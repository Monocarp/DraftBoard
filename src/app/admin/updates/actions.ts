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

  if (!title || !body) {
    return { error: "Title and body are required." };
  }

  const { error } = await supabase.from("site_updates").insert({
    title,
    body,
    category,
  });

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
