"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DataType =
  | "rankings"
  | "positional_rankings"
  | "adp"
  | "mocks"
  | "player_rankings"
  | "source_dates"
  | "pff_scores"
  | "draftbuzz_grades"
  | "athletic_scores"
  | "site_ratings"
  | "nfl_profiles";

export type ColumnMapping = Record<string, string>; // csv_header → db_column

export interface UploadResult {
  success: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Normalize a player name before lookup:
 * 1. Strip periods (Jr. → Jr, T.J. → TJ, K.C. → KC)
 * 2. Trim whitespace
 */
function normalizeName(name: string): string {
  return name
    .replace(/\./g, "")     // Remove ALL periods
    .replace(/\s+/g, " ")   // Collapse whitespace
    .trim();
}

/**
 * Create a "compact" slug that also strips apostrophes and hyphens
 * for fuzzy matching: "Ja'Kobi" and "JaKobi" both → "jakobi"
 */
function compactSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); // Strip everything non-alphanumeric
}

// ─── Player cache + corrections cache (built once per import batch) ─────────

interface PlayerCacheEntry {
  id: string;
  slug: string;
  name: string;
  compact: string; // compact slug for fuzzy matching
}

let playerCache: PlayerCacheEntry[] | null = null;
let correctionsCache: Map<string, string> | null = null; // normalized variant → canonical_slug

async function buildCaches(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>
) {
  if (!playerCache) {
    // Load all players once
    const PAGE = 1000;
    const allPlayers: PlayerCacheEntry[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("players")
        .select("id, slug, name")
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      for (const p of data) {
        allPlayers.push({
          id: p.id,
          slug: p.slug,
          name: p.name,
          compact: compactSlug(p.name),
        });
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    playerCache = allPlayers;
  }

  if (!correctionsCache) {
    // Load all name corrections
    correctionsCache = new Map();
    try {
      const { data } = await supabase
        .from("name_corrections")
        .select("variant_name, canonical_slug")
        .limit(5000);
      if (data) {
        for (const c of data) {
          // Store with normalized key (lowercase, no periods)
          correctionsCache.set(
            normalizeName(c.variant_name).toLowerCase(),
            c.canonical_slug
          );
        }
      }
    } catch {
      // Table might not exist yet — that's fine
    }
  }
}

function clearCaches() {
  playerCache = null;
  correctionsCache = null;
}

/** Look up a player using the full normalization pipeline, create if not found */
async function resolvePlayerId(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  playerName: string,
  extras?: { position?: string; college?: string }
): Promise<string | null> {
  await buildCaches(supabase);

  // Step 0: Normalize the input name (strip periods, whitespace)
  const normalized = normalizeName(playerName);
  if (!normalized) return null;

  // Step 1: Check name_corrections table
  const correctionKey = normalized.toLowerCase();
  const correctedSlug = correctionsCache?.get(correctionKey);
  if (correctedSlug) {
    const match = playerCache!.find((p) => p.slug === correctedSlug);
    if (match) return match.id;
  }

  // Step 2: Exact slug match (from normalized name)
  const slug = toSlug(normalized);
  if (!slug) return null;

  const exactMatch = playerCache!.find((p) => p.slug === slug);
  if (exactMatch) return exactMatch.id;

  // Step 3: Compact slug match (strips apostrophes/hyphens)
  // "JaKobi Lane" → "jakobilane" matches "Ja'Kobi Lane" → "jakobilane"
  const compact = compactSlug(normalized);
  const compactMatch = playerCache!.find((p) => p.compact === compact);
  if (compactMatch) return compactMatch.id;

  // Step 4: Auto-create a minimal player record
  const { data: created, error } = await supabase
    .from("players")
    .insert({
      name: normalized,
      slug,
      position: extras?.position || null,
      college: extras?.college || null,
    })
    .select("id")
    .single();

  if (error || !created) return null;

  // Add to cache so subsequent rows in the same batch can find it
  playerCache!.push({
    id: created.id,
    slug,
    name: normalized,
    compact: compactSlug(normalized),
  });

  return created.id;
}

// ─── Import: Rankings ───────────────────────────────────────────────────────

async function importRankings(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  sourceName: string,
): Promise<UploadResult> {
  const result: UploadResult = { success: true, inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const playerName = row[mapping["player_name"]];
    const rankRaw = row[mapping["rank"]];

    if (!playerName?.trim()) { result.skipped++; continue; }

    const playerId = await resolvePlayerId(supabase, playerName, {
      position: mapping["position"] ? row[mapping["position"]] : undefined,
      college: mapping["college"] ? row[mapping["college"]] : undefined,
    });

    if (!playerId) {
      result.errors.push(`Row ${i + 1}: Could not resolve player "${playerName}"`);
      result.skipped++;
      continue;
    }

    const slug = toSlug(playerName);
    const rankValue = rankRaw ? parseFloat(rankRaw) : null;

    const { data: existing } = await supabase
      .from("rankings")
      .select("id")
      .eq("player_id", playerId)
      .eq("source", sourceName)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("rankings")
        .update({ rank_value: rankValue, slug })
        .eq("id", existing.id);
      if (error) result.errors.push(`Row ${i + 1}: ${error.message}`);
      else result.updated++;
    } else {
      const { error } = await supabase
        .from("rankings")
        .insert({ player_id: playerId, source: sourceName, rank_value: rankValue, slug });
      if (error) result.errors.push(`Row ${i + 1}: ${error.message}`);
      else result.inserted++;
    }
  }

  return result;
}

// ─── Import: Positional Rankings ────────────────────────────────────────────

async function importPositionalRankings(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  sourceName: string,
): Promise<UploadResult> {
  const result: UploadResult = { success: true, inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const playerName = row[mapping["player_name"]];
    const rankRaw = row[mapping["rank"]];

    if (!playerName?.trim()) { result.skipped++; continue; }

    const playerId = await resolvePlayerId(supabase, playerName, {
      position: mapping["position"] ? row[mapping["position"]] : undefined,
      college: mapping["college"] ? row[mapping["college"]] : undefined,
    });

    if (!playerId) {
      result.errors.push(`Row ${i + 1}: Could not resolve player "${playerName}"`);
      result.skipped++;
      continue;
    }

    const slug = toSlug(playerName);
    const rankValue = rankRaw ? parseFloat(rankRaw) : null;

    const { data: existing } = await supabase
      .from("positional_rankings")
      .select("id")
      .eq("player_id", playerId)
      .eq("source", sourceName)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("positional_rankings")
        .update({ rank_value: rankValue, slug })
        .eq("id", existing.id);
      if (error) result.errors.push(`Row ${i + 1}: ${error.message}`);
      else result.updated++;
    } else {
      const { error } = await supabase
        .from("positional_rankings")
        .insert({ player_id: playerId, source: sourceName, rank_value: rankValue, slug });
      if (error) result.errors.push(`Row ${i + 1}: ${error.message}`);
      else result.inserted++;
    }
  }

  return result;
}

// ─── Import: ADP ────────────────────────────────────────────────────────────

async function importADP(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  sourceName: string,
): Promise<UploadResult> {
  const result: UploadResult = { success: true, inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const playerName = row[mapping["player_name"]];
    const adpRaw = row[mapping["adp_value"]];

    if (!playerName?.trim()) { result.skipped++; continue; }

    const playerId = await resolvePlayerId(supabase, playerName, {
      position: mapping["position"] ? row[mapping["position"]] : undefined,
      college: mapping["college"] ? row[mapping["college"]] : undefined,
    });

    if (!playerId) {
      result.errors.push(`Row ${i + 1}: Could not resolve player "${playerName}"`);
      result.skipped++;
      continue;
    }

    const adpValue = adpRaw ? parseFloat(adpRaw) : null;

    const { data: existing } = await supabase
      .from("adp_entries")
      .select("id")
      .eq("player_id", playerId)
      .eq("source", sourceName)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("adp_entries")
        .update({ adp_value: adpValue })
        .eq("id", existing.id);
      if (error) result.errors.push(`Row ${i + 1}: ${error.message}`);
      else result.updated++;
    } else {
      const { error } = await supabase
        .from("adp_entries")
        .insert({ player_id: playerId, source: sourceName, adp_value: adpValue });
      if (error) result.errors.push(`Row ${i + 1}: ${error.message}`);
      else result.inserted++;
    }
  }

  return result;
}

