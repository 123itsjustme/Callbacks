"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { assessFit, importJobForUser, loadUserContext, tailorApplication, type JobRow } from "@/lib/jobs";
import { PIPELINE_STATUSES, type PipelineStatus } from "@/lib/utils";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => {
  console.error(e);
  return { ok: false, error: (e as Error)?.message || "Something went wrong." };
};

export async function importJobAction(url: string): Promise<Result<{ pipelineId: string; title: string; company: string; score: number }>> {
  try {
    if (!/^https?:\/\//i.test(url.trim())) return { ok: false, error: "Paste a full job URL starting with https://" };
    const { supabase, user } = await requireUser();
    const r = await importJobForUser(supabase, user.id, url);
    revalidatePath("/dashboard");
    return { ok: true, pipelineId: r.pipelineId, title: r.job.title, company: r.job.company_name, score: r.fit.match_score };
  } catch (e) {
    return fail(e);
  }
}

async function loadPipeline(pipelineId: string) {
  const { supabase, user } = await requireUser();
  const { data: row, error } = await supabase.from("user_pipeline").select("*, jobs(*)").eq("id", pipelineId).eq("user_id", user.id).single();
  if (error || !row) throw new Error("Pipeline item not found.");
  const job = (Array.isArray(row.jobs) ? row.jobs[0] : row.jobs) as JobRow;
  return { supabase, user, row, job };
}

/** Generate tailored CV + cover letter + pitch. Used by Approve and Regenerate. */
export async function generateAssetsAction(pipelineId: string, opts: { approve?: boolean } = {}): Promise<Result> {
  try {
    const { supabase, user, row, job } = await loadPipeline(pipelineId);
    const { profile, master } = await loadUserContext(supabase, user.id);
    if (!profile || !master) return { ok: false, error: "Upload your CV first." };
    const app = await tailorApplication(profile, master, job);
    const { error } = await supabase
      .from("user_pipeline")
      .update({
        tailored_cv_json: app.tailored_cv,
        cover_letter_md: app.cover_letter_md,
        custom_pitch_headline: app.custom_pitch_headline,
        custom_pitch_intro: app.custom_pitch_intro,
        featured_project_ids: app.featured_project_ids,
        company_slug: job.company_slug,
        ...(opts.approve && ["new", "passed", "rejected"].includes(row.status) ? { status: "approved" } : {}),
      })
      .eq("id", pipelineId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/pipeline/${pipelineId}`);
    revalidatePath(`/${profile.username}/for/${job.company_slug}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function approveAction(pipelineId: string) {
  return generateAssetsAction(pipelineId, { approve: true });
}

export async function setStatusAction(pipelineId: string, status: PipelineStatus): Promise<Result> {
  try {
    if (!PIPELINE_STATUSES.includes(status)) return { ok: false, error: "Invalid status" };
    const { supabase, row } = await loadPipeline(pipelineId);
    // Moving into an active stage without assets generates them first.
    if (["approved", "applied", "interview", "offer"].includes(status) && !row.tailored_cv_json) {
      const g = await generateAssetsAction(pipelineId);
      if (!g.ok) return g;
    }
    const { error } = await supabase
      .from("user_pipeline")
      .update({ status, ...(status === "applied" && !row.applied_at ? { applied_at: new Date().toISOString() } : {}) })
      .eq("id", pipelineId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/pipeline/${pipelineId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateAssetsAction(
  pipelineId: string,
  fields: { cover_letter_md?: string; custom_pitch_headline?: string; custom_pitch_intro?: string; notes?: string; featured_project_ids?: string[] },
): Promise<Result> {
  try {
    const { supabase, job } = await loadPipeline(pipelineId);
    const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (clean.featured_project_ids) clean.featured_project_ids = (clean.featured_project_ids as string[]).slice(0, 3);
    const { error } = await supabase.from("user_pipeline").update(clean).eq("id", pipelineId);
    if (error) throw new Error(error.message);
    revalidatePath(`/dashboard/pipeline/${pipelineId}`);
    const { data: p } = await supabase.from("profiles").select("username").eq("id", (await requireUser()).user.id).single();
    if (p) revalidatePath(`/${p.username}/for/${job.company_slug}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function rescoreAction(pipelineId: string): Promise<Result> {
  try {
    const { supabase, user, job } = await loadPipeline(pipelineId);
    const { profile, master } = await loadUserContext(supabase, user.id);
    if (!profile || !master) return { ok: false, error: "Upload your CV first." };
    const fit = await assessFit(profile, master, job);
    const { error } = await supabase.from("user_pipeline").update(fit).eq("id", pipelineId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/pipeline/${pipelineId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeFromPipelineAction(pipelineId: string): Promise<Result> {
  try {
    const { supabase } = await loadPipeline(pipelineId);
    const { error } = await supabase.from("user_pipeline").delete().eq("id", pipelineId);
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
