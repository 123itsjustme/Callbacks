import Link from "next/link";
import { ArrowRight, FileUp, Globe, KanbanSquare, ShieldCheck } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex-1">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-serif text-2xl">Callback</span>
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href="/dashboard" className={buttonClass("primary", "sm")}>
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className={buttonClass("ghost", "sm")}>
                Sign in
              </Link>
              <Link href="/login?mode=signup" className={buttonClass("primary", "sm")}>
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 md:pt-24">
        <p className="mb-6 text-xs font-medium uppercase tracking-[0.2em] text-muted">For producers, strategists & creatives</p>
        <h1 className="max-w-4xl font-serif text-5xl leading-[1.02] md:text-7xl">
          Upload your CV. <em className="text-accent">Get matched</em> — and a live portfolio for every company you pitch.
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted">
          Callback turns your CV into a master profile and an interactive microsite, finds roles at agencies, indies, publishers and
          in-house teams, and writes a truth-anchored CV, cover letter and custom landing page for each one you approve.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={user ? "/onboarding" : "/login?mode=signup&next=/onboarding"} className={buttonClass("primary")}>
            Upload my CV <ArrowRight className="size-4" />
          </Link>
          <Link href="#how" className={buttonClass("secondary")}>
            How it works
          </Link>
        </div>
      </section>

      <section id="how" className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-px bg-line md:grid-cols-4">
          {[
            { icon: FileUp, t: "Upload CV", d: "PDF or DOCX parsed into a structured master profile — every metric kept verbatim." },
            { icon: Globe, t: "Live microsite", d: "/you — filterable case studies, availability pill and one-click PDF CV." },
            { icon: KanbanSquare, t: "Approve jobs", d: "Paste any job URL or let the daily scan find roles. You approve; nothing auto-sends." },
            { icon: ShieldCheck, t: "Truth-anchored", d: "Tailored CVs can only reorder and select. No invented employers, dates or numbers." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="bg-surface p-8">
              <Icon className="mb-6 size-5 text-accent" />
              <h3 className="mb-2 font-medium">{t}</h3>
              <p className="text-sm leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
