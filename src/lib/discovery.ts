import "server-only";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { createAdminClient } from "./supabase/admin";
import { detectAts, fetchAtsPostings, scrapeUrl } from "./scraper";
import { extractJob, extractListings, normalizeUrl, saveJob, similarityToScore, type JobRow } from "./jobs";
import type { OrgType } from "./ai/schemas";

export type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  org_type: OrgType;
  careers_url: string;
  ats_provider: string | null;
  last_scraped_at: string | null;
};

type UserVec = { user_id: string; vec: number[]; orgTypes: string[] };

const TITLE_PREFILTER = 0.22; // title-vs-profile similarity needed before we spend an LLM call
const MATCH_THRESHOLD = 0.3; // full job-vs-profile similarity to land in a pipeline
const MAX_NEW_JOBS_PER_COMPANY = 8;

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

const parseVec = (v: unknown): number[] | null => {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") try { return JSON.parse(v); } catch { return null; }
  return null;
};

export async function loadUserVectors(onlyUserId?: string): Promise<UserVec[]> {
  const admin = createAdminClient();
  let q = admin.from("master_profiles").select("user_id, embedding, profiles(preferred_org_types)").not("embedding", "is", null);
  if (onlyUserId) q = q.eq("user_id", onlyUserId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r) => {
      const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as { preferred_org_types: string[] | null } | null;
      return { user_id: r.user_id as string, vec: parseVec(r.embedding)!, orgTypes: p?.preferred_org_types ?? [] };
    })
    .filter((u) => u.vec);
}

/** Scan one company's careers page / ATS board, add relevant new jobs to the shared pool. */
export async function scanCompany(company: CompanyRow, users: UserVec[], deadline: number) {
  const admin = createAdminClient();
  const known = new Set<string>();
  const ats = detectAts(company.careers_url);

  type Candidate = { url: string; title: string; content?: string };
  let candidates: Candidate[] = [];
  if (ats) {
    candidates = (await fetchAtsPostings(ats)).map((p) => ({ url: normalizeUrl(p.url), title: p.title, content: p.content ? `# ${p.title}\n${p.location ? `Location: ${p.location}\n` : ""}\n${p.content}` : undefined }));
  } else {
    const page = await scrapeUrl(company.careers_url);
    candidates = await extractListings(page);
  }
  if (!candidates.length) return { found: 0, added: [] as JobRow[] };

  // Skip URLs already in the pool.
  const { data: existing } = await admin.from("jobs").select("source_url").in("source_url", candidates.map((c) => c.url).slice(0, 500));
  (existing ?? []).forEach((e) => known.add(e.source_url));
  candidates = candidates.filter((c) => !known.has(c.url));

  // Cheap relevance pre-filter on titles.
  if (users.length && candidates.length) {
    const { embeddings } = await embedMany({ model: openai.embedding("text-embedding-3-small"), values: candidates.map((c) => `${c.title} at ${company.name}`) });
    candidates = candidates
      .map((c, i) => ({ c, s: Math.max(...users.map((u) => cosine(embeddings[i], u.vec))) }))
      .filter((x) => x.s >= TITLE_PREFILTER)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
  }

  const added: JobRow[] = [];
  for (const c of candidates.slice(0, MAX_NEW_JOBS_PER_COMPANY)) {
    if (Date.now() > deadline) break;
    try {
      const page = c.content ? { url: c.url, markdown: c.content } : await scrapeUrl(c.url);
      const extracted = await extractJob(page, { company: company.name, orgType: company.org_type });
      if (!extracted.is_job_posting) continue;
      added.push(await saveJob({ url: c.url, extracted, companyId: company.id, companyName: company.name, orgType: company.org_type }));
    } catch (e) {
      console.warn(`[scan] ${company.name} ${c.url}:`, (e as Error).message);
    }
  }
  await admin.from("target_companies").update({ last_scraped_at: new Date().toISOString(), ats_provider: ats?.provider ?? company.ats_provider ?? "custom" }).eq("id", company.id);
  return { found: candidates.length, added };
}

/** Add new jobs to each user's pipeline where the profile embedding is a good match. */
export async function distributeJobs(jobIds: string[], users: UserVec[]) {
  if (!jobIds.length || !users.length) return 0;
  const admin = createAdminClient();
  const { data: jobs } = await admin.from("jobs").select("id, company_slug, org_type, embedding").in("id", jobIds);
  const rows = [];
  for (const j of jobs ?? []) {
    const jv = parseVec(j.embedding);
    if (!jv) continue;
    for (const u of users) {
      const sim = cosine(jv, u.vec);
      const prefers = !u.orgTypes.length || u.orgTypes.includes(j.org_type);
      if (sim >= MATCH_THRESHOLD && prefers)
        rows.push({
          user_id: u.user_id,
          job_id: j.id,
          company_slug: j.company_slug,
          match_score: similarityToScore(sim),
          fit_reasoning: "Found by the daily watchlist scan and matched to your master profile. Open it for a detailed fit review.",
        });
    }
  }
  if (!rows.length) return 0;
  const { error } = await admin.from("user_pipeline").upsert(rows, { onConflict: "user_id,job_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return rows.length;
}