// ─── Import: Mocks ──────────────────────────────────────────────────────────

async function importMocks(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  sourceName: string,
): Promise<UploadResult> {
  const result: UploadResult = { success: true, inserted: 0, updated: 0, skipped: 0, errors: [] };

  // First, delete existing mock for this source (replace strategy)
  await supabase.from("mock_picks").delete().eq("source", sourceName);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const pickRaw = row[mapping["pick_number"]];
    const team = row[mapping["team"]];
    const playerName = row[mapping["player_name"]];

    if (!playerName?.trim() || !pickRaw?.trim()) { result.skipped++; continue; }

    const pickNumber = parseInt(pickRaw, 10);
    if (isNaN(pickNumber)) { result.skipped++; continue; }

    const position = mapping["position"] ? row[mapping["position"]] || null : null;
    const college = mapping["college"] ? row[mapping["college"]] || null : null;

    // Use the normalization pipeline to find player ID
    const normalizedName = normalizeName(playerName);
    const playerId = await resolvePlayerId(supabase, playerName, {
      position: position ?? undefined,
      college: college ?? undefined,
    });

    const { error } = await supabase.from("mock_picks").insert({
      source: sourceName,
      pick_number: pickNumber,
      team: team?.trim() || "TBD",
      player_id: playerId,
      player_name: normalizedName,
      position,
      college,
    });

    if (error) result.errors.push(`Row ${i + 1}: ${error.message}`);
    else result.inserted++;
  }

  return result;
}

// ─── Import: Player Rankings (profile page) ─────────────────────────────────

async function importPlayerRankings(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  sourceName: string,
): Promise<UploadResult> {
  const result: UploadResult = { success: true, inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const playerName = row[mapping["player_name"]];
    const overallRaw = row[mapping["overall_rank"]];
    const positionalRank = mapping["positional_rank"] ? row[mapping["positional_rank"]] || null : null;

    if (!playerName?.trim()) { result.skipped++; continue; }

    const playerId = await resolvePlayerId(supabase, playerName, {
      position: mapping["position"] ? row[mapping["position"]] : undefined,
      college: mapping["college"] ? row[mapping["college"]] : undefined,
    });

    if (!playerId) {
      result.errors.push(`Row ${i + 1}: Could not resolve player "${playerName}"`);
      result.skipped++;
      continue;
    }

    const overallRank = overallRaw ? parseFloat(overallRaw) : null;

    const { data: existing } = await supabase
      .from("player_rankings")
      .select("id")
      .eq("player_id", playerId)
      .eq("source", sourceName)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("player_rankings")
        .update({ overall_rank: overallRank, positional_rank: positionalRank })
        .eq("id", existing.id);
      if (error) result.errors.push(`Row ${i + 1}: ${error.message}`);
      else result.updated++;
    } else {
      const { error } = await supabase
        .from("player_rankings")
        .insert({ player_id: playerId, source: sourceName, overall_rank: overallRank, positional_rank: positionalRank });
      if (error) result.errors.push(`Row ${i + 1}: ${error.message}`);
      else result.inserted++;
    }
  }

  return result;
}

// ─── Import: Source Dates ───────────────────────────────────────────────────

async function importSourceDates(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): Promise<UploadResult> {
  const result: UploadResult = { success: true, inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const source = row[mapping["source"]];
    const sourceType = row[mapping["source_type"]];
    const date = row[mapping["date"]];

    if (!source?.trim() || !sourceType?.trim()) { result.skipped++; continue; }

    const { data: existing } = await supabase
      .from("source_dates")
      .select("id")
      .eq("source", source.trim())
      .eq("source_type", sourceType.trim())
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("source_dates")
        .update({ date: date || null })
        .eq("id", existing.id);
      if (error) result.errors.push(`Row ${i + 1}: ${error.message}`);
      else result.updated++;
    } else {
      const { error } = await supabase
        .from("source_dates")
        .insert({ source: source.trim(), source_type: sourceType.trim(), date: date || null });
      if (error) result.errors.push(`Row ${i + 1}: ${error.message}`);
      else result.inserted++;
    }
  }

  return result;
}

// ─── PFF Position Config ────────────────────────────────────────────────────
// Maps template display label → PFF_Stats CSV column header, per position group

type PffColumnMapping = [string, string][]; // [templateLabel, csvColumnHeader]

