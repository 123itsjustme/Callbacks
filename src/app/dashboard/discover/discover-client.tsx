"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Loader2, MapPin, Plus, Radar, Sparkles, Undo2, X } from "lucide-react";
import { approveAction, passAction, saveLocationPrefsAction, setStatusAction } from "@/app/dashboard/actions";
import { ALL_MODES, MODE_LABEL, matchesLocation, type LocationPrefs, type WorkMode } from "@/lib/location";
import { Button, Card, OrgTypeBadge, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

export type DeckCard = {
  id: string;
  match_score: number | null;
  fit_reasoning: string | null;
  red_flags: string[];
  assessed: boolean;
  source: string;
  job: {
    title: string;
    company_name: string;
    org_type: string;
    location: string | null;
    work_mode: string | null;
    salary_text: string | null;
    summary_bullets: string[];
    source_url: string;
  };
};

type Fit = { match_score: number; fit_reasoning: string; red_flags: string[] };
type Toast = { kind: "pass" | "approve"; id: string; title: string; company: string } | null;

const PASS_REASONS = ["Wrong level", "Wrong location", "Not my discipline", "Company isn't a fit", "Pay too low"];
const SOURCE_LABEL: Record<string, string> = { watchlist: "From your companies", search: "Found by web search", match: "Matched to your CV", import: "You imported this" };
const THRESHOLD = 110;

async function api<T>(body: object): Promise<T & { ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) {
    return { ok: false, error: (e as Error).message } as T & { ok: boolean; error?: string };
  }
}

