"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CalendarClock, Check, Copy, Download, Eye, Loader2, RefreshCw, Send, Sparkles, Trash2 } from "lucide-react";
import {
  addNoteEventAction,
  approveAction,
  markOutreachSentAction,
  regenerateAction,
  removeFromPipelineAction,
  rescoreAction,
  setNextActionAction,
  setStatusAction,
  updateAssetsAction,
} from "@/app/dashboard/actions";
import { Button, Card, Input, Label, Markdown, Textarea, buttonClass } from "@/components/ui";
import type { Outreach, TailoredCV } from "@/lib/ai/schemas";
import { PIPELINE_STATUSES, cn, type PipelineStatus } from "@/lib/utils";

type Event = { id: string; kind: string; detail: string | null; created_at: string };

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
  assetsStatus: "none" | "generating" | "ready" | "error";
  assetsError: string | null;
  outreach: Outreach | null;
  nextAction: string | null;
  nextActionDue: string | null;
  events: Event[];
};

const TABS = ["Outreach", "CV", "Cover letter", "Pitch page", "History"] as const;
const ROUTE_LABEL: Record<Outreach["recommended_route"], string> = {
  apply_direct: "Apply through the job posting",
  hiring_manager: "Message the hiring manager directly",
  recruiter: "Go through the recruiter / talent team",
  referral: "Ask for a referral",
};

export function Studio(p: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Outreach");
  const [pending, start] = useTransition();
  const [busyLabel, setBusyLabel] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Poll while assets are generating in the background.
  useEffect(() => {
    if (p.assetsStatus !== "generating") return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [p.assetsStatus, router]);

  const act = (label: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) => {
    setMsg(null);
    setBusyLabel(label);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (okText ? { ok: true, text: okText } : null) : { ok: false, text: r.error ?? "Failed" });
      router.refresh();
    });
  };

  if (p.assetsStatus === "generating") {
    return (
      <Card className="flex flex-col items-center justify-center p-10 text-center">
        <Loader2 className="mb-3 size-6 animate-spin text-accent" />
        <h2 className="font-serif text-2xl">Writing your application…</h2>
        <p className="mt-2 max-w-md text-sm text-muted">Tailored CV, cover letter, pitch page and outreach kit. This usually takes under a minute — this page updates by itself.</p>
      </Card>
    );
  }

  if (!p.tailoredCv) {
    return (
      <Card className="flex flex-col items-center justify-center p-10 text-center">
        <Sparkles className="mb-3 size-6 text-accent" />
        <h2 className="font-serif text-2xl">{p.assetsStatus === "error" ? "Generation hit a problem" : "Ready when you are"}</h2>
        <p className="mt-2 max-w-md text-sm text-muted">
          {p.assetsStatus === "error"
            ? p.assetsError ?? "Something went wrong."
            : "Approving writes a tailored CV (only reordering and selecting from your real experience), a tone-matched cover letter, a custom pitch page and an outreach kit."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button disabled={pending} onClick={() => act("Starting…", () => (p.assetsStatus === "error" ? regenerateAction(p.pipelineId) : approveAction(p.pipelineId)))}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {p.assetsStatus === "error" ? "Try again" : "Approve & generate"}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => act("Reviewing fit…", () => rescoreAction(p.pipelineId), "Fit review updated.")}>
            Detailed fit review
          </Button>
        </div>
        {pending && <p className="mt-4 text-sm text-muted">{busyLabel}</p>}
        {msg && <p className={cn("mt-4 text-sm", msg.ok ? "text-accent" : "text-warn")}>{msg.text}</p>}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <NextStep {...p} pending={pending} act={act} />

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <select
          value={p.status}
          disabled={pending}
          onChange={(e) => act("Updating…", () => setStatusAction(p.pipelineId, e.target.value as PipelineStatus))}
          className="h-9 rounded-full border border-line bg-paper px-3 text-xs capitalize"
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
        <CopyButton text={p.pitchUrl} label="Copy pitch URL" />
        <Link href={p.pitchUrl} target="_blank" className={buttonClass("ghost", "sm")}>
          <Eye className="size-3.5" /> Preview{p.views ? ` · ${p.views} view${p.views === 1 ? "" : "s"}` : ""}
        </Link>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Regenerate CV, cover letter, pitch and outreach? Your edits will be replaced.") && act("Regenerating…", () => regenerateAction(p.pipelineId))}>
            <RefreshCw className="size-3.5" /> Regenerate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Remove from pipeline"
            disabled={pending}
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

      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", tab === t ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Outreach" && <OutreachTab {...p} pending={pending} act={act} />}
      {tab === "CV" && <CvTab cv={p.tailoredCv} />}
      {tab === "Cover letter" && <CoverTab {...p} pending={pending} act={act} />}
      {tab === "Pitch page" && <PitchTab {...p} pending={pending} act={act} />}
      {tab === "History" && <HistoryTab {...p} pending={pending} act={act} />}
    </div>
  );
}