const PFF_POSITION_COLUMNS: Record<string, PffColumnMapping> = {
  CB: [
    ["25 Grade", "25 Grade"], ["24 Grade", "24 Grade"], ["23 Grade", "23 Grade"],
    ["Coverage Grade", "Coverage Grade"], ["Passer Rating", "Passer Rating Against"],
    ["Interceptions", "Interceptions"], ["Forced Incom.", "Forced Incom."],
    ["Forced Inc. Rate", "Forced Incom. Rate"], ["Dropped Picks", "Dropped Picks"],
    ["Completion %", "Completion % Allowed"], ["Man Coverage", "Man Coverage"],
    ["Zone Coverage", "Zone Coverage"], ["% In Man", "Man %"], ["% In Zone", "Zone %"],
    ["Coverage Stops", "Coverage Stops"], ["Tackling", "Tackling Grade"],
    ["Missed Tackles", "Missed Tackles"], ["Missed Tackle Rate", "Missed Tackle Rate"],
    ["Run Def Grade", "Run Def Grade"],
  ],
  SAF: [
    ["25 Grade", "25 Grade"], ["24 Grade", "24 Grade"], ["23 Grade", "23 Grade"],
    ["Coverage Grade", "Coverage Grade"], ["Interceptions", "Interceptions"],
    ["Forced Inc. Rate", "Forced Incom. Rate"], ["Passer Rating Alwd", "Passer Rating Against"],
    ["TD Allowed/Ints", "TD Allowed/Ints"], ["Coverage Stops", "Coverage Stops"],
    ["Run Def Grade", "Run Def Grade"], ["Run Stops", "Run Stops"],
    ["Tackling Grade", "Tackling Grade"], ["Tackles", "Tackles"],
    ["Assisted Tackles", "Assisted Tackles"], ["Missed Tackles", "Missed Tackles"],
    ["Missed Tackle Rate", "Missed Tackle Rate"],
  ],
  DT: [
    ["25 Grade", "25 Grade"], ["24 Grade", "24 Grade"], ["23 Grade", "23 Grade"],
    ["Pass Rush Grade", "Pass Rush Grade"], ["True Pass Rush", "True Pass Rush"],
    ["PR Win Rate", "PR Win Rate"], ["Run Def. Grade", "Run Def Grade"],
    ["Run Stop %", "Run Stop %"], ["Sacks", "Sacks"], ["Hits", "Hits"],
    ["Hurries", "Hurries"], ["Batted Balls", "Batted Balls"],
    ["Forced Fumbles", "Forced Fumbles"], ["Tackling Grade", "Tackling Grade2"],
    ["Missed Tackle Rate", "Missed Tackle Rate2"], ["Total Pressures", "Total Pressures"],
  ],
  EDGE: [
    ["25 Grade", "25 Grade"], ["24 Grade", "24 Grade"], ["23 Grade", "23 Grade"],
    ["Pass Rush Grade", "Pass Rush Grade"], ["True Pass Rush", "True Pass Rush"],
    ["PR Win Rate", "PR Win Rate"], ["Run Def. Grade", "Run Def Grade"],
    ["Run Stop %", "Run Stop %"], ["Sacks", "Sacks"], ["Hits", "Hits"],
    ["Hurries", "Hurries"], ["Batted Balls", "Batted Balls"],
    ["Forced Fumbles", "Forced Fumbles"], ["Tackling Grade", "Tackling Grade2"],
    ["Missed Tackle Rate", "Missed Tackle Rate2"], ["Total Pressures", "Total Pressures"],
  ],
  LB: [
    ["25 Grade", "25 Grade"], ["24 Grade", "24 Grade"], ["23 Grade", "23 Grade"],
    ["Pass Rush Grade", "Pass Rush Grade"], ["Run Def. Grade", "Run Def Grade"],
    ["Run Stop %", "Run Stop %"], ["Tackles", "Tackles"],
    ["Tackling Grade", "Tackling Grade"], ["Missed Tkl Rate", "Missed Tackle Rate"],
    ["ADORT", "Average Depth of Target Coverage"], ["Coverage", "Coverage Grade"],
    ["Coverage Stops", "Coverage Stops"], ["Recs/Tgts", "Receptions/Tgts"],
    ["Completion %", "Completion % Allowed"], ["TD / INT", "TD Allowed/Ints"],
    ["Forced Inc Rate", "Forced Incom. Rate"], ["Pass Rat. All.", "Passer Rating Against"],
  ],
  OL: [
    ["2025 Grade", "25 Grade"], ["2024 Grade", "24 Grade"], ["2023 Grade", "23 Grade"],
    ["Run Block Grade", "Run Block Grade"], ["Pass Block Grade", "Pass Block Grade"],
    ["True Pass Set Grade", "True Pass Set Grade"],
    ["Pass Block Efficiency", "Pass Block Efficiency"],
    ["Zone Grade", "Zone Blocking Grade"], ["Gap Grade", "Gap Blocking Grade"],
    ["Sacks Allowed", "Sacks Allowed"], ["Hits Allowed", "Hits Allowed"],
    ["Hurries Allowed", "Hurries Allowed"], ["Pressures Allowed", "Pressures Allowed"],
    ["Penalties", "Penalties"],
  ],
  OT: [
    ["2025 Grade", "25 Grade"], ["2024 Grade", "24 Grade"], ["2023 Grade", "23 Grade"],
    ["Run Block Grade", "Run Block Grade"], ["Pass Block Grade", "Pass Block Grade"],
    ["True Pass Set Grade", "True Pass Set Grade"],
    ["Pass Block Efficiency", "Pass Block Efficiency"],
    ["Zone Grade", "Zone Blocking Grade"], ["Gap Grade", "Gap Blocking Grade"],
    ["Sacks Allowed", "Sacks Allowed"], ["Hits Allowed", "Hits Allowed"],
    ["Hurries Allowed", "Hurries Allowed"], ["Pressures Allowed", "Pressures Allowed"],
    ["Penalties", "Penalties"],
  ],
  IOL: [
    ["2025 Grade", "25 Grade"], ["2024 Grade", "24 Grade"], ["2023 Grade", "23 Grade"],
    ["Run Block Grade", "Run Block Grade"], ["Pass Block Grade", "Pass Block Grade"],
    ["True Pass Set Grade", "True Pass Set Grade"],
    ["Pass Block Efficiency", "Pass Block Efficiency"],
    ["Zone Grade", "Zone Blocking Grade"], ["Gap Grade", "Gap Blocking Grade"],
    ["Sacks Allowed", "Sacks Allowed"], ["Hits Allowed", "Hits Allowed"],
    ["Hurries Allowed", "Hurries Allowed"], ["Pressures Allowed", "Pressures Allowed"],
    ["Penalties", "Penalties"],
  ],
  QB: [
    ["23 Grade", "25 Grade"], ["22 Grade", "24 Grade"], ["21 Grade", "23 Grade"],
    ["Passing Grade", "Passing Grade"], ["Intermediate Grade", "Intermediate Passing Grade"],
    ["Deep Grade", "Deep Passing Grade"], ["No Pressure Grade", "No Pressure Grade"],
    ["Pressure Grade", "Pressure Grade"], ["Adjusted Comp %", "Adjusted Comp %"],
    ["Average DOT", "Passing Average Depth of Target"],
    ["Big Time Throw", "Big Time Throw"], ["TO Worthy Plays", "TO Worthy Plays"],
    ["Pressure to Sack", "Pressure to Sack"], ["Avg Time to Throw", "Avg Time to Throw"],
    ["Deep Yards", "Deep Yards Thrown"], ["Screen Yards", "Screen Yards Thrown"],
    ["Touchdowns", "Touchdowns Thrown"], ["NFL Passer Rating", "NFL Passer Rating"],
  ],
  RB: [
    ["23 Grade", "25 Grade"], ["22 Grade", "24 Grade"], ["21 Grade", "23 Grade"],
    ["Rushing Grade", "Rushing Grade"], ["Zone Grade", "Zone Grade Rushing"],
    ["Gap Grade", "Gap Grade Rushing"], ["Elusiveness", "Elusiveness"],
    ["YAC per Att.", "YAC per Rush Att"], ["Missed Tkls For", "Missed Tkls Forced Rushing"],
    ["Runs of 15+", "Runs of 15+"], ["Yds per RR", "Yards/ Routes Run"],
    ["Breakaway %", "Breakaway Percentage"], ["Drops", "Drop %"],
    ["Explosive Runs(?)", "Explosive"], ["Fumbles", "Fumbles"],
    ["Ball Security Grade", "Ball Security"], ["Pass Block Grade", "Pass Block Grade"],
    ["Touchdowns", "Rushing Touchdowns"], ["Receiving Grade", "Receiving Grade"],
  ],
  WR: [
    ["2025 Grade", "25 Grade"], ["2024 Grade", "24 Grade"], ["2023 Grade", "23 Grade"],
    ["Receiving Grade", "Receiving Grade"], ["Yards/ Routes Run", "Yards/ Routes Run"],
    ["Drop %", "Drop %"], ["Contested Catch", "CCR"], ["Grade vs Man", "Grade vs Man"],
    ["YAC/Reception", "YAC/Reception"],
    ["Missed Tkls Forced", "Receving Missed Tkls Forced"],
    ["ADOT", "Receiving Average Depth of Target"],
    ["Deep Yards", "Deep Yards Receiving"], ["Touchdowns", "Touchdowns Caught"],
    ["Elusiveness", "Elusiveness"],
  ],
  TE: [
    ["2025 Grade", "25 Grade"], ["2024 Grade", "24 Grade"], ["2023 Grade", "23 Grade"],
    ["Receiving Grade", "Receiving Grade"], ["Drop %", "Drop %"],
    ["Cont. Catch Ratio", "CCR"], ["Yards Per Route Run", "Yards/ Routes Run"],
    ["YAC Per Reception", "YAC/Reception"],
    ["Missed Tkles Forced", "Receving Missed Tkls Forced"],
    ["Pass Block Grade", "Pass Block Grade"], ["Run Block Grade", "Run Block Grade"],
    ["Touchdowns", "Touchdowns Caught"],
  ],
};

