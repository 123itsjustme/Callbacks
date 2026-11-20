"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEED_COMPANIES } from "@/lib/seed-companies";
import { detectAts } from "@/lib/scraper";
import { distributeJobs, loadUserVectors, scanCompany, type CompanyRow } from "@/lib/discovery";
import { slugify } from "@/lib/utils";

type R = { ok: true; message?: string } | { ok: false; error: string };
const ORG = ["agency", "indie", "publisher", "client", "other"];

function cleanUrl(raw: string) {
  const u = new URL(raw.trim());
  if (!/^https?:$/.test(u.protocol)) throw new Error("URL must start with http(s)://");
  u.hash = "";
  return u.toString();
}

export async function addCompanyAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const { supabase, user } = await requireUser();
    const name = String(fd.get("name") ?? "").trim();
    const org_type = String(fd.get("org_type") ?? "other");
    if (!name) return { ok: false, error: "Company name is required." };
    const careers_url = cleanUrl(String(fd.get("careers_url") ?? ""));
    const { error } = await supabase.from("target_companies").insert({
      name,
      slug: slugify(name),
      org_type: ORG.includes(org_type) ? org_type : "other",
      careers_url,
      ats_provider: detectAts(careers_url)?.provider ?? "custom",
      added_by: user.id,
    });
    if (error) return { ok: false, error: error.code === "23505" ? "That company or careers URL is already on the watchlist." : error.message };
    revalidatePath("/dashboard/companies");
    return { ok: true, message: `${name} added.` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function seedCompaniesAction(): Promise<R> {
  const { supabase, user } = await requireUser();
  const rows = SEED_COMPANIES.map((c) => ({ ...c, slug: slugify(c.name), ats_provider: detectAts(c.careers_url)?.provider ?? "custom", added_by: user.id }));
  // Insert one by one so existing slugs/URLs are skipped instead of failing the batch.
  let added = 0;
  for (const r of rows) {
    const { error } = await supabase.from("target_companies").insert(r);
    if (!error) added++;
  }
  revalidatePath("/dashboard/companies");
  return { ok: true, message: added ? `Added ${added} sample companies.` : "Sample companies are already on the watchlist." };
}

/** Shared watchlist for the two beta users: any signed-in user may fix a URL or remove a company. */
export async function updateCompanyUrlAction(id: string, url: string): Promise<R> {
  try {
    await requireUser();
    const careers_url = cleanUrl(url);
    const { error } = await createAdminClient()
      .from("target_companies")
      .update({ careers_url, ats_provider: detectAts(careers_url)?.provider ?? "custom" })
      .eq("id", id);
    if (error) return { ok: false, error: error.code === "23505" ? "Another company already uses that URL." : error.message };
    revalidatePath("/dashboard/companies");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function removeCompanyAction(id: string): Promise<R> {
  await requireUser();
  const { error } = await createAdminClient().from("target_companies").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/companies");
  return { ok: true };
}

export async function scanCompanyAction(id: string): Promise<R> {
  try {
    const { supabase, user } = await requireUser();
    const { data: company } = await supabase.from("target_companies").select("*").eq("id", id).single();
    if (!company) return { ok: false, error: "Company not found." };
    const users = await loadUserVectors();
    if (!users.some((u) => u.user_id === user.id)) return { ok: false, error: "Upload your CV first so we know what to look for." };
    const { found, added } = await scanCompany(company as CompanyRow, users, Date.now() + 240_000);
    const distributed = await distributeJobs(added.map((j) => j.id), users);
    revalidatePath("/dashboard/companies");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: found
        ? `${found} relevant new posting${found === 1 ? "" : "s"} found, ${added.length} imported, ${distributed} pipeline match${distributed === 1 ? "" : "es"}.`
        : "No new relevant postings right now.",
    };
  } catch (e) {
    return { ok: false, error: `Scan failed: ${(e as Error).message}` };
  }
}
