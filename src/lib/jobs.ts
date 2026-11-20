import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import { generateStructured } from "./ai/models";
import { embedText, jobEmbeddingText, toPgVector } from "./ai/embeddings";
import {
  ExtractedJobSchema,
  FitAssessmentSchema,
  JobListingsSchema,
  MasterDataSchema,
  TailoredApplicationSchema,
  type ExtractedJob,
  type FitAssessment,
  type MasterData,
  type OrgType,
  type TailoredApplication,
} from "./ai/schemas";
import { FIT_PROMPT, JOB_EXTRACTOR_PROMPT, LISTINGS_EXTRACTOR_PROMPT, TAILORING_PROMPT } from "./ai/prompts";
import { scrapeUrl, type ScrapeResult } from "./scraper";
import { slugify } from "./utils";

export type JobRow = {
  id: string;
  company_id: string | null;
  company_name: string;
  company_slug: string;
  org_type: OrgType;
  title: string;
  location: string | null;
  work_mode: string | null;
  salary_text: string | null;
  source_url: string;
  description_md: string;
  summary_bullets: string[];
  posted_at: string;
};

export type ProfileRow = {
  id: string;
  username: string;
  full_name: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  availability_status: string | null;
  preferred_org_types: string[] | null;
  target_roles: string[] | null;
  contact_email: string | null;
  social_links: Record<string, string> | null;
  is_public: boolean;
};

const JOB_COLS =
  "id, company_id, company_name, company_slug, org_type, title, location, work_mode, salary_text, source_url, description_md, summary_bullets, posted_at";

export function normalizeUrl(raw: string) {
  const u = new URL(raw.trim());
  u.hash = "";
  for (const p of [...u.searchParams.keys()]) if (/^(utm_|gh_src|ref$|source$|lever-source)/i.test(p)) u.searchParams.delete(p);
  return u.toString();
}

export function parseMaster(raw: unknown): MasterData {
  const r = MasterDataSchema.safeParse(raw ?? {});
  return r.success ? r.data : MasterDataSchema.parse({});
}

export async function loadUserContext(supabase: SupabaseClient, userId: string) {
  const [{ data: profile }, { data: master }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("master_profiles").select("structured_data, embedding").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    profile: profile as ProfileRow | null,
    master: master ? parseMaster(master.structured_data) : null,
    embedding: (master?.embedding as string | null) ?? null,
  };
}

// ---------------------------------------------------------------- extraction

export async function extractJob(page: ScrapeResult | { url: string; markdown: string }, hint?: { company?: string; orgType?: OrgType }) {
  const job = await generateStructured({
    schema: ExtractedJobSchema,
    system: JOB_EXTRACTOR_PROMPT,
    prompt: [
      `URL: ${page.url}`,
      hint?.company ? `Known company: ${hint.company}` : "",
      hint?.orgType && hint.orgType !== "other" ? `Known org type: ${hint.orgType}` : "",
      `\nPAGE CONTENT:\n${page.markdown.slice(0, 40000)}`,
    ].join("\n"),
  });
  const bullets = job.summary_bullets.filter(Boolean).slice(0, 3);
  while (bullets.length < 3 && bullets.length > 0) bullets.push(bullets[bullets.length - 1]);
  return { ...job, summary_bullets: bullets } as ExtractedJob;
}

export async function extractListings(page: ScrapeResult) {
  const { listings } = await generateStructured({
    schema: JobListingsSchema,
    system: LISTINGS_EXTRACTOR_PROMPT,
    prompt: `CAREERS PAGE: ${page.url}\n\nCONTENT:\n${page.markdown.slice(0, 25000)}\n\nLINKS:\n${page.links.slice(0, 300).join("\n")}`,
    maxOutputTokens: 4000,
  });
  const out = new Map<string, string>();
  for (const l of listings) {
    try {
      out.set(normalizeUrl(new URL(l.url, page.url).toString()), l.title);
    } catch {}
  }
  return [...out].map(([url, title]) => ({ url, title }));
}