type ActProps = Props & { pending: boolean; act: (label: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) => void };

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : label}
    </Button>
  );
}

function NextStep(p: ActProps) {
  const [editing, setEditing] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = p.nextActionDue && p.nextActionDue < today;
  if (!p.nextAction && !editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="w-full rounded-2xl border border-dashed border-line p-3 text-left text-sm text-muted hover:border-ink/30">
        + Add a next step
      </button>
    );
  if (editing)
    return (
      <Card className="p-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            p.act("Saving…", () => setNextActionAction(p.pipelineId, String(fd.get("text")), String(fd.get("due")) || null));
            setEditing(false);
          }}
        >
          <div className="min-w-48 flex-1">
            <Label htmlFor="ns-text">Next step</Label>
            <Input id="ns-text" name="text" defaultValue={p.nextAction ?? ""} required />
          </div>
          <div>
            <Label htmlFor="ns-due">Due</Label>
            <Input id="ns-due" name="due" type="date" defaultValue={p.nextActionDue ?? ""} />
          </div>
          <Button size="sm">Save</Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      </Card>
    );
  return (
    <Card className={cn("flex flex-wrap items-center gap-3 p-4", overdue && "border-orange-200 bg-orange-50")}>
      <CalendarClock className={cn("size-5 shrink-0", overdue ? "text-warn" : "text-accent")} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Next step{p.nextActionDue ? ` · ${overdue ? "overdue, was due" : "due"} ${new Date(p.nextActionDue).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}</p>
        <p className="text-sm font-medium">{p.nextAction}</p>
      </div>
      <Button size="sm" disabled={p.pending} onClick={() => p.act("Marking done…", () => setNextActionAction(p.pipelineId, null, null), "Done.")}>
        <Check className="size-3.5" /> Done
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </Card>
  );
}

function OutreachTab(p: ActProps) {
  const o = p.outreach;
  if (!o)
    return (
      <Card className="p-6 text-sm text-muted">
        No outreach kit yet for this application.{" "}
        <button type="button" className="underline" onClick={() => p.act("Generating…", () => regenerateAction(p.pipelineId))}>
          Generate one
        </button>
      </Card>
    );
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Recommended route</p>
        <p className="mt-1 font-serif text-2xl">{ROUTE_LABEL[o.recommended_route]}</p>
        <p className="mt-2 text-sm leading-relaxed">{o.route_reasoning}</p>
        {o.who_to_contact.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Who to look for on LinkedIn or the company site</p>
            <ul className="mt-2 space-y-1.5">
              {o.who_to_contact.map((w, i) => (
                <li key={i} className="text-sm">
                  <strong className="font-medium">{w.title}</strong> <span className="text-muted">— {w.why}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <MessageCard
        title="LinkedIn connection note"
        hint={`${o.linkedin_note.length}/300 characters`}
        text={o.linkedin_note}
        onSent={() => p.act("Logging…", () => markOutreachSentAction(p.pipelineId, "linkedin"), "Logged — we'll remind you to follow up.")}
        pending={p.pending}
      />
      <MessageCard
        title="Email"
        hint={`Subject: ${o.email_subject}`}
        text={o.email_body_md}
        copyText={`Subject: ${o.email_subject}\n\n${o.email_body_md}`}
        onSent={() => p.act("Logging…", () => markOutreachSentAction(p.pipelineId, "email"), "Logged — we'll remind you to follow up.")}
        pending={p.pending}
      />
      <MessageCard
        title={`Follow-up (after ${o.follow_up_after_days} days with no reply)`}
        text={o.follow_up_md}
        onSent={() => p.act("Logging…", () => markOutreachSentAction(p.pipelineId, "follow_up"), "Follow-up logged.")}
        pending={p.pending}
        sentLabel="Mark follow-up sent"
      />
    </div>
  );
}

function MessageCard({ title, hint, text, copyText, onSent, pending, sentLabel = "Mark as sent" }: { title: string; hint?: string; text: string; copyText?: string; onSent: () => void; pending: boolean; sentLabel?: string }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{title}</p>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
        <div className="flex gap-2">
          <CopyButton text={copyText ?? text} />
          <Button size="sm" variant="ghost" disabled={pending} onClick={onSent}>
            <Send className="size-3.5" /> {sentLabel}
          </Button>
        </div>
      </div>
      <Markdown text={text} className="rounded-xl bg-paper p-4 text-sm" />
    </Card>
  );
}

function CvTab({ cv }: { cv: TailoredCV }) {
  return (
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
  );
}

function CoverTab(p: ActProps) {
  const [cover, setCover] = useState(p.coverLetter);
  const [edit, setEdit] = useState(false);
  return (
    <Card className="p-6">
      <div className="mb-3 flex justify-between">
        <CopyButton text={cover} />
        {edit ? (
          <Button
            size="sm"
            disabled={p.pending}
            onClick={() => {
              p.act("Saving…", () => updateAssetsAction(p.pipelineId, { cover_letter_md: cover }), "Saved.");
              setEdit(false);
            }}
          >
            Save
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>
            Edit
          </Button>
        )}
      </div>
      {edit ? <Textarea value={cover} onChange={(e) => setCover(e.target.value)} rows={20} className="font-mono text-xs" aria-label="Cover letter" /> : <Markdown text={cover} className="text-[15px]" />}
    </Card>
  );
}

function PitchTab(p: ActProps) {
  const [headline, setHeadline] = useState(p.pitchHeadline);
  const [intro, setIntro] = useState(p.pitchIntro);
  const [featured, setFeatured] = useState<string[]>(p.featured);
  return (
    <Card className="space-y-4 p-6">
      <p className="text-xs text-muted">
        Live at <span className="font-mono">{p.pitchUrl}</span>
        {!["approved", "applied", "interview", "offer"].includes(p.status) && <span className="text-warn"> — only visible while status is approved, applied, interview or offer.</span>}
      </p>
      <div>
        <Label htmlFor="pitch-headline">Headline (max 12 words)</Label>
        <Input id="pitch-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="pitch-intro">Intro to the hiring team</Label>
        <Textarea id="pitch-intro" value={intro} onChange={(e) => setIntro(e.target.value)} rows={8} />
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
                aria-pressed={on}
                onClick={() => setFeatured((f) => (on ? f.filter((x) => x !== pr.id) : f.length >= 3 ? f : [...f, pr.id]))}
                className={cn("min-h-9 rounded-full border px-3 text-xs", on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-ink/40")}
              >
                {on && "★ "}
                {pr.title}
              </button>
            );
          })}
        </div>
      </div>
      <Button disabled={p.pending} onClick={() => p.act("Saving…", () => updateAssetsAction(p.pipelineId, { custom_pitch_headline: headline, custom_pitch_intro: intro, featured_project_ids: featured }), "Pitch page updated.")}>
        Save pitch page
      </Button>
    </Card>
  );
}

function HistoryTab(p: ActProps) {
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState(p.notes);
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            p.act("Adding…", () => addNoteEventAction(p.pipelineId, note));
            setNote("");
          }}
        >
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Log an update — e.g. ‘Recruiter called, interview Tuesday’" aria-label="Add an update" />
          <Button size="sm" disabled={!note.trim() || p.pending}>
            Add
          </Button>
        </form>
        <ol className="mt-5 space-y-3 border-l border-line pl-4">
          {p.events.length === 0 && <li className="text-sm text-muted">Nothing logged yet.</li>}
          {p.events.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-ink/40" />
              <p>{e.detail ?? e.kind}</p>
              <p className="text-xs text-muted">{new Date(e.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </li>
          ))}
        </ol>
      </Card>
      <Card className="space-y-3 p-5">
        <Label htmlFor="private-notes">Private notes (never shown publicly)</Label>
        <Textarea id="private-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Recruiter name, interview prep…" />
        <Button size="sm" disabled={p.pending} onClick={() => p.act("Saving…", () => updateAssetsAction(p.pipelineId, { notes }), "Saved.")}>
          Save notes
        </Button>
      </Card>
    </div>
  );
}
