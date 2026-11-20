import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) next = "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const { data: profile } = await supabase.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
      return NextResponse.redirect(`${origin}${profile ? next : "/onboarding"}`);
    }
    console.error("[auth/callback] code exchange failed:", error?.name, error?.message);
  } else {
    console.error("[auth/callback] no code in callback URL", searchParams.toString().slice(0, 200));
  }
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("That sign-in link is invalid or expired.")}`);
}