/** Insert a job into the shared pool (service role) — returns existing row if URL already known. */
export async function saveJob(input: {
  url: string;
  extracted: ExtractedJob;
  companyId?: string | null;
  companyName?: string;
  orgType?: OrgType;
}): Promise<JobRow> {
  const admin = createAdminClient();
  const url = normalizeUrl(input.url);
  const existing = await admin.from("jobs").select(JOB_COLS).eq("source_url", url).maybeSingle();
  if (existing.data) return existing.data as JobRow;

  const e = input.extracted;
  const company_name = input.companyName || e.company_name || new URL(url).hostname;
  const row = {
    company_id: input.companyId ?? null,
    company_name,
    company_slug: slugify(company_name),
    org_type: input.orgType && input.orgType !== "other" ? input.orgType : e.org_type,
    title: e.title,
    location: e.location || null,
    work_mode: e.work_mode,
    salary_text: e.salary_text || null,
    source_url: url,
    description_md: e.clean_description_md,
    summary_bullets: e.summary_bullets,
    embedding: toPgVector(await embedText(jobEmbeddingText({ title: e.title, company_name, description_md: e.clean_description_md }))),
  };
  const { data, error } = await admin
    .from("jobs")
    .upsert(row, { onConflict: "source_url" })
    .select(JOB_COLS)
    .single();
  if (error) throw new Error(`Saving job failed: ${error.message}`);
  return data as JobRow;
}

// ---------------------------------------------------------------- scoring

export async function assessFit(profile: ProfileRow, master: MasterData, job: JobRow): Promise<FitAssessment> {
  const fit = await generateStructured({
    schema: FitAssessmentSchema,
    system: FIT_PROMPT,
    prompt: `CANDIDATE: ${profile.full_name} — ${profile.headline ?? ""}
Location: ${profile.location ?? "unknown"} | Availability: ${profile.availability_status ?? ""}
Target roles: ${(profile.target_roles ?? []).join(", ")} | Preferred org types: ${(profile.preferred_org_types ?? []).join(", ")}

MASTER PROFILE JSON:
${JSON.stringify(master)}

JOB (${job.org_type}): ${job.title} at ${job.company_name}
Location: ${job.location ?? "n/a"} | Mode: ${job.work_mode ?? "n/a"} | Salary: ${job.salary_text ?? "n/a"}

${job.description_md.slice(0, 20000)}`,
    maxOutputTokens: 1500,
  });
  return { ...fit, match_score: Math.max(0, Math.min(100, Math.round(fit.match_score))) };
}

