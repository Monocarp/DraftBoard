// Podcast pipeline orchestration: episode processing, review, publish, reconcile.
// Replaces podcast_pipeline/{run,app,write_to_db}.py.
//
// Long work is split into short, resumable steps: the client calls
// runEpisodeStep() repeatedly and each call advances an episode by a bounded
// amount (a few audio pieces, or a few players), saving progress before it
// returns. A closed tab, timeout or API error loses at most one step.
//
// Takes a Supabase client instead of creating one and has no Next.js imports, so
// it runs identically inside server actions (admin-checked, service role — see
// app/admin/podcasts/actions.ts) and in standalone integration tests.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PODCASTS, CHUNKS_PER_CALL, PLAYERS_PER_CALL, getPodcast, sectionTitle } from "./config";
import { fetchAllFeeds, fetchFeed } from "./rss";
import { planChunks, probeAudio, stitchTranscripts, transcribeChunk } from "./audio";
import {
  discoverPlayers, extractPlayer, step2Filter,
  type CandidatePlayer, type DiscoveredPlayer, type Usage,
} from "./extract";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sumCost = (u: Usage[]) => u.reduce((a, x) => a + x.costUsd, 0);

// ─── Types ──────────────────────────────────────────────────────────────────

export type EpisodeStatus = "transcribing" | "extracting" | "review" | "published";

export interface EpisodeListItem {
  podcastSlug: string;
  podcastName: string;
  guid: string;
  title: string;
  date: string;
  duration: string;
  id: string | null;            // null = never processed
  status: EpisodeStatus | null;
  error: string | null;
  chunksDone: number;
  chunksTotal: number;
  playersDone: number;
  playersTotal: number;
  inFeed: boolean;
}

export interface StepResult {
  id: string;
  status: EpisodeStatus;
  error: string | null;
  message: string;
  chunksDone: number;
  chunksTotal: number;
  playersDone: number;
  playersTotal: number;
  summary?: {
    matched: number; unmatched: number; tooShort: number; keptReviewed: number; failed: number; costUsd: number;
    failures: string[];
  };
}

interface EpisodeRow {
  id: string;
  podcast_slug: string;
  guid: string;
  title: string;
  episode_date: string;
  audio_url: string;
  status: EpisodeStatus;
  error: string | null;
  audio_resolved_url: string | null;
  audio_bytes: number | null;
  transcript_chunks: (string | null)[];
  chunks_total: number;
  chunks_done: number;
  transcript: string | null;
  discovered: DiscoveredPlayer[];
  discovered_at: string | null;
  players_total: number;
  players_done: number;
  llm_cost_usd: number;
}

// ─── Episodes list ──────────────────────────────────────────────────────────

