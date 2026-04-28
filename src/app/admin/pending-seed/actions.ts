"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PendingSeedPlayer {
  id: string;
  name: string;
  slug: string;
  position: string | null;
  college: string | null;
  conflict_reason: string | null;
  created_at: string;
}

export interface SeedPlayerOption {
  id: string;
  name: string;
  slug: string;
  position: string | null;
  college: string | null;
}

export interface PendingSeedData {
  pending: PendingSeedPlayer[];
  players: SeedPlayerOption[];
  pendingCount: number;
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function getPendingSeedData(): Promise<PendingSeedData> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  const [pendingRes, playersRes] = await Promise.all([
    supabase
      .from("pending_seed_players")
      .select("id, name, slug, position, college, conflict_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("players")
      .select("id, name, slug, position, college")
      .eq("draft_year", 2027)
      .order("name"),
  ]);

  const pending = (pendingRes.data ?? []) as PendingSeedPlayer[];
  const players = (playersRes.data ?? []) as SeedPlayerOption[];

  return { pending, players, pendingCount: pending.length };
}

export async function getPendingSeedCount(): Promise<number> {
  const supabase = await createSupabaseServer();
  const { count } = await supabase
    .from("pending_seed_players")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/**
 * Create a new 2027 player from a pending seed entry, optionally overriding
 * the name (to resolve slug conflicts between two real players).
 */
export async function createSeedPlayer(
  pendingId: string,
  overrideName?: string,
): Promise<{ error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  const { data: pending } = await supabase
    .from("pending_seed_players")
    .select("name, slug, position, college")
    .eq("id", pendingId)
    .single();
  if (!pending) return { error: "Pending entry not found" };

  const finalName = overrideName?.trim() || pending.name;
  const finalSlug = finalName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Check the new slug isn't taken either
  const { data: existing } = await supabase
    .from("players")
    .select("id")
    .eq("slug", finalSlug)
    .eq("draft_year", 2027)
    .maybeSingle();

  if (existing) return { error: `Slug '${finalSlug}' already exists in 2027 players` };

  const { error } = await supabase.from("players").insert({
    name: finalName,
    slug: finalSlug,
    position: pending.position,
    college: pending.college,
    draft_year: 2027,
    overview: {},
  });

  if (error) return { error: error.message };

  await supabase.from("pending_seed_players").delete().eq("id", pendingId);

  revalidatePath("/admin/pending-seed");
  return {};
}

/**
 * Map a pending seed entry to an existing 2027 player by adding a
 * name_corrections entry, then dismiss the pending row.
 */
export async function mapSeedPlayer(
  pendingId: string,
  targetPlayerId: string,
): Promise<{ error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  const { data: pending } = await supabase
    .from("pending_seed_players")
    .select("name")
    .eq("id", pendingId)
    .single();
  if (!pending) return { error: "Pending entry not found" };

  const { data: player } = await supabase
    .from("players")
    .select("slug")
    .eq("id", targetPlayerId)
    .single();
  if (!player) return { error: "Target player not found" };

  // Write name correction so future uploads match this name to the existing player
  await supabase
    .from("name_corrections")
    .upsert({ variant_name: pending.name, canonical_slug: player.slug }, { onConflict: "variant_name" });

  await supabase.from("pending_seed_players").delete().eq("id", pendingId);

  revalidatePath("/admin/pending-seed");
  return {};
}

/**
 * Dismiss without creating — for entries that are genuinely not needed.
 */
export async function dismissSeedPlayer(pendingId: string): Promise<{ error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  await supabase.from("pending_seed_players").delete().eq("id", pendingId);

  revalidatePath("/admin/pending-seed");
  return {};
}
