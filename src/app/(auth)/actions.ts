"use server";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function loginUser(formData: FormData) {
  const supabase = await createSupabaseServer();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

export async function registerUser(formData: FormData) {
  const supabase = await createSupabaseServer();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (password !== confirmPassword) {
    return { error: "Passwords do not match" };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }

  // Auto-login after registration
  const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
  if (loginError) {
    return { error: "Account created. Please log in." };
  }

  redirect("/");
}

export async function logoutUser() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}
