import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { KanbanBoard, type KanbanItem } from "@/components/kanban-board";
import { JobUrlImporter } from "@/components/job-url-importer";
import { Card, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pipeline" };
export const maxDuration = 300;

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("user_pipeline")
    .select(
      "id, status, match_score, fit_reasoning, red_flags, microsite_views, tailored_cv_json, assets_status, next_action, next_action_due, jobs(title, company_name, org_type, location, work_mode)",
    )
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
      generating: r.assets_status === "generating",
      next_action: r.next_action,
      next_action_due: r.next_action_due,
      job: j,
    };
  });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const ahead = new Date(now);
  ahead.setUTCDate(ahead.getUTCDate() + 7);
  const weekAhead = ahead.toISOString().slice(0, 10);
  const todo = items
    .filter((i) => i.next_action && !["passed", "rejected", "new"].includes(i.status) && (!i.next_action_due || i.next_action_due <= weekAhead))
    .sort((a, b) => (a.next_action_due ?? "9999").localeCompare(b.next_action_due ?? "9999"));
  const newCount = items.filter((i) => i.status === "new").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl">Your pipeline</h1>
          <p className="mt-1 text-sm text-muted">Everything you&apos;ve applied for, with the next step for each. Nothing is sent automatically.</p>
        </div>
        {newCount > 0 && (
          <Link href="/dashboard/discover" className={buttonClass("pop", "sm")}>
            Review {newCount} new role{newCount === 1 ? "" : "s"} →
          </Link>
        )}
      </div>

      {todo.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-medium">
            <span className="flex size-7 items-center justify-center rounded-full bg-pop">
              <CalendarClock className="size-4 text-ink" />
            </span>
            Today &amp; this week
          </h2>
          <ul className="divide-y divide-line">
            {todo.slice(0, 8).map((i) => {
              const overdue = i.next_action_due && i.next_action_due < today;
              const isToday = i.next_action_due === today;
              return (
                <li key={i.id}>
                  <Link href={`/dashboard/pipeline/${i.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-paper/60">
                    <span className="w-20 shrink-0">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          overdue ? "text-warn" : isToday ? "rounded-full bg-pop px-2 py-0.5 text-ink" : "text-muted",
                        )}
                      >
                        {overdue ? "Overdue" : isToday ? "Today" : i.next_action_due ? new Date(i.next_action_due).toLocaleDateString(undefined, { weekday: "short", day: "numeric" }) : "Anytime"}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 text-sm">{i.next_action}</span>
                    <span className="text-xs text-muted">
                      {i.job.title} · {i.job.company_name}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <JobUrlImporter />
      {items.length ? (
        <KanbanBoard items={items} />
      ) : (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center">
          <p className="font-medium">No jobs yet</p>
          <p className="mt-1 text-sm text-muted">
            <Link href="/dashboard/companies?suggest=1" className="underline underline-offset-2">
              Let Callback find companies that fit your CV
            </Link>
            , or paste a job URL above.
          </p>
        </div>
      )}
    </div>
  );
}
