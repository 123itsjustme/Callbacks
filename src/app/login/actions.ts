"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
}

async function origin() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_APP_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function authAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const intent = String(formData.get("intent") ?? "signin");
  const next = safeNext(formData.get("next"));
  if (!email) return { error: "Enter your email." };

  if (intent === "magic") {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    return error ? { error: error.message } : { message: "Check your inbox for a sign-in link." };
  }

  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  if (intent === "signup") {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${await origin()}/auth/callback?next=/onboarding` },
    });
    if (error) return { error: error.message };
    if (!data.session) return { message: "Account created — confirm your email, then you'll land on onboarding." };
    redirect("/onboarding");
  }

  const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", signIn.user.id).maybeSingle();
  redirect(profile ? next : "/onboarding");
}
