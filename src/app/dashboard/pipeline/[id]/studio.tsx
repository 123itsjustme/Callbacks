"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Copy, Download, Eye, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { approveAction, generateAssetsAction, removeFromPipelineAction, rescoreAction, setStatusAction, updateAssetsAction } from "@/app/dashboard/actions";
import { Button, Card, Input, Label, Markdown, Textarea, buttonClass } from "@/components/ui";
import type { TailoredCV } from "@/lib/ai/schemas";
import { PIPELINE_STATUSES, cn, type PipelineStatus } from "@/lib/utils";
import { useRouter } from "next/navigation";

type Props = {
  pipelineId: string;
  status: PipelineStatus;
  pitchUrl: string;
  views: number;
  tailoredCv: TailoredCV | null;
  coverLetter: string;
  pitchHeadline: string;
  pitchIntro: string;
  featured: string[];
  notes: string;
  projects: { id: string; title: string; client: string }[];
};

const TABS = ["CV", "Cover letter", "Pitch page", "Notes"] as const;

export function Studio(p: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("CV");
  const [pending, start] = useTransition();
  const [busyLabel, setBusyLabel] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [cover, setCover] = useState(p.coverLetter);
  const [headline, setHeadline] = useState(p.pitchHeadline);
  const [intro, setIntro] = useState(p.pitchIntro);
  const [featured, setFeatured] = useState<string[]>(p.featured);
  const [notes, setNotes] = useState(p.notes);
  const [editCover, setEditCover] = useState(false);

  const act = (label: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) => {
    setMsg(null);
    setBusyLabel(label);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (okText ? { ok: true, text: okText } : null) : { ok: false, text: r.error ?? "Failed" });
      router.refresh();
    });
  };

  const hasAssets = !!p.tailoredCv;

  if (!hasAssets) {
    return (
      <Card className="flex flex-col items-center justify-center p-10 text-center">
        <Sparkles className="mb-3 size-6 text-accent" />
        <h2 className="font-serif text-2xl">Ready when you are</h2>
        <p className="mt-2 max-w-md text-sm text-muted">
          Approving generates a tailored CV (only reordering and selecting from your real experience), a tone-matched cover letter, and a custom pitch page for this company.
        </p>
        <div className="mt-6 flex gap-2">
          <Button disabled={pending} onClick={() => act("Generating your application… (30–60s)", () => approveAction(p.pipelineId))}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve & generate
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => act("Re-scoring…", () => rescoreAction(p.pipelineId), "Fit review updated.")}>
            Detailed fit review
          </Button>
        </div>
        {pending && <p className="mt-4 text-sm text-muted">{busyLabel}</p>}
        {msg && <p className={cn("mt-4 text-sm", msg.ok ? "text-accent" : "text-warn")}>{msg.text}</p>}
      </Card>
    );
  }

  const cv = p.tailoredCv!;

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <select
          value={p.status}
          disabled={pending}
          onChange={(e) => act("Updating…", () => setStatusAction(p.pipelineId, e.target.value as PipelineStatus))}
          className="h-8 rounded-full border border-line bg-paper px-3 text-xs capitalize"
          aria-label="Status"
        >
          {PIPELINE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <a href={`/api/pdf/${p.pipelineId}`} className={buttonClass("primary", "sm")}>
          <Download className="size-3.5" /> Tailored CV (PDF)
        </a>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            navigator.clipboard.writeText(p.pitchUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy pitch URL"}
        </Button>
        <Link href={p.pitchUrl} target="_blank" className={buttonClass("ghost", "sm")}>
          <Eye className="size-3.5" /> Preview{p.views ? ` · ${p.views} view${p.views === 1 ? "" : "s"}` : ""}
        </Link>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" disabled={pending} title="Regenerate all assets" onClick={() => confirm("Regenerate CV, cover letter and pitch? Your edits will be replaced.") && act("Regenerating…", () => generateAssetsAction(p.pipelineId), "Regenerated.")}>
            <RefreshCw className={cn("size-3.5", pending && "animate-spin")} /> Regenerate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            title="Remove from pipeline"
            onClick={() =>
              confirm("Remove this job from your pipeline?") &&
              start(async () => {
                const r = await removeFromPipelineAction(p.pipelineId);
                if (r.ok) router.push("/dashboard");
                else setMsg({ ok: false, text: r.error });
              })
            }
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </Card>
      {(pending || msg) && <p className={cn("px-1 text-sm", msg && !msg.ok ? "text-warn" : "text-muted")}>{pending ? busyLabel : msg?.text}</p>}
      <p className="px-1 text-xs text-muted">
        Pitch page: <span className="font-mono">{p.pitchUrl}</span>
        {!["approved", "applied", "interview", "offer"].includes(p.status) && <span className="text-warn"> — only live while status is approved, applied, interview or offer.</span>}
      </p>

      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === t ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "CV" && (
        <Card className="p-6">
          <p className="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">
            Truth-anchored: employers, titles and dates are copied from your master profile; bullet points with numbers not in your CV are automatically removed.
          </p>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Summary</h3>
          <p className="mb-5 text-sm leading-relaxed">{cv.summary}</p>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Experience</h3>
          <div className="mb-5 space-y-4">
            {cv.experience.map((e) => (
              <div key={e.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {e.role} <span className="font-normal text-muted">· {e.company}</span>
                  </p>
                  <span className="text-xs text-muted">{e.dates}</span>
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                  {e.highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {cv.projects.length > 0 && (
            <>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Selected projects</h3>
              <div className="mb-5 space-y-3">
                {cv.projects.map((pr) => (
                  <div key={pr.id} className="text-sm">
                    <p className="font-medium">
                      {pr.title} <span className="font-normal text-muted">· {pr.client_or_org}</span>
                    </p>
                    <p>{pr.description}</p>
                    {pr.impact_metric && <p className="text-accent">↗ {pr.impact_metric}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Skills</h3>
          <p className="text-sm">{cv.selected_skills.join(" · ")}</p>
        </Card>
      )}

      {tab === "Cover letter" && (
        <Card className="p-6">
          <div className="mb-3 flex justify-between">
            <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(cover)}>
              <Copy className="size-3.5" /> Copy
            </Button>
            {editCover ? (
              <Button size="sm" disabled={pending} onClick={() => {
                  act("Saving…", () => updateAssetsAction(p.pipelineId, { cover_letter_md: cover }), "Saved.");
                  setEditCover(false);
                }}
              >
                Save
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setEditCover(true)}>
                Edit
              </Button>
            )}
          </div>
          {editCover ? <Textarea value={cover} onChange={(e) => setCover(e.target.value)} rows={20} className="font-mono text-xs" /> : <Markdown text={cover} className="text-[15px]" />}
        </Card>
      )}

      {tab === "Pitch page" && (
        <Card className="space-y-4 p-6">
          <div>
            <Label>Headline (max 12 words)</Label>
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </div>
          <div>
            <Label>Intro to the hiring team</Label>
            <Textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={8} />
          </div>
          <div>
            <Label>Featured case studies (pinned, up to 3)</Label>
            <div className="flex flex-wrap gap-2">
              {p.projects.map((pr) => {
                const on = featured.includes(pr.id);
                return (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => setFeatured((f) => (on ? f.filter((x) => x !== pr.id) : f.length >= 3 ? f : [...f, pr.id]))}
                    className={cn("rounded-full border px-3 py-1 text-xs", on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-ink/40")}
                  >
                    {on && "★ "}
                    {pr.title}
                  </button>
                );
              })}
            </div>
          </div>
          <Button disabled={pending} onClick={() => act("Saving…", () => updateAssetsAction(p.pipelineId, { custom_pitch_headline: headline, custom_pitch_intro: intro, featured_project_ids: featured }), "Pitch page updated.")}>
            Save pitch page
          </Button>
        </Card>
      )}

      {tab === "Notes" && (
        <Card className="space-y-3 p-6">
          <Label>Private notes (never shown publicly)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={8} placeholder="Recruiter name, follow-up dates, interview prep…" />
          <Button disabled={pending} onClick={() => act("Saving…", () => updateAssetsAction(p.pipelineId, { notes }), "Saved.")}>
            Save notes
          </Button>
        </Card>
      )}
    </div>
  );
}
