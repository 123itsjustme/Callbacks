import { requireUser } from "@/lib/supabase/server";
import { CompaniesClient, type CompanyItem } from "./companies-client";

export const metadata = { title: "Companies" };
export const maxDuration = 300;

export default async function CompaniesPage({ searchParams }: PageProps<"/dashboard/companies">) {
  const { supabase, user } = await requireUser();
  const sp = await searchParams;
  const [{ data: links }, { data: pipeline }] = await Promise.all([
    supabase
      .from("user_companies")
      .select("status, source, fit_reason, last_scanned_at, target_companies(id, name, org_type, careers_url, ats_provider, url_verified, hq_location)")
      .eq("user_id", user.id)
      .neq("status", "removed")
      .order("created_at", { ascending: true }),
    supabase.from("user_pipeline").select("jobs(company_id)").eq("user_id", user.id),
  ]);

  const roleCounts = new Map<string, number>();
  (pipeline ?? []).forEach((p) => {
    const cid = ((Array.isArray(p.jobs) ? p.jobs[0] : p.jobs) as { company_id: string | null } | null)?.company_id;
    if (cid) roleCounts.set(cid, (roleCounts.get(cid) ?? 0) + 1);
  });

  const items: CompanyItem[] = (links ?? [])
    .map((l) => {
      const c = (Array.isArray(l.target_companies) ? l.target_companies[0] : l.target_companies) as {
        id: string; name: string; org_type: string; careers_url: string; ats_provider: string | null; url_verified: boolean | null; hq_location: string | null;
      } | null;
      if (!c) return null;
      return {
        id: c.id,
        name: c.name,
        org_type: c.org_type,
        careers_url: c.careers_url,
        ats_provider: c.ats_provider,
        verified: !!c.url_verified || (!!c.ats_provider && c.ats_provider !== "custom"),
        location: c.hq_location,
        status: l.status as "suggested" | "active",
        source: l.source,
        fit_reason: l.fit_reason,
        last_scanned_at: l.last_scanned_at,
        roles: roleCounts.get(c.id) ?? 0,
      };
    })
    .filter((x): x is CompanyItem => !!x);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-4xl">Your companies</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Callback reads your CV and researches companies that fit, then checks their job boards for open roles. Keep the ones you like; we scan them daily.
        </p>
      </div>
      <CompaniesClient companies={items} autoSuggest={sp.suggest === "1"} />
    </div>
  );
}
