import "server-only";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { createAdminClient } from "./supabase/admin";
import { detectAts, fetchAtsPostings, scrapeUrl } from "./scraper";
import { extractJob, extractListings, loadUserContext, normalizeUrl, saveJob, similarityToScore, type JobRow } from "./jobs";
import { generateStructured, webResearch } from "./ai/models";
import { CompanySuggestionsSchema, RoleSearchSchema } from "./ai/schemas";
import { COMPANY_EXTRACT_PROMPT, COMPANY_RESEARCH_PROMPT, ROLE_EXTRACT_PROMPT, ROLE_SEARCH_PROMPT } from "./ai/prompts";
import { slugify } from "./utils";
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

export function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export const parseVec = (v: unknown): number[] | null => {
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

// ============================================================ per-user discovery

/** Sites we can't read reliably (login walls, anti-bot) or that are aggregators rather than employers. */
const SEARCH_BLOCKED = ["linkedin.com", "indeed.com", "glassdoor.com", "glassdoor.co.uk", "ziprecruiter.com", "totaljobs.com", "reed.co.uk"];

async function candidateBrief(userId: string) {
  const admin = createAdminClient();
  const { profile, master } = await loadUserContext(admin, userId);
  if (!profile || !master) throw new Error("Upload your CV first.");
  const { data: passes } = await admin
    .from("user_pipeline")
    .select("pass_reason, jobs(title, company_name)")
    .eq("user_id", userId)
    .eq("status", "passed")
    .not("pass_reason", "is", null)
    .order("updated_at", { ascending: false })
    .limit(15);
  const passLines = (passes ?? []).map((p) => {
    const j = (Array.isArray(p.jobs) ? p.jobs[0] : p.jobs) as { title: string; company_name: string } | null;
    return `- Passed on "${j?.title}" at ${j?.company_name}: ${p.pass_reason}`;
  });
  const brief = `CANDIDATE: ${profile.full_name} — ${profile.headline ?? ""}
Location: ${profile.location ?? "unknown"} | Availability: ${profile.availability_status ?? ""}
Target roles: ${(profile.target_roles ?? []).join(", ") || "infer from profile"}
Preferred organisation types: ${(profile.preferred_org_types ?? []).join(", ")}
Summary: ${master.summary}
Experience: ${master.experience.map((e) => `${e.role} at ${e.company} (${e.dates})`).join("; ")}
Key projects: ${master.projects.map((p) => `${p.title} for ${p.client_or_org}`).join("; ")}
Skills: ${master.skills.join(", ")}
${passLines.length ? `\nPASS HISTORY (avoid similar):\n${passLines.join("\n")}` : ""}`;
  return { profile, master, brief };
}

function countryFrom(location: string | null) {
  const l = (location ?? "").toLowerCase();
  if (/uk|united kingdom|england|london|scotland|wales|manchester|bristol|leeds|brighton/.test(l)) return "GB";
  if (/usa|united states|new york|california|\bny\b|\bca\b/.test(l)) return "US";
  return undefined;
}

async function urlLoads(url: string) {
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; CallbackBot/1.0)" }, signal: AbortSignal.timeout(10000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Find and save ~10 suggested companies for a user (status 'suggested' until they keep them). */
export async function suggestCompaniesForUser(userId: string, count = 10) {
  const admin = createAdminClient();
  const { profile, brief } = await candidateBrief(userId);
  const { data: existing } = await admin.from("user_companies").select("target_companies(name)").eq("user_id", userId);
  const exclude = (existing ?? [])
    .map((r) => ((Array.isArray(r.target_companies) ? r.target_companies[0] : r.target_companies) as { name: string } | null)?.name)
    .filter(Boolean);

  const research = await webResearch({
    system: COMPANY_RESEARCH_PROMPT,
    prompt: `${brief}\n\nFind ${count} companies.${exclude.length ? `\nExclude: ${exclude.join(", ")}` : ""}`,
    maxUses: 20,
    blockedDomains: ["linkedin.com", "glassdoor.com", "glassdoor.co.uk", "indeed.com"],
    country: countryFrom(profile.location),
  });
  const { companies } = await generateStructured({
    schema: CompanySuggestionsSchema,
    system: COMPANY_EXTRACT_PROMPT,
    prompt: research.text,
    maxOutputTokens: 4000,
  });

  const saved: { id: string; name: string; verified: boolean }[] = [];
  await Promise.all(
    companies.slice(0, count + 2).map(async (c) => {
      let careers: string;
      try {
        careers = normalizeUrl(c.careers_url);
      } catch {
        return;
      }
      const verified = await urlLoads(careers);
      const slug = slugify(c.name);
      // Reuse a pooled company if we already know it (by slug or URL).
      const bySlug = await admin.from("target_companies").select("id").eq("slug", slug).maybeSingle();
      const found = bySlug.data ?? (await admin.from("target_companies").select("id").eq("careers_url", careers).maybeSingle()).data;
      let companyId = found?.id as string | undefined;
      if (!companyId) {
        const { data: ins, error } = await admin
          .from("target_companies")
          .insert({
            name: c.name,
            slug,
            org_type: c.org_type,
            careers_url: careers,
            website: c.website || null,
            hq_location: c.hq_location || null,
            url_verified: verified,
            ats_provider: detectAts(careers)?.provider ?? "custom",
            added_by: userId,
          })
          .select("id")
          .single();
        if (error) return;
        companyId = ins.id;
      }
      const { data: link } = await admin.from("user_companies").select("status").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
      if (link?.status === "removed" || link?.status === "active") return;
      await admin
        .from("user_companies")
        .upsert({ user_id: userId, company_id: companyId, status: "suggested", source: "ai", fit_reason: c.why_fit }, { onConflict: "user_id,company_id" });
      saved.push({ id: companyId!, name: c.name, verified });
    }),
  );
  await admin.from("profiles").update({ last_discovery_at: new Date().toISOString() }).eq("id", userId);
  return saved.slice(0, count);
}

/** Scan one company for one user: refresh its board, then add relevant roles (new or already pooled) to their pipeline. */
export async function scanCompanyForUser(userId: string, companyId: string, deadline = Date.now() + 240_000) {
  const admin = createAdminClient();
  const { data: company } = await admin.from("target_companies").select("*").eq("id", companyId).single();
  if (!company) throw new Error("Company not found");
  const users = await loadUserVectors();
  const me = users.find((u) => u.user_id === userId);
  if (!me) throw new Error("Upload your CV first so we know what to look for.");

  let scanError: string | undefined;
  let added: JobRow[] = [];
  try {
    ({ added } = await scanCompany(company as CompanyRow, users, deadline));
  } catch (e) {
    scanError = (e as Error).message;
  }
  await distributeJobs(added.map((j) => j.id), users.filter((u) => u.user_id !== userId));

  const newMatches = await addCompanyJobsForUser(userId, me.vec, companyId);
  await admin.from("user_companies").update({ last_scanned_at: new Date().toISOString() }).eq("user_id", userId).eq("company_id", companyId);
  return { newMatches, scanError };
}

/** Web search for open roles matching the user (beyond their company list). */
export async function searchRolesForUser(userId: string, deadline = Date.now() + 240_000, maxImports = 6) {
  const admin = createAdminClient();
  const { profile, brief } = await candidateBrief(userId);
  const { data: list } = await admin.from("user_companies").select("target_companies(name)").eq("user_id", userId).eq("status", "active");
  const names = (list ?? [])
    .map((r) => ((Array.isArray(r.target_companies) ? r.target_companies[0] : r.target_companies) as { name: string } | null)?.name)
    .filter(Boolean);

  const research = await webResearch({
    system: ROLE_SEARCH_PROMPT,
    prompt: `${brief}\n\nPriority companies: ${names.join(", ") || "none yet — find suitable employers"}\nFind up to 12 open roles.`,
    maxUses: 15,
    blockedDomains: SEARCH_BLOCKED,
    country: countryFrom(profile.location),
  });
  const { roles } = await generateStructured({ schema: RoleSearchSchema, system: ROLE_EXTRACT_PROMPT, prompt: research.text, maxOutputTokens: 3000 });

  const users = await loadUserVectors(userId);
  const me = users[0];
  const urls = [...new Set(roles.map((r) => { try { return normalizeUrl(r.url); } catch { return ""; } }).filter((u) => u && !SEARCH_BLOCKED.some((d) => u.includes(d))))];
  const { data: known } = await admin.from("jobs").select("id, source_url, company_slug, embedding").in("source_url", urls.length ? urls : ["-"]);
  const knownMap = new Map((known ?? []).map((k) => [k.source_url, k]));
  const { data: mine } = await admin.from("user_pipeline").select("job_id").eq("user_id", userId);
  const have = new Set((mine ?? []).map((m) => m.job_id));

  let imported = 0;
  let added = 0;
  for (const url of urls) {
    if (Date.now() > deadline || imported >= maxImports) break;
    try {
      let job = knownMap.get(url) as { id: string; company_slug: string; embedding: unknown } | undefined;
      if (!job) {
        const page = await scrapeUrl(url);
        if (page.markdown.trim().length < 200) continue;
        const extracted = await extractJob(page);
        if (!extracted.is_job_posting) continue;
        const saved = await saveJob({ url, extracted });
        imported++;
        const { data: withVec } = await admin.from("jobs").select("id, company_slug, embedding").eq("id", saved.id).single();
        job = withVec ?? { id: saved.id, company_slug: saved.company_slug, embedding: null };
      }
      if (have.has(job.id)) continue;
      const v = parseVec(job.embedding);
      const sim = v && me ? cosine(v, me.vec) : 0.3;
      await admin.from("user_pipeline").upsert(
        {
          user_id: userId,
          job_id: job.id,
          company_slug: job.company_slug,
          match_score: similarityToScore(sim),
          source: "search",
          fit_reasoning: "Found by web search for roles like yours. Swipe to see a detailed fit review.",
        },
        { onConflict: "user_id,job_id", ignoreDuplicates: true },
      );
      have.add(job.id);
      added++;
    } catch (e) {
      console.warn("[searchRoles]", url, (e as Error).message);
    }
  }
  return { found: urls.length, added };
}

/** Add relevant roles at a company the user follows (a lower bar than general matching). */
export async function addCompanyJobsForUser(userId: string, vec: number[], companyId: string) {
  const admin = createAdminClient();
  const { data: jobs } = await admin.from("jobs").select("id, company_slug, embedding").eq("company_id", companyId);
  const { data: mine } = await admin.from("user_pipeline").select("job_id").eq("user_id", userId);
  const have = new Set((mine ?? []).map((m) => m.job_id));
  const rows = (jobs ?? [])
    .filter((j) => !have.has(j.id))
    .map((j) => ({ j, sim: parseVec(j.embedding) ? cosine(parseVec(j.embedding)!, vec) : 0.3 }))
    .filter((x) => x.sim >= 0.24)
    .map(({ j, sim }) => ({
      user_id: userId,
      job_id: j.id,
      company_slug: j.company_slug,
      match_score: similarityToScore(sim),
      source: "watchlist",
      fit_reasoning: "Found at a company on your list. Swipe to see a detailed fit review.",
    }));
  if (rows.length) await admin.from("user_pipeline").upsert(rows, { onConflict: "user_id,job_id", ignoreDuplicates: true });
  return rows.length;
}
