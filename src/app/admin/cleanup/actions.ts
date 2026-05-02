"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { CANONICAL_COLLEGES } from "@/lib/normalize-college";
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
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

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
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

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

// ─── School Audit ────────────────────────────────────────────────────────────

export interface SchoolVariant {
  /** Raw value stored in players.college */
  raw: string;
  /** Player IDs that have this value */
  playerIds: string[];
  /** Player names for display */
  playerNames: string[];
  /** True if an exact canonical match exists */
  isCanonical: boolean;
  /** True if a correction already exists in college_corrections */
  hasCorrection: boolean;
  /** The canonical value from correction, if any */
  correctionTarget: string | null;
}

/**
 * Scan all player college values and return those that are not already
 * canonical or covered by an existing correction.
 */
export async function auditSchoolNames(): Promise<SchoolVariant[]> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  const canonicalSet = new Set(CANONICAL_COLLEGES.map((c) => c.toLowerCase()));

  // Load all players with a non-null college
  const { data: players } = await supabase
    .from("players")
    .select("id, name, college")
    .not("college", "is", null)
    .order("college");

  if (!players) return [];

  // Load all existing corrections
  const { data: corrections } = await supabase
    .from("college_corrections")
    .select("variant, canonical");

  const correctionMap = new Map<string, string>(
    (corrections ?? []).map((c: { variant: string; canonical: string }) => [c.variant.toLowerCase(), c.canonical])
  );

  // Group by raw college value
  const grouped = new Map<string, { ids: string[]; names: string[] }>();
  for (const p of players) {
    const raw = (p.college as string).trim();
    if (!raw) continue;
    if (!grouped.has(raw)) grouped.set(raw, { ids: [], names: [] });
    grouped.get(raw)!.ids.push(p.id as string);
    grouped.get(raw)!.names.push(p.name as string);
  }

  const results: SchoolVariant[] = [];
  for (const [raw, { ids, names }] of grouped) {
    const lower = raw.toLowerCase();
    const isCanonical = canonicalSet.has(lower);
    const correctionTarget = correctionMap.get(lower) ?? null;
    const hasCorrection = correctionTarget !== null;

    // Only surface entries that are NOT already canonical and NOT already corrected
    if (!isCanonical && !hasCorrection) {
      results.push({ raw, playerIds: ids, playerNames: names, isCanonical, hasCorrection, correctionTarget });
    }
  }

  // Sort by number of affected players descending, then alphabetically
  results.sort((a, b) => b.playerIds.length - a.playerIds.length || a.raw.localeCompare(b.raw));

  return results;
}

/**
 * Apply a school correction: write to college_corrections and back-fill players.college.
 */
export async function applySchoolCorrection(
  raw: string,
  canonical: string,
): Promise<{ error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  const { error: ccErr } = await supabase
    .from("college_corrections")
    .upsert({ variant: raw.toLowerCase(), canonical }, { onConflict: "variant" });
  if (ccErr) return { error: ccErr.message };

  await supabase.from("players").update({ college: canonical }).eq("college", raw);

  revalidatePath("/admin/cleanup");
  revalidatePath("/players");
  return {};
}

/**
 * Dismiss a raw school value by adding it to college_corrections mapping to itself
 * (treated as acceptable as-is / effectively canonical).
 */
export async function dismissSchoolVariant(raw: string): Promise<{ error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("college_corrections")
    .upsert({ variant: raw.toLowerCase(), canonical: raw }, { onConflict: "variant" });
  if (error) return { error: error.message };

  revalidatePath("/admin/cleanup");
  return {};
}

// ─── Duplicate Players Audit ─────────────────────────────────────────────────

export interface DuplicatePlayer {
  id: string;
  name: string;
  slug: string;
  position: string | null;
  college: string | null;
  draftYear: number;
  hasProfile: boolean;
  dataCounts: Record<string, number>;
}

export interface DuplicatePair {
  pairKey: string;
  playerA: DuplicatePlayer;
  playerB: DuplicatePlayer;
  reason: string;
}

