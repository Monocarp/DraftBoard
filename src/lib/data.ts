import "server-only";
import { supabase } from "./supabase";

// Re-export types so server pages can import everything from @/lib/data
export type {
  BoardPlayer, BigBoard, PlayerIndex, Ranking, Commentary, PlayerProfile,
  MockPick, RankingEntry, ADPEntry, PositionBoardPlayer,
} from "./types";

import type {
  BigBoard, BoardPlayer, ExpandedBoardPlayer, PlayerIndex, PlayerProfile,
  MockPick, RankingEntry, ADPEntry, PositionBoardPlayer,
  Ranking, Commentary,
} from "./types";

// ─── Source Filtering ────────────────────────────────────────────────────────

/** Sources excluded from public display (legacy migration artifacts). */
const HIDDEN_SOURCES = new Set(["Bleacher", "Con", "Premier Con."]);

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Supabase caps `.select()` at 1 000 rows by default.
 *  This helper fetches ALL rows in pages of 1 000. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll<T>(
  table: string,
  select: string = "*",
  filter?: (q: any) => any,
): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q: any = supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`Supabase error (${table}): ${error.message}`);
    if (!data || data.length === 0) break;
    all = all.concat(data as T[]);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ─── Big Board ──────────────────────────────────────────────────────────────

export async function getBigBoard(): Promise<BigBoard> {
  const rows = await fetchAll<{
    board_type: string;
    rank: number;
    grades: Record<string, string | number>;
    ranks: Record<string, string | number>;
    summary: string | null;
    players: { slug: string; name: string; position: string | null; college: string | null };
  }>("board_entries", "board_type, rank, grades, ranks, summary, players(slug, name, position, college)");

  const consensus: BoardPlayer[] = [];
  const bengals: BoardPlayer[] = [];
  const expanded: ExpandedBoardPlayer[] = [];

  for (const r of rows) {
    const p = r.players as unknown as { slug: string; name: string; position: string | null; college: string | null };
    const base: BoardPlayer = {
      rank: r.rank,
      player: p.name,
      position: p.position ?? "",
      school: p.college ?? "",
      slug: p.slug,
    };
    if (r.board_type === "consensus") consensus.push(base);
    else if (r.board_type === "bengals") bengals.push(base);
    else if (r.board_type === "expanded") {
      expanded.push({ ...base, grades: r.grades ?? {}, ranks: r.ranks ?? {}, summary: r.summary ?? null });
    }
  }

  consensus.sort((a, b) => a.rank - b.rank);
  bengals.sort((a, b) => a.rank - b.rank);
  expanded.sort((a, b) => a.rank - b.rank);

  return { consensus, bengals, expanded };
}

// ─── Enriched Big Board (adds year + age) ───────────────────────────────────

export async function getEnrichedBigBoard(): Promise<BigBoard> {
  const board = await getBigBoard();

  // Gather all slugs we need ages/years for
  const allSlugs = new Set<string>();
  [...board.consensus, ...board.bengals, ...board.expanded].forEach((p) => allSlugs.add(p.slug));

  // Fetch ages + year from DB in one go
  const { data: ageRows } = await supabase
    .from("ages")
    .select("player_id, age_final, players(slug, year)")
    .limit(1000);

  const ageMap = new Map<string, { age_final: string | null; year: string | null }>();
  for (const a of ageRows ?? []) {
    const pl = (a as Record<string, unknown>).players as { slug: string; year: string | null } | null;
    if (pl) ageMap.set(pl.slug, { age_final: a.age_final, year: pl.year });
  }

  // Also fetch year from players directly for those without an age row
  const { data: playerRows } = await supabase
    .from("players")
    .select("slug, year")
    .in("slug", [...allSlugs])
    .limit(1000);
  const yearMap = new Map<string, string | null>();
  for (const p of playerRows ?? []) yearMap.set(p.slug, p.year);

  const enrich = <T extends { slug: string }>(players: T[]) =>
    players.map((p) => {
      const age = ageMap.get(p.slug);
      return {
        ...p,
        year: age?.year ?? yearMap.get(p.slug) ?? null,
        age: age?.age_final ?? null,
      };
    });

  return {
    consensus: enrich(board.consensus),
    bengals: enrich(board.bengals),
    expanded: enrich(board.expanded),
  };
}

// ─── Players Index ──────────────────────────────────────────────────────────

