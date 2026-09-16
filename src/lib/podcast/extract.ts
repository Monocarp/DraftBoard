// AI extraction: discover players, pull verbatim text, filter for GM relevance.
// Ported from podcast_pipeline/extract_mentions.py. Prompts, models, token
// limits and temperatures are unchanged so output matches what has already
// been reviewed and published.
//
// Split into per-step functions (instead of one call that does everything) so
// the admin UI can run them in short server calls with progress and resume.

import Anthropic from "@anthropic-ai/sdk";
import { MIN_PLAYER_TEXT_CHARS, getPodcast } from "./config";

export interface CandidatePlayer {
  id: string;
  slug: string;
  name: string;
}

export interface DiscoveredPlayer {
  key: string;          // board slug when matched, slugified spoken name otherwise
  name: string;         // canonical board name when matched, spoken name otherwise
  spokenName: string;
  playerId: string | null;
  // How the player was found: the AI discovery call, the AI plus a spelling
  // correction, or the deterministic full-name scan backing it up.
  via: "ai" | "ai-fuzzy" | "name-scan";
  done: boolean;
  outcome?: "matched" | "unmatched" | "too_short" | "kept_reviewed" | "error";
  errorMessage?: string;
}

export interface Usage {
  step: "phase1" | "phase2" | "step2";
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const PHASE12_MODEL = "gpt-4o-mini";
const STEP2_MODEL = "claude-haiku-4-5-20251001";

// Rates carried over from the Python pipeline's cost table (USD per million tokens).
const RATES: Record<string, [number, number]> = {
  [PHASE12_MODEL]: [0.15, 0.6],
  [STEP2_MODEL]: [1.0, 5.0],
};

function usage(step: Usage["step"], model: string, inputTokens: number, outputTokens: number): Usage {
  const [inRate, outRate] = RATES[model] ?? [0, 0];
  return { step, model, inputTokens, outputTokens, costUsd: (inputTokens * inRate + outputTokens * outRate) / 1_000_000 };
}

// ─── Prompts (verbatim from extract_mentions.py) ────────────────────────────

const PHASE1_SYSTEM_TEMPLATE = `You are scanning a transcript of the {display_name} podcast ({hosts}).
YOUR TASK:
Return a JSON list of every NFL draft prospect who is SUBSTANTIVELY discussed —
meaning at least 2-3 sentences of actual evaluation, not just a name-drop.
IMPORTANT: Hosts frequently refer to players by nickname, first name only, or last name only
after their first introduction (e.g. "Reese", "Bailey", "Bain", "Banks", "CJ", "Will").
Always map these back to the correct full name and slug from the provided player list.
For each prospect include:
- "name": their properly capitalized full name as spoken in the podcast
- "slug": their exact slug from the provided player list, or null if not in the list
OUTPUT FORMAT:
{"players": [{"name": "Caleb Banks", "slug": "caleb-banks"}, ...]}
Return {"players": []} if no prospects are substantively discussed.`;

const PHASE2_SYSTEM = `You are extracting verbatim text from a podcast transcript.

Extract ONLY the portions of this transcript where the specified player is the PRIMARY subject
being discussed — meaning the hosts are evaluating, analyzing, or giving opinions about THAT player.

RULES:
1. Return ONLY text that appears verbatim in the transcript. Do NOT paraphrase or summarize.
2. If a paragraph is primarily about a DIFFERENT player (even if the specified player is
   mentioned briefly for comparison), do NOT include it.
3. If multiple segments discuss this player as the primary subject, concatenate them in
   chronological order with a blank line between each segment.
4. Minor cleanup of filler words ("um", "uh", "like" as filler) is acceptable.
5. If the player is not substantively discussed as a primary subject, return an empty string.

Return ONLY the extracted text. No JSON, no labels, no explanation.`;

const STEP2_SYSTEM = `You are an editorial filter for an NFL front-office draft research tool.

You will receive verbatim podcast commentary about a specific NFL draft prospect.
Your job is to KEEP only the portions that would be useful to an NFL General Manager
evaluating this player, and REMOVE everything else.

KEEP (verbatim — do not rephrase):
- Player evaluation and scouting analysis (strengths, weaknesses, technique)
- Physical traits and measurables (size, speed, athleticism)
- Production and college stats/performance
- Scheme fit and positional value
- NFL comparisons and projected role
- Draft stock, round projection, and team fit
- Character, leadership, work ethic observations
- Medical/injury concerns
- Combine or pro day performance
- Any specific game tape observations

REMOVE:
- Podcast transitions ("so Field, what do you think about...")
- Host banter and conversational filler
- Sponsor reads or show promos that got mixed in
- Repetitive restating of the same point (keep the clearest version)
- Generic hype with no substance ("this guy is just a baller, man")
- Sentences that are purely about another player (not the one being analyzed)

CRITICAL RULES:
1. Stay VERBATIM. Do not rephrase, summarize, or add any words not in the original.
   You may only remove text, never modify it.
2. Preserve the chronological order of the remaining text.
3. If removing text leaves two segments that were separate, join them with a blank line.
4. If after filtering, less than 2 sentences of substance remain, return an empty string.

Return ONLY the filtered text. No JSON, no explanation — just the cleaned verbatim text.`;

// ─── Helpers ────────────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/**
 * Surname for matching, ignoring generational suffixes. The Python version used
 * the final token, so "Rueben Bain Jr." searched for "jr." — which never forms a
 * word boundary — instead of "Bain".
 */
function lastName(fullName: string): string {
  const parts = fullName.replace(/\./g, "").trim().split(/\s+/);
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  return parts[parts.length - 1] ?? "";
}

async function openaiChat(body: Record<string, unknown>): Promise<{ text: string; inTok: number; outTok: number }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) {
        const j = await res.json();
        return {
          text: j.choices?.[0]?.message?.content ?? "",
          inTok: j.usage?.prompt_tokens ?? 0,
          outTok: j.usage?.completion_tokens ?? 0,
        };
      }
      lastErr = new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ─── Name matching safety nets ──────────────────────────────────────────────
