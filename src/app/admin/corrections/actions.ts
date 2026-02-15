"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NameCorrection {
  id: string;
  variant_name: string;
  canonical_slug: string;
  canonical_name?: string; // joined from players table
  created_at: string;
}

// ─── Ensure table exists ────────────────────────────────────────────────────

export async function ensureCorrectionsTable(): Promise<{ exists: boolean; error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Try a simple select — if the table exists, this works
  const { error } = await supabase
    .from("name_corrections")
    .select("id")
    .limit(1);

  if (!error) return { exists: true };

  // Table doesn't exist — create it via RPC or raw SQL
  // The user will need to run this SQL in Supabase Dashboard
  return {
    exists: false,
    error: `Table "name_corrections" doesn't exist yet. Please run this SQL in your Supabase Dashboard → SQL Editor:\n\n` +
      `CREATE TABLE name_corrections (\n` +
      `  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n` +
      `  variant_name text NOT NULL UNIQUE,\n` +
      `  canonical_slug text NOT NULL,\n` +
      `  created_at timestamptz DEFAULT now()\n` +
      `);\n` +
      `CREATE INDEX idx_corrections_variant ON name_corrections(variant_name);\n` +
      `CREATE INDEX idx_corrections_slug ON name_corrections(canonical_slug);\n` +
      `CREATE POLICY "Public read" ON name_corrections FOR SELECT USING (true);\n` +
      `CREATE POLICY "Auth insert" ON name_corrections FOR INSERT WITH CHECK (auth.role() = 'authenticated');\n` +
      `CREATE POLICY "Auth update" ON name_corrections FOR UPDATE USING (auth.role() = 'authenticated');\n` +
      `CREATE POLICY "Auth delete" ON name_corrections FOR DELETE USING (auth.role() = 'authenticated');\n` +
      `ALTER TABLE name_corrections ENABLE ROW LEVEL SECURITY;`,
  };
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function getCorrections(): Promise<NameCorrection[]> {
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("name_corrections")
    .select("*")
    .order("variant_name");

  if (error) return [];
  return data ?? [];
}

export async function addCorrection(
  variantName: string,
  canonicalSlug: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("name_corrections")
    .insert({
      variant_name: variantName.trim(),
      canonical_slug: canonicalSlug.trim(),
    });

  if (error) {
    if (error.code === "23505") return { success: false, error: `"${variantName}" already exists in corrections.` };
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/corrections");
  return { success: true };
}

export async function deleteCorrection(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("name_corrections")
    .delete()
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/corrections");
  return { success: true };
}

export async function bulkAddCorrections(
  corrections: { variant_name: string; canonical_slug: string }[]
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const c of corrections) {
    const { error } = await supabase
      .from("name_corrections")
      .insert({
        variant_name: c.variant_name.trim(),
        canonical_slug: c.canonical_slug.trim(),
      });

    if (error) {
      if (error.code === "23505") {
        skipped++;
      } else {
        errors.push(`"${c.variant_name}": ${error.message}`);
      }
    } else {
      inserted++;
    }
  }

  revalidatePath("/admin/corrections");
  return { inserted, skipped, errors };
}

// ─── Search players (for the correction form) ──────────────────────────────

export async function searchPlayersForCorrection(
  query: string
): Promise<{ slug: string; name: string; position: string | null }[]> {
  if (!query || query.length < 2) return [];

  const supabase = await createSupabaseServer();

  const { data } = await supabase
    .from("players")
    .select("slug, name, position")
    .ilike("name", `%${query}%`)
    .limit(10);

  return data ?? [];
}

// ─── Audit & Merge ─────────────────────────────────────────────────────────

function toSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface AuditDuplicate {
  variantName: string;
  variantSlug: string;
  variantId: string;
  canonicalName: string;
  canonicalSlug: string;
  canonicalId: string;
  /** How many data rows reference the variant player across all tables */
  rowsToMove: number;
  /** Breakdown by table */
  details: { table: string; count: number }[];
}

export interface AuditResult {
  duplicates: AuditDuplicate[];
  totalRowsToMove: number;
}

const DATA_TABLES_BY_PLAYER_ID = [
  "rankings",
  "positional_rankings",
  "player_rankings",
  "adp_entries",
  "mock_picks",
  "board_entries",
  "position_board_entries",
  "player_comps",
  "projected_rounds",
  "commentary",
] as const;

const DATA_TABLES_BY_SLUG = ["rankings", "positional_rankings"] as const;

/**
 * Scan all corrections for duplicate player records that need merging.
 */
export async function auditCorrections(): Promise<AuditResult> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const corrections = await getCorrections();
  const duplicates: AuditDuplicate[] = [];

  for (const c of corrections) {
    const variantSlug = toSlug(c.variant_name);
    const canonicalSlug = c.canonical_slug;
    if (variantSlug === canonicalSlug) continue;

    // Check if both players exist
    const { data: vPlayers } = await supabase
      .from("players")
      .select("id, name, slug")
      .eq("slug", variantSlug)
      .limit(1);
    const { data: cPlayers } = await supabase
      .from("players")
      .select("id, name, slug")
      .eq("slug", canonicalSlug)
      .limit(1);

    const vp = vPlayers?.[0];
    const cp = cPlayers?.[0];
    if (!vp || !cp || vp.id === cp.id) continue;

    // Count data rows on the variant player
    const details: { table: string; count: number }[] = [];
    let rowsToMove = 0;

    for (const tbl of DATA_TABLES_BY_PLAYER_ID) {
      const { count } = await supabase
        .from(tbl)
        .select("id", { count: "exact", head: true })
        .eq("player_id", vp.id);
      if (count && count > 0) {
        details.push({ table: tbl, count });
        rowsToMove += count;
      }
    }

    duplicates.push({
      variantName: vp.name,
      variantSlug,
      variantId: vp.id,
      canonicalName: cp.name,
      canonicalSlug,
      canonicalId: cp.id,
      rowsToMove,
      details,
    });
  }

  return {
    duplicates,
    totalRowsToMove: duplicates.reduce((sum, d) => sum + d.rowsToMove, 0),
  };
}

