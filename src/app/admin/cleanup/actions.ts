"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

export interface IncompletPlayer {
  id: string;
  name: string;
  slug: string;
  position: string | null;
  college: string | null;
  hasProfile: boolean;
  /** Tables with data referencing this player */
  dataCounts: Record<string, number>;
}

const EMPTY = new Set(["", "TBD", "tbd", "Tbd", "N/A", "n/a", "—", "-", "Unknown", "unknown"]);

function isMissing(val: unknown): boolean {
  if (val == null) return true;
  if (typeof val === "string" && EMPTY.has(val.trim())) return true;
  return false;
}

/**
 * Find all players whose position OR college is blank / TBD.
 * Returns player info + counts of data in child tables.
 */
export async function auditIncompletePlayers(): Promise<IncompletPlayer[]> {
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: players } = await supabase
    .from("players")
    .select("id, name, slug, position, college, overview")
    .order("name");

  if (!players) return [];

  // Filter to incomplete
  const incomplete = players.filter(
    (p) => isMissing(p.position) || isMissing(p.college),
  );

  // For each incomplete player, count related data
  const results: IncompletPlayer[] = [];

  for (const p of incomplete) {
    const id = p.id as string;
    const slug = p.slug as string;

    const counts: Record<string, number> = {};

    // player_id-keyed tables
    const pidTables = [
      "board_entries", "player_rankings", "adp_entries", "mock_picks",
      "position_board_entries", "player_comps", "projected_rounds",
      "commentary", "media_links", "injury_history", "ages",
    ];
    for (const t of pidTables) {
      const { count } = await supabase
        .from(t)
        .select("*", { count: "exact", head: true })
        .eq("player_id", id);
      if (count && count > 0) counts[t] = count;
    }

    // slug-keyed tables
    for (const t of ["rankings", "positional_rankings"]) {
      const { count } = await supabase
        .from(t)
        .select("*", { count: "exact", head: true })
        .eq("slug", slug);
      if (count && count > 0) counts[t] = count;
    }

    const overview = p.overview as Record<string, unknown> | null;
    const hasProfile = overview != null && JSON.stringify(overview) !== "{}";

    results.push({
      id,
      name: p.name as string,
      slug,
      position: (p.position as string) ?? null,
      college: (p.college as string) ?? null,
      hasProfile,
      dataCounts: counts,
    });
  }

  return results;
}

/**
 * Delete a single player and all related data (same cascade as deletePlayer).
 * Does NOT redirect — this is called one at a time from the audit UI.
 */
export async function removeIncompletePlayer(
  playerId: string,
  slug: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Cascading delete across all child tables
  await supabase.from("board_entries").delete().eq("player_id", playerId);
  await supabase.from("rankings").delete().eq("slug", slug);
  await supabase.from("positional_rankings").delete().eq("slug", slug);
  await supabase.from("player_rankings").delete().eq("player_id", playerId);
  await supabase.from("adp_entries").delete().eq("player_id", playerId);
  await supabase.from("mock_picks").delete().eq("player_id", playerId);
  await supabase.from("position_board_entries").delete().eq("player_id", playerId);
  await supabase.from("player_comps").delete().eq("player_id", playerId);
  await supabase.from("projected_rounds").delete().eq("player_id", playerId);
  await supabase.from("commentary").delete().eq("player_id", playerId);
  await supabase.from("media_links").delete().eq("player_id", playerId);
  await supabase.from("injury_history").delete().eq("player_id", playerId);
  await supabase.from("ages").delete().eq("player_id", playerId);

  const { error } = await supabase.from("players").delete().eq("id", playerId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/cleanup");
  revalidatePath("/players");
  revalidatePath("/");

  return { success: true };
}