export function DiscoverClient({
  cards,
  companies,
  autoRun,
  initialPrefs,
  homeCity,
}: {
  cards: DeckCard[];
  companies: { id: string; name: string }[];
  autoRun: boolean;
  initialPrefs: LocationPrefs;
  homeCity: string | null;
}) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<LocationPrefs>(initialPrefs);
  const [, startSave] = useTransition();
  const updatePrefs = (next: LocationPrefs) => {
    setPrefs(next);
    startSave(async () => {
      await saveLocationPrefsAction(next);
    });
  };
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [fits, setFits] = useState<Record<string, Fit | "error">>({});
  const [drag, setDrag] = useState({ x: 0, active: false });
  const [exiting, setExiting] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const startX = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------- discovery runner
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const ran = useRef(false);

  const runDiscovery = useCallback(async () => {
    setRunning(true);
    setProgress([]);
    const log = (s: string) => setProgress((p) => [...p, s]);
    let total = 0;
    for (let i = 0; i < companies.length; i++) {
      const c = companies[i];
      log(`Checking ${c.name}… (${i + 1}/${companies.length})`);
      const r = await api<{ newMatches?: number; scanError?: string }>({ op: "scan", companyId: c.id });
      if (r.ok) {
        total += r.newMatches ?? 0;
        if (r.newMatches) log(`  ${r.newMatches} new role${r.newMatches === 1 ? "" : "s"} at ${c.name}`);
        if (r.scanError && !r.newMatches) log(`  Couldn't read ${c.name}'s jobs page`);
      } else log(`  ${c.name}: ${r.error}`);
      if (i % 2 === 1) router.refresh();
    }
    log("Searching the web for roles like yours…");
    const s = await api<{ added?: number; found?: number }>({ op: "search" });
    if (s.ok) {
      total += s.added ?? 0;
      log(`  Web search: ${s.added ?? 0} new role${s.added === 1 ? "" : "s"}`);
    } else log(`  Web search: ${s.error}`);
    log(total ? `Done — ${total} new role${total === 1 ? "" : "s"} to review.` : "Done — no new roles right now. We'll keep checking daily.");
    setRunning(false);
    router.refresh();
  }, [companies, router]);

  useEffect(() => {
    if (autoRun && !ran.current) {
      ran.current = true;
      runDiscovery();
    }
  }, [autoRun, runDiscovery]);

  // ---------------- deck
  const remaining = cards.filter((c) => !gone.has(c.id));
  const deck = remaining.filter((c) => matchesLocation(c.job, prefs));
  const hidden = remaining.length - deck.length;
  const top = deck[0];
  const next = deck[1];

  // Detailed AI fit review for the visible card (and pre-load the next one).
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const c of [top, next]) {
      if (!c || c.assessed || requested.current.has(c.id)) continue;
      requested.current.add(c.id);
      api<Fit>({ op: "fit", pipelineId: c.id }).then((r) =>
        setFits((f) => ({ ...f, [c.id]: r.ok && "fit_reasoning" in r && r.fit_reasoning ? { match_score: r.match_score, fit_reasoning: r.fit_reasoning, red_flags: r.red_flags } : "error" })),
      );
    }
  }, [top, next]);

  const showToast = (t: Toast) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  };

  const commit = useCallback(
    (dir: 1 | -1) => {
      if (!top || exiting) return;
      const card = top;
      setExiting({ id: card.id, dir });
      setTimeout(() => {
        setGone((g) => new Set(g).add(card.id));
        setExiting(null);
        setDrag({ x: 0, active: false });
      }, 220);
      showToast({ kind: dir === 1 ? "approve" : "pass", id: card.id, title: card.job.title, company: card.job.company_name });
      start(async () => {
        const r = dir === 1 ? await approveAction(card.id) : await passAction(card.id);
        if (!r.ok) setError(r.error);
      });
    },
    [top, exiting],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") commit(1);
      if (e.key === "ArrowLeft") commit(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit]);

  const undo = (id: string) => {
    setToast(null);
    setGone((g) => {
      const n = new Set(g);
      n.delete(id);
      return n;
    });
    start(async () => {
      await setStatusAction(id, "new");
    });
  };

  const giveReason = (id: string, reason: string) => {
    setToast(null);
    start(async () => {
      await passAction(id, reason);
    });
  };

  const x = exiting && top && exiting.id === top.id ? exiting.dir * 700 : drag.x;
  const rot = x / 18;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,560px)_1fr]">
      <div>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl">Discover</h1>
            <p className="mt-1 text-sm text-muted">
              {deck.length ? `${deck.length} role${deck.length === 1 ? "" : "s"} to review. Swipe right to apply, left to pass.` : "Nothing to review right now."}
              {hidden > 0 && <span> {hidden} hidden by your location filter.</span>}
            </p>
          </div>
        </div>

        <LocationFilter prefs={prefs} onChange={updatePrefs} homeCity={homeCity} />

        {error && <p className="mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-warn">{error}</p>}

        <div className="relative h-[560px] select-none">
          {next && (
            <div aria-hidden="true" className="absolute inset-x-3 top-3 h-[540px] rounded-3xl border border-line bg-surface opacity-70" />
          )}
          {top ? (
            <article
              key={top.id}
              aria-label={`${top.job.title} at ${top.job.company_name}`}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("a, button")) return;
                startX.current = e.clientX;
                setDrag({ x: 0, active: true });
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => drag.active && setDrag({ x: e.clientX - startX.current, active: true })}
              onPointerUp={() => {
                if (!drag.active) return;
                if (Math.abs(drag.x) > THRESHOLD) commit(drag.x > 0 ? 1 : -1);
                else setDrag({ x: 0, active: false });
              }}
              onPointerCancel={() => setDrag({ x: 0, active: false })}
              style={{ transform: `translateX(${x}px) rotate(${rot}deg)`, transition: drag.active ? "none" : "transform 220ms ease-out", touchAction: "pan-y" }}
              className="absolute inset-0 flex cursor-grab flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.08)] active:cursor-grabbing"
            >
              <SwipeStamp x={x} />
              <CardBody card={top} fit={fits[top.id]} />
            </article>
          ) : (
            <Card className="flex h-full flex-col items-center justify-center p-10 text-center">
              <Sparkles className="mb-3 size-6 text-accent" />
              <p className="font-serif text-2xl">You&apos;re all caught up</p>
              <p className="mt-2 max-w-sm text-sm text-muted">
                {companies.length ? "Run a fresh search, or add more companies to your list." : "Start by letting Callback suggest companies that fit your CV."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {companies.length ? (
                  <Button onClick={runDiscovery} disabled={running}>
                    <Radar className="size-4" /> Find open roles
                  </Button>
                ) : null}
                <Link href={companies.length ? "/dashboard/companies" : "/dashboard/companies?suggest=1"} className={buttonClass(companies.length ? "secondary" : "primary")}>
                  {companies.length ? "Manage companies" : "Find my 10 companies"}
                </Link>
              </div>
            </Card>
          )}
        </div>

        {top && (
          <div className="mt-5 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => commit(-1)}
              aria-label="Pass (left arrow)"
              className="flex size-16 items-center justify-center rounded-full border border-line bg-surface text-warn shadow-sm transition hover:scale-105 hover:border-warn/40"
            >
              <X className="size-7" />
            </button>
            <p className="hidden text-center text-xs text-muted sm:block">
              <ArrowLeft className="inline size-3" /> / <ArrowRight className="inline size-3" /> keys work too
            </p>
            <button
              type="button"
              onClick={() => commit(1)}
              aria-label="Apply (right arrow)"
              className="flex size-16 items-center justify-center rounded-full bg-accent text-white shadow-sm transition hover:scale-105"
            >
              <Check className="size-7" />
            </button>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <h2 className="font-medium">Find new roles</h2>
          <p className="mt-1 text-sm text-muted">
            Checks the job boards of your {companies.length} compan{companies.length === 1 ? "y" : "ies"}, then searches the web for similar roles. Runs automatically every day too.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={runDiscovery} disabled={running}>
              {running ? <Loader2 className="size-3.5 animate-spin" /> : <Radar className="size-3.5" />} {running ? "Searching…" : "Search now"}
            </Button>
            <Link href="/dashboard/companies" className={buttonClass("secondary", "sm")}>
              Your companies
            </Link>
          </div>
          {progress.length > 0 && (
            <ol className="mt-4 max-h-64 space-y-1 overflow-y-auto rounded-lg bg-paper p-3 font-mono text-[11px] leading-relaxed text-muted" aria-live="polite">
              {progress.map((p, i) => (
                <li key={i} className={cn(p.startsWith("Done") && "font-semibold text-accent")}>
                  {p}
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card className="p-5 text-sm text-muted">
          <p className="font-medium text-ink">How it works</p>
          <ul className="mt-2 space-y-1.5">
            <li>→ Swipe right and Callback writes your tailored CV, cover letter, pitch page and outreach kit in the background.</li>
            <li>← Swipe left and tell us why, and future suggestions get sharper.</li>
            <li>Everything you approve lands in your Pipeline with a next step.</li>
          </ul>
        </Card>
      </aside>

      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-xl rounded-2xl border border-line bg-ink p-4 text-paper shadow-xl sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
          {toast.kind === "approve" ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Check className="size-4 text-emerald-400" />
              <span className="flex-1">
                Applying to <strong>{toast.title}</strong> — writing your CV, cover letter &amp; outreach kit…
              </span>
              <Link href={`/dashboard/pipeline/${toast.id}`} className="underline underline-offset-2">
                Open
              </Link>
              <button type="button" onClick={() => undo(toast.id)} className="inline-flex items-center gap-1 text-paper/70 hover:text-paper">
                <Undo2 className="size-3.5" /> Undo
              </button>
            </div>
          ) : (
            <div className="text-sm">
              <div className="flex items-center gap-3">
                <span className="flex-1">
                  Passed on <strong>{toast.title}</strong>. Why?
                </span>
                <button type="button" onClick={() => undo(toast.id)} className="inline-flex items-center gap-1 text-paper/70 hover:text-paper">
                  <Undo2 className="size-3.5" /> Undo
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {PASS_REASONS.map((r) => (
                  <button key={r} type="button" onClick={() => giveReason(toast.id, r)} className="min-h-9 rounded-full border border-paper/25 px-3 text-xs hover:bg-paper/10">
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SwipeStamp({ x }: { x: number }) {
  const o = Math.min(1, Math.abs(x) / THRESHOLD);
  if (o < 0.15) return null;
  return x > 0 ? (
    <span style={{ opacity: o }} className="pointer-events-none absolute left-6 top-6 z-10 rotate-[-12deg] rounded-lg border-2 border-accent px-3 py-1 text-lg font-bold uppercase tracking-wide text-accent">
      Apply
    </span>
  ) : (
    <span style={{ opacity: o }} className="pointer-events-none absolute right-6 top-6 z-10 rotate-[12deg] rounded-lg border-2 border-warn px-3 py-1 text-lg font-bold uppercase tracking-wide text-warn">
      Pass
    </span>
  );
}

function CardBody({ card, fit }: { card: DeckCard; fit?: Fit | "error" }) {
  const j = card.job;
  const live = fit && typeof fit === "object" ? fit : null;
  const score = live?.match_score ?? card.match_score;
  const reasoning = live?.fit_reasoning ?? (card.assessed ? card.fit_reasoning : null);
  const flags = live?.red_flags ?? (card.assessed ? card.red_flags : []);
  const tone = (score ?? 0) >= 75 ? "bg-accent text-white" : (score ?? 0) >= 50 ? "bg-accent-soft text-accent" : "bg-paper text-muted";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-medium uppercase tracking-wide">{j.company_name}</span>
            <OrgTypeBadge type={j.org_type} />
          </div>
          {score != null && (
            <span className={cn("rounded-full px-2.5 py-1 font-mono text-xs font-semibold", tone)} title="Fit score">
              {score}% fit
            </span>
          )}
        </div>
        <h2 className="font-serif text-3xl leading-tight">{j.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {j.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {j.location}
            </span>
          )}
          {j.work_mode && j.work_mode !== "unspecified" && <span className="capitalize">{j.work_mode}</span>}
          {j.salary_text && <span>{j.salary_text}</span>}
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {j.summary_bullets.length > 0 && (
          <ul className="space-y-1.5 text-[15px]">
            {j.summary_bullets.map((b, i) => (
              <li key={i}>→ {b}</li>
            ))}
          </ul>
        )}
        <div className="rounded-2xl bg-paper p-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Why it fits you</p>
          {reasoning ? (
            <p className="text-sm leading-relaxed">{reasoning}</p>
          ) : fit === "error" ? (
            <p className="text-sm text-muted">{card.fit_reasoning}</p>
          ) : (
            <p className="inline-flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-3.5 animate-spin" /> Reviewing against your CV…
            </p>
          )}
          {flags.length > 0 && (
            <ul className="mt-2 space-y-1">
              {flags.slice(0, 3).map((f, i) => (
                <li key={i} className="text-sm text-warn">
                  ⚑ {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line px-6 py-3 text-xs text-muted">
        <span>{SOURCE_LABEL[card.source] ?? "Matched"}</span>
        <a href={j.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">
          View posting <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

function LocationFilter({ prefs, onChange, homeCity }: { prefs: LocationPrefs; onChange: (p: LocationPrefs) => void; homeCity: string | null }) {
  const [draft, setDraft] = useState("");
  const add = (place: string) => {
    const v = place.trim();
    if (!v || prefs.places.some((p) => p.toLowerCase() === v.toLowerCase())) return;
    onChange({ ...prefs, places: [...prefs.places, v] });
    setDraft("");
  };
  const toggleMode = (m: WorkMode) => {
    const on = prefs.modes.includes(m);
    const modes = on ? prefs.modes.filter((x) => x !== m) : [...prefs.modes, m];
    if (modes.length) onChange({ ...prefs, modes });
  };
  const suggest = homeCity && !prefs.places.some((p) => p.toLowerCase() === homeCity.toLowerCase()) ? homeCity : null;

  return (
    <div className="mb-4 space-y-2.5 rounded-2xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Work mode">
        <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-muted">
          <MapPin className="size-3.5" /> Where
        </span>
        {ALL_MODES.map((m) => {
          const on = prefs.modes.includes(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => toggleMode(m)}
              className={cn("min-h-8 rounded-full border px-3 text-xs", on ? "border-ink bg-ink text-paper" : "border-line text-muted hover:border-ink/40")}
            >
              {MODE_LABEL[m]}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {prefs.places.length === 0 && <span className="text-xs text-muted">Any location</span>}
        {prefs.places.map((p) => (
          <span key={p} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-accent-soft pl-3 pr-1 text-xs font-medium text-accent">
            {p}
            <button type="button" aria-label={`Remove ${p}`} onClick={() => onChange({ ...prefs, places: prefs.places.filter((x) => x !== p) })} className="rounded-full p-1 hover:bg-accent/10">
              <X className="size-3" />
            </button>
          </span>
        ))}
        {suggest && (
          <button type="button" onClick={() => add(suggest)} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed border-line px-3 text-xs text-muted hover:border-ink/40">
            <Plus className="size-3" /> {suggest}
          </button>
        )}
        <form
          className="flex items-center"
          onSubmit={(e) => {
            e.preventDefault();
            add(draft);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a city or country…"
            aria-label="Add a location"
            className="h-8 w-44 rounded-full border border-line bg-paper px-3 text-xs outline-none focus:border-ink/40"
          />
        </form>
      </div>
      {prefs.places.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={prefs.includeUnknown} onChange={(e) => onChange({ ...prefs, includeUnknown: e.target.checked })} />
          Include jobs that don&apos;t list a location
        </label>
      )}
    </div>
  );
}
