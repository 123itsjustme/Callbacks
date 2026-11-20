"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { assessFit, importJobForUser, loadUserContext, type JobRow } from "@/lib/jobs";
import { logEvent, nextActionFor, runAssetGeneration } from "@/lib/applications";
import type { Outreach } from "@/lib/ai/schemas";
import { ACTIVE_PITCH_STATUSES, PIPELINE_STATUSES, type PipelineStatus } from "@/lib/utils";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => {
  console.error(e);
  return { ok: false, error: (e as Error)?.message || "Something went wrong." };
};

function refresh(pipelineId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/discover");
  if (pipelineId) revalidatePath(`/dashboard/pipeline/${pipelineId}`);
}

export async function importJobAction(url: string): Promise<Result<{ pipelineId: string; title: string; company: string; score: number }>> {
  try {
    if (!/^https?:\/\//i.test(url.trim())) return { ok: false, error: "Paste a full job URL starting with https://" };
    const { supabase, user } = await requireUser();
    const r = await importJobForUser(supabase, user.id, url);
    await supabase.from("user_pipeline").update({ source: "import", fit_assessed_at: new Date().toISOString() }).eq("id", r.pipelineId);
    refresh();
    return { ok: true, pipelineId: r.pipelineId, title: r.job.title, company: r.job.company_name, score: r.fit.match_score };
  } catch (e) {
    return fail(e);
  }
}

async function loadPipeline(pipelineId: string) {
  const { supabase, user } = await requireUser();
  const { data: row, error } = await supabase.from("user_pipeline").select("*, jobs(*)").eq("id", pipelineId).eq("user_id", user.id).single();
  if (error || !row) throw new Error("Application not found.");
  const job = (Array.isArray(row.jobs) ? row.jobs[0] : row.jobs) as JobRow;
  return { supabase, user, row, job };
}

/** Kick off background generation; returns immediately. */
async function startGeneration(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string, pipelineId: string) {
  await supabase.from("user_pipeline").update({ assets_status: "generating", assets_error: null }).eq("id", pipelineId);
  after(() => runAssetGeneration(userId, pipelineId));
}

/** Swipe right / Approve: move to approved and generate CV, cover letter, pitch page and outreach kit in the background. */
export async function approveAction(pipelineId: string): Promise<Result> {
  try {
    const { supabase, user, row } = await loadPipeline(pipelineId);
    const moving = ["new", "passed", "rejected"].includes(row.status);
    if (moving) {
      await supabase
        .from("user_pipeline")
        .update({ status: "approved", pass_reason: null, ...nextActionFor("approved") })
        .eq("id", pipelineId);
      await logEvent(supabase, user.id, pipelineId, "status", "Approved");
    }
    if (row.assets_status !== "generating" && (row.assets_status !== "ready" || !row.tailored_cv_json)) await startGeneration(supabase, user.id, pipelineId);
    refresh(pipelineId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Swipe left / Pass, with an optional reason that steers future suggestions. */
export async function passAction(pipelineId: string, reason?: string): Promise<Result> {
  try {
    const { supabase, user } = await loadPipeline(pipelineId);
    const clean = reason?.trim().slice(0, 200) || null;
    const { error } = await supabase
      .from("user_pipeline")
      .update({ status: "passed", pass_reason: clean, next_action: null, next_action_due: null })
      .eq("id", pipelineId);
    if (error) throw new Error(error.message);
    await logEvent(supabase, user.id, pipelineId, "status", clean ? `Passed: ${clean}` : "Passed");
    refresh(pipelineId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function regenerateAction(pipelineId: string): Promise<Result> {
  try {
    const { supabase, user } = await loadPipeline(pipelineId);
    await startGeneration(supabase, user.id, pipelineId);
    refresh(pipelineId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setStatusAction(pipelineId: string, status: PipelineStatus): Promise<Result> {
  try {
    if (!PIPELINE_STATUSES.includes(status)) return { ok: false, error: "Invalid status" };
    if (status === "approved") return approveAction(pipelineId);
    if (status === "passed") return passAction(pipelineId);
    const { supabase, user, row } = await loadPipeline(pipelineId);
    if (row.status === status) return { ok: true };
    const followUp = (row.outreach_json as Outreach | null)?.follow_up_after_days ?? 7;
    const { error } = await supabase
      .from("user_pipeline")
      .update({
        status,
        ...nextActionFor(status, followUp),
        ...(status === "applied" && !row.applied_at ? { applied_at: new Date().toISOString() } : {}),
      })
      .eq("id", pipelineId);
    if (error) throw new Error(error.message);
    await logEvent(supabase, user.id, pipelineId, "status", `Moved to ${status}`);
    if ((ACTIVE_PITCH_STATUSES as readonly string[]).includes(status) && !row.tailored_cv_json && row.assets_status !== "generating")
      await startGeneration(supabase, user.id, pipelineId);
    refresh(pipelineId);
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
    const { supabase, user, job } = await loadPipeline(pipelineId);
    const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (clean.featured_project_ids) clean.featured_project_ids = (clean.featured_project_ids as string[]).slice(0, 3);
    const { error } = await supabase.from("user_pipeline").update(clean).eq("id", pipelineId);
    if (error) throw new Error(error.message);
    revalidatePath(`/dashboard/pipeline/${pipelineId}`);
    const { data: p } = await supabase.from("profiles").select("username").eq("id", user.id).single();
    if (p) revalidatePath(`/${p.username}/for/${job.company_slug}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function rescoreAction(pipelineId: string): Promise<Result<{ match_score: number; fit_reasoning: string; red_flags: string[] }>> {
  try {
    const { supabase, user, job } = await loadPipeline(pipelineId);
    const { profile, master } = await loadUserContext(supabase, user.id);
    if (!profile || !master) return { ok: false, error: "Upload your CV first." };
    const fit = await assessFit(profile, master, job);
    const { error } = await supabase.from("user_pipeline").update({ ...fit, fit_assessed_at: new Date().toISOString() }).eq("id", pipelineId);
    if (error) throw new Error(error.message);
    return { ok: true, ...fit };
  } catch (e) {
    return fail(e);
  }
}

/** Swipe deck: get a detailed AI fit review the first time a card is shown. */
export async function ensureFitAction(pipelineId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("user_pipeline").select("fit_assessed_at").eq("id", pipelineId).single();
  if (data?.fit_assessed_at) return { ok: true as const, skipped: true };
  return rescoreAction(pipelineId);
}

export async function markOutreachSentAction(pipelineId: string, channel: "linkedin" | "email" | "follow_up"): Promise<Result> {
  try {
    const { supabase, user, row } = await loadPipeline(pipelineId);
    const days = (row.outreach_json as Outreach | null)?.follow_up_after_days ?? 7;
    const due = new Date();
    due.setUTCDate(due.getUTCDate() + days);
    const label = channel === "follow_up" ? "Follow-up sent" : channel === "linkedin" ? "LinkedIn note sent" : "Outreach email sent";
    await logEvent(supabase, user.id, pipelineId, channel === "follow_up" ? "followed_up" : "outreach_sent", label);
    await supabase
      .from("user_pipeline")
      .update({ next_action: channel === "follow_up" ? "Check for a reply" : "Follow up if there's no reply", next_action_due: due.toISOString().slice(0, 10) })
      .eq("id", pipelineId);
    refresh(pipelineId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setNextActionAction(pipelineId: string, text: string | null, due: string | null): Promise<Result> {
  try {
    const { supabase, user, row } = await loadPipeline(pipelineId);
    if (!text && row.next_action) await logEvent(supabase, user.id, pipelineId, "next_action_done", row.next_action);
    const { error } = await supabase
      .from("user_pipeline")
      .update({ next_action: text?.trim() || null, next_action_due: text ? due || null : null })
      .eq("id", pipelineId);
    if (error) throw new Error(error.message);
    refresh(pipelineId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addNoteEventAction(pipelineId: string, text: string): Promise<Result> {
  try {
    const { supabase, user } = await loadPipeline(pipelineId);
    if (!text.trim()) return { ok: false, error: "Write something first." };
    await logEvent(supabase, user.id, pipelineId, "note", text.trim().slice(0, 1000));
    refresh(pipelineId);
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
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