/** Full URL import for one user: scrape -> classify -> embed -> score -> pipeline. */
export async function importJobForUser(supabase: SupabaseClient, userId: string, rawUrl: string) {
  const url = normalizeUrl(rawUrl);
  const { profile, master } = await loadUserContext(supabase, userId);
  if (!profile || !master) throw new Error("Upload your CV first so jobs can be scored against it.");

  const admin = createAdminClient();
  let { data: job } = await admin.from("jobs").select(JOB_COLS).eq("source_url", url).maybeSingle();
  if (!job) {
    const page = await scrapeUrl(url);
    if (page.markdown.trim().length < 200) throw new Error("That page had almost no readable content (it may require JavaScript or a login). Try the direct job posting link, or set FIRECRAWL_API_KEY.");
    const extracted = await extractJob(page);
    if (!extracted.is_job_posting) throw new Error("That page doesn't look like a single job posting. Paste the link to a specific role.");
    job = await saveJob({ url, extracted });
  }
  const j = job as JobRow;
  const fit = await assessFit(profile, master, j);
  const { data: row, error } = await supabase
    .from("user_pipeline")
    .upsert(
      {
        user_id: userId,
        job_id: j.id,
        company_slug: j.company_slug,
        match_score: fit.match_score,
        fit_reasoning: fit.fit_reasoning,
        red_flags: fit.red_flags,
      },
      { onConflict: "user_id,job_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { pipelineId: row.id as string, job: j, fit };
}

/** Vector-match the shared jobs pool and add new matches to a user's pipeline (status 'new'). */
export async function matchExistingJobs(supabase: SupabaseClient, userId: string, embedding: number[] | string, threshold = 0.3) {
  const { data: matches, error } = await supabase.rpc("match_jobs_for_user", {
    query_embedding: typeof embedding === "string" ? embedding : toPgVector(embedding),
    match_threshold: threshold,
    match_count: 25,
  });
  if (error) throw new Error(error.message);
  if (!matches?.length) return 0;
  const rows = (matches as { id: string; company_slug: string; similarity: number; title: string }[]).map((m) => ({
    user_id: userId,
    job_id: m.id,
    company_slug: m.company_slug,
    match_score: similarityToScore(m.similarity),
    fit_reasoning: "Auto-matched from your master profile by semantic similarity. Open the job to get a detailed fit review.",
  }));
  const { error: insErr, count } = await supabase
    .from("user_pipeline")
    .upsert(rows, { onConflict: "user_id,job_id", ignoreDuplicates: true, count: "exact" });
  if (insErr) throw new Error(insErr.message);
  return count ?? rows.length;
}

/** text-embedding-3-small cosine similarities for good matches sit around 0.35-0.65; stretch to 0-100. */
export function similarityToScore(sim: number) {
  return Math.max(0, Math.min(100, Math.round(((sim - 0.15) / 0.55) * 100)));
}

// ---------------------------------------------------------------- tailoring

export async function tailorApplication(profile: ProfileRow, master: MasterData, job: JobRow): Promise<TailoredApplication> {
  const app = await generateStructured({
    schema: TailoredApplicationSchema,
    system: TAILORING_PROMPT,
    prompt: `CANDIDATE: ${profile.full_name}
Headline: ${profile.headline ?? ""}
availability_status: ${profile.availability_status ?? "Open to opportunities"}
Location: ${profile.location ?? ""}

MASTER PROFILE JSON (the only source of truth):
${JSON.stringify(master)}

TARGET JOB
org_type: ${job.org_type}
Company: ${job.company_name}
Title: ${job.title}
Location: ${job.location ?? "n/a"} | Work mode: ${job.work_mode ?? "n/a"}

${job.description_md.slice(0, 20000)}`,
    maxOutputTokens: 10000,
  });
  return enforceTruthAnchor(app, master);
}

const NUM_RE = /\d+(?:[.,]\d+)*/g;
function numbersSupported(text: string, source: string) {
  return (text.match(NUM_RE) ?? []).every((n) => source.includes(n));
}

/** Programmatic guard so the tailored CV can never contain employers, titles, dates or metrics that aren't in the master profile. */
export function enforceTruthAnchor(app: TailoredApplication, master: MasterData): TailoredApplication {
  const source = JSON.stringify(master);
  const expById = new Map(master.experience.map((e) => [e.id, e]));
  const projById = new Map(master.projects.map((p) => [p.id, p]));

  const seen = new Set<string>();
  const experience = app.tailored_cv.experience
    .filter((e) => expById.has(e.id) && !seen.has(e.id) && seen.add(e.id))
    .map((e) => {
      const m = expById.get(e.id)!;
      const roleSource = JSON.stringify(m);
      const highlights = e.highlights.filter((h) => numbersSupported(h, roleSource));
      return { id: m.id, role: m.role, company: m.company, dates: m.dates, highlights: highlights.length ? highlights : m.highlights.slice(0, 3) };
    });
  // Keep the career timeline complete: append any roles the model dropped.
  for (const m of master.experience)
    if (!seen.has(m.id)) experience.push({ id: m.id, role: m.role, company: m.company, dates: m.dates, highlights: m.highlights.slice(0, 2) });

  const pSeen = new Set<string>();
  const projects = app.tailored_cv.projects
    .filter((p) => projById.has(p.id) && !pSeen.has(p.id) && pSeen.add(p.id))
    .map((p) => {
      const m = projById.get(p.id)!;
      return {
        id: m.id,
        title: m.title,
        client_or_org: m.client_or_org,
        description: numbersSupported(p.description, JSON.stringify(m)) ? p.description : m.description,
        impact_metric: m.impact_metric,
      };
    });

  const lowerSource = source.toLowerCase();
  const selected_skills = [...new Set(app.tailored_cv.selected_skills)].filter((s) => lowerSource.includes(s.toLowerCase()));

  let featured = app.featured_project_ids.filter((id) => projById.has(id));
  if (!featured.length) featured = projects.map((p) => p.id);
  featured = [...new Set(featured)].slice(0, 3);

  const headlineWords = app.custom_pitch_headline.trim().split(/\s+/);
  return {
    tailored_cv: {
      summary: numbersSupported(app.tailored_cv.summary, source) ? app.tailored_cv.summary : master.summary,
      selected_skills: selected_skills.length ? selected_skills : master.skills.slice(0, 12),
      experience,
      projects,
    },
    cover_letter_md: app.cover_letter_md,
    custom_pitch_headline: headlineWords.length > 12 ? headlineWords.slice(0, 12).join(" ") : app.custom_pitch_headline,
    custom_pitch_intro: app.custom_pitch_intro,
    featured_project_ids: featured,
  };
}
