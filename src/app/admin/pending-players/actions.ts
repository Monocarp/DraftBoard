"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { normalizePosition } from "@/lib/types";
import { revalidatePath } from "next/cache";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PendingPlayer {
  id: string;
  variant_name: string;
  source: string | null;
  position: string | null;
  college: string | null;
  status: string;
  created_at: string;
}

export interface PlayerOption {
  id: string;
  name: string;
  slug: string;
  position: string | null;
  college: string | null;
}

export interface PendingPageData {
  pending: PendingPlayer[];
  players: PlayerOption[];
  pendingCount: number;
}

// ─── Load ───────────────────────────────────────────────────────────────────

export async function getPendingData(): Promise<PendingPageData> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  const [pendingRes, playersRes] = await Promise.all([
    supabase
      .from("pending_players")
      .select("id, variant_name, source, position, college, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("players")
      .select("id, name, slug, position, college")
      .order("name"),
  ]);

  const pending = (pendingRes.data ?? []) as PendingPlayer[];
  const players = (playersRes.data ?? []) as PlayerOption[];

  return { pending, players, pendingCount: pending.length };
}

export async function getPendingCount(): Promise<number> {
  const supabase = await createSupabaseServer();
  const { count } = await supabase
    .from("pending_players")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

// ─── Actions ────────────────────────────────────────────────────────────────

/** Map a pending entry to an existing player — creates a name_corrections entry */
export async function mapPendingPlayer(pendingId: string, targetPlayerId: string): Promise<{ error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  // Get pending row
  const { data: pending } = await supabase
    .from("pending_players")
    .select("variant_name")
    .eq("id", pendingId)
    .single();
  if (!pending) return { error: "Pending entry not found" };

  // Get target player slug
  const { data: player } = await supabase
    .from("players")
    .select("slug")
    .eq("id", targetPlayerId)
    .single();
  if (!player) return { error: "Target player not found" };

  // Insert name_correction
  await supabase
    .from("name_corrections")
    .upsert({ variant_name: pending.variant_name, canonical_slug: player.slug }, { onConflict: "variant_name" });

  // Mark pending as mapped
  await supabase
    .from("pending_players")
    .update({ status: "mapped", resolved_player_id: targetPlayerId })
    .eq("id", pendingId);

  revalidatePath("/admin/pending-players");
  return {};
}

/** Create a new player from a pending entry */
export async function createPlayerFromPending(pendingId: string): Promise<{ error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  const { data: pending } = await supabase
    .from("pending_players")
    .select("variant_name, position, college")
    .eq("id", pendingId)
    .single();
  if (!pending) return { error: "Pending entry not found" };

  const name = pending.variant_name;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  // Check slug doesn't already exist
  const { data: existing } = await supabase.from("players").select("id").eq("slug", slug).maybeSingle();
  if (existing) return { error: `Slug "${slug}" already exists — map to existing instead` };

  const { data: created, error } = await supabase
    .from("players")
    .insert({
      name,
      slug,
      position: normalizePosition(pending.position ?? null) || null,
      college: pending.college || null,
    })
    .select("id")
    .single();

  if (error || !created) return { error: error?.message ?? "Insert failed" };

  await supabase
    .from("pending_players")
    .update({ status: "created", resolved_player_id: created.id })
    .eq("id", pendingId);

  revalidatePath("/admin/pending-players");
  return {};
}

/** Skip / dismiss a pending entry */
export async function skipPendingPlayer(pendingId: string): Promise<void> {
  const supabase = await createSupabaseServer();
  await supabase.from("pending_players").update({ status: "skipped" }).eq("id", pendingId);
  revalidatePath("/admin/pending-players");
}

/** Bulk skip all pending entries from a given source */
export async function skipAllFromSource(source: string): Promise<void> {
  const supabase = await createSupabaseServer();
  await supabase.from("pending_players").update({ status: "skipped" }).eq("source", source).eq("status", "pending");
  revalidatePath("/admin/pending-players");
}
