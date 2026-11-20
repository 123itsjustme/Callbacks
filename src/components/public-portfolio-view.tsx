"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Download, Mail, MapPin, Pin } from "lucide-react";
import type { MasterData, Project } from "@/lib/ai/schemas";
import type { PublicProfile } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

type Props = {
  profile: PublicProfile;
  master: MasterData;
  pdfHref: string;
  pitch?: { companyName: string; headline: string | null; intro: string | null; featuredProjectIds: string[]; jobTitle: string } | null;
};

function availabilityTone(s: string | null) {
  const v = (s ?? "").toLowerCase();
  if (v.includes("not looking")) return { dot: "bg-stone-400", ring: "bg-stone-400/30" };
  if (v.includes("immediate") || v.startsWith("available")) return { dot: "bg-emerald-500", ring: "bg-emerald-500/40" };
  return { dot: "bg-amber-500", ring: "bg-amber-500/40" };
}

export function PublicPortfolioView({ profile, master, pdfHref, pitch }: Props) {
  const featuredIds = useMemo(() => pitch?.featuredProjectIds ?? [], [pitch?.featuredProjectIds]);
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    master.projects.forEach((p) => p.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 10);
  }, [master.projects]);
  const [active, setActive] = useState<string | null>(null);

  const projects = useMemo(() => {
    const order = (p: Project) => {
      const i = featuredIds.indexOf(p.id);
      return i === -1 ? 99 : i;
    };
    return [...master.projects].sort((a, b) => order(a) - order(b)).filter((p) => !active || p.tags.includes(active));
  }, [master.projects, featuredIds, active]);

  const tone = availabilityTone(profile.availability_status);
  const social = Object.entries(profile.social_links ?? {}).filter(([, v]) => v);

  return (
    <div className="min-h-screen bg-paper">
      {pitch && (
        <div className="border-b border-accent/15 bg-accent-soft px-4 py-2.5 text-center text-sm text-accent">
          Custom portfolio & CV prepared for <strong className="font-semibold">{pitch.companyName}</strong>
        </div>
      )}

      <header className="mx-auto max-w-5xl px-6 pb-12 pt-14 md:pt-20">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          {profile.availability_status && (
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium">
              <span className="relative flex size-2">
                <span className={cn("absolute inline-flex size-full animate-ping rounded-full", tone.ring)} />
                <span className={cn("relative inline-flex size-2 rounded-full", tone.dot)} />
              </span>
              {profile.availability_status}
            </span>
          )}
          {profile.location && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <MapPin className="size-3" /> {profile.location}
            </span>
          )}
        </div>
        <h1 className="font-serif text-5xl leading-[0.95] tracking-tight md:text-7xl">{profile.full_name}</h1>
        {profile.headline && <p className="mt-4 max-w-2xl text-xl text-muted md:text-2xl">{profile.headline}</p>}
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <a href={pdfHref} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:bg-ink/85">
            <Download className="size-4" /> {pitch ? `Download CV for ${pitch.companyName}` : "Download CV (PDF)"}
          </a>
          {profile.contact_email && (
            <a href={`mailto:${profile.contact_email}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-5 text-sm font-medium hover:border-ink/40">
              <Mail className="size-4" /> Get in touch
            </a>
          )}
          {social.map(([k, v]) => (
            <a key={k} href={v} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm capitalize text-muted hover:text-ink">
              {k === "linkedin" ? "LinkedIn" : k} <ArrowUpRight className="size-3.5" />
            </a>
          ))}
        </div>
      </header>

      {pitch && (pitch.headline || pitch.intro) && (
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-muted">
              To the {pitch.companyName} team{pitch.jobTitle ? ` — re: ${pitch.jobTitle}` : ""}
            </p>
            {pitch.headline && <h2 className="max-w-3xl font-serif text-3xl leading-tight md:text-5xl">{pitch.headline}</h2>}
            {pitch.intro && (
              <div className="mt-6 max-w-2xl space-y-4 text-lg leading-relaxed text-ink/80">
                {pitch.intro.split(/\n{2,}/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {!pitch && profile.bio && (
        <section className="mx-auto max-w-5xl px-6 pb-6">
          <p className="max-w-3xl font-serif text-2xl leading-snug text-ink/85 md:text-3xl">{profile.bio}</p>
        </section>
      )}

      {master.projects.length > 0 && (
        <section className="mx-auto max-w-5xl px-6 py-14">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-serif text-3xl">Selected work</h2>
            {tags.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by discipline">
                <Pill active={!active} onClick={() => setActive(null)}>
                  All
                </Pill>
                {tags.map((t) => (
                  <Pill key={t} active={active === t} onClick={() => setActive(active === t ? null : t)}>
                    {t}
                  </Pill>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((p) => {
              const featured = featuredIds.includes(p.id);
              return (
                <article key={p.id} className={cn("group flex flex-col rounded-2xl border bg-surface p-6 transition hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]", featured ? "border-accent/40" : "border-line")}>
                  {featured && pitch && (
                    <span className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                      <Pin className="size-3" /> Picked for {pitch.companyName}
                    </span>
                  )}
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">{p.client_or_org}</p>
                  <h3 className="mt-1 text-xl font-medium leading-snug">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted">{p.role}</p>
                  <p className="mt-4 flex-1 text-[15px] leading-relaxed text-ink/80">{p.description}</p>
                  {p.impact_metric && (
                    <div className="mt-5 rounded-xl bg-paper px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Impact</p>
                      <p className="mt-0.5 font-serif text-xl leading-snug text-accent">{p.impact_metric}</p>
                    </div>
                  )}
                  {p.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1">
                      {p.tags.map((t) => (
                        <button key={t} onClick={() => setActive(t)} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted hover:border-ink/40 hover:text-ink">
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {master.experience.length > 0 && (
        <section className="border-t border-line">
          <div className="mx-auto grid max-w-5xl gap-8 px-6 py-14 md:grid-cols-[200px_1fr]">
            <h2 className="font-serif text-3xl">Experience</h2>
            <ol className="relative space-y-8 border-l border-line pl-6">
              {master.experience.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[29px] top-1.5 size-2.5 rounded-full border-2 border-paper bg-ink" />
                  <p className="text-xs text-muted">{e.dates}</p>
                  <h3 className="mt-0.5 font-medium">
                    {e.role} <span className="font-normal text-muted">· {e.company}</span>
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm leading-relaxed text-ink/80">
                    {e.highlights.slice(0, 4).map((h, i) => (
                      <li key={i}>— {h}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {(master.skills.length > 0 || master.education.length > 0 || master.awards.length > 0) && (
        <section className="border-t border-line">
          <div className="mx-auto grid max-w-5xl gap-10 px-6 py-14 md:grid-cols-3">
            {master.skills.length > 0 && (
              <div className="md:col-span-2">
                <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-muted">Skills</h2>
                <div className="flex flex-wrap gap-1.5">
                  {master.skills.map((s) => (
                    <span key={s} className="rounded-full border border-line bg-surface px-3 py-1 text-sm">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-8">
              {master.education.length > 0 && (
                <div>
                  <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted">Education</h2>
                  {master.education.map((e, i) => (
                    <p key={i} className="mb-2 text-sm">
                      <span className="font-medium">{e.degree}</span>
                      <br />
                      <span className="text-muted">
                        {e.institution}
                        {e.year ? `, ${e.year}` : ""}
                      </span>
                    </p>
                  ))}
                </div>
              )}
              {master.awards.length > 0 && (
                <div>
                  <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted">Awards</h2>
                  <ul className="space-y-1 text-sm">
                    {master.awards.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted">
          <span>© {profile.full_name}</span>
          <a href={pdfHref} className="inline-flex items-center gap-1 hover:text-ink">
            <Download className="size-3.5" /> CV (PDF)
          </a>
        </div>
      </footer>
    </div>
  );
}

function Pill({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={cn("rounded-full border px-3 py-1 text-xs transition", active ? "border-ink bg-ink text-paper" : "border-line bg-surface text-muted hover:border-ink/40 hover:text-ink")}>
      {children}
    </button>
  );
}
