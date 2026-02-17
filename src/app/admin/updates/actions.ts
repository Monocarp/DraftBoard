"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

export async function createUpdate(formData: FormData) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return { error: "Unauthorized" };
  }

  const title = (formData.get("title") as string)?.trim();
  const body = (formData.get("body") as string)?.trim();
  const category = (formData.get("category") as string)?.trim() || "announcement";
  const pinned = formData.get("pinned") === "on";
  const dateStr = (formData.get("date") as string)?.trim();

  if (!title || !body) {
    return { error: "Title and body are required." };
  }

  const row: Record<string, unknown> = { title, body, category, pinned };
  if (dateStr) {
    row.created_at = new Date(dateStr).toISOString();
  }

  const { error } = await supabase.from("site_updates").insert(row);

  if (error) return { error: error.message };

  revalidatePath("/updates");
  revalidatePath("/admin/updates");
  revalidatePath("/"); // nav dot
  return { success: true };
}

export async function deleteUpdate(id: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return { error: "Unauthorized" };
  }

  const { error } = await supabase.from("site_updates").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/updates");
  revalidatePath("/admin/updates");
  revalidatePath("/");
  return { success: true };
}

export async function togglePin(id: string, pinned: boolean) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return { error: "Unauthorized" };
  }

  const { error } = await supabase
    .from("site_updates")
    .update({ pinned })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/updates");
  revalidatePath("/admin/updates");
  return { success: true };
}

export async function updateDate(id: string, date: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return { error: "Unauthorized" };
  }

  const { error } = await supabase
    .from("site_updates")
    .update({ created_at: new Date(date).toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/updates");
  revalidatePath("/admin/updates");
  return { success: true };
}
