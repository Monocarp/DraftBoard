"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

export interface SourceDate {
  id: string;
  source: string;
  source_type: string;
  date: string | null;
}

export async function getSourceDates(): Promise<SourceDate[]> {
  const supabase = await createSupabaseServer();

  const { data } = await supabase
    .from("source_dates")
    .select("*")
    .order("source_type")
    .order("source");

  return (data ?? []) as SourceDate[];
}

export async function updateSourceDate(
  id: string,
  date: string | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("source_dates")
    .update({ date })
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/dates");
  revalidatePath("/rankings");
  revalidatePath("/mocks");
  return { success: true };
}

export async function addSourceDate(
  source: string,
  sourceType: string,
  date: string | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("source_dates")
    .insert({ source: source.trim(), source_type: sourceType, date });

  if (error) {
    if (error.code === "23505") return { success: false, error: "This source + type combination already exists." };
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/dates");
  revalidatePath("/rankings");
  revalidatePath("/mocks");
  return { success: true };
}

export async function deleteSourceDate(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("source_dates")
    .delete()
    .eq("id", id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/dates");
  revalidatePath("/rankings");
  revalidatePath("/mocks");
  return { success: true };
}
