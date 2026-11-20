import { requireUser } from "@/lib/supabase/server";
import { CompaniesClient, type CompanyItem } from "./companies-client";

export const metadata = { title: "Watchlist" };
export const maxDuration = 300;

export default async function CompaniesPage() {
  const { supabase } = await requireUser();
  const [{ data: companies }, { data: counts }] = await Promise.all([
    supabase.from("target_companies").select("id, name, org_type, careers_url, ats_provider, last_scraped_at").order("name"),
    supabase.from("jobs").select("company_id").not("company_id", "is", null),
  ]);
  const jobCounts = new Map<string, number>();
  (counts ?? []).forEach((c) => jobCounts.set(c.company_id, (jobCounts.get(c.company_id) ?? 0) + 1));
  const items: CompanyItem[] = (companies ?? []).map((c) => ({ ...c, jobs: jobCounts.get(c.id) ?? 0 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">Watchlist</h1>
        <p className="mt-1 text-sm text-muted">
          Agencies, indies, publishers and in-house teams scanned daily. Shared between all beta users. Greenhouse, Lever and Ashby boards are read via their public APIs; other pages are scraped.
        </p>
      </div>
      <CompaniesClient companies={items} />
    </div>
  );
}
