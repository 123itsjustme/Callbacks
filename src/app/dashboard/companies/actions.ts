"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEED_COMPANIES } from "@/lib/seed-companies";
import { detectAts } from "@/lib/scraper";
import { scanCompanyForUser, searchRolesForUser, suggestCompaniesForUser } from "@/lib/discovery";
import { slugify } from "@/lib/utils";

type R = { ok: true; message?: string } | { ok: false; error: string };
const ORG = ["agency", "indie", "publisher", "client", "other"];

function revalidate() {
  revalidatePath("/dashboard/companies");
  revalidatePath("/dashboard/discover");
  revalidatePath("/dashboard");
}

function cleanUrl(raw: string) {
  const u = new URL(raw.trim());
  if (!/^https?:$/.test(u.protocol)) throw new Error("URL must start with http(s)://");
  u.hash = "";
  return u.toString();
}

/** Find a pooled company by slug/URL or create it; returns its id. */
async function upsertPoolCompany(c: { name: string; org_type: string; careers_url: string }, userId: string) {
  const admin = createAdminClient();
  const slug = slugify(c.name);
  const bySlug = await admin.from("target_companies").select("id").eq("slug", slug).maybeSingle();
  const found = bySlug.data ?? (await admin.from("target_companies").select("id").eq("careers_url", c.careers_url).maybeSingle()).data;
  if (found) return found.id as string;
  const { data, error } = await admin
    .from("target_companies")
    .insert({
      name: c.name,
      slug,
      org_type: ORG.includes(c.org_type) ? c.org_type : "other",
      careers_url: c.careers_url,
      ats_provider: detectAts(c.careers_url)?.provider ?? "custom",
      added_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function suggestCompaniesAction(): Promise<R> {
  try {
    const { user } = await requireUser();
    const saved = await suggestCompaniesForUser(user.id);
    revalidate();
    if (!saved.length) return { ok: false, error: "Couldn't find companies with working careers pages this time. Try again, or add some yourself." };
    return { ok: true, message: `Found ${saved.length} companies that suit your profile. Keep the ones you like.` };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[suggestCompanies]", msg);
    return {
      ok: false,
      error: /web.?search|not enabled|permission/i.test(msg)
        ? "Web search isn't enabled for the Anthropic API key. Turn it on in the Anthropic Console (Settings → Privacy → Web search), then try again."
        : msg,
    };
  }
}

export async function setCompanyStatusAction(ids: string[], status: "active" | "removed"): Promise<R> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("user_companies").update({ status }).eq("user_id", user.id).in("company_id", ids);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

export async function addCompanyAction(_: R | null, fd: FormData): Promise<R> {
  try {
    const { supabase, user } = await requireUser();
    const name = String(fd.get("name") ?? "").trim();
    if (!name) return { ok: false, error: "Company name is required." };
    const careers_url = cleanUrl(String(fd.get("careers_url") ?? ""));
    const companyId = await upsertPoolCompany({ name, org_type: String(fd.get("org_type") ?? "other"), careers_url }, user.id);
    const { error } = await supabase
      .from("user_companies")
      .upsert({ user_id: user.id, company_id: companyId, status: "active", source: "manual" }, { onConflict: "user_id,company_id" });
    if (error) return { ok: false, error: error.message };
    revalidate();
    return { ok: true, message: `${name} added to your list.` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function seedCompaniesAction(): Promise<R> {
  const { supabase, user } = await requireUser();
  let added = 0;
  for (const c of SEED_COMPANIES) {
    try {
      const id = await upsertPoolCompany(c, user.id);
      const { data: link } = await supabase.from("user_companies").select("id").eq("user_id", user.id).eq("company_id", id).maybeSingle();
      if (link) continue;
      const { error } = await supabase.from("user_companies").insert({ user_id: user.id, company_id: id, status: "suggested", source: "sample" });
      if (!error) added++;
    } catch {}
  }
  revalidate();
  return { ok: true, message: added ? `Added ${added} sample companies to your suggestions.` : "Sample companies are already in your list." };
}

/** Fix a company's careers URL (shared pool, so any signed-in user may correct it). */
export async function updateCompanyUrlAction(id: string, url: string): Promise<R> {
  try {
    await requireUser();
    const careers_url = cleanUrl(url);
    const { error } = await createAdminClient()
      .from("target_companies")
      .update({ careers_url, ats_provider: detectAts(careers_url)?.provider ?? "custom", url_verified: false })
      .eq("id", id);
    if (error) return { ok: false, error: error.code === "23505" ? "Another company already uses that URL." : error.message };
    revalidate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function scanCompanyAction(id: string): Promise<R & { newMatches?: number }> {
  try {
    const { user } = await requireUser();
    const { newMatches, scanError } = await scanCompanyForUser(user.id, id);
    revalidate();
    if (scanError && !newMatches) return { ok: false, error: `Couldn't read this company's jobs page (${scanError}). Check the careers URL.` };
    return { ok: true, newMatches, message: newMatches ? `${newMatches} new role${newMatches === 1 ? "" : "s"} to review.` : "No new matching roles right now." };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function searchRolesAction(): Promise<R & { added?: number }> {
  try {
    const { user } = await requireUser();
    const { found, added } = await searchRolesForUser(user.id);
    revalidate();
    return { ok: true, added, message: found ? `Web search found ${found} roles; ${added} new ones added to review.` : "Web search didn't find new roles this time." };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[searchRoles]", msg);
    return { ok: false, error: /web.?search|not enabled/i.test(msg) ? "Web search isn't enabled for the Anthropic API key (Anthropic Console → Settings → Privacy)." : msg };
  }
}
