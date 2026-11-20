import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { DashNav } from "./nav";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("username, full_name").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Link href="/dashboard" className="font-serif text-xl">
            Folio
          </Link>
          <DashNav />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href={`/${profile.username}`} target="_blank" className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 hover:border-ink/40 sm:inline-flex">
              View my microsite <ExternalLink className="size-3.5" />
            </Link>
            <form action="/auth/signout" method="post">
              <button className="text-muted hover:text-ink">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