export async function getPlayers(): Promise<PlayerIndex[]> {
  // Only return players that have profiles (non-empty overview)
  const rows = await fetchAll<{
    name: string; slug: string; position: string | null; college: string | null;
    height: string | null; weight: string | null; age: number | null;
    year: string | null; projected_round: string | null; games: number | null;
  }>(
    "players",
    "name, slug, position, college, height, weight, age, year, projected_round, games",
    (q) => q.not("overview", "eq", "{}"),
  );

  return rows.map((r) => ({
    name: r.name,
    slug: r.slug,
    position: r.position,
    college: r.college,
    height: r.height,
    weight: r.weight,
    age: r.age,
    year: r.year,
    projected_round: r.projected_round,
    games: r.games,
  }));
}

// ─── Player Profile ─────────────────────────────────────────────────────────

export async function getPlayerProfile(slug: string): Promise<PlayerProfile | null> {
  // Core player data
  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!player) return null;

  const pid = player.id as string;

  // Fetch related data in parallel
  const [
    { data: rankings },
    { data: comps },
    { data: projRounds },
    { data: commentaryRows },
    { data: mediaLinks },
    { data: injuries },
    { data: adpEntries },
  ] = await Promise.all([
    supabase.from("player_rankings").select("source, overall_rank, positional_rank").eq("player_id", pid),
    supabase.from("player_comps").select("source, comp").eq("player_id", pid),
    supabase.from("projected_rounds").select("source, round").eq("player_id", pid),
    supabase.from("commentary").select("source, sections").eq("player_id", pid),
    supabase.from("media_links").select("description, source, url").eq("player_id", pid),
    supabase.from("injury_history").select("detail, recovery_time, year").eq("player_id", pid),
    supabase.from("adp_entries").select("source, adp_value").eq("player_id", pid),
  ]);

  // Build adp_by_source map (exclude hidden sources)
  const adp_by_source: Record<string, number | null> = {};
  for (const a of adpEntries ?? []) {
    if (!HIDDEN_SOURCES.has(a.source)) adp_by_source[a.source] = a.adp_value;
  }

  // Build projected_round_by_source map
  const projected_round_by_source: Record<string, string | null> = {};
  for (const pr of projRounds ?? []) {
    projected_round_by_source[pr.source] = pr.round;
  }

  // Build player_comps map
  const player_comps: Record<string, string> = {};
  for (const c of comps ?? []) {
    player_comps[c.source] = c.comp;
  }

  const profile: PlayerProfile = {
    name: player.name,
    slug: player.slug,
    position: player.position,
    college: player.college,
    height: player.height,
    weight: player.weight,
    age: player.age,
    dob: player.dob,
    year: player.year,
    projected_round: player.projected_round,
    games: player.games,
    snaps: player.snaps,
    overview: player.overview ?? {},
    site_ratings: player.site_ratings ?? {},
    pff_scores: player.pff_scores ?? {},
    athletic_scores: player.athletic_scores ?? {},
    rankings: (rankings ?? []).filter((r) => !HIDDEN_SOURCES.has(r.source)).map((r) => ({
      source: r.source,
      overall_rank: r.overall_rank,
      positional_rank: r.positional_rank,
    })) as Ranking[],
    adp_by_source,
    projected_round_by_source,
    player_comps,
    strengths: player.strengths,
    weaknesses: player.weaknesses,
    accolades: player.accolades,
    player_summary: player.player_summary,
    draftbuzz_grades: player.draftbuzz_grades ?? {},
    projected_role: player.projected_role,
    ideal_scheme: player.ideal_scheme,
    alignments: player.alignments ?? {},
    skills_traits: player.skills_traits ?? {},
    media_links: (mediaLinks ?? []).map((m) => ({
      description: m.description ?? "",
      source: m.source ?? undefined,
      url: m.url ?? undefined,
    })),
    commentary: (commentaryRows ?? []).map((c) => ({
      source: c.source,
      sections: c.sections ?? [],
    })) as Commentary[],
    injury_history: (injuries ?? []).map((i) => ({
      detail: i.detail,
      recovery_time: i.recovery_time,
      year: i.year,
    })),
  };

  return profile;
}

// ─── All Player Slugs (for generateStaticParams) ───────────────────────────

