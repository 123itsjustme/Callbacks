import { requireUser } from "@/lib/supabase/server";
import { DiscoverClient, type DeckCard } from "./discover-client";
import type { LocationPrefs, WorkMode } from "@/lib/location";

export const metadata = { title: "Discover" };
export const maxDuration = 300;

export default async function DiscoverPage({ searchParams }: PageProps<"/dashboard/discover">) {
  const { supabase, user } = await requireUser();
  const sp = await searchParams;
  const [{ data: links }, { data: rows }, { data: profile }] = await Promise.all([
    supabase.from("user_companies").select("company_id, target_companies(name)").eq("user_id", user.id).eq("status", "active"),
    supabase
      .from("user_pipeline")
      .select("id, match_score, fit_reasoning, red_flags, fit_assessed_at, source, jobs(title, company_name, org_type, location, work_mode, salary_text, summary_bullets, source_url)")
      .eq("user_id", user.id)
      .eq("status", "new")
      .order("match_score", { ascending: false, nullsFirst: false })
      .limit(60),
    supabase.from("profiles").select("location, job_locations, work_modes, include_unknown_location").eq("id", user.id).single(),
  ]);

  const companies = (links ?? []).map((l) => ({
    id: l.company_id as string,
    name: ((Array.isArray(l.target_companies) ? l.target_companies[0] : l.target_companies) as { name: string } | null)?.name ?? "Company",
  }));

  const cards: DeckCard[] = (rows ?? []).map((r) => {
    const j = (Array.isArray(r.jobs) ? r.jobs[0] : r.jobs) as DeckCard["job"];
    return {
      id: r.id,
      match_score: r.match_score,
      fit_reasoning: r.fit_reasoning,
      red_flags: r.red_flags ?? [],
      assessed: !!r.fit_assessed_at,
      source: r.source ?? "match",
      job: { ...j, summary_bullets: j?.summary_bullets ?? [] },
    };
  });

  const prefs: LocationPrefs = {
    places: profile?.job_locations ?? [],
    modes: ((profile?.work_modes as WorkMode[] | null) ?? ["remote", "hybrid", "onsite"]),
    includeUnknown: profile?.include_unknown_location ?? true,
  };
  const homeCity = (profile?.location ?? "").split(",")[0].trim() || null;

  return <DiscoverClient cards={cards} companies={companies} autoRun={sp.run === "1"} initialPrefs={prefs} homeCity={homeCity} />;
}
