"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { normalizePosition } from "@/lib/types";
import { revalidatePath } from "next/cache";

// ─── Canonical position set ────────────────────────────────────────────────

const CANONICAL_POSITIONS = new Set([
  "QB", "RB", "WR", "TE", "OT", "OG", "C", "ED", "DT", "LB", "CB", "SAF", "K", "P",
]);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PositionMismatch {
  /** Raw position stored in DB */
  raw: string;
  /** What normalizePosition maps it to */
  canonical: string;
  /** Number of players with this raw position */
  count: number;
  /** Sample player names (up to 5) */
  examples: string[];
}

export interface PositionAuditResult {
  mismatches: PositionMismatch[];
  totalPlayers: number;
  nonCanonicalCount: number;
  nullCount: number;
}

// ─── Audit ──────────────────────────────────────────────────────────────────

export async function auditPositions(): Promise<PositionAuditResult> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: players, error } = await supabase
    .from("players")
    .select("id, name, position")
    .order("name");

  if (error || !players) {
    throw new Error(`Failed to fetch players: ${error?.message}`);
  }

  // Group by raw position
  const groups = new Map<string, { count: number; examples: string[] }>();
  let nullCount = 0;

  for (const p of players) {
    if (!p.position) {
      nullCount++;
      continue;
    }
    const raw = p.position.trim();
    if (!raw || raw === "TBD") continue;

    const existing = groups.get(raw) || { count: 0, examples: [] };
    existing.count++;
    if (existing.examples.length < 5) existing.examples.push(p.name);
    groups.set(raw, existing);
  }

  // Find non-canonical positions
  const mismatches: PositionMismatch[] = [];
  for (const [raw, info] of groups) {
    if (CANONICAL_POSITIONS.has(raw)) continue;

    const canonical = normalizePosition(raw) || raw;
    mismatches.push({
      raw,
      canonical: CANONICAL_POSITIONS.has(canonical) ? canonical : `⚠ ${canonical}`,
      count: info.count,
      examples: info.examples,
    });
  }

  // Sort by count descending
  mismatches.sort((a, b) => b.count - a.count);

  return {
    mismatches,
    totalPlayers: players.length,
    nonCanonicalCount: mismatches.reduce((sum, m) => sum + m.count, 0),
    nullCount,
  };
}

// ─── Fix a single position ─────────────────────────────────────────────────

export async function fixPosition(
  rawPosition: string,
  newPosition: string,
): Promise<{ success: boolean; updated: number; error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Find all players with this raw position
  const { data: players, error: fetchErr } = await supabase
    .from("players")
    .select("id")
    .eq("position", rawPosition);

  if (fetchErr) return { success: false, updated: 0, error: fetchErr.message };
  if (!players || players.length === 0) return { success: true, updated: 0 };

  // Batch update
  const { error: updateErr } = await supabase
    .from("players")
    .update({ position: newPosition })
    .eq("position", rawPosition);

  if (updateErr) return { success: false, updated: 0, error: updateErr.message };

  revalidatePath("/admin/positions");
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true, updated: players.length };
}

// ─── Fix all mismatches ────────────────────────────────────────────────────

export async function fixAllPositions(): Promise<{
  fixed: number;
  totalUpdated: number;
  errors: string[];
}> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const audit = await auditPositions();
  let fixed = 0;
  let totalUpdated = 0;
  const errors: string[] = [];

  for (const m of audit.mismatches) {
    // Only auto-fix if canonical is a known position (no ⚠ prefix)
    if (m.canonical.startsWith("⚠")) continue;

    const result = await fixPosition(m.raw, m.canonical);
    if (result.success) {
      fixed++;
      totalUpdated += result.updated;
    } else {
      errors.push(`${m.raw} → ${m.canonical}: ${result.error}`);
    }
  }

  revalidatePath("/admin/positions");
  revalidatePath("/admin");
  revalidatePath("/");
  return { fixed, totalUpdated, errors };
}
