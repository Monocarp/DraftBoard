"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

// ─── Big Board Actions ──────────────────────────────────────────────────────

export async function reorderBoard(
  boardType: string,
  orderedEntryIds: string[]
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Update ranks based on array order
  const updates = orderedEntryIds.map((id, index) =>
    supabase
      .from("board_entries")
      .update({ rank: index + 1 })
      .eq("id", id)
      .eq("board_type", boardType)
  );

  await Promise.all(updates);

  revalidatePath("/admin/boards");
  revalidatePath("/");
}

export async function addPlayerToBoard(
  boardType: string,
  playerSlug: string
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Get the player ID from slug
  const { data: player } = await supabase
    .from("players")
    .select("id")
    .eq("slug", playerSlug)
    .single();

  if (!player) return { error: "Player not found" };

  // Check if already on this board
  const { data: existing } = await supabase
    .from("board_entries")
    .select("id")
    .eq("player_id", player.id)
    .eq("board_type", boardType)
    .maybeSingle();

  if (existing) return { error: "Player is already on this board" };

  // Get current max rank
  const { data: maxRow } = await supabase
    .from("board_entries")
    .select("rank")
    .eq("board_type", boardType)
    .order("rank", { ascending: false })
    .limit(1)
    .maybeSingle();

  const newRank = (maxRow?.rank ?? 0) + 1;

  const { error } = await supabase.from("board_entries").insert({
    player_id: player.id,
    board_type: boardType,
    rank: newRank,
    grades: {},
    ranks: {},
    summary: null,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/boards");
  revalidatePath("/");
  return { success: true };
}

export async function removePlayerFromBoard(entryId: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Get the entry to know the board type and rank for re-ranking
  const { data: entry } = await supabase
    .from("board_entries")
    .select("board_type, rank")
    .eq("id", entryId)
    .single();

  if (!entry) return { error: "Entry not found" };

  await supabase.from("board_entries").delete().eq("id", entryId);

  // Re-rank remaining entries
  const { data: remaining } = await supabase
    .from("board_entries")
    .select("id")
    .eq("board_type", entry.board_type)
    .order("rank");

  if (remaining) {
    const updates = remaining.map((r, i) =>
      supabase.from("board_entries").update({ rank: i + 1 }).eq("id", r.id)
    );
    await Promise.all(updates);
  }

  revalidatePath("/admin/boards");
  revalidatePath("/");
  return { success: true };
}

// ─── Position Board Actions ─────────────────────────────────────────────────

export async function reorderPositionBoard(
  positionGroup: string,
  orderedEntryIds: string[]
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const updates = orderedEntryIds.map((id, index) =>
    supabase
      .from("position_board_entries")
      .update({ pos_rank: index + 1 })
      .eq("id", id)
      .eq("position_group", positionGroup)
  );

  await Promise.all(updates);

  revalidatePath("/admin/boards/positions");
  revalidatePath("/boards");
}

export async function addPlayerToPositionBoard(
  positionGroup: string,
  playerSlug: string
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: player } = await supabase
    .from("players")
    .select("id, position, college, height, weight, age, projected_round, projected_role, strengths, weaknesses")
    .eq("slug", playerSlug)
    .single();

  if (!player) return { error: "Player not found" };

  const { data: existing } = await supabase
    .from("position_board_entries")
    .select("id")
    .eq("player_id", player.id)
    .eq("position_group", positionGroup)
    .maybeSingle();

  if (existing) return { error: "Player is already on this position board" };

  const { data: maxRow } = await supabase
    .from("position_board_entries")
    .select("pos_rank")
    .eq("position_group", positionGroup)
    .order("pos_rank", { ascending: false })
    .limit(1)
    .maybeSingle();

  const newRank = (maxRow?.pos_rank ?? 0) + 1;

  const { error } = await supabase.from("position_board_entries").insert({
    player_id: player.id,
    position_group: positionGroup,
    pos_rank: newRank,
    height: player.height,
    weight: player.weight,
    age: player.age?.toString() ?? null,
    projected_role: player.projected_role,
    projected_round: player.projected_round,
    strengths: player.strengths,
    weaknesses: player.weaknesses,
    grades: {},
    pff_scores: {},
    athletic_scores: {},
    overall_rankings: {},
    pos_rankings: {},
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/boards/positions");
  revalidatePath("/boards");
  return { success: true };
}

export async function removePlayerFromPositionBoard(entryId: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: entry } = await supabase
    .from("position_board_entries")
    .select("position_group, pos_rank")
    .eq("id", entryId)
    .single();

  if (!entry) return { error: "Entry not found" };

  await supabase.from("position_board_entries").delete().eq("id", entryId);

  const { data: remaining } = await supabase
    .from("position_board_entries")
    .select("id")
    .eq("position_group", entry.position_group)
    .order("pos_rank");

  if (remaining) {
    const updates = remaining.map((r, i) =>
      supabase.from("position_board_entries").update({ pos_rank: i + 1 }).eq("id", r.id)
    );
    await Promise.all(updates);
  }

  revalidatePath("/admin/boards/positions");
  revalidatePath("/boards");
  return { success: true };
}

// ─── Player Search (for add-player dropdowns) ──────────────────────────────

export async function searchPlayers(query: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (!query || query.length < 2) return [];

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
