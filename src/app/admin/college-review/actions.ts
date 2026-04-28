"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { CANONICAL_COLLEGES } from "@/lib/normalize-college";
import { revalidatePath } from "next/cache";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PendingCollege {
  id: string;
  raw_name: string;
  source: string | null;
  created_at: string;
}

export interface CollegeReviewData {
  pending: PendingCollege[];
  canonicals: string[];
}

// ─── Load ────────────────────────────────────────────────────────────────────

export async function getCollegeReviewData(): Promise<CollegeReviewData> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  const { data } = await supabase
    .from("pending_colleges")
    .select("id, raw_name, source, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  return {
    pending: (data ?? []) as PendingCollege[],
    canonicals: CANONICAL_COLLEGES,
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Approve: write correction, back-fill players.college, delete from pending.
 */
export async function approveCollegeCorrection(
  pendingId: string,
  rawName: string,
  canonical: string,
): Promise<{ error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  // 1. Write to college_corrections
  const { error: ccErr } = await supabase
    .from("college_corrections")
    .upsert({ variant: rawName.toLowerCase(), canonical }, { onConflict: "variant" });
  if (ccErr) return { error: ccErr.message };

  // 2. Back-fill all players whose college exactly matches the raw name
  await supabase
    .from("players")
    .update({ college: canonical })
    .eq("college", rawName);

  // 3. Remove from pending
  await supabase.from("pending_colleges").delete().eq("id", pendingId);

  revalidatePath("/admin/college-review");
  revalidatePath("/admin");
  return {};
}

/**
 * Dismiss: remove from pending without creating a correction
 * (the raw value is acceptable as-is or should just be ignored).
 */
export async function dismissPendingCollege(pendingId: string): Promise<{ error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  await supabase.from("pending_colleges").delete().eq("id", pendingId);

  revalidatePath("/admin/college-review");
  return {};
}

/**
 * Dismiss all — clears all pending colleges at once.
 */
export async function dismissAllPendingColleges(): Promise<{ error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  await supabase.from("pending_colleges").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  revalidatePath("/admin/college-review");
  return {};
}