function compactName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const PLAYER_ID_TABLES = [
  "board_entries", "player_rankings", "adp_entries", "mock_picks",
  "position_board_entries", "player_comps", "projected_rounds",
  "commentary", "media_links", "injury_history", "ages",
] as const;

async function getPlayerDataCounts(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  playerId: string,
  slug: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of PLAYER_ID_TABLES) {
    const { count } = await supabase
      .from(t).select("*", { count: "exact", head: true }).eq("player_id", playerId);
    if (count && count > 0) counts[t] = count;
  }
  for (const t of ["rankings", "positional_rankings"] as const) {
    const { count } = await supabase
      .from(t).select("*", { count: "exact", head: true }).eq("slug", slug);
    if (count && count > 0) counts[t] = count;
  }
  return counts;
}

/**
 * Find potential duplicate players by comparing compact (alphanumeric-only) names.
 * Returns pairs where two players share the same compact name.
 */
export async function auditDuplicatePlayers(): Promise<DuplicatePair[]> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  const { data: players } = await supabase
    .from("players")
    .select("id, name, slug, position, college, draft_year, overview")
    .order("name");
  if (!players) return [];

  // Group by compact name
  const grouped = new Map<string, typeof players>();
  for (const p of players) {
    const key = compactName(p.name as string);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  const pairs: DuplicatePair[] = [];

  for (const [, group] of grouped) {
    if (group.length < 2) continue;

    // Generate all pairs within the group
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        const [aCounts, bCounts] = await Promise.all([
          getPlayerDataCounts(supabase, a.id as string, a.slug as string),
          getPlayerDataCounts(supabase, b.id as string, b.slug as string),
        ]);

        const aHasProfile = a.overview != null && JSON.stringify(a.overview) !== "{}";
        const bHasProfile = b.overview != null && JSON.stringify(b.overview) !== "{}";

        const reasons: string[] = [];
        if ((a.slug as string) === (b.slug as string)) reasons.push("identical slug");
        else if (compactName(a.name as string) === compactName(b.name as string)) reasons.push("same name (different format)");
        if ((a.draft_year as number) === (b.draft_year as number)) reasons.push("same draft year");

        pairs.push({
          pairKey: `${a.id}__${b.id}`,
          playerA: {
            id: a.id as string,
            name: a.name as string,
            slug: a.slug as string,
            position: (a.position as string) ?? null,
            college: (a.college as string) ?? null,
            draftYear: a.draft_year as number,
            hasProfile: aHasProfile,
            dataCounts: aCounts,
          },
          playerB: {
            id: b.id as string,
            name: b.name as string,
            slug: b.slug as string,
            position: (b.position as string) ?? null,
            college: (b.college as string) ?? null,
            draftYear: b.draft_year as number,
            hasProfile: bHasProfile,
            dataCounts: bCounts,
          },
          reason: reasons.join(", ") || "same compact name",
        });
      }
    }
  }

  return pairs;
}

/**
 * Merge two players: move all data from `deleteId` to `keepId`, then delete `deleteId`.
 */
export async function mergeDuplicatePlayers(
  keepId: string,
  keepSlug: string,
  deleteId: string,
  deleteSlug: string,
): Promise<{ error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  // Move player_id-keyed rows
  for (const t of PLAYER_ID_TABLES) {
    await supabase.from(t).update({ player_id: keepId }).eq("player_id", deleteId);
  }

  // Update slug-keyed rows (only if slugs differ)
  if (keepSlug !== deleteSlug) {
    await supabase.from("rankings").update({ slug: keepSlug }).eq("slug", deleteSlug);
    await supabase.from("positional_rankings").update({ slug: keepSlug }).eq("slug", deleteSlug);
  }

  // Delete the duplicate player record
  const { error } = await supabase.from("players").delete().eq("id", deleteId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/cleanup");
  revalidatePath("/players");
  revalidatePath("/");
  return {};
}