// Alignment column mapping per position group
const ALIGNMENT_COLUMNS: Record<string, [string, string, string][]> = {
  // [templateLabel, csvCol_2025, csvCol_Career]
  CB: [
    ["D-Line", "Coverage D-Line Allignment", "Coverage Career D-Line Allignment"],
    ["Slot", "Coverage Slot Allignment", "Coverage Career Slot Allignment"],
    ["Corner", "Coverage Corner Allignment", "Coverage Career Corner Allignment"],
    ["Box", "Coverage Box Allignment", "Coverage Career Box Allignment"],
    ["Deep", "Coverage Deep Allignment", "Coverage Career Deep Allignment"],
  ],
  SAF: [
    ["Slot", "Coverage Slot Allignment", "Coverage Career Slot Allignment"],
    ["Box", "Coverage Box Allignment", "Coverage Career Box Allignment"],
    ["Corner", "Coverage Corner Allignment", "Coverage Career Corner Allignment"],
    ["Deep", "Coverage Deep Allignment", "Coverage Career Deep Allignment"],
  ],
  LB: [
    ["D-Line", "Coverage D-Line Allignment", "Coverage Career D-Line Allignment"],
    ["Slot", "Coverage Slot Allignment", "Coverage Career Slot Allignment"],
    ["Corner", "Coverage Corner Allignment", "Coverage Career Corner Allignment"],
    ["Box", "Coverage Box Allignment", "Coverage Career Box Allignment"],
    ["Deep", "Coverage Deep Allignment", "Coverage Career Deep Allignment"],
  ],
  DT: [
    ["A GAP", "Dline A Gap Allignment", "Dline Career A Gap Allignment"],
    ["B GAP", "Dline B Gap Allignment", "Dline Career B Gap Allignment"],
    ["Over Tackle", "Dline Over Tackle Allignment", "Dline Career Over Tackle Allignment"],
    ["Outside Tkl", "Dline Outside Tackle Allignment", "Dline Career Outside Tackle Allignment"],
    ["Off Ball", "Dline Off Ball Allignment", "Dline Career Offball Allignment"],
  ],
  EDGE: [
    ["A GAP", "Dline A Gap Allignment", "Dline Career A Gap Allignment"],
    ["B GAP", "Dline B Gap Allignment", "Dline Career B Gap Allignment"],
    ["Over Tackle", "Dline Over Tackle Allignment", "Dline Career Over Tackle Allignment"],
    ["Outside Tkl", "Dline Outside Tackle Allignment", "Dline Career Outside Tackle Allignment"],
    ["Off Ball", "Dline Off Ball Allignment", "Dline Career Offball Allignment"],
  ],
  OL: [
    ["LT", "LT Snaps", "Career LT Snaps"],
    ["LG", "LG Snaps", "Career LG Snaps"],
    ["C", "C Snaps", "Career C Snaps"],
    ["RG", "RG Snaps", "Career RG Snaps"],
    ["RT", "RT Snaps", "Career RT Snaps"],
  ],
  OT: [
    ["LT", "LT Snaps", "Career LT Snaps"],
    ["LG", "LG Snaps", "Career LG Snaps"],
    ["C", "C Snaps", "Career C Snaps"],
    ["RG", "RG Snaps", "Career RG Snaps"],
    ["RT", "RT Snaps", "Career RT Snaps"],
  ],
  IOL: [
    ["LT", "LT Snaps", "Career LT Snaps"],
    ["LG", "LG Snaps", "Career LG Snaps"],
    ["C", "C Snaps", "Career C Snaps"],
    ["RG", "RG Snaps", "Career RG Snaps"],
    ["RT", "RT Snaps", "Career RT Snaps"],
  ],
  WR: [
    ["Slot", "Slot Snaps", "Career Slot Snaps"],
    ["Wide", "Wide Snaps", "Career Wide Snaps"],
  ],
  TE: [
    ["Slot Snaps", "Slot Snaps", "Career Slot Snaps"],
    ["Inline Snaps", "Inline Snaps", "Inline Snaps"],
  ],
};

// DraftBuzz grade column names per position (CSV header → display label)
const DRAFTBUZZ_GRADE_COLUMNS: Record<string, [string, string][]> = {
  // [csvHeader, displayLabel]
  CB: [
    ["qbr", "QBR Allowed"], ["Tackling", "Tackling"], ["Run_Defense", "Run Defense"],
    ["Coverage", "Cov Grade"], ["Zone", "Zone Coverage"], ["Man_Press", "Man/Press"],
  ],
  SAF: [
    ["qbr", "QBR When Targeted"], ["Tackling", "Tackling"], ["Run_Defense", "Run Defense"],
    ["Coverage", "Coverage Grade"], ["Zone", "Zone Coverage"], ["Man_Press", "Man/Press"],
  ],
  DT: [["Tackling", "Tackling"], ["Pass_Rush", "Pass Rush"], ["Run_Defense", "Run Defense"]],
  EDGE: [["Tackling", "Tackling"], ["Pass_Rush", "Pass Rush"], ["Run_Defense", "Run Defense"]],
  DL: [["Tackling", "Tackling"], ["Pass_Rush", "Pass Rush"], ["Run_Defense", "Run Defense"]],
  LB: [
    ["Tackling", "Tackling"], ["Pass_Rush", "Pass Rush"],
    ["Run_Defense", "Run Defense"], ["Coverage", "Coverage"],
  ],
  OL: [["Pass_Blocking", "Pass Blocking Grade"], ["Run_Blocking", "Run Blocking Grade"]],
  OT: [["Pass_Blocking", "Pass Blocking Grade"], ["Run_Blocking", "Run Blocking Grade"]],
  IOL: [["Pass_Blocking", "Pass Blocking Grade"], ["Run_Blocking", "Run Blocking Grade"]],
  QB: [
    ["short_passing", "Short Passing"], ["med_passing", "Medium Passing"],
    ["long_passing", "Long Passing"], ["rush_scramble", "Rush/Scramble"],
  ],
  RB: [
    ["Rushing", "Rushing Grade"], ["Break_Tackles", "Break Tackles"],
    ["Receiving_Hands", "Receiving/Hands"], ["Pass_Blocking", "Pass Blocking"],
    ["Run_Blocking", "Run Blocking"],
  ],
  WR: [
    ["qbr", "QBR When Tgtd"], ["Hands", "Hands"], ["Short_Receiving", "Short Receiving"],
    ["Intermediate_Routes", "Med Routes"], ["Deep_Threat", "Deep Threat"],
    ["Blocking", "Blocking"],
  ],
  TE: [
    ["qbr", "QBR When Tgtd"], ["Hands", "Hands"], ["Short_Receiving", "Short Receiving"],
    ["Intermediate_Routes", "Intermediate Routes"], ["Deep_Threat", "Deep Threat"],
    ["Blocking", "Blocking"],
  ],
};

// Map DB sheet name suffix → position group (for auto-detection)
const DB_SHEET_POSITION_MAP: Record<string, string[]> = {
  CB: ["CB"],
  DL: ["DT", "EDGE", "DL"],
  LB: ["LB"],
  OL: ["OL", "OT", "IOL"],
  QB: ["QB"],
  RB: ["RB"],
  SAF: ["SAF"],
  TE: ["TE"],
  WR: ["WR"],
};

