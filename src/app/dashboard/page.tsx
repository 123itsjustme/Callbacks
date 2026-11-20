import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { KanbanBoard, type KanbanItem } from "@/components/kanban-board";
import { JobUrlImporter } from "@/components/job-url-importer";

export const metadata = { title: "Pipeline" };
export const maxDuration = 300;

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("user_pipeline")
    .select("id, status, match_score, fit_reasoning, red_flags, microsite_views, tailored_cv_json, jobs(title, company_name, org_type, location, work_mode)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const items: KanbanItem[] = (data ?? []).map((r) => {
    const j = (Array.isArray(r.jobs) ? r.jobs[0] : r.jobs) as KanbanItem["job"];
    return {
      id: r.id,
      status: r.status,
      match_score: r.match_score,
      fit_reasoning: r.fit_reasoning,
      red_flags: r.red_flags,
      microsite_views: r.microsite_views ?? 0,
      has_assets: !!r.tailored_cv_json,
      job: j,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl">Your pipeline</h1>
          <p className="mt-1 text-sm text-muted">Approve a role to generate a truth-anchored CV, cover letter and a custom pitch page. Nothing is sent automatically.</p>
        </div>
      </div>
      <JobUrlImporter />
      {items.length ? (
        <KanbanBoard items={items} />
      ) : (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center">
          <p className="font-medium">No jobs yet</p>
          <p className="mt-1 text-sm text-muted">
            Paste a job URL above, or{" "}
            <Link href="/dashboard/companies" className="underline underline-offset-2">
              add companies to your watchlist
            </Link>{" "}
            and scan them.
          </p>
        </div>
      )}
    </div>
  );
}
