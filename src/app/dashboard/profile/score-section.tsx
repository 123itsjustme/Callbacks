"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, Loader2, RefreshCw, Upload } from "lucide-react";
import { reviewCvAction, reviewLinkedInAction } from "./actions";
import { Button, Card, Textarea } from "@/components/ui";
import type { ProfileReview } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

export type ReviewRow = { overall_score: number; review: ProfileReview; created_at: string };

export function ScoreSection({ cv, cvPrev, linkedin, linkedinPrev, hasLinkedIn }: { cv: ReviewRow | null; cvPrev: number | null; linkedin: ReviewRow | null; linkedinPrev: number | null; hasLinkedIn: boolean }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <CvCard row={cv} prev={cvPrev} />
      <LinkedInCard row={linkedin} prev={linkedinPrev} hasLinkedIn={hasLinkedIn} />
    </div>
  );
}

function CvCard({ row, prev }: { row: ReviewRow | null; prev: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = () =>
    start(async () => {
      setError(null);
      const r = await reviewCvAction();
      if (!r.ok) setError(r.error);
      router.refresh();
    });

  return (
    <Card className="p-6">
      <Header title="CV score" subtitle="How your CV reads to a recruiter hiring for your target roles." row={row} prev={prev} />
      {!row && !pending && (
        <div className="mt-5">
          <Button onClick={run}>Score my CV</Button>
        </div>
      )}
      {pending && <Working label="Reviewing your CV — about 20 seconds…" />}
      {error && <p className="mt-3 text-sm text-warn">{error}</p>}
      {row && !pending && (
        <>
          <Body review={row.review} />
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-xs text-muted">
            <span>Updated your CV? Re-upload it on the onboarding page, then re-score.</span>
            <Button size="sm" variant="secondary" onClick={run} className="ml-auto">
              <RefreshCw className="size-3.5" /> Re-score
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function LinkedInCard({ row, prev, hasLinkedIn }: { row: ReviewRow | null; prev: number | null; hasLinkedIn: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(!row);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <Card className="p-6">
      <Header title="LinkedIn score" subtitle="Headline, About, experience and how well it matches your CV." row={row} prev={prev} />
      {pending && <Working label="Reviewing your LinkedIn profile against your CV…" />}
      {error && <p className="mt-3 text-sm text-warn">{error}</p>}
      {showForm && !pending && (
        <form
          className="mt-5 space-y-3"
          action={(fd) =>
            start(async () => {
              setError(null);
              const r = await reviewLinkedInAction(fd);
              if (!r.ok) setError(r.error);
              else setShowForm(false);
              router.refresh();
            })
          }
        >
          <p className="text-sm text-muted">
            On LinkedIn, open your profile → <strong className="font-medium text-ink">More</strong> → <strong className="font-medium text-ink">Save to PDF</strong>, and upload it here. Or paste your headline, About and experience below.
          </p>
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted hover:border-ink/30">
            <Upload className="size-4" />
            {fileName ?? "Upload LinkedIn PDF"}
            <input type="file" name="file" accept=".pdf" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
          </label>
          <Textarea name="text" rows={6} placeholder="…or paste your LinkedIn profile text here" aria-label="LinkedIn profile text" />
          <div className="flex gap-2">
            <Button>{row ? "Re-score LinkedIn" : "Score my LinkedIn"}</Button>
            {row && (
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">Callback can&apos;t read LinkedIn directly, so we only use what you provide here.</p>
        </form>
      )}
      {row && !pending && !showForm && (
        <>
          <Body review={row.review} />
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-xs text-muted">
            <span>{hasLinkedIn ? "Updated your LinkedIn? Upload the new version to re-score." : ""}</span>
            <Button size="sm" variant="secondary" onClick={() => setShowForm(true)} className="ml-auto">
              <RefreshCw className="size-3.5" /> Re-score
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function Header({ title, subtitle, row, prev }: { title: string; subtitle: string; row: ReviewRow | null; prev: number | null }) {
  const delta = row && prev != null ? row.overall_score - prev : null;
  return (
    <div className="flex items-start gap-5">
      <ScoreDial score={row?.overall_score ?? null} />
      <div className="min-w-0 flex-1">
        <h2 className="font-serif text-2xl">{title}</h2>
        <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
        {row && (
          <p className="mt-2 text-xs text-muted">
            Scored {new Date(row.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            {delta != null && delta !== 0 && (
              <span className={cn("ml-2 font-semibold", delta > 0 ? "text-accent" : "text-warn")}>
                {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} since last time
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function ScoreDial({ score }: { score: number | null }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : score / 100;
  const color = score == null ? "var(--line)" : score >= 75 ? "var(--accent)" : score >= 55 ? "#b7791f" : "var(--warn)";
  return (
    <div className="relative size-20 shrink-0">
      <svg viewBox="0 0 80 80" className="size-20 -rotate-90" role="img" aria-label={score == null ? "Not scored yet" : `Score ${score} out of 100`}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-serif text-2xl">{score ?? "–"}</span>
    </div>
  );
}

function Working({ label }: { label: string }) {
  return (
    <p className="mt-5 inline-flex items-center gap-2 text-sm text-muted">
      <Loader2 className="size-4 animate-spin text-accent" /> {label}
    </p>
  );
}

const PRIORITY: Record<string, string> = { high: "bg-orange-50 text-warn border-orange-200", medium: "bg-amber-50 text-amber-800 border-amber-200", low: "bg-paper text-muted border-line" };

function Body({ review }: { review: ProfileReview }) {
  return (
    <div className="mt-5 space-y-5">
      <p className="text-[15px] leading-relaxed">{review.verdict}</p>

      <ul className="space-y-2.5">
        {review.categories.map((c) => (
          <li key={c.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{c.name}</span>
              <span className="font-mono text-xs text-muted">{c.score}/10</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper" aria-hidden="true">
              <div className={cn("h-full rounded-full", c.score >= 7 ? "bg-accent" : c.score >= 5 ? "bg-amber-600" : "bg-warn")} style={{ width: `${c.score * 10}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">{c.comment}</p>
          </li>
        ))}
      </ul>

      {review.consistency_issues.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-warn">
            <AlertTriangle className="size-4" /> Doesn&apos;t match your CV
          </p>
          <ul className="space-y-1 text-sm">
            {review.consistency_issues.map((i, k) => (
              <li key={k}>• {i}</li>
            ))}
          </ul>
        </div>
      )}

      {review.strengths.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">What&apos;s working</p>
          <ul className="space-y-1 text-sm">
            {review.strengths.map((s, i) => (
              <li key={i} className="flex gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-accent" /> {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Fix these first</p>
        <ol className="space-y-3">
          {review.improvements.map((imp, i) => (
            <li key={i} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", PRIORITY[imp.priority])}>{imp.priority}</span>
                <span className="text-sm font-medium">{imp.issue}</span>
              </div>
              <p className="mt-1.5 text-sm text-ink/80">{imp.fix}</p>
              {imp.example && <Example text={imp.example} />}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Example({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 rounded-lg bg-paper p-3 text-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Try</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}
