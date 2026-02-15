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