// Added in the TypeScript port. A dry run on a published episode (First Draft
// 2026-02-16) found 4 of the 6 players that had been approved from it:
//   • the AI returned Whisper's stray spelling "Mansoor Dillain" with no slug,
//     although "Delane" appears 8 times in the transcript, and "Sonny Stiles"
//     likewise — both would have been dumped into the unmatched queue;
//   • it skipped CJ Allen, named in full 3 times, on that run.
// Every extract is human-reviewed before publishing, so an extra candidate costs
// a click while a silent miss loses the content. These two checks favour recall.

/** Jaro-Winkler similarity (same algorithm as the upload importer's matcher). */
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const l1 = s1.length, l2 = s2.length;
  if (!l1 || !l2) return 0;
  const dist = Math.max(Math.floor(Math.max(l1, l2) / 2) - 1, 0);
  const m1 = new Array(l1).fill(false), m2 = new Array(l2).fill(false);
  let matches = 0;
  for (let i = 0; i < l1; i++) {
    for (let j = Math.max(0, i - dist); j < Math.min(i + dist + 1, l2); j++) {
      if (m2[j] || s1[i] !== s2[j]) continue;
      m1[i] = m2[j] = true; matches++; break;
    }
  }
  if (!matches) return 0;
  let k = 0, trans = 0;
  for (let i = 0; i < l1; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
    if (s1[i] !== s2[k]) trans++;
    k++;
  }
  const jaro = (matches / l1 + matches / l2 + (matches - trans / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, l1, l2) && s1[i] === s2[i]; i++) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const firstToken = (s: string) => compact(s.trim().split(/\s+/)[0] ?? "");
const baseName = (s: string) => {
  const parts = s.replace(/\./g, "").trim().split(/\s+/);
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  return parts.join(" ");
};

/**
 * Map a misspelled spoken name to a board player: same first name, near-identical
 * full name (Jaro-Winkler ≥ 0.9), and a clear winner — never a coin flip.
 */
