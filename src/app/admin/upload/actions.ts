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
  | "source_dates";

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
