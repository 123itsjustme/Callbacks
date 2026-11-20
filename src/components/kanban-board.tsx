"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Check, Loader2, MapPin, X, Eye, Sparkles } from "lucide-react";
import { approveAction, setStatusAction } from "@/app/dashboard/actions";
import { Button, OrgTypeBadge, ScorePill } from "@/components/ui";
import { cn, type PipelineStatus } from "@/lib/utils";

export type KanbanItem = {
  id: string;
  status: PipelineStatus;
  match_score: number | null;
  fit_reasoning: string | null;
  red_flags: string[] | null;
  microsite_views: number;
  has_assets: boolean;
  job: { title: string; company_name: string; org_type: string; location: string | null; work_mode: string | null };
};

const COLUMNS: { key: PipelineStatus; label: string; hint: string }[] = [
  { key: "new", label: "New matches", hint: "Review & approve" },
  { key: "approved", label: "Approved", hint: "Assets ready to send" },
  { key: "applied", label: "Applied", hint: "" },
  { key: "interview", label: "Interview", hint: "" },
  { key: "offer", label: "Offer", hint: "" },
];

export function KanbanBoard({ items }: { items: KanbanItem[] }) {
  const [optimistic, move] = useOptimistic(items, (state, { id, status }: { id: string; status: PipelineStatus }) =>
    state.map((i) => (i.id === id ? { ...i, status } : i)),
  );
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [, start] = useTransition();
  const [dragOver, setDragOver] = useState<PipelineStatus | null>(null);

  const run = (id: string, label: string, status: PipelineStatus, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    setBusy((b) => ({ ...b, [id]: label }));
    start(async () => {
      move({ id, status });
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Failed");
      setBusy((b) => {
        const next = { ...b };
        delete next[id];
        return next;
      });
    });
  };

  const changeStatus = (id: string, status: PipelineStatus) => {
    const item = optimistic.find((i) => i.id === id);
    if (!item || item.status === status) return;
    if (status === "approved" && item.status === "new") return run(id, "Generating…", status, () => approveAction(id));
    run(id, status !== "passed" && !item.has_assets && status !== "rejected" ? "Generating…" : "Moving…", status, () => setStatusAction(id, status));
  };

  const archived = optimistic.filter((i) => i.status === "passed" || i.status === "rejected");

  return (
    <div>
      {error && <p className="mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-warn">{error}</p>}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colItems = optimistic.filter((i) => i.status === col.key).sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
          return (
            <section
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.key);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) changeStatus(id, col.key);
              }}
              className={cn("flex w-72 shrink-0 flex-col rounded-2xl bg-ink/[0.03] p-2 transition", dragOver === col.key && "bg-accent-soft ring-2 ring-accent/30")}
            >
              <header className="flex items-baseline justify-between px-2 pb-2 pt-1">
                <h2 className="text-sm font-medium">
                  {col.label} <span className="text-muted">{colItems.length}</span>
                </h2>
                <span className="text-[11px] text-muted">{col.hint}</span>
              </header>
              <div className="flex min-h-24 flex-col gap-2">
                {colItems.map((item) => (
                  <Card key={item.id} item={item} busy={busy[item.id]} onStatus={(s) => changeStatus(item.id, s)} />
                ))}
                {!colItems.length && <p className="px-2 py-6 text-center text-xs text-muted">Drop here</p>}
              </div>
            </section>
          );
        })}
      </div>
      {archived.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowArchived((s) => !s)} className="text-sm text-muted hover:text-ink">
            {showArchived ? "Hide" : "Show"} passed & rejected ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {archived.map((item) => (
                <Card key={item.id} item={item} busy={busy[item.id]} onStatus={(s) => changeStatus(item.id, s)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ item, busy, onStatus }: { item: KanbanItem; busy?: string; onStatus: (s: PipelineStatus) => void }) {
  return (
    <article
      draggable={!busy}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
      className={cn("group rounded-xl border border-line bg-surface p-3 shadow-[0_1px_0_rgba(0,0,0,0.03)]", busy && "opacity-70", !busy && "cursor-grab active:cursor-grabbing")}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <Link href={`/dashboard/pipeline/${item.id}`} className="font-medium leading-snug hover:underline">
          {item.job.title}
        </Link>
        <ScorePill score={item.match_score} />
      </div>
      <p className="text-sm text-muted">{item.job.company_name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <OrgTypeBadge type={item.job.org_type} />
        {item.job.location && (
          <span className="inline-flex items-center gap-0.5">
            <MapPin className="size-3" /> {item.job.location}
          </span>
        )}
        {item.job.work_mode && item.job.work_mode !== "unspecified" && <span className="capitalize">· {item.job.work_mode}</span>}
        {item.microsite_views > 0 && (
          <span className="inline-flex items-center gap-0.5 text-accent">
            <Eye className="size-3" /> {item.microsite_views}
          </span>
        )}
      </div>
      {item.status === "new" && item.red_flags && item.red_flags.length > 0 && <p className="mt-2 line-clamp-2 text-xs text-warn">⚑ {item.red_flags[0]}</p>}

      {busy ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted">
          <Loader2 className="size-3.5 animate-spin" /> {busy}
        </p>
      ) : item.status === "new" ? (
        <div className="mt-3 flex gap-1.5">
          <Button size="sm" onClick={() => onStatus("approved")} title="Generate tailored CV, cover letter & pitch page">
            <Check className="size-3.5" /> Approve
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onStatus("passed")}>
            <X className="size-3.5" /> Pass
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2">
          <select
            value={item.status}
            onChange={(e) => onStatus(e.target.value as PipelineStatus)}
            className="h-7 rounded-full border border-line bg-paper px-2 text-xs capitalize"
            aria-label="Move to"
          >
            {["new", "approved", "applied", "interview", "offer", "rejected", "passed"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {item.has_assets && (
            <Link href={`/dashboard/pipeline/${item.id}`} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              <Sparkles className="size-3" /> Studio
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