export async function getAllPlayerSlugs(): Promise<string[]> {
  const rows = await fetchAll<{ slug: string }>(
    "players",
    "slug",
    (q) => q.not("overview", "eq", "{}"),
  );
  return rows.map((r) => r.slug);
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

export async function getMocks(): Promise<{ mocks: Record<string, MockPick[]>; mock_dates: Record<string, string> }> {
  const rows = await fetchAll<{
    source: string; pick_number: number; team: string;
    player_name: string; position: string | null; college: string | null;
    players: { slug: string } | null;
  }>("mock_picks", "source, pick_number, team, player_name, position, college, players(slug)");

  const mocks: Record<string, MockPick[]> = {};
  for (const r of rows) {
    if (!mocks[r.source]) mocks[r.source] = [];
    const pl = r.players as unknown as { slug: string } | null;
    mocks[r.source].push({
      pick: r.pick_number,
      team: r.team,
      player: r.player_name,
      position: r.position,
      college: r.college,
      slug: pl?.slug ?? null,
    });
  }
  // Sort picks within each source
  for (const src of Object.keys(mocks)) {
    mocks[src].sort((a, b) => (a.pick ?? 0) - (b.pick ?? 0));
  }

  // Source dates
  const { data: dateRows } = await supabase
    .from("source_dates")
    .select("source, date")
    .eq("source_type", "mock");

  const mock_dates: Record<string, string> = {};
  for (const d of dateRows ?? []) {
    mock_dates[d.source] = d.date ?? "";
  }

  return { mocks, mock_dates };
}

// ─── Rankings ───────────────────────────────────────────────────────────────

export async function getRankings(): Promise<{ players: RankingEntry[]; source_dates: Record<string, string> }> {
  // Fetch all ranking rows with player info
  const rows = await fetchAll<{
    source: string; rank_value: number | null; slug: string;
    players: { name: string; position: string | null; college: string | null; height: string | null; weight: string | null; eligibility: string | null };
  }>("rankings", "source, rank_value, slug, players(name, position, college, height, weight, eligibility)");

  // Group by slug (exclude hidden sources)
  const playerMap = new Map<string, RankingEntry>();
  for (const r of rows) {
    if (HIDDEN_SOURCES.has(r.source)) continue;
    const p = r.players as unknown as { name: string; position: string | null; college: string | null; height: string | null; weight: string | null; eligibility: string | null };
    if (!playerMap.has(r.slug)) {
      playerMap.set(r.slug, {
        player: p.name,
        school: p.college,
        position: p.position,
        height: p.height,
        weight: p.weight,
        eligibility: p.eligibility,
        athletic_score: null,
        source_rankings: {},
        slug: r.slug,
      });
    }
    const entry = playerMap.get(r.slug)!;
    entry.source_rankings[r.source] = r.rank_value;
  }

  const players = [...playerMap.values()];

  // Source dates
  const { data: dateRows } = await supabase
    .from("source_dates")
    .select("source, date")
    .eq("source_type", "ranking");

  const source_dates: Record<string, string> = {};
  for (const d of dateRows ?? []) {
    source_dates[d.source] = d.date ?? "";
  }

  return { players, source_dates };
}

// ─── ADP ────────────────────────────────────────────────────────────────────

export async function getADP(): Promise<{ players: ADPEntry[]; source_dates: Record<string, string> }> {
  const rows = await fetchAll<{
    source: string; adp_value: number | null;
    players: { slug: string; name: string; position: string | null; college: string | null };
  }>("adp_entries", "source, adp_value, players(slug, name, position, college)");

  const playerMap = new Map<string, ADPEntry>();
  for (const r of rows) {
    const p = r.players as unknown as { slug: string; name: string; position: string | null; college: string | null };
    if (!playerMap.has(p.slug)) {
      playerMap.set(p.slug, {
        player: p.name,
        school: p.college,
        position: p.position,
        source_adps: {},
        consensus_adp: null,
        slug: p.slug,
      });
    }
    const entry = playerMap.get(p.slug)!;
    entry.source_adps[r.source] = r.adp_value;
  }

  // Compute consensus from "Con" source, then strip hidden sources from display
  for (const entry of playerMap.values()) {
    if (entry.source_adps["Con"] != null) {
      entry.consensus_adp = entry.source_adps["Con"] as number;
    }
    for (const src of HIDDEN_SOURCES) delete entry.source_adps[src];
  }

  return { players: [...playerMap.values()], source_dates: {} };
}

// ─── Position Boards ────────────────────────────────────────────────────────

/** Sources used to compute consensus for position board ranking columns. */
const CONSENSUS_SOURCES = ["Brugler", "NFL.com", "CBS", "PFF", "ESPN"];

export async function getPositionBoards(): Promise<Record<string, PositionBoardPlayer[]>> {
  const rows = await fetchAll<{
    player_id: string;
    position_group: string; pos_rank: number | null;
    height: string | null; weight: string | null; age: string | null;
    projected_role: string | null; projected_round: string | null;
    grades: Record<string, string | number>;
    pff_scores: Record<string, { value: string | number; percentile: number | null } | string | number>;
    athletic_scores: Record<string, string | number>;
    strengths: string | null; weaknesses: string | null;
    players: { slug: string; name: string; position: string | null; college: string | null };
  }>("position_board_entries", "player_id, position_group, pos_rank, height, weight, age, projected_role, projected_round, grades, pff_scores, athletic_scores, strengths, weaknesses, players(slug, name, position, college)");

  // Fetch live rankings for all board players in one query
  const playerIds = [...new Set(rows.map((r) => r.player_id))];
  const rankingRows = await fetchAll<{
    player_id: string; source: string; overall_rank: number | null; positional_rank: number | null;
  }>("player_rankings", "player_id, source, overall_rank, positional_rank", (q) =>
    q.in("player_id", playerIds).in("source", CONSENSUS_SOURCES)
  );

  // Index rankings by player_id
  const rankingsByPlayer = new Map<string, { source: string; overall_rank: number | null; positional_rank: number | null }[]>();
  for (const rk of rankingRows) {
    if (!rankingsByPlayer.has(rk.player_id)) rankingsByPlayer.set(rk.player_id, []);
    rankingsByPlayer.get(rk.player_id)!.push(rk);
  }

  const boards: Record<string, PositionBoardPlayer[]> = {};
  for (const r of rows) {
    const p = r.players as unknown as { slug: string; name: string; position: string | null; college: string | null };
    const pRankings = rankingsByPlayer.get(r.player_id) || [];

    // Build overall_rankings and pos_rankings from live data
    const overall_rankings: Record<string, string | number> = {};
    const pos_rankings: Record<string, string | number> = {};
    const overallValues: number[] = [];
    const posValues: number[] = [];

    for (const rk of pRankings) {
      if (rk.overall_rank != null) {
        overall_rankings[rk.source] = rk.overall_rank;
        overallValues.push(rk.overall_rank);
      }
      if (rk.positional_rank != null) {
        pos_rankings[rk.source] = rk.positional_rank;
        posValues.push(rk.positional_rank);
      }
    }

    // Compute consensus averages
    if (overallValues.length > 0) {
      overall_rankings["Avg"] = Math.round((overallValues.reduce((a, b) => a + b, 0) / overallValues.length) * 10) / 10;
    }
    if (posValues.length > 0) {
      pos_rankings["Avg"] = Math.round((posValues.reduce((a, b) => a + b, 0) / posValues.length) * 10) / 10;
    }

    if (!boards[r.position_group]) boards[r.position_group] = [];
    boards[r.position_group].push({
      name: p.name,
      slug: p.slug,
      position: p.position ?? "",
      school: p.college,
      pos_rank: r.pos_rank,
      height: r.height,
      weight: r.weight,
      age: r.age,
      projected_role: r.projected_role,
      projected_round: r.projected_round,
      grades: r.grades ?? {},
      pff_scores: r.pff_scores ?? {},
      athletic_scores: r.athletic_scores ?? {},
      strengths: r.strengths,
      weaknesses: r.weaknesses,
      overall_rankings,
      pos_rankings,
    });
  }

  // Sort by pos_rank within each group
  for (const group of Object.keys(boards)) {
    boards[group].sort((a, b) => (a.pos_rank ?? 999) - (b.pos_rank ?? 999));
  }

  return boards;
}

// ─── Ages ───────────────────────────────────────────────────────────────────

export async function getAges(): Promise<Array<{ player: string; slug: string; age_final: string | number | null }>> {
  const rows = await fetchAll<{
    age_final: string | null;
    players: { slug: string; name: string };
  }>("ages", "age_final, players(slug, name)");

  return rows.map((r) => {
    const p = r.players as unknown as { slug: string; name: string };
    return {
      player: p.name,
      slug: p.slug,
      age_final: r.age_final,
    };
  });
}

// ─── Profile Count ──────────────────────────────────────────────────────────

export async function getProfileCount(): Promise<number> {
  const { count } = await supabase
    .from("players")
    .select("id", { count: "exact", head: true })
    .not("overview", "eq", "{}");
  return count ?? 0;
}
