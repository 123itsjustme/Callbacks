"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Pencil, Radar, Sprout, Trash2 } from "lucide-react";
import { addCompanyAction, removeCompanyAction, scanCompanyAction, seedCompaniesAction, updateCompanyUrlAction } from "./actions";
import { Button, Card, Input, Label, OrgTypeBadge } from "@/components/ui";
import { cn } from "@/lib/utils";

export type CompanyItem = { id: string; name: string; org_type: string; careers_url: string; ats_provider: string | null; last_scraped_at: string | null; jobs: number };

const FILTERS = ["all", "agency", "indie", "publisher", "client", "other"];

export function CompaniesClient({ companies }: { companies: CompanyItem[] }) {
  const [state, addAction, adding] = useActionState(addCompanyAction, null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [, start] = useTransition();

  const run = (key: string, fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    setBusy(key);
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Failed" });
      setBusy(null);
    });
  };

  const shown = companies.filter((c) => filter === "all" || c.org_type === filter);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded-full border px-3 py-1 text-xs capitalize", filter === f ? "border-ink bg-ink text-paper" : "border-line bg-surface text-muted")}>
              {f}
            </button>
          ))}
          <Button size="sm" variant="secondary" className="ml-auto" disabled={!!busy} onClick={() => run("seed", seedCompaniesAction)}>
            {busy === "seed" ? <Loader2 className="size-3.5 animate-spin" /> : <Sprout className="size-3.5" />} Load sample companies
          </Button>
        </div>
        {msg && <p className={cn("text-sm", msg.ok ? "text-accent" : "text-warn")}>{msg.text}</p>}
        {!shown.length && (
          <Card className="p-10 text-center text-sm text-muted">No companies yet — add one, or load the sample list to test scanning and matching.</Card>
        )}
        {shown.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
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
                    <Input name="url" defaultValue={c.careers_url} className="h-8 text-xs" />
                    <Button size="sm">Save</Button>
                  </form>
                ) : (
                  <a href={c.careers_url} target="_blank" rel="noreferrer" className="block truncate text-xs text-muted hover:underline">
                    {c.careers_url}
                  </a>
                )}
                <p className="mt-1 text-[11px] text-muted">
                  {c.jobs} job{c.jobs === 1 ? "" : "s"} in pool · {c.last_scraped_at ? `scanned ${new Date(c.last_scraped_at).toLocaleDateString()}` : "never scanned"}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run(c.id, () => scanCompanyAction(c.id))}>
                  {busy === c.id ? <Loader2 className="size-3.5 animate-spin" /> : <Radar className="size-3.5" />} {busy === c.id ? "Scanning…" : "Scan now"}
                </Button>
                <Button size="sm" variant="ghost" title="Edit careers URL" onClick={() => setEditing(editing === c.id ? null : c.id)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button size="sm" variant="ghost" title="Remove" disabled={!!busy} onClick={() => confirm(`Remove ${c.name} from the shared watchlist?`) && run(c.id, () => removeCompanyAction(c.id))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

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
              {FILTERS.slice(1).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          {state && <p className={cn("text-sm", state.ok ? "text-accent" : "text-warn")}>{state.ok ? state.message : state.error}</p>}
          <Button className="w-full" disabled={adding}>
            {adding ? "Adding…" : "Add to watchlist"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
