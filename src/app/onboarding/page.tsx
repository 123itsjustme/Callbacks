import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { appUrl } from "@/lib/utils";
import { OnboardingClient } from "./onboarding-client";

export const metadata = { title: "Upload your CV" };
export const maxDuration = 300;

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/" className="font-serif text-2xl">
          Callback
        </Link>
        {profile && (
          <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
            Skip to dashboard →
          </Link>
        )}
      </div>
      <h1 className="font-serif text-4xl">{profile ? "Refresh your CV" : "Let's start with your CV"}</h1>
      <p className="mb-8 mt-2 text-muted">We&apos;ll build your master profile, your public portfolio, and match you to roles.</p>
      <OnboardingClient appUrl={appUrl()} hasProfile={!!profile} />
    </main>
  );
}