/** Normalize position string for lookup in config maps */
function normalizePosition(pos: string): string {
  const p = pos.trim().toUpperCase().replace(/\//g, "");
  // Map variants to standard keys
  if (["DE", "ED", "EDGE", "DEED", "LBED"].includes(p)) return "EDGE";
  if (["IDL", "DT", "NT", "DI", "DL"].includes(p)) return "DT";
  if (["S", "FS", "SS", "SAF"].includes(p)) return "SAF";
  if (["OG", "G", "C", "IOL"].includes(p)) return "IOL";
  if (["OT", "T"].includes(p)) return "OT";
  if (["ILB", "MLB"].includes(p)) return "LB";
  if (["HB", "FB"].includes(p)) return "RB";
  return p;
}

/**
 * Ensure a player's overview is non-empty so they appear as "having a profile".
 * Seeds overview with basic bio from top-level columns if currently empty.
 * Returns the (possibly seeded) overview merged with any new keys.
 */
async function ensureOverviewSeeded(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  playerId: string,
  existingOverview: Record<string, unknown> | null,
  newOverviewKeys?: Record<string, string | null>,
): Promise<Record<string, unknown>> {
  const existing = existingOverview || {};
  const merged = { ...existing, ...(newOverviewKeys || {}) };

  // If overview is already populated, just merge
  if (Object.keys(existing).length > 0) return merged;

  // Overview is empty — seed it from top-level player columns
  const { data: player } = await supabase
    .from("players")
    .select("position, college, height, weight, age, dob, year, games, snaps, projected_round")
    .eq("id", playerId)
    .single();

  if (player) {
    if (player.position && !merged["POS"]) merged["POS"] = player.position;
    if (player.college && !merged["College"]) merged["College"] = player.college;
    if (player.height && !merged["Height"]) merged["Height"] = player.height;
    if (player.weight && !merged["Weight"]) merged["Weight"] = String(player.weight);
    if (player.age && !merged["Age"]) merged["Age"] = String(player.age);
    if (player.dob && !merged["DOB"]) merged["DOB"] = player.dob;
    if (player.year && !merged["Year"]) merged["Year"] = player.year;
    if (player.games && !merged["Games"]) merged["Games"] = String(player.games);
    if (player.snaps && !merged["Snaps"]) merged["Snaps"] = String(player.snaps);
    if (player.projected_round && !merged["Prj. Rd"]) merged["Prj. Rd"] = player.projected_round;
  }

  return merged;
}

// ─── Bio Source Priority Resolution ─────────────────────────────────────────

/**
 * Source priority for bio fields (higher index = higher priority).
 * When multiple sources provide the same field (e.g. "age"),
 * the highest-priority source wins for the top-level column.
 */
const SOURCE_PRIORITY: string[] = [
  "manual",       // 0 – lowest: hand-entered fallback
  "draftbuzz",    // 1 – comprehensive but less accurate
  "nfl_com",      // 2 – NFL.com profiles
  "site_ratings", // 3 – aggregated site grades
  "pff",          // 4 – highest: premium source
];

/** The bio fields we track per-source */
type BioField = "age" | "dob" | "games" | "snaps" | "height" | "weight" | "year" | "position" | "college" | "projected_round";

const BIO_FIELDS: BioField[] = [
  "age", "dob", "games", "snaps", "height", "weight",
  "year", "position", "college", "projected_round",
];

/**
 * Write bio values to `bio_sources` under a source key, then resolve
 * the best value per field to top-level columns using SOURCE_PRIORITY.
 *
 * @param supabase  - Supabase client
 * @param playerId - Player UUID
 * @param source   - Source key (e.g. "pff", "draftbuzz")
 * @param values   - Map of bio field → value from this source
 */
async function writeBioSources(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  playerId: string,
  source: string,
  values: Partial<Record<BioField, string | number | null>>,
): Promise<void> {
  // Filter out null/empty values
  const clean: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== null && v !== undefined && v !== "" && v !== "#N/A") {
      clean[k] = v;
    }
  }
  if (Object.keys(clean).length === 0) return;

  // Fetch existing bio_sources
  const { data: existing } = await supabase
    .from("players")
    .select("bio_sources")
    .eq("id", playerId)
    .single();

  const bioSources: Record<string, Record<string, string | number>> =
    (existing?.bio_sources as Record<string, Record<string, string | number>>) || {};

  // Merge this source's values
  bioSources[source] = { ...(bioSources[source] || {}), ...clean };

  // Resolve best value per field
  const resolved: Record<string, string | number | null> = {};
  for (const field of BIO_FIELDS) {
    let bestValue: string | number | null = null;
    let bestPriority = -1;

    for (const [src, vals] of Object.entries(bioSources)) {
      if (vals[field] !== undefined && vals[field] !== null) {
        const priority = SOURCE_PRIORITY.indexOf(src);
        const effectivePriority = priority === -1 ? 0 : priority;
        if (effectivePriority > bestPriority) {
          bestPriority = effectivePriority;
          bestValue = vals[field];
        }
      }
    }

    if (bestValue !== null) {
      resolved[field] = bestValue;
    }
  }

  // Build update for top-level columns
  const updateData: Record<string, unknown> = { bio_sources: bioSources };

  if (resolved.age !== undefined) {
    const n = typeof resolved.age === "number" ? resolved.age : parseFloat(String(resolved.age));
    if (!isNaN(n)) updateData.age = n;
  }
  if (resolved.dob !== undefined) updateData.dob = String(resolved.dob);
  if (resolved.games !== undefined) {
    const n = typeof resolved.games === "number" ? resolved.games : parseInt(String(resolved.games), 10);
    if (!isNaN(n)) updateData.games = n;
  }
  if (resolved.snaps !== undefined) {
    const n = typeof resolved.snaps === "number" ? resolved.snaps : parseInt(String(resolved.snaps), 10);
    if (!isNaN(n)) updateData.snaps = n;
  }
  if (resolved.height !== undefined) updateData.height = String(resolved.height);
  if (resolved.weight !== undefined) updateData.weight = String(resolved.weight);
  if (resolved.year !== undefined) updateData.year = String(resolved.year);
  if (resolved.position !== undefined) updateData.position = String(resolved.position);
  if (resolved.college !== undefined) updateData.college = String(resolved.college);
  if (resolved.projected_round !== undefined) updateData.projected_round = String(resolved.projected_round);

  await supabase
    .from("players")
    .update(updateData)
    .eq("id", playerId);
}

// ─── Import: PFF Scores ─────────────────────────────────────────────────────

