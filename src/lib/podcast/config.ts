// Podcast pipeline configuration.
//
// Ported from podcast_pipeline/config.py. `sourceName` must stay identical to the
// Python values: it is the `commentary.source` every previously published
// episode was written under, so new episodes append to the same rows.
//
// This module (and the rest of lib/podcast) deliberately has no Next.js or "@/"
// imports so the pipeline can be exercised outside the app.

export interface PodcastConfig {
  slug: string;
  displayName: string;
  rssUrl: string;
  sourceName: string;
  hosts: string;
}

export const PODCASTS: PodcastConfig[] = [
  {
    slug: "first-draft",
    displayName: "First Draft",
    rssUrl: "https://feeds.megaphone.fm/ESP5707918440",
    sourceName: "First Draft Comments",
    hosts: "Mel Kiper Jr. and Field Yates",
  },
  {
    slug: "nflse",
    displayName: "NFL Stock Exchange",
    rssUrl: "https://feeds.simplecast.com/DjoMwzRw",
    sourceName: "NFL Stock Exchange Comments",
    hosts: "Trevor Sikkema and Connor Rogers",
  },
  {
    slug: "mcshay",
    displayName: "The McShay Show",
    rssUrl: "https://feeds.megaphone.fm/todd-mcshay",
    sourceName: "The McShay Show Comments",
    hosts: "Todd McShay",
  },
];

export function getPodcast(slug: string): PodcastConfig {
  const p = PODCASTS.find((x) => x.slug === slug);
  if (!p) throw new Error(`Unknown podcast: ${slug}`);
  return p;
}

// ─── Audio / transcription ──────────────────────────────────────────────────
// Whisper rejects uploads over 25 MB, and every recent episode is 60–210 MB.
// Rather than re-encode with ffmpeg (unavailable on Vercel), the MP3 is fetched
// in byte ranges and each range is transcribed on its own. Pieces overlap so a
// word cut at a boundary is captured whole by the neighbouring piece; the
// duplicate words are trimmed when the transcript is stitched back together.
export const CHUNK_BYTES = 23_000_000;   // stays under Whisper's 25 MB with margin
export const CHUNK_OVERLAP_BYTES = 500_000;
export const CHUNKS_PER_CALL = 3;        // pieces transcribed in parallel per server call

// ─── Extraction ─────────────────────────────────────────────────────────────
export const MIN_PLAYER_TEXT_CHARS = 150;
export const RECENT_EPISODES_PER_PODCAST = 12;
export const PLAYERS_PER_CALL = 6;       // players extracted in parallel per server call

// Must match the section titles the Python pipeline wrote ("YYYY-MM-DD — Title",
// em dash). Publishing skips a section whose title already exists, so an
// identical title is what prevents double-publishing an episode.
export function sectionTitle(episodeDate: string, title: string): string {
  return `${episodeDate} — ${title}`;
}
