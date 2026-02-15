"use server";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function login(formData: FormData) {
  const supabase = await createSupabaseServer();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/admin");
}

export async function logout() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