async function importPFFScores(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): Promise<UploadResult> {
  const result: UploadResult = { success: true, inserted: 0, updated: 0, skipped: 0, errors: [] };

  // Phase 1: Extract raw values per player
  interface PlayerPffRow {
    playerId: string;
    position: string;
    pffScores: Record<string, string>;
    alignments: Record<string, { "2025": number | null; career: number | null }>;
    overview: Record<string, string | null>;
  }
  const playerRows: PlayerPffRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const playerName = row[mapping["player_name"]];
    const rawPos = row[mapping["position"]] || "";

    if (!playerName?.trim()) { result.skipped++; continue; }

    const pos = normalizePosition(rawPos);
    if (!pos || pos === "TBD") {
      // No position assigned yet — can't determine which metrics to extract
      result.skipped++;
      continue;
    }
    const colMap = PFF_POSITION_COLUMNS[pos];
    if (!colMap) {
      result.errors.push(`Row ${i + 1}: Unknown position "${rawPos}" for "${playerName}"`);
      result.skipped++;
      continue;
    }

    const playerId = await resolvePlayerId(supabase, playerName, { position: rawPos });
    if (!playerId) {
      result.errors.push(`Row ${i + 1}: Could not resolve player "${playerName}"`);
      result.skipped++;
      continue;
    }

    // Extract PFF scores using position-specific column mapping
    const pffScores: Record<string, string> = {};
    for (const [label, csvCol] of colMap) {
      const val = row[csvCol];
      if (val !== undefined && val !== null && val !== "") {
        pffScores[label] = val;
      }
    }

    // Extract alignments
    const alignments: Record<string, { "2025": number | null; career: number | null }> = {};
    const alignCols = ALIGNMENT_COLUMNS[pos];
    if (alignCols) {
      for (const [label, col2025, colCareer] of alignCols) {
        const v2025 = row[col2025];
        const vCareer = row[colCareer];
        if ((v2025 && v2025 !== "") || (vCareer && vCareer !== "")) {
          alignments[label] = {
            "2025": v2025 ? parseFloat(v2025) || null : null,
            career: vCareer ? parseFloat(vCareer) || null : null,
          };
        }
      }
    }

    // Extract overview fields from PFF_Stats
    const overview: Record<string, string | null> = {};
    const overviewMap: [string, string][] = [
      ["Age", "Age"], ["Summary", "Summary"], ["Pros", "Pros"],
      ["Cons", "Cons"], ["Player Comp", "Player Comp"],
      ["Bottom Line", "Bottom Line"], ["Round Projection", "Round Projection"],
    ];
    for (const [key, csvCol] of overviewMap) {
      const val = row[csvCol];
      if (val !== undefined && val !== null && val !== "") {
        overview[key] = val;
      }
    }

    playerRows.push({ playerId, position: pos, pffScores, alignments, overview });
  }

  // Phase 2: Compute percentile ranks within position groups
  // Group players by position
  const byPosition = new Map<string, PlayerPffRow[]>();
  for (const pr of playerRows) {
    const group = byPosition.get(pr.position) || [];
    group.push(pr);
    byPosition.set(pr.position, group);
  }

  // For each position group, compute percentiles for each metric
  type PffWithPercentile = Record<string, { value: string; percentile: number | null }>;
  const playerPffFinal = new Map<string, PffWithPercentile>();

  for (const [, group] of byPosition) {
    // Collect all metric keys used in this position
    const allKeys = new Set<string>();
    for (const pr of group) {
      for (const k of Object.keys(pr.pffScores)) allKeys.add(k);
    }

    // Initialize final objects
    for (const pr of group) {
      if (!playerPffFinal.has(pr.playerId)) {
        playerPffFinal.set(pr.playerId, {});
      }
    }

    // For each metric, rank all players and assign percentiles
    for (const metric of allKeys) {
      // Collect (playerId, numericValue) pairs
      const values: [string, number][] = [];
      for (const pr of group) {
        const raw = pr.pffScores[metric];
        if (raw !== undefined) {
          const num = parseFloat(raw);
          if (!isNaN(num)) {
            values.push([pr.playerId, num]);
          } else {
            // Non-numeric value — store as-is with no percentile
            playerPffFinal.get(pr.playerId)![metric] = { value: raw, percentile: null };
          }
        }
      }

      if (values.length < 2) {
        // Not enough data to rank — store with null percentile
        for (const [pid, val] of values) {
          playerPffFinal.get(pid)![metric] = { value: String(val), percentile: null };
        }
        continue;
      }

      // Sort ascending by value
      values.sort((a, b) => a[1] - b[1]);

      // Assign percentile ranks (0..1) using average rank for ties
      const n = values.length;
      const rankMap = new Map<string, number>();
      let i = 0;
      while (i < n) {
        let j = i;
        while (j < n && values[j][1] === values[i][1]) j++;
        const avgRank = (i + j - 1) / 2;
        const percentile = n > 1 ? round3(1 - avgRank / (n - 1)) : 0.5;
        for (let k = i; k < j; k++) {
          rankMap.set(values[k][0], percentile);
        }
        i = j;
      }

      // Write back
      for (const [pid, val] of values) {
        playerPffFinal.get(pid)![metric] = {
          value: String(val),
          percentile: rankMap.get(pid) ?? null,
        };
      }
    }
  }

  // Phase 3: Write to database (merge with existing data)
  for (const pr of playerRows) {
    const pffScores = playerPffFinal.get(pr.playerId) || {};

    // Fetch existing player data to merge
    const { data: existing } = await supabase
      .from("players")
      .select("pff_scores, alignments, overview")
      .eq("id", pr.playerId)
      .single();

    const mergedPff = { ...(existing?.pff_scores || {}), ...pffScores };
    const mergedAlign = { ...(existing?.alignments || {}), ...pr.alignments };

    // Merge overview keys without auto-seeding (profile must be created explicitly)
    const mergedOverview = { ...(existing?.overview || {}), ...pr.overview };

    const { error } = await supabase
      .from("players")
      .update({
        pff_scores: mergedPff,
        alignments: mergedAlign,
        overview: mergedOverview,
      })
      .eq("id", pr.playerId);

    // Write bio fields through priority-based resolver
    const bioValues: Partial<Record<BioField, string | number | null>> = {};
    if (pr.overview["Age"]) bioValues.age = pr.overview["Age"];
    await writeBioSources(supabase, pr.playerId, "pff", bioValues);

    if (error) {
      result.errors.push(`${pr.playerId}: ${error.message}`);
    } else {
      result.updated++;
    }
  }

  return result;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ─── Import: DraftBuzz Grades ───────────────────────────────────────────────

async function importDraftBuzzGrades(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  sourceName: string,
): Promise<UploadResult> {
  const result: UploadResult = { success: true, inserted: 0, updated: 0, skipped: 0, errors: [] };

  // sourceName is used as the DraftBuzz sheet type indicator (e.g. "DB CB", "DB DL", etc.)
  // Determine which position group this sheet is for
  const sheetSuffix = sourceName.replace(/^DB\s*/i, "").trim().toUpperCase();
  const positionGroup = sheetSuffix;
  const gradeConfig = DRAFTBUZZ_GRADE_COLUMNS[positionGroup] || DRAFTBUZZ_GRADE_COLUMNS[sheetSuffix];

  if (!gradeConfig) {
    return {
      success: false, inserted: 0, updated: 0, skipped: 0,
      errors: [`Unknown DraftBuzz position group: "${sourceName}". Use format "DB CB", "DB DL", etc.`],
    };
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const playerName = row[mapping["player_name"]];

    if (!playerName?.trim()) { result.skipped++; continue; }

    const playerId = await resolvePlayerId(supabase, playerName);
    if (!playerId) {
      result.errors.push(`Row ${i + 1}: Could not resolve player "${playerName}"`);
      result.skipped++;
      continue;
    }

    // Build draftbuzz_grades object
    const grades: Record<string, number | null> = {};
    for (const [csvHeader, displayLabel] of gradeConfig) {
      const val = row[csvHeader];
      if (val !== undefined && val !== null && val !== "" && val !== "#N/A") {
        const num = parseFloat(val);
        grades[displayLabel] = isNaN(num) ? null : num;
      }
    }

    // Build overview fields from DraftBuzz
    const overview: Record<string, string | null> = {};
    const overviewFields: [string, string][] = [
      ["age", "Age"], ["DOB", "DOB"], ["overall_rating", "Draft Buzz"],
      ["college_games", "Games"], ["college_snaps", "Snaps"],
      ["espn_rating", "ESPN"], ["rating_247", "24/7 Sports"],
      ["rivals_rating", "Rivals"], ["projected_role", "Projected Role"],
      ["Projected Role", "Projected Role"], ["Projected_role", "Projected Role"],
    ];
    for (const [csvH, ovKey] of overviewFields) {
      const val = row[csvH];
      if (val !== undefined && val !== null && val !== "" && val !== "#N/A") {
        overview[ovKey] = val;
      }
    }

    // Format DraftBuzz rating specially
    if (row["overall_rating"] && row["overall_rating"] !== "#N/A") {
      overview["Draft Buzz"] = `${row["overall_rating"]} / 100`;
    }

    // Fetch existing to merge
    const { data: existing } = await supabase
      .from("players")
      .select("draftbuzz_grades, overview")
      .eq("id", playerId)
      .single();

    const mergedGrades = { ...(existing?.draftbuzz_grades || {}), ...grades };

    // Merge overview keys without auto-seeding (profile must be created explicitly)
    const mergedOverview = { ...(existing?.overview || {}), ...overview };

    const { error } = await supabase
      .from("players")
      .update({
        draftbuzz_grades: mergedGrades,
        overview: mergedOverview,
      })
      .eq("id", playerId);

    // Write bio fields through priority-based resolver
    const bioValues: Partial<Record<BioField, string | number | null>> = {};
    if (row["age"] && row["age"] !== "#N/A") bioValues.age = row["age"];
    if (row["DOB"] && row["DOB"] !== "#N/A") bioValues.dob = row["DOB"];
    if (row["college_games"] && row["college_games"] !== "#N/A") bioValues.games = row["college_games"];
    if (row["college_snaps"] && row["college_snaps"] !== "#N/A") bioValues.snaps = row["college_snaps"];
    await writeBioSources(supabase, playerId, "draftbuzz", bioValues);

    if (error) {
      result.errors.push(`Row ${i + 1}: ${error.message}`);
    } else {
      result.updated++;
    }
  }

  return result;
}

