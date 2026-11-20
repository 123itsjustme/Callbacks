"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, CheckCircle2, Loader2, Pencil, Radar, Sparkles, Sprout, X } from "lucide-react";
import { addCompanyAction, scanCompanyAction, seedCompaniesAction, setCompanyStatusAction, suggestCompaniesAction, updateCompanyUrlAction } from "./actions";
import { Button, Card, Input, Label, OrgTypeBadge, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

export type CompanyItem = {
  id: string;
  name: string;
  org_type: string;
  careers_url: string;
  ats_provider: string | null;
  verified: boolean;
  location: string | null;
  status: "suggested" | "active";
  source: string;
  fit_reason: string | null;
  last_scanned_at: string | null;
  roles: number;
};

const ORG_TYPES = ["agency", "indie", "publisher", "client", "other"];

export function CompaniesClient({ companies, autoSuggest }: { companies: CompanyItem[]; autoSuggest: boolean }) {
  const router = useRouter();
  const [state, addAction, adding] = useActionState(addCompanyAction, null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [, start] = useTransition();
  const started = useRef(false);

  const suggested = companies.filter((c) => c.status === "suggested");
  const active = companies.filter((c) => c.status === "active");

  const run = (key: string, fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    setBusy(key);
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Failed" });
      setBusy(null);
      router.refresh();
    });
  };

  const suggest = () => run("suggest", suggestCompaniesAction);

  useEffect(() => {
    if (autoSuggest && !started.current && suggested.length === 0) {
      started.current = true;
      suggest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSuggest]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-8">
        {/* Suggestions */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium">Suggested for you {suggested.length > 0 && <span className="text-muted">{suggested.length}</span>}</h2>
            <div className="flex flex-wrap gap-2">
              {suggested.length > 0 && (
                <Button size="sm" disabled={!!busy} onClick={() => run("keepall", () => setCompanyStatusAction(suggested.map((c) => c.id), "active").then((r) => (r.ok ? { ok: true, message: "Added to your list. Next: find open roles." } : r)))}>
                  <Check className="size-3.5" /> Keep all
                </Button>
              )}
              <Button size="sm" variant={suggested.length ? "secondary" : "primary"} disabled={!!busy} onClick={suggest}>
                {busy === "suggest" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {busy === "suggest" ? "Researching…" : suggested.length || active.length ? "Suggest more" : "Find my 10 companies"}
              </Button>
            </div>
          </div>
          {busy === "suggest" && (
            <Card className="flex items-center gap-3 p-4 text-sm text-muted">
              <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
              Reading your CV and researching companies on the web — this takes 1–2 minutes.
            </Card>
          )}
          {msg && <p className={cn("text-sm", msg.ok ? "text-accent" : "text-warn")}>{msg.text}</p>}
          {!suggested.length && busy !== "suggest" && (
            <Card className="p-6 text-sm text-muted">
              {active.length ? "No pending suggestions." : "Let Callback suggest 10 companies that fit your CV, or add your own on the right."}
            </Card>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {suggested.map((c) => (
              <Card key={c.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      <OrgTypeBadge type={c.org_type} />
                      {c.location && <span>{c.location}</span>}
                      {c.verified ? (
                        <span className="inline-flex items-center gap-0.5 text-accent">
                          <CheckCircle2 className="size-3" /> careers page checked
                        </span>
                      ) : (
                        <span className="text-warn">link not verified</span>
                      )}
                    </div>
                  </div>
                </div>
                {c.fit_reason && <p className="mt-3 flex-1 text-sm leading-relaxed">{c.fit_reason}</p>}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" disabled={!!busy} onClick={() => run(c.id, () => setCompanyStatusAction([c.id], "active"))}>
                    <Check className="size-3.5" /> Keep
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run(c.id, () => setCompanyStatusAction([c.id], "removed"))}>
                    <X className="size-3.5" /> Dismiss
                  </Button>
                  <a href={c.careers_url} target="_blank" rel="noreferrer" className={cn(buttonClass("ghost", "sm"), "ml-auto")}>
                    Careers ↗
                  </a>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Active list */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium">
              On your list <span className="text-muted">{active.length}</span>
            </h2>
            {active.length > 0 && (
              <Link href="/dashboard/discover?run=1" className={buttonClass("primary", "sm")}>
                <Radar className="size-3.5" /> Find open roles
              </Link>
            )}
          </div>
          {!active.length && <Card className="p-6 text-sm text-muted">Companies you keep appear here and are scanned for roles every day.</Card>}
          {active.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{c.name}</p>
                    <OrgTypeBadge type={c.org_type} />
                    {c.ats_provider && c.ats_provider !== "custom" && <span className="font-mono text-[10px] uppercase text-muted">{c.ats_provider}</span>}
                  </div>
                  {editing === c.id ? (
                    <form
                      className="mt-2 flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const url = String(new FormData(e.currentTarget).get("url"));
                        run(c.id, async () => {
                          const r = await updateCompanyUrlAction(c.id, url);
                          if (r.ok) setEditing(null);
                          return r;
                        });
                      }}
                    >
                      <Input name="url" defaultValue={c.careers_url} className="h-9 text-xs" aria-label="Careers URL" />
                      <Button size="sm">Save</Button>
                    </form>
                  ) : (
                    <a href={c.careers_url} target="_blank" rel="noreferrer" className="block truncate text-xs text-muted hover:underline">
                      {c.careers_url}
                    </a>
                  )}
                  <p className="mt-1 text-[11px] text-muted">
                    {c.roles} role{c.roles === 1 ? "" : "s"} in your pipeline · {c.last_scanned_at ? `scanned ${new Date(c.last_scanned_at).toLocaleDateString()}` : "not scanned yet"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run(c.id, () => scanCompanyAction(c.id))}>
                    {busy === c.id ? <Loader2 className="size-3.5 animate-spin" /> : <Radar className="size-3.5" />} {busy === c.id ? "Scanning…" : "Scan"}
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Edit ${c.name} careers URL`} onClick={() => setEditing(editing === c.id ? null : c.id)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Remove ${c.name}`} disabled={!!busy} onClick={() => run(c.id, () => setCompanyStatusAction([c.id], "removed"))}>
                    <X className="size-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </section>
      </div>

      <div className="space-y-4">
        <Card className="h-fit p-5">
          <h2 className="mb-4 font-medium">Add a company</h2>
          <form action={addAction} className="space-y-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="careers_url">Careers page or job board URL</Label>
              <Input id="careers_url" name="careers_url" type="url" placeholder="https://jobs.lever.co/…" required />
            </div>
            <div>
              <Label htmlFor="org_type">Type</Label>
              <select id="org_type" name="org_type" className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm capitalize">
                {ORG_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            {state && <p className={cn("text-sm", state.ok ? "text-accent" : "text-warn")}>{state.ok ? state.message : state.error}</p>}
            <Button className="w-full" disabled={adding}>
              {adding ? "Adding…" : "Add to my list"}
            </Button>
          </form>
        </Card>
        <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => run("seed", seedCompaniesAction)}>
          <Sprout className="size-3.5" /> Load sample companies
        </Button>
      </div>
    </div>
  );
}
