"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getAuthUser() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

// ─── User Big Board ─────────────────────────────────────────────────────────

export async function populateUserBoard(orderedSlugs: string[]) {
  const { supabase, user } = await getAuthUser();

  // Resolve slugs to player_ids
  const { data: players } = await supabase
    .from("players")
    .select("id, slug")
    .in("slug", orderedSlugs);

  if (!players) return { error: "Failed to load players" };

  const slugToId = new Map<string, string>();
  for (const p of players) slugToId.set(p.slug as string, p.id as string);

  // Delete existing board
  await supabase.from("user_boards").delete().eq("user_id", user.id);

  // Insert new board
  const inserts = orderedSlugs
    .map((slug, i) => {
      const playerId = slugToId.get(slug);
      if (!playerId) return null;
      return { user_id: user.id, player_id: playerId, rank: i + 1 };
    })
    .filter(Boolean);

  if (inserts.length > 0) {
    const { error } = await supabase.from("user_boards").insert(inserts);
    if (error) return { error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}

export async function addToUserBoard(playerSlug: string) {
  const { supabase, user } = await getAuthUser();

  // Resolve player_id from slug
  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("slug", playerSlug)
    .single();

  if (!player) return { error: "Player not found" };

  // Check if already on board
  const { data: existing } = await supabase
    .from("user_boards")
    .select("id")
    .eq("user_id", user.id)
    .eq("player_id", player.id)
    .maybeSingle();

  if (existing) return { error: "Already on your board" };

  // Get max rank
  const { data: maxRow } = await supabase
    .from("user_boards")
    .select("rank")
    .eq("user_id", user.id)
    .order("rank", { ascending: false })
    .limit(1)
    .maybeSingle();

  const newRank = (maxRow?.rank ?? 0) + 1;

  const { error } = await supabase.from("user_boards").insert({
    user_id: user.id,
    player_id: player.id,
    rank: newRank,
  });

  if (error) return { error: error.message };

  revalidatePath("/");
  return { success: true };
}

export async function removeFromUserBoard(playerSlug: string) {
  const { supabase, user } = await getAuthUser();

  // Resolve player_id from slug
  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("slug", playerSlug)
    .single();

  if (!player) return { error: "Player not found" };

  await supabase
    .from("user_boards")
    .delete()
    .eq("user_id", user.id)
    .eq("player_id", player.id);

  // Re-rank remaining entries
  const { data: remaining } = await supabase
    .from("user_boards")
    .select("id")
    .eq("user_id", user.id)
    .order("rank");

  if (remaining) {
    await Promise.all(
      remaining.map((r, i) =>
        supabase.from("user_boards").update({ rank: i + 1 }).eq("id", r.id)
      )
    );
  }

  revalidatePath("/");
  return { success: true };
}

export async function reorderUserBoard(orderedSlugs: string[]) {
  const { supabase, user } = await getAuthUser();

  // Get all user board entries
  const { data: entries } = await supabase
    .from("user_boards")
    .select("id, players(slug)")
    .eq("user_id", user.id);

  if (!entries) return { error: "Failed to load board" };

  // Build slug → id map
  const slugToId = new Map<string, string>();
  for (const e of entries) {
    const p = e.players as unknown as { slug: string };
    slugToId.set(p.slug, e.id as string);
  }

  // Update ranks
  const updates = orderedSlugs
    .map((slug, i) => {
      const id = slugToId.get(slug);
      if (!id) return null;
      return supabase.from("user_boards").update({ rank: i + 1 }).eq("id", id);
    })
    .filter(Boolean);

  await Promise.all(updates);

  revalidatePath("/");
  return { success: true };
}

export async function searchPlayersForBoard(query: string) {
  if (!query || query.length < 2) return [];

  const supabase = (await createSupabaseServer());
  const { data } = await supabase
    .from("players")
    .select("slug, name, position, college")
    .ilike("name", `%${query}%`)
    .order("name")
    .limit(20);

  return (data ?? []).map((p) => ({
    slug: p.slug as string,
    name: p.name as string,
    position: (p.position as string) ?? null,
    college: (p.college as string) ?? null,
  }));
}

// ─── User Position Ranks ────────────────────────────────────────────────────

export async function setUserPositionRanks(
  positionGroup: string,
  orderedSlugs: string[],
) {
  const { supabase, user } = await getAuthUser();

  // Resolve slugs to player_ids
  const { data: players } = await supabase
    .from("players")
    .select("id, slug")
    .in("slug", orderedSlugs);

  if (!players) return { error: "Failed to load players" };

  const slugToId = new Map<string, string>();
  for (const p of players) slugToId.set(p.slug as string, p.id as string);

  // Delete existing ranks for this user + position group
  await supabase
    .from("user_position_ranks")
    .delete()
    .eq("user_id", user.id)
    .eq("position_group", positionGroup);

  // Insert new ranks
  const inserts = orderedSlugs
    .map((slug, i) => {
      const playerId = slugToId.get(slug);
      if (!playerId) return null;
      return {
        user_id: user.id,
        player_id: playerId,
        position_group: positionGroup,
        rank: i + 1,
      };
    })
    .filter(Boolean);

  if (inserts.length > 0) {
    const { error } = await supabase.from("user_position_ranks").insert(inserts);
    if (error) return { error: error.message };
  }

  revalidatePath("/boards");
  return { success: true };
}

export async function clearUserPositionRanks(positionGroup: string) {
  const { supabase, user } = await getAuthUser();

  await supabase
    .from("user_position_ranks")
    .delete()
    .eq("user_id", user.id)
    .eq("position_group", positionGroup);

  revalidatePath("/boards");
  return { success: true };
}
