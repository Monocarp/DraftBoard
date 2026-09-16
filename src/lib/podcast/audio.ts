// Audio download + transcription without ffmpeg.
// Replaces podcast_pipeline/transcribe.py, which compressed with ffmpeg first.
//
// Verified against the live feeds before this was written:
//   • Megaphone and Simplecast both serve HTTP 206 byte ranges.
//   • Repeated requests for the same range return identical bytes (the ad cut
//     is stable), so separately fetched pieces line up.
//   • whisper-1 transcribes a piece cut mid-frame from the middle of an MP3.
// Ad stitching could still differ between requests from another network, so
// every range response is checked against the size recorded when the episode
// was first probed; a mismatch aborts rather than stitching mismatched audio.

import { CHUNK_BYTES, CHUNK_OVERLAP_BYTES } from "./config";

export interface AudioProbe {
  resolvedUrl: string;
  totalBytes: number;
}

export interface ChunkRange {
  index: number;
  start: number;
  end: number; // inclusive
}

/** Follow redirects once and read the file size from a 1-byte range request. */
export async function probeAudio(url: string): Promise<AudioProbe> {
  const res = await fetch(url, {
    headers: { Range: "bytes=0-0" },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  await res.arrayBuffer().catch(() => undefined);
  if (res.status !== 206) {
    throw new Error(`Audio host did not honour a range request (HTTP ${res.status}); cannot split the file.`);
  }
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  if (!Number.isFinite(total) || total <= 0) throw new Error("Audio host did not report a file size.");
  return { resolvedUrl: res.url || url, totalBytes: total };
}

export function planChunks(totalBytes: number): ChunkRange[] {
  const chunks: ChunkRange[] = [];
  for (let start = 0, i = 0; start < totalBytes; start += CHUNK_BYTES, i++) {
    chunks.push({ index: i, start, end: Math.min(totalBytes, start + CHUNK_BYTES + CHUNK_OVERLAP_BYTES) - 1 });
  }
  return chunks;
}

/** Skip to the first MPEG frame header so a mid-stream piece starts on a frame boundary. */
function alignToFrame(buf: Buffer): Buffer {
  const limit = Math.min(buf.length - 4, 16_384);
  for (let i = 0; i < limit; i++) {
    // 11-bit sync word, valid version/layer/bitrate/sample-rate fields.
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0 &&
        (buf[i + 1] & 0x18) !== 0x08 && (buf[i + 1] & 0x06) !== 0x00 &&
        (buf[i + 2] & 0xf0) !== 0xf0 && (buf[i + 2] & 0x0c) !== 0x0c) {
      return buf.subarray(i);
    }
  }
  return buf;
}

async function fetchChunk(probe: AudioProbe, chunk: ChunkRange): Promise<Buffer> {
  const res = await fetch(probe.resolvedUrl, {
    headers: { Range: `bytes=${chunk.start}-${chunk.end}` },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
  if (res.status !== 206) throw new Error(`Piece ${chunk.index + 1}: audio host returned HTTP ${res.status}`);
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  if (total !== probe.totalBytes) {
    throw new Error(
      `Piece ${chunk.index + 1}: audio file changed size between requests (${probe.totalBytes} → ${total}), ` +
      `likely a different ad insertion. Use Restart transcription.`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return chunk.index === 0 ? buf : alignToFrame(buf);
}

async function whisper(buf: Buffer, label: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("response_format", "text");
    form.append("file", new Blob([new Uint8Array(buf)], { type: "audio/mpeg" }), `${label}.mp3`);
    try {
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(240_000),
      });
      if (res.ok) return (await res.text()).trim();
      const body = (await res.text()).slice(0, 300);
      lastErr = new Error(`Whisper HTTP ${res.status}: ${body}`);
      if (res.status !== 429 && res.status < 500) break; // not retryable
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function transcribeChunk(probe: AudioProbe, chunk: ChunkRange): Promise<string> {
  const buf = await fetchChunk(probe, chunk);
  return whisper(buf, `piece-${chunk.index + 1}`);
}

// ─── Stitching ──────────────────────────────────────────────────────────────

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");

/**
 * Join transcribed pieces, removing the words each overlap produced twice.
 * Finds a run of identical words shared by the tail of one piece and the head of
 * the next and splices there. If no reliable run is found the pieces are simply
 * joined — a few duplicated seconds, never lost text.
 */
export function stitchTranscripts(pieces: string[]): string {
  const RUN = 6;       // consecutive matching words required
  const WINDOW = 160;  // words searched at each seam (overlap is ~10–30 s of speech)

  let words = (pieces[0] ?? "").split(/\s+/).filter(Boolean);
  for (let p = 1; p < pieces.length; p++) {
    const next = (pieces[p] ?? "").split(/\s+/).filter(Boolean);
    if (next.length === 0) continue;

    const tailStart = Math.max(0, words.length - WINDOW);
    const tail = words.slice(tailStart).map(norm);
    const head = next.slice(0, WINDOW).map(norm);

    let splice: { prevAt: number; nextAt: number } | null = null;
    outer:
    for (let j = 0; j + RUN <= head.length; j++) {
      const key = head.slice(j, j + RUN).join(" ");
      if (!head[j]) continue;
      // Latest occurrence in the tail wins, so repeated phrases splice at the true seam.
      for (let i = tail.length - RUN; i >= 0; i--) {
        if (tail.slice(i, i + RUN).join(" ") === key) {
          splice = { prevAt: tailStart + i, nextAt: j };
          break outer;
        }
      }
    }

    words = splice
      ? [...words.slice(0, splice.prevAt), ...next.slice(splice.nextAt)]
      : [...words, ...next];
  }
  return words.join(" ");
}
