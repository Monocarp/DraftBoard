"use server";

// Server actions for /admin/podcasts. Each one checks the caller is the admin,
// then delegates to lib/podcast/pipeline.ts with a service-role client.
//
// Service role is required: podcast_episodes and podcast_extracts have RLS
// enabled with no policies, since they hold unreviewed transcripts/extracts.

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import * as pipeline from "@/lib/podcast/pipeline";

export type {
  EpisodeStatus, EpisodeListItem, StepResult, ReviewExtract, ReviewEpisode,
  PublishResult, UnmatchedRow, BoardPlayer,
} from "@/lib/podcast/pipeline";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const auth = await createSupabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");
  return createServiceClient();
}

/** Player pages render commentary; refresh them after anything is published. */
function revalidateSite() {
  for (const path of ["/", "/players", "/player", "/admin/podcasts"]) revalidatePath(path);
}

// ─── Episodes / processing ──────────────────────────────────────────────────

export async function getEpisodesView() {
  return pipeline.getEpisodesView(await requireAdmin());
}

export async function startEpisode(podcastSlug: string, guid: string) {
  return pipeline.startEpisode(await requireAdmin(), podcastSlug, guid);
}

export async function runEpisodeStep(id: string) {
  return pipeline.runEpisodeStep(await requireAdmin(), id);
}

export async function reprocessEpisode(id: string) {
  return pipeline.reprocessEpisode(await requireAdmin(), id);
}

export async function restartTranscription(id: string) {
  return pipeline.restartTranscription(await requireAdmin(), id);
}

// ─── Review ─────────────────────────────────────────────────────────────────

export async function getReviewData() {
  return pipeline.getReviewData(await requireAdmin());
}

export async function setExtractStatus(extractId: string, approved: boolean) {
  return pipeline.setExtractStatus(await requireAdmin(), extractId, approved);
}

export async function setEpisodeExtractsStatus(episodeId: string, approved: boolean) {
  return pipeline.setEpisodeExtractsStatus(await requireAdmin(), episodeId, approved);
}

export async function saveExtractText(extractId: string, text: string) {
  return pipeline.saveExtractText(await requireAdmin(), extractId, text);
}

export async function deleteExtract(extractId: string) {
  return pipeline.deleteExtract(await requireAdmin(), extractId);
}

export async function markEpisodeDone(episodeId: string) {
  return pipeline.markEpisodeDone(await requireAdmin(), episodeId);
}

export async function publishApproved() {
  const result = await pipeline.publishApproved(await requireAdmin());
  if (result.written > 0) revalidateSite();
  return result;
}

// ─── Reconcile ──────────────────────────────────────────────────────────────

export async function getReconcileData() {
  return pipeline.getReconcileData(await requireAdmin());
}

export async function reconcileRows(rowIds: string[], playerId: string) {
  const result = await pipeline.reconcileRows(await requireAdmin(), rowIds, playerId);
  if (result.written > 0) revalidateSite();
  return result;
}

export async function dismissRows(rowIds: string[]) {
  return pipeline.dismissRows(await requireAdmin(), rowIds);
}