export interface MergeResult {
  merged: number;
  moved: number;
  deleted: number;
  errors: string[];
}

/**
 * Merge all duplicate players found by audit.
 * Moves all data from variant player to canonical player, then deletes variant.
 */
export async function mergeAllDuplicates(): Promise<MergeResult> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const audit = await auditCorrections();
  const result: MergeResult = { merged: 0, moved: 0, deleted: 0, errors: [] };

  for (const dup of audit.duplicates) {
    try {
      // Move all player_id references from variant to canonical
      for (const tbl of DATA_TABLES_BY_PLAYER_ID) {
        const { count } = await supabase
          .from(tbl)
          .select("id", { count: "exact", head: true })
          .eq("player_id", dup.variantId);

        if (count && count > 0) {
          const { error } = await supabase
            .from(tbl)
            .update({ player_id: dup.canonicalId })
            .eq("player_id", dup.variantId);
          if (error) {
            result.errors.push(`${tbl}: ${error.message}`);
          } else {
            result.moved += count;
          }
        }
      }

      // Update slug references too
      for (const tbl of DATA_TABLES_BY_SLUG) {
        const { error } = await supabase
          .from(tbl)
          .update({ slug: dup.canonicalSlug })
          .eq("slug", dup.variantSlug);
        if (error) {
          result.errors.push(`${tbl} slug update: ${error.message}`);
        }
      }

      // Delete the variant player record
      const { error: delError } = await supabase
        .from("players")
        .delete()
        .eq("id", dup.variantId);

      if (delError) {
        result.errors.push(`Delete player ${dup.variantName}: ${delError.message}`);
      } else {
        result.deleted++;
      }

      result.merged++;
    } catch (err) {
      result.errors.push(`${dup.variantName}: ${String(err)}`);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return result;
}