export async function getEpisodesView(db: SupabaseClient): Promise<{ episodes: EpisodeListItem[]; feedErrors: string[] }> {
  const [{ episodes: feed, errors }, { data: rows, error }] = await Promise.all([
    fetchAllFeeds(),
    db.from("podcast_episodes")
      .select("id, podcast_slug, guid, title, episode_date, duration, status, error, chunks_done, chunks_total, players_done, players_total"),
  ]);
  if (error) throw new Error(`Could not load podcast_episodes (has the migration been run?): ${error.message}`);

  const byGuid = new Map((rows ?? []).map((r) => [r.guid, r]));
  const name = (slug: string) => PODCASTS.find((p) => p.slug === slug)?.displayName ?? slug;

  const items: EpisodeListItem[] = feed.map((e) => {
    const r = byGuid.get(e.guid);
    return {
      podcastSlug: e.podcastSlug, podcastName: name(e.podcastSlug), guid: e.guid,
      title: r?.title ?? e.title, date: r?.episode_date ?? e.date, duration: e.duration,
      id: r?.id ?? null, status: r?.status ?? null, error: r?.error ?? null,
      chunksDone: r?.chunks_done ?? 0, chunksTotal: r?.chunks_total ?? 0,
      playersDone: r?.players_done ?? 0, playersTotal: r?.players_total ?? 0,
      inFeed: true,
    };
  });

  // Keep unfinished episodes visible after they scroll out of the recent feed.
  const feedGuids = new Set(feed.map((e) => e.guid));
  for (const r of rows ?? []) {
    if (feedGuids.has(r.guid) || r.status === "published") continue;
    items.push({
      podcastSlug: r.podcast_slug, podcastName: name(r.podcast_slug), guid: r.guid,
      title: r.title, date: r.episode_date, duration: r.duration ?? "",
      id: r.id, status: r.status, error: r.error,
      chunksDone: r.chunks_done, chunksTotal: r.chunks_total,
      playersDone: r.players_done, playersTotal: r.players_total,
      inFeed: false,
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date));
  return { episodes: items, feedErrors: errors };
}

/**
 * Create the episode record. Episode details are re-read from the feed on the
 * server rather than trusted from the browser.
 */
export async function startEpisode(db: SupabaseClient, podcastSlug: string, guid: string): Promise<{ id: string }> {
  getPodcast(podcastSlug);

  const { data: existing } = await db.from("podcast_episodes").select("id").eq("guid", guid).maybeSingle();
  if (existing) return { id: existing.id };

  const ep = (await fetchFeed(podcastSlug, 500)).find((e) => e.guid === guid);
  if (!ep) throw new Error("Episode not found in the podcast feed.");

  const { data, error } = await db.from("podcast_episodes").insert({
    podcast_slug: podcastSlug, guid: ep.guid, title: ep.title, episode_date: ep.date,
    audio_url: ep.audioUrl, duration: ep.duration, status: "transcribing",
  }).select("id").single();
  if (error || !data) throw new Error(`Could not create episode: ${error?.message}`);
  return { id: data.id };
}

// ─── Processing ─────────────────────────────────────────────────────────────

function toStep(row: EpisodeRow, message: string, extra?: Partial<StepResult>): StepResult {
  return {
    id: row.id, status: row.status, error: row.error, message,
    chunksDone: row.chunks_done, chunksTotal: row.chunks_total,
    playersDone: row.players_done, playersTotal: row.players_total,
    ...extra,
  };
}

async function loadEpisode(db: SupabaseClient, id: string): Promise<EpisodeRow> {
  const { data, error } = await db.from("podcast_episodes").select("*").eq("id", id).single();
  if (error || !data) throw new Error(`Episode not found: ${error?.message}`);
  return data as EpisodeRow;
}

async function saveEpisode(db: SupabaseClient, id: string, patch: Partial<EpisodeRow>): Promise<void> {
  const { error } = await db.from("podcast_episodes")
    .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Could not save progress: ${error.message}`);
}

/** All board players. Paginated — the Python version stopped at Supabase's 1,000-row cap. */
async function loadAllPlayers(db: SupabaseClient): Promise<CandidatePlayer[]> {
  const out: CandidatePlayer[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("players").select("id, slug, name").order("id").range(from, from + 999);
    if (error) throw new Error(`Could not load players: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function summarize(row: EpisodeRow): StepResult["summary"] {
  const c = (o: DiscoveredPlayer["outcome"]) => row.discovered.filter((p) => p.outcome === o).length;
  return {
    matched: c("matched"), unmatched: c("unmatched"), tooShort: c("too_short"),
    keptReviewed: c("kept_reviewed"), failed: c("error"), costUsd: Number(row.llm_cost_usd),
    failures: row.discovered.filter((p) => p.outcome === "error").map((p) => `${p.name}: ${p.errorMessage ?? "unknown error"}`),
  };
}

/** Advance an episode by one bounded step. Call repeatedly until status is review. */
export async function runEpisodeStep(db: SupabaseClient, id: string): Promise<StepResult> {
  let row = await loadEpisode(db, id);

  try {
    if (row.status === "transcribing") return await transcribeStep(db, row);
    if (row.status === "extracting") return await extractStep(db, row);
    return toStep(row, row.status === "review" ? "Ready for review" : "Published", { summary: summarize(row) });
  } catch (e) {
    const message = errMsg(e);
    await saveEpisode(db, id, { error: message }).catch(() => undefined);
    row = { ...row, error: message };
    return toStep(row, message);
  }
}

async function transcribeStep(db: SupabaseClient, row: EpisodeRow): Promise<StepResult> {
  // First call: measure the file and plan the pieces.
  if (!row.audio_bytes || !row.audio_resolved_url) {
    const probe = await probeAudio(row.audio_url);
    const chunks = planChunks(probe.totalBytes);
    const patch = {
      audio_resolved_url: probe.resolvedUrl, audio_bytes: probe.totalBytes,
      transcript_chunks: chunks.map(() => null), chunks_total: chunks.length, chunks_done: 0, error: null,
    };
    await saveEpisode(db, row.id, patch);
    return toStep({ ...row, ...patch }, `Audio is ${(probe.totalBytes / 1048576).toFixed(0)} MB — ${chunks.length} pieces to transcribe`);
  }

  const probe = { resolvedUrl: row.audio_resolved_url, totalBytes: row.audio_bytes };
  const plan = planChunks(row.audio_bytes);
  const pieces = [...row.transcript_chunks];
  const todo = plan.filter((c) => pieces[c.index] == null).slice(0, CHUNKS_PER_CALL);

  if (todo.length > 0) {
    const results = await Promise.allSettled(todo.map((c) => transcribeChunk(probe, c)));
    const failures: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") pieces[todo[i].index] = r.value;
      else failures.push(errMsg(r.reason));
    });
    const done = pieces.filter((p) => p != null).length;
    const patch = { transcript_chunks: pieces, chunks_done: done, error: failures[0] ?? null };
    await saveEpisode(db, row.id, patch);
    const next = { ...row, ...patch };
    return toStep(next, failures.length ? failures[0] : `Transcribed ${done} of ${plan.length} pieces`);
  }

  // All pieces present: stitch and move on. Pieces are dropped once stitched.
  const transcript = stitchTranscripts(pieces as string[]);
  const patch = {
    transcript, transcript_chunks: [], status: "extracting" as const, error: null,
    discovered: [], discovered_at: null, players_total: 0, players_done: 0,
  };
  await saveEpisode(db, row.id, patch);
  return toStep({ ...row, ...patch }, `Transcript ready — ${transcript.split(/\s+/).length.toLocaleString()} words`);
}

