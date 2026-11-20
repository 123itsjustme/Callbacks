import "server-only";
import { cache } from "react";
import { createAdminClient } from "./supabase/admin";
import { parseMaster, type ProfileRow } from "./jobs";
import type { MasterData, TailoredCV } from "./ai/schemas";
import { ACTIVE_PITCH_STATUSES } from "./utils";

export type PublicProfile = Pick<
  ProfileRow,
  "id" | "username" | "full_name" | "headline" | "bio" | "location" | "availability_status" | "contact_email" | "social_links"
>;

export type PublicPitch = {
  pipelineId: string;
  companyName: string;
  companySlug: string;
  jobTitle: string;
  headline: string | null;
  intro: string | null;
  featuredProjectIds: string[];
  tailoredCv: TailoredCV | null;
};

/** Public profile + master data. Only whitelisted fields leave this function. */
export const getPublicPortfolio = cache(async (username: string) => {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, username, full_name, headline, bio, location, availability_status, contact_email, social_links, is_public")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  if (!profile || !profile.is_public) return null;
  const { data: master } = await admin.from("master_profiles").select("structured_data").eq("user_id", profile.id).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { is_public, ...pub } = profile;
  return { profile: pub as PublicProfile, master: parseMaster(master?.structured_data) as MasterData };
});

/** Most recent active pitch for this user+company. Never exposes notes, fit reasoning, red flags or cover letters. */
export const getPublicPitch = cache(async (userId: string, companySlug: string): Promise<PublicPitch | null> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_pipeline")
    .select("id, company_slug, custom_pitch_headline, custom_pitch_intro, featured_project_ids, tailored_cv_json, jobs(company_name, title)")
    .eq("user_id", userId)
    .eq("company_slug", companySlug.toLowerCase())
    .in("status", [...ACTIVE_PITCH_STATUSES])
    .not("tailored_cv_json", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const job = (Array.isArray(data.jobs) ? data.jobs[0] : data.jobs) as { company_name: string; title: string } | null;
  return {
    pipelineId: data.id,
    companySlug: data.company_slug,
    companyName: job?.company_name ?? companySlug,
    jobTitle: job?.title ?? "",
    headline: data.custom_pitch_headline,
    intro: data.custom_pitch_intro,
    featuredProjectIds: data.featured_project_ids ?? [],
    tailoredCv: (data.tailored_cv_json as TailoredCV) ?? null,
  };
});

export async function recordPitchView(username: string, companySlug: string) {
  try {
    await createAdminClient().rpc("increment_microsite_views", { p_username: username, p_company_slug: companySlug });
  } catch (e) {
    console.warn("view counter failed", e);
  }
}
