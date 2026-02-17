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

  // Notify admin of new registration (fire-and-forget)
  notifyAdminOfRegistration(email).catch(() => {});

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

async function notifyAdminOfRegistration(email: string) {
  const key = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!key || !adminEmail) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Draft Board <onboarding@resend.dev>",
      to: adminEmail,
      subject: `New Draft Board Registration: ${email}`,
      html: `<p>A new user just registered on the 2026 Draft Board:</p>
             <p><strong>${email}</strong></p>
             <p style="color:#888;font-size:12px">${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}</p>`,
    }),
  });
}