async function extractStep(db: SupabaseClient, row: EpisodeRow): Promise<StepResult> {
  if (!row.transcript) throw new Error("No transcript. Use Restart transcription.");

  // First call: find which players are discussed.
  if (!row.discovered_at) {
    const players = await loadAllPlayers(db);
    const d = await discoverPlayers(row.transcript, row.podcast_slug, players);
    const patch = {
      discovered: d.discovered, discovered_at: new Date().toISOString(),
      players_total: d.discovered.length, players_done: 0, error: null,
      llm_cost_usd: Number(row.llm_cost_usd) + d.usage.costUsd,
    };
    await saveEpisode(db, row.id, patch);
    return toStep({ ...row, ...patch }, `Found ${d.discovered.length} players to extract (from ${d.candidates} candidates)`);
  }

  const discovered = [...row.discovered];
  const batch = discovered.filter((p) => !p.done).slice(0, PLAYERS_PER_CALL);

  if (batch.length === 0) {
    const patch = { status: "review" as const, error: null };
    await saveEpisode(db, row.id, patch);
    const next = { ...row, ...patch };
    return toStep(next, "Ready for review", { summary: summarize(next) });
  }

  // Extracts already reviewed in an earlier run are never overwritten.
  const { data: existingRows } = await db.from("podcast_extracts")
    .select("slug, status").eq("episode_id", row.id).in("slug", batch.map((p) => p.key));
  const reviewed = new Set((existingRows ?? []).filter((r) => r.status !== "pending").map((r) => r.slug));
  const source = getPodcast(row.podcast_slug).sourceName;

  const usages: Usage[] = [];
  await Promise.all(batch.map(async (p) => {
    const idx = discovered.findIndex((x) => x.key === p.key);
    if (reviewed.has(p.key)) {
      discovered[idx] = { ...p, done: true, outcome: "kept_reviewed" };
      return;
    }
    try {
      const { outcome, usage } = await extractPlayer(row.transcript!, p);
      usages.push(...usage);

      if (outcome.kind === "matched") {
        const { error } = await db.from("podcast_extracts").upsert({
          episode_id: row.id, player_id: p.playerId, slug: p.key, name: p.name,
          text: outcome.text, raw_text: outcome.rawText, via: p.via, status: "pending",
          updated_at: new Date().toISOString(),
        }, { onConflict: "episode_id,slug" });
        if (error) throw new Error(error.message);
      } else if (outcome.kind === "unmatched") {
        const { error } = await db.from("unmatched_commentary").upsert({
          slug: p.key, name: p.spokenName, source, episode_title: row.title,
          episode_date: row.episode_date, episode_guid: row.guid, text: outcome.rawText,
        }, { onConflict: "slug,episode_guid", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      discovered[idx] = { ...p, done: true, outcome: outcome.kind };
    } catch (e) {
      // One player failing shouldn't stall the episode (Python also carried on).
      // The reason is kept on the player and counted in the summary; Re-process
      // runs everyone not yet reviewed again.
      discovered[idx] = { ...p, done: true, outcome: "error", errorMessage: errMsg(e) };
    }
  }));

  const patch = {
    discovered, players_done: discovered.filter((p) => p.done).length,
    llm_cost_usd: Number(row.llm_cost_usd) + sumCost(usages),
    error: null,
  };
  await saveEpisode(db, row.id, patch);
  return toStep({ ...row, ...patch }, `Extracted ${patch.players_done} of ${discovered.length} players`);
}

/** Run extraction again on the saved transcript. Approved/published extracts are kept. */
export async function reprocessEpisode(db: SupabaseClient, id: string): Promise<void> {
  const row = await loadEpisode(db, id);
  const { error } = await db.from("podcast_extracts").delete().eq("episode_id", id).eq("status", "pending");
  if (error) throw new Error(error.message);
  if (!row.transcript) return restartTranscription(db, id);
  await saveEpisode(db, id, {
    status: "extracting", error: null, discovered: [], discovered_at: null, players_total: 0, players_done: 0,
  });
}

/** Discard transcription progress and download the audio again. */
export async function restartTranscription(db: SupabaseClient, id: string): Promise<void> {
  await saveEpisode(db, id, {
    status: "transcribing", error: null, audio_resolved_url: null, audio_bytes: null,
    transcript_chunks: [], chunks_total: 0, chunks_done: 0, transcript: null,
    discovered: [], discovered_at: null, players_total: 0, players_done: 0,
  });
}

// ─── Review ─────────────────────────────────────────────────────────────────

export interface ReviewExtract {
  id: string;
  slug: string;
  name: string;
  text: string;
  rawText: string;
  via: string | null;
  status: "pending" | "approved";
  hasPlayer: boolean;
}

export interface ReviewEpisode {
  id: string;
  podcastName: string;
  title: string;
  date: string;
  extracts: ReviewExtract[];
}

export async function getReviewData(db: SupabaseClient): Promise<ReviewEpisode[]> {
  const [{ data: eps, error: e1 }, { data: ext, error: e2 }] = await Promise.all([
    db.from("podcast_episodes").select("id, podcast_slug, title, episode_date, status").order("episode_date", { ascending: false }),
    db.from("podcast_extracts").select("id, episode_id, player_id, slug, name, text, raw_text, via, status")
      .in("status", ["pending", "approved"]).order("name"),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);

  const byEpisode = new Map<string, ReviewExtract[]>();
  for (const x of ext ?? []) {
    const list = byEpisode.get(x.episode_id) ?? [];
    list.push({ id: x.id, slug: x.slug, name: x.name, text: x.text, rawText: x.raw_text, via: x.via, status: x.status, hasPlayer: !!x.player_id });
    byEpisode.set(x.episode_id, list);
  }

  return (eps ?? [])
    .filter((e) => byEpisode.has(e.id) || e.status === "review")
    .map((e) => ({
      id: e.id,
      podcastName: PODCASTS.find((p) => p.slug === e.podcast_slug)?.displayName ?? e.podcast_slug,
      title: e.title, date: e.episode_date, extracts: byEpisode.get(e.id) ?? [],
    }));
}

export async function setExtractStatus(db: SupabaseClient, extractId: string, approved: boolean): Promise<void> {
  const { error } = await db.from("podcast_extracts")
    .update({ status: approved ? "approved" : "pending", updated_at: new Date().toISOString() })
    .eq("id", extractId).neq("status", "published");
  if (error) throw new Error(error.message);
}

export async function setEpisodeExtractsStatus(db: SupabaseClient, episodeId: string, approved: boolean): Promise<void> {
  const { error } = await db.from("podcast_extracts")
    .update({ status: approved ? "approved" : "pending", updated_at: new Date().toISOString() })
    .eq("episode_id", episodeId).eq("status", approved ? "pending" : "approved");
  if (error) throw new Error(error.message);
}

export async function saveExtractText(db: SupabaseClient, extractId: string, text: string): Promise<void> {
  if (!text.trim()) throw new Error("Extract text cannot be empty. Delete the extract instead.");
  const { error } = await db.from("podcast_extracts")
    .update({ text: text.trim(), status: "approved", updated_at: new Date().toISOString() })
    .eq("id", extractId).neq("status", "published");
  if (error) throw new Error(error.message);
}

export async function deleteExtract(db: SupabaseClient, extractId: string): Promise<void> {
  const { error } = await db.from("podcast_extracts").delete().eq("id", extractId).neq("status", "published");
  if (error) throw new Error(error.message);
}

/** For episodes that produced nothing worth publishing. */
export async function markEpisodeDone(db: SupabaseClient, episodeId: string): Promise<void> {
  const { count } = await db.from("podcast_extracts").select("id", { count: "exact", head: true })
    .eq("episode_id", episodeId).in("status", ["pending", "approved"]);
  if ((count ?? 0) > 0) throw new Error("This episode still has extracts to review.");
  await saveEpisode(db, episodeId, { status: "published", error: null });
}

// ─── Publish ────────────────────────────────────────────────────────────────

/**
 * Append a section to the player's commentary row for this source.
 * Returns false when a section with that title already exists (idempotent),
 * exactly as write_to_db._append_commentary_section did.
 */
async function appendCommentarySection(
  db: SupabaseClient, playerId: string, title: string, text: string, source: string,
): Promise<boolean> {
  const { data: existing, error } = await db.from("commentary")
    .select("id, sections").eq("player_id", playerId).eq("source", source).maybeSingle();
  if (error) throw new Error(error.message);

  const section = { title, text };
  if (existing) {
    const sections: { title: string | null; text: string }[] = existing.sections ?? [];
    if (sections.some((s) => s.title === title)) return false;
    const { error: upErr } = await db.from("commentary").update({ sections: [...sections, section] }).eq("id", existing.id);
    if (upErr) throw new Error(upErr.message);
  } else {
    const { error: insErr } = await db.from("commentary").insert({ player_id: playerId, source, sections: [section] });
    if (insErr) throw new Error(insErr.message);
  }
  return true;
}

export interface PublishResult { written: number; existed: number; skipped: string[]; errors: string[]; episodesCompleted: number }

export async function publishApproved(db: SupabaseClient): Promise<PublishResult> {
  const { data: rows, error } = await db.from("podcast_extracts")
    .select("id, episode_id, player_id, name, text, podcast_episodes(podcast_slug, title, episode_date)")
    .eq("status", "approved");
  if (error) throw new Error(error.message);

  const result: PublishResult = { written: 0, existed: 0, skipped: [], errors: [], episodesCompleted: 0 };
  const touched = new Set<string>();

  for (const r of rows ?? []) {
    const ep = r.podcast_episodes as unknown as { podcast_slug: string; title: string; episode_date: string } | null;
    if (!ep) { result.errors.push(`${r.name}: episode record missing`); continue; }
    if (!r.player_id) { result.skipped.push(`${r.name} (player no longer on the board)`); continue; }
    try {
      const written = await appendCommentarySection(
        db, r.player_id, sectionTitle(ep.episode_date, ep.title), r.text, getPodcast(ep.podcast_slug).sourceName,
      );
      if (written) result.written++; else result.existed++;
      const { error: upErr } = await db.from("podcast_extracts")
        .update({ status: "published", updated_at: new Date().toISOString() }).eq("id", r.id);
      if (upErr) throw new Error(upErr.message);
      touched.add(r.episode_id);
    } catch (e) {
      result.errors.push(`${r.name}: ${errMsg(e)}`);
    }
  }

  // An episode is finished once nothing is left pending or approved.
  for (const episodeId of touched) {
    const { count } = await db.from("podcast_extracts").select("id", { count: "exact", head: true })
      .eq("episode_id", episodeId).in("status", ["pending", "approved"]);
    if ((count ?? 0) === 0) {
      await saveEpisode(db, episodeId, { status: "published" });
      result.episodesCompleted++;
    }
  }

  return result;
}

// ─── Reconcile ──────────────────────────────────────────────────────────────

export interface UnmatchedRow {
  id: string;
  slug: string;
  name: string;
  source: string;
  episodeTitle: string | null;
  episodeDate: string | null;
  text: string;
}

export interface BoardPlayer { id: string; slug: string; name: string; position: string | null }

export async function getReconcileData(db: SupabaseClient): Promise<{ rows: UnmatchedRow[]; players: BoardPlayer[] }> {
  const { data, error } = await db.from("unmatched_commentary").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const players: BoardPlayer[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error: pErr } = await db.from("players").select("id, slug, name, position").order("name").range(from, from + 999);
    if (pErr) throw new Error(pErr.message);
    players.push(...(page ?? []));
    if (!page || page.length < 1000) break;
  }

  return {
    rows: (data ?? []).map((r) => ({
      id: r.id, slug: r.slug, name: r.name, source: r.source,
      episodeTitle: r.episode_title, episodeDate: r.episode_date, text: r.text,
    })),
    players,
  };
}

/** Filter each row with Step 2, publish it under the chosen player, then remove it from the queue. */
export async function reconcileRows(db: SupabaseClient, rowIds: string[], playerId: string): Promise<{ written: number; existed: number }> {
  const { data: player, error: pErr } = await db.from("players").select("id, name").eq("id", playerId).single();
  if (pErr || !player) throw new Error("Player not found.");
  const { data: rows, error } = await db.from("unmatched_commentary").select("*").in("id", rowIds);
  if (error) throw new Error(error.message);

  let written = 0, existed = 0;
  for (const r of rows ?? []) {
    const { text } = await step2Filter(player.name, r.text);
    const ok = await appendCommentarySection(
      db, player.id, sectionTitle(r.episode_date ?? "", r.episode_title ?? ""), text, r.source,
    );
    if (ok) written++; else existed++;
    const { error: delErr } = await db.from("unmatched_commentary").delete().eq("id", r.id);
    if (delErr) throw new Error(delErr.message);
  }
  return { written, existed };
}

export async function dismissRows(db: SupabaseClient, rowIds: string[]): Promise<void> {
  const { error } = await db.from("unmatched_commentary").delete().in("id", rowIds);
  if (error) throw new Error(error.message);
}
