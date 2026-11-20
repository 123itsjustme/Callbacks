import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { loadUserContext } from "@/lib/jobs";
import { appUrl } from "@/lib/utils";
import { ProfileForms } from "./profile-forms";
import { buttonClass } from "@/components/ui";

export const metadata = { title: "Profile & CV" };

export default async function ProfilePage() {
  const { supabase, user } = await requireUser();
  const { profile, master } = await loadUserContext(supabase, user.id);
  if (!profile || !master) return null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl">Profile & master CV</h1>
          <p className="mt-1 text-sm text-muted">Your master profile is the single source of truth — tailored CVs can only select from it.</p>
        </div>
        <div className="flex gap-2">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- PDF download, not a page */}
          <a href="/api/pdf/master" className={buttonClass("secondary", "sm")}>
            Master CV (PDF)
          </a>
          <Link href="/onboarding" className={buttonClass("secondary", "sm")}>
            Re-upload CV
          </Link>
        </div>
      </div>
      <ProfileForms profile={profile} master={master} appUrl={appUrl()} />
    </div>
  );
}
