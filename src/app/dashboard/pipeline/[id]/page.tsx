import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MapPin } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import { loadUserContext, type JobRow } from "@/lib/jobs";
import type { Outreach, TailoredCV } from "@/lib/ai/schemas";
import { Badge, Card, Markdown, OrgTypeBadge, ScorePill } from "@/components/ui";
import { appUrl } from "@/lib/utils";
import { Studio } from "./studio";

export const maxDuration = 300;

export async function generateMetadata({ params }: PageProps<"/dashboard/pipeline/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("user_pipeline").select("jobs(title, company_name)").eq("id", id).maybeSingle();
  const j = (Array.isArray(data?.jobs) ? data?.jobs[0] : data?.jobs) as { title: string; company_name: string } | undefined;
  return { title: j ? `${j.title} · ${j.company_name}` : "Application Studio" };
}

export default async function PipelinePage({ params }: PageProps<"/dashboard/pipeline/[id]">) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: row } = await supabase.from("user_pipeline").select("*, jobs(*)").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!row) notFound();
  const job = (Array.isArray(row.jobs) ? row.jobs[0] : row.jobs) as JobRow;
  const { profile, master } = await loadUserContext(supabase, user.id);
  if (!profile || !master) notFound();
  const { data: events } = await supabase
    .from("pipeline_events")
    .select("id, kind, detail, created_at")
    .eq("pipeline_id", id)
    .order("created_at", { ascending: false })
    .limit(40);

  const pitchUrl = appUrl(`/${profile.username}/for/${row.company_slug}`);

  return (
    <div>
      <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Pipeline
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <OrgTypeBadge type={job.org_type} />
            <Badge tone={row.status === "new" ? "neutral" : "accent"} className="capitalize">
              {row.status}
            </Badge>
            <ScorePill score={row.match_score} />
          </div>
          <h1 className="font-serif text-4xl leading-tight">{job.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-muted">
            <span>{job.company_name}</span>
            {job.location && (
              <span className="inline-flex items-center gap-1 text-sm">
                <MapPin className="size-3.5" /> {job.location}
              </span>
            )}
            {job.work_mode && job.work_mode !== "unspecified" && <span className="text-sm capitalize">{job.work_mode}</span>}
            {job.salary_text && <span className="text-sm">{job.salary_text}</span>}
            <a href={job.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline underline-offset-2">
              Original posting <ExternalLink className="size-3" />
            </a>
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Fit review</h2>
            <p className="text-sm leading-relaxed">{row.fit_reasoning ?? "—"}</p>
            {row.red_flags?.length > 0 && (
              <ul className="mt-3 space-y-1">
                {row.red_flags.map((f: string, i: number) => (
                  <li key={i} className="text-sm text-warn">
                    ⚑ {f}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">The role</h2>
            {job.summary_bullets?.length > 0 && (
              <ul className="mb-4 space-y-1.5 border-b border-line pb-4">
                {job.summary_bullets.map((b, i) => (
                  <li key={i} className="text-sm">
                    → {b}
                  </li>
                ))}
              </ul>
            )}
            <div className="max-h-[60vh] overflow-y-auto pr-2 text-sm">
              <Markdown text={job.description_md} />
            </div>
          </Card>
        </div>

        <Studio
          pipelineId={row.id}
          status={row.status}
          pitchUrl={pitchUrl}
          views={row.microsite_views ?? 0}
          tailoredCv={row.tailored_cv_json as TailoredCV | null}
          coverLetter={row.cover_letter_md ?? ""}
          pitchHeadline={row.custom_pitch_headline ?? ""}
          pitchIntro={row.custom_pitch_intro ?? ""}
          featured={row.featured_project_ids ?? []}
          notes={row.notes ?? ""}
          assetsStatus={row.assets_status ?? "none"}
          assetsError={row.assets_error ?? null}
          outreach={row.outreach_json as Outreach | null}
          nextAction={row.next_action ?? null}
          nextActionDue={row.next_action_due ?? null}
          events={events ?? []}
          projects={master.projects.map((p) => ({ id: p.id, title: p.title, client: p.client_or_org }))}
        />
      </div>
    </div>
  );
}