export function fuzzyMatchName(spokenName: string, players: CandidatePlayer[]): CandidatePlayer | null {
  const target = compact(baseName(spokenName));
  const first = firstToken(spokenName);
  if (target.length < 6 || first.length < 2) return null;

  const scored = players
    .filter((p) => firstToken(p.name) === first)
    .map((p) => ({ p, sim: jaroWinkler(target, compact(baseName(p.name))) }))
    .filter((x) => x.sim >= 0.9)
    .sort((a, b) => b.sim - a.sim);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].sim - scored[1].sim < 0.02) return null;
  return scored[0].p;
}

/** Board players named in full (suffix optional) at least `minMentions` times. */
export function scanFullNameMentions(transcript: string, players: CandidatePlayer[], minMentions = 2): CandidatePlayer[] {
  const text = transcript.replace(/\./g, "");
  return players.filter((p) => {
    const parts = baseName(p.name).split(/\s+/);
    if (parts.length < 2) return false;
    const re = new RegExp(`\\b${parts.map(escapeRe).join("\\s+")}\\b`, "gi");
    return (text.match(re)?.length ?? 0) >= minMentions;
  });
}

// ─── Phase 1: discover ──────────────────────────────────────────────────────

/** Narrow ~1,000 board players to those whose surname appears in the transcript. */
export function prefilterCandidates(transcript: string, players: CandidatePlayer[]): CandidatePlayer[] {
  const lower = transcript.toLowerCase();
  const hits = players.filter((p) => {
    const ln = lastName(p.name).toLowerCase();
    return ln.length > 0 && new RegExp(`\\b${escapeRe(ln)}\\b`).test(lower);
  });
  return hits.length < 5 ? players : hits;
}

export async function discoverPlayers(
  transcript: string,
  podcastSlug: string,
  players: CandidatePlayer[],
): Promise<{ discovered: DiscoveredPlayer[]; candidates: number; usage: Usage }> {
  const cfg = getPodcast(podcastSlug);
  const candidates = prefilterCandidates(transcript, players);

  const system = PHASE1_SYSTEM_TEMPLATE
    .replace("{display_name}", cfg.displayName)
    .replace("{hosts}", cfg.hosts);
  const list = candidates.map((p) => ` - ${p.name} (slug: ${p.slug})`).join("\n");

  const r = await openaiChat({
    model: PHASE12_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `KNOWN DRAFT PROSPECTS (for slug lookup):\n${list}\n\nTRANSCRIPT:\n${transcript}` },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
    temperature: 0.1,
  });

  let parsed: { players?: { name?: string; slug?: string | null }[] } = {};
  try {
    parsed = JSON.parse(r.text || '{"players": []}');
  } catch {
    parsed = { players: [] };
  }

  // Resolve against the FULL board, not just the prefiltered candidates.
  const bySlug = new Map(players.map((p) => [p.slug, p]));
  const byName = new Map(players.map((p) => [p.name.toLowerCase(), p]));

  const seen = new Set<string>();
  const discovered: DiscoveredPlayer[] = [];
  for (const entry of parsed.players ?? []) {
    const spokenName = (entry.name ?? "").trim();
    if (!spokenName) continue;
    const exact = (entry.slug && bySlug.get(entry.slug)) || byName.get(spokenName.toLowerCase()) || null;
    // Whole board, not just the prefiltered candidates: if Whisper misspelled every
    // mention of a surname, that player never made the candidate list.
    const fuzzy = exact ? null : fuzzyMatchName(spokenName, players);
    const match = exact ?? fuzzy;
    const key = match ? match.slug : slugify(spokenName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    discovered.push({
      key,
      name: match ? match.name : spokenName,
      spokenName,
      playerId: match ? match.id : null,
      via: fuzzy ? "ai-fuzzy" : "ai",
      done: false,
    });
  }

  // Backstop for players the AI skipped. Phase 2 still drops anyone without
  // enough substantive discussion (MIN_PLAYER_TEXT_CHARS), so a passing mention
  // doesn't become a review item.
  for (const p of scanFullNameMentions(transcript, candidates)) {
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    discovered.push({ key: p.slug, name: p.name, spokenName: p.name, playerId: p.id, via: "name-scan", done: false });
  }

  return {
    discovered,
    candidates: candidates.length,
    usage: usage("phase1", PHASE12_MODEL, r.inTok, r.outTok),
  };
}

// ─── Phase 2: extract ───────────────────────────────────────────────────────