// ─── Import: Athletic Scores (RAS Data) ─────────────────────────────────────

async function importAthleticScores(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): Promise<UploadResult> {
  const result: UploadResult = { success: true, inserted: 0, updated: 0, skipped: 0, errors: [] };

  // RAS Data column mapping: [csvHeader, displayLabel]
  // Each becomes { result: value, grade: gradeValue }
  const athleticFields: [string, string, string][] = [
    // [resultCol, gradeCol, displayLabel]
    ["RAS", "", "RAS"],
    ["Composite Size Grade", "", "Size"],
    ["Height", "Height Score", "Height"],
    ["Weight", "Weight Score", "Weight"],
    ["Bench", "Bench Score", "Bench"],
    ["Composite Speed Grade", "", "Speed"],
    ["Composite Explosion Grade", "", "Explosive"],
    ["Composite Agility Grade", "", "Agility"],
    ["40 Yard Dash", "40 Yard Dash Grade", "40 Time"],
    ["20 Yard Split", "20 Yard Split Grade", "20 Split"],
    ["10 Yard Split", "10 Yard Split Grade", "10 Split"],
    ["Vertical", "Vertical Grade", "Vertical"],
    ["Broad", "Broad Grade", "Broad"],
    ["Shuttle", "Shuttle Grade", "Shuttle"],
    ["3-Cone", "3-Cone Grade", "3 Cone"],
    ["Hand Size", "", "Hand Size"],
    ["Arm Length", "", "Arm Length"],
  ];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const playerName = row[mapping["player_name"]];

    if (!playerName?.trim()) { result.skipped++; continue; }

    const playerId = await resolvePlayerId(supabase, playerName, {
      position: row[mapping["position"]] || undefined,
    });
    if (!playerId) {
      result.errors.push(`Row ${i + 1}: Could not resolve player "${playerName}"`);
      result.skipped++;
      continue;
    }

    // Build athletic_scores object
    const scores: Record<string, { result: string | null; grade: string | null }> = {};
    for (const [resultCol, gradeCol, label] of athleticFields) {
      const resultVal = row[resultCol];
      const gradeVal = gradeCol ? row[gradeCol] : undefined;

      // Only include if at least one value exists
      if ((resultVal && resultVal !== "") || (gradeVal && gradeVal !== "")) {
        scores[label] = {
          result: resultVal && resultVal !== "" ? resultVal : null,
          grade: gradeVal && gradeVal !== "" ? gradeVal : null,
        };
      }
    }

    if (Object.keys(scores).length === 0) { result.skipped++; continue; }

    // Fetch existing to merge
    const { data: existing } = await supabase
      .from("players")
      .select("athletic_scores")
      .eq("id", playerId)
      .single();

    const merged = { ...(existing?.athletic_scores || {}), ...scores };

    const { error } = await supabase
      .from("players")
      .update({ athletic_scores: merged })
      .eq("id", playerId);

    if (error) {
      result.errors.push(`Row ${i + 1}: ${error.message}`);
    } else {
      result.updated++;
    }
  }

  return result;
}

// ─── Import: Site Ratings (Grades sheet) ────────────────────────────────────

async function importSiteRatings(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): Promise<UploadResult> {
  const result: UploadResult = { success: true, inserted: 0, updated: 0, skipped: 0, errors: [] };

  // Grades sheet columns: Player, School, Position, NFL, ESPN, Gridiron, Bleacher
  const ratingCols: [string, string][] = [
    ["NFL", "NFL.com"],
    ["ESPN", "ESPN"],
    ["Gridiron", "Gridiron"],
    ["Bleacher", "Bleacher"],
  ];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const playerName = row[mapping["player_name"]];

    if (!playerName?.trim()) { result.skipped++; continue; }

    const playerId = await resolvePlayerId(supabase, playerName, {
      position: row[mapping["position"]] || undefined,
      college: row[mapping["college"]] || undefined,
    });
    if (!playerId) {
      result.errors.push(`Row ${i + 1}: Could not resolve player "${playerName}"`);
      result.skipped++;
      continue;
    }

    // Build site_ratings object
    const ratings: Record<string, string | null> = {};
    for (const [csvCol, displayLabel] of ratingCols) {
      const val = row[csvCol];
      if (val !== undefined && val !== null && val !== "") {
        ratings[displayLabel] = val;
      }
    }

    if (Object.keys(ratings).length === 0) { result.skipped++; continue; }

    // Fetch existing to merge
    const { data: existing } = await supabase
      .from("players")
      .select("site_ratings, overview")
      .eq("id", playerId)
      .single();

    const merged = { ...(existing?.site_ratings || {}), ...ratings };

    // Merge overview keys without auto-seeding (profile must be created explicitly)
    const mergedOverview = { ...(existing?.overview || {}) };

    // Also merge site ratings into overview (NFL.com, ESPN, etc.)
    for (const [, displayLabel] of ratingCols) {
      if (ratings[displayLabel]) {
        mergedOverview[displayLabel] = ratings[displayLabel];
      }
    }

    const { error } = await supabase
      .from("players")
      .update({ site_ratings: merged, overview: mergedOverview })
      .eq("id", playerId);

    if (error) {
      result.errors.push(`Row ${i + 1}: ${error.message}`);
    } else {
      result.updated++;
    }
  }

  return result;
}

// ─── Import: NFL Profiles ───────────────────────────────────────────────────