const WINDOW_CHARS = 3000;

/** Only the transcript around mentions of this player, so adjacent players' sections aren't grabbed. */
export function buildContextWindows(transcript: string, playerName: string): string {
  const clean = playerName.replace(/\./g, "").trim();
  const parts = clean.split(/\s+/);
  const patterns = [escapeRe(playerName)];
  if (parts.length >= 2) {
    patterns.push(escapeRe(lastName(clean)));
    if (parts[0].length >= 3) patterns.push(escapeRe(parts[0]));
  }
  const re = new RegExp(`\\b(?:${patterns.join("|")})\\b`, "gi");
  const positions = [...transcript.matchAll(re)].map((m) => m.index ?? 0);
  if (positions.length === 0) return transcript;

  const windows: [number, number][] = [];
  for (const pos of positions) {
    const start = Math.max(0, pos - WINDOW_CHARS);
    const end = Math.min(transcript.length, pos + WINDOW_CHARS);
    const last = windows[windows.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else windows.push([start, end]);
  }
  return windows.map(([s, e]) => transcript.slice(s, e).trim()).filter(Boolean).join("\n\n[...]\n\n");
}

async function phase2Extract(transcript: string, playerName: string): Promise<{ text: string; usage: Usage | null }> {
  try {
    const r = await openaiChat({
      model: PHASE12_MODEL,
      messages: [
        { role: "system", content: PHASE2_SYSTEM },
        { role: "user", content: `PLAYER: ${playerName}\n\nTRANSCRIPT:\n${buildContextWindows(transcript, playerName)}` },
      ],
      max_completion_tokens: 4096,
      temperature: 0.1,
    });
    return { text: r.text.trim(), usage: usage("phase2", PHASE12_MODEL, r.inTok, r.outTok) };
  } catch {
    return { text: "", usage: null };
  }
}

// ─── Step 2: GM filter ──────────────────────────────────────────────────────

/** Filter to GM-relevant text. Falls back to the raw text on any failure, as Python did. */
export async function step2Filter(playerName: string, rawText: string): Promise<{ text: string; usage: Usage | null; fellBack: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY) return { text: rawText, usage: null, fellBack: true };
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: STEP2_MODEL,
      max_tokens: 4096,
      system: STEP2_SYSTEM,
      messages: [{ role: "user", content: `PLAYER: ${playerName}\n\nRAW PODCAST COMMENTARY:\n${rawText}` }],
      temperature: 0,
    });
    const block = res.content[0];
    const filtered = (block && block.type === "text" ? block.text : "").trim();
    const u = usage("step2", STEP2_MODEL, res.usage.input_tokens, res.usage.output_tokens);
    if (filtered.length < MIN_PLAYER_TEXT_CHARS) return { text: rawText, usage: u, fellBack: true };
    return { text: filtered, usage: u, fellBack: false };
  } catch {
    return { text: rawText, usage: null, fellBack: true };
  }
}

// ─── Per-player orchestration ───────────────────────────────────────────────

export type PlayerOutcome =
  | { kind: "matched"; rawText: string; text: string; filterFellBack: boolean }
  | { kind: "unmatched"; rawText: string }
  | { kind: "too_short" };

/**
 * Phase 2 then (for board players) Step 2. Unmatched players keep raw text —
 * as in Python, they are filtered later, at reconcile time.
 */
export async function extractPlayer(
  transcript: string,
  player: DiscoveredPlayer,
): Promise<{ outcome: PlayerOutcome; usage: Usage[] }> {
  const usages: Usage[] = [];
  const p2 = await phase2Extract(transcript, player.name);
  if (p2.usage) usages.push(p2.usage);

  if (p2.text.length < MIN_PLAYER_TEXT_CHARS) return { outcome: { kind: "too_short" }, usage: usages };
  if (!player.playerId) return { outcome: { kind: "unmatched", rawText: p2.text }, usage: usages };

  const f = await step2Filter(player.name, p2.text);
  if (f.usage) usages.push(f.usage);
  return { outcome: { kind: "matched", rawText: p2.text, text: f.text, filterFellBack: f.fellBack }, usage: usages };
}