async function importNFLProfiles(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): Promise<UploadResult> {
  const result: UploadResult = { success: true, inserted: 0, updated: 0, skipped: 0, errors: [] };
  const SOURCE = "NFL.com";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const playerName = row[mapping["player_name"]];
    const rawPos = row[mapping["position"]] || "";
    const school = row[mapping["school"]] || "";

    if (!playerName?.trim()) { result.skipped++; continue; }

    const playerId = await resolvePlayerId(supabase, playerName, {
      position: rawPos,
      college: school,
    });
    if (!playerId) {
      result.errors.push(`Row ${i + 1}: Could not resolve player "${playerName}"`);
      result.skipped++;
      continue;
    }

    // ── 1. Player Rankings (Rank + Pos Rank) ────────────────────────────
    const rank = row[mapping["rank"]] || row["Rank"];
    const posRank = row[mapping["pos_rank"]] || row["Pos Rank"];
    if (rank) {
      const overallRank = parseInt(String(rank), 10);
      const positionalRank = posRank ? parseInt(String(posRank), 10) : null;
      if (!isNaN(overallRank)) {
        await supabase
          .from("player_rankings")
          .upsert(
            {
              player_id: playerId,
              source: SOURCE,
              overall_rank: overallRank,
              positional_rank: !isNaN(positionalRank ?? NaN) ? positionalRank : null,
            },
            { onConflict: "player_id,source" },
          );
      }
    }

    // ── 2. Site Ratings (Prospect Grade) ────────────────────────────────
    const prospectGrade = row[mapping["prospect_grade"]] || row["Prospect Grade"];
    if (prospectGrade && String(prospectGrade).trim()) {
      const { data: existing } = await supabase
        .from("players")
        .select("site_ratings, overview")
        .eq("id", playerId)
        .single();

      const merged = { ...(existing?.site_ratings || {}), [SOURCE]: String(prospectGrade) };
      const mergedOverview = { ...(existing?.overview || {}), [SOURCE]: String(prospectGrade) };

      await supabase
        .from("players")
        .update({ site_ratings: merged, overview: mergedOverview })
        .eq("id", playerId);
    }

    // ── 3. Player Comps (NFL Comparison) ────────────────────────────────
    const comp = row[mapping["nfl_comparison"]] || row["NFL Comparison"];
    if (comp && comp.trim() && comp.trim() !== "N/A") {
      // Upsert by player_id + source
      const { data: existingComp } = await supabase
        .from("player_comps")
        .select("id")
        .eq("player_id", playerId)
        .eq("source", SOURCE)
        .maybeSingle();

      if (existingComp) {
        await supabase.from("player_comps").update({ comp: comp.trim() }).eq("id", existingComp.id);
      } else {
        await supabase.from("player_comps").insert({ player_id: playerId, source: SOURCE, comp: comp.trim() });
      }
    }

    // ── 4. Commentary (Overview, Strengths, Weaknesses, Sources Tell Us) ─
    const overview = row[mapping["overview"]] || row["Overview"];
    const strengths = row[mapping["strengths"]] || row["Strengths"];
    const weaknesses = row[mapping["weaknesses"]] || row["Weaknesses"];
    const sourcesTellUs = row[mapping["sources_tell_us"]] || row["Sources Tell Us"];

    const sections: { title: string; text: string }[] = [];
    if (overview?.trim()) sections.push({ title: "Overview", text: overview.trim() });
    if (strengths?.trim()) sections.push({ title: "Strengths", text: strengths.trim() });
    if (weaknesses?.trim()) sections.push({ title: "Weaknesses", text: weaknesses.trim() });
    if (sourcesTellUs?.trim() && sourcesTellUs.trim() !== "N/A") {
      sections.push({ title: "Sources Tell Us", text: sourcesTellUs.trim() });
    }

    if (sections.length > 0) {
      // Delete existing commentary for this source, then insert fresh
      await supabase.from("commentary").delete().eq("player_id", playerId).eq("source", SOURCE);
      await supabase.from("commentary").insert({
        player_id: playerId,
        source: SOURCE,
        sections,
      });
    }

    // ── 5. Player columns (strengths, weaknesses, summary, year, projected_role) ─
    const updateData: Record<string, unknown> = {};

    // Convert pipe-delimited strengths/weaknesses into bullet lists
    if (strengths?.trim()) {
      updateData.strengths = strengths.split("|").map((s: string) => s.trim()).filter(Boolean).join("\n");
    }
    if (weaknesses?.trim()) {
      updateData.weaknesses = weaknesses.split("|").map((s: string) => s.trim()).filter(Boolean).join("\n");
    }
    if (overview?.trim()) {
      updateData.player_summary = overview.trim();
    }

    // Prospect Grade Indicator → projected_role
    const indicator = row[mapping["prospect_grade_indicator"]] || row["Prospect Grade Indicator"];
    if (indicator?.trim()) {
      updateData.projected_role = indicator.trim();
    }

    // Eligibility → year via bio_sources
    const eligibility = row[mapping["eligibility"]] || row["Eligibility"];
    if (eligibility?.trim()) {
      await writeBioSources(supabase, playerId, "nfl_com", { year: eligibility.trim() });
    }

    if (Object.keys(updateData).length > 0) {
      await supabase.from("players").update(updateData).eq("id", playerId);
    }

    result.updated++;
  }

  return result;
}

// ─── Main Import Dispatcher ────────────────────────────────────────────────

export async function importData(
  dataType: DataType,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  sourceName: string,
): Promise<UploadResult> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Clear caches so we get fresh data for this import batch
  clearCaches();

  let result: UploadResult;

  // Determine source_type for auto-updating source_dates
  let autoDateType: "ranking" | "mock" | null = null;

  switch (dataType) {
    case "rankings":
      result = await importRankings(supabase, rows, mapping, sourceName);
      autoDateType = "ranking";
      break;
    case "positional_rankings":
      result = await importPositionalRankings(supabase, rows, mapping, sourceName);
      autoDateType = "ranking";
      break;
    case "adp":
      result = await importADP(supabase, rows, mapping, sourceName);
      break;
    case "mocks":
      result = await importMocks(supabase, rows, mapping, sourceName);
      autoDateType = "mock";
      break;
    case "player_rankings":
      result = await importPlayerRankings(supabase, rows, mapping, sourceName);
      autoDateType = "ranking";
      break;
    case "source_dates":
      result = await importSourceDates(supabase, rows, mapping);
      break;
    case "pff_scores":
      result = await importPFFScores(supabase, rows, mapping);
      break;
    case "draftbuzz_grades":
      result = await importDraftBuzzGrades(supabase, rows, mapping, sourceName);
      break;
    case "athletic_scores":
      result = await importAthleticScores(supabase, rows, mapping);
      break;
    case "site_ratings":
      result = await importSiteRatings(supabase, rows, mapping);
      break;
    case "nfl_profiles":
      result = await importNFLProfiles(supabase, rows, mapping);
      break;
    default:
      result = { success: false, inserted: 0, updated: 0, skipped: 0, errors: [`Unknown data type: ${dataType}`] };
  }

  // Auto-update source_dates when importing rankings or mocks
  if (autoDateType && sourceName && result.inserted + result.updated > 0) {
    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from("source_dates")
      .select("id")
      .eq("source", sourceName)
      .eq("source_type", autoDateType)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("source_dates")
        .update({ date: now })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("source_dates")
        .insert({ source: sourceName, source_type: autoDateType, date: now });
    }
  }

  // Clear caches after import
  clearCaches();

  // Revalidate all public paths after import
  revalidatePath("/");
  revalidatePath("/rankings");
  revalidatePath("/mocks");
  revalidatePath("/boards");
  revalidatePath("/players");
  revalidatePath("/player", "layout");

  return result;
}

// ─── Delete Source Data ─────────────────────────────────────────────────────

export async function deleteSourceData(
  dataType: DataType,
  sourceName: string,
): Promise<{ success: boolean; deleted: number; error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  let table: string;
  switch (dataType) {
    case "rankings": table = "rankings"; break;
    case "positional_rankings": table = "positional_rankings"; break;
    case "adp": table = "adp_entries"; break;
    case "mocks": table = "mock_picks"; break;
    case "player_rankings": table = "player_rankings"; break;
    case "source_dates": table = "source_dates"; break;
    // Profile importers write to players table JSON fields — no source-based deletion
    case "pff_scores":
    case "draftbuzz_grades":
    case "athletic_scores":
    case "site_ratings":
      return { success: false, deleted: 0, error: "Profile data cannot be deleted by source. Edit individual players instead." };
    default: return { success: false, deleted: 0, error: "Unknown data type" };
  }

  // Count first
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("source", sourceName);

  const { error } = await supabase
    .from(table)
    .delete()
    .eq("source", sourceName);

  if (error) return { success: false, deleted: 0, error: error.message };

  revalidatePath("/");
  revalidatePath("/rankings");
  revalidatePath("/mocks");
  revalidatePath("/boards");
  revalidatePath("/players");

  return { success: true, deleted: count ?? 0 };
}

// ─── Get Existing Sources ───────────────────────────────────────────────────

export async function getExistingSources(dataType: DataType): Promise<string[]> {
  const supabase = await createSupabaseServer();

  let table: string;
  switch (dataType) {
    case "rankings": table = "rankings"; break;
    case "positional_rankings": table = "positional_rankings"; break;
    case "adp": table = "adp_entries"; break;
    case "mocks": table = "mock_picks"; break;
    case "player_rankings": table = "player_rankings"; break;
    case "source_dates": table = "source_dates"; break;
    default: return [];
  }

  const { data } = await supabase
    .from(table)
    .select("source")
    .limit(1000);

  if (!data) return [];

  const sources = [...new Set(data.map((r: { source: string }) => r.source))];
  return sources.sort();
}
