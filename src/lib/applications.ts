import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import { generateStructured } from "./ai/models";
import { OutreachSchema, type MasterData, type Outreach } from "./ai/schemas";
import { OUTREACH_PROMPT } from "./ai/prompts";
import { loadUserContext, tailorApplication, type JobRow, type ProfileRow } from "./jobs";
import type { PipelineStatus } from "./utils";

export type EventKind =
  | "status"
  | "assets_ready"
  | "assets_error"
  | "outreach_sent"
  | "followed_up"
  | "next_action_done"
  | "note";

export async function logEvent(db: SupabaseClient, userId: string, pipelineId: string, kind: EventKind, detail?: string) {
  const { error } = await db.from("pipeline_events").insert({ user_id: userId, pipeline_id: pipelineId, kind, detail: detail ?? null });
  if (error) console.warn("[logEvent]", error.message);
}

const addDays = (d: number) => {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};

/** Default next step when an application enters a stage. */
export function nextActionFor(status: PipelineStatus, followUpDays = 7): { next_action: string | null; next_action_due: string | null } {
  switch (status) {
    case "approved":
      return { next_action: "Review your CV & cover letter, then apply and send your outreach note", next_action_due: addDays(1) };
    case "applied":
      return { next_action: "Follow up if you haven't heard back", next_action_due: addDays(followUpDays) };
    case "interview":
      return { next_action: "Prepare for the interview, then send a thank-you note", next_action_due: addDays(2) };
    case "offer":
      return { next_action: "Review the offer and reply", next_action_due: addDays(3) };
    default:
      return { next_action: null, next_action_due: null };
  }
}

export async function generateOutreach(profile: ProfileRow, master: MasterData, job: JobRow): Promise<Outreach> {
  const o = await generateStructured({
    schema: OutreachSchema,
    system: OUTREACH_PROMPT,
    prompt: `CANDIDATE: ${profile.full_name} — ${profile.headline ?? ""}
availability_status: ${profile.availability_status ?? ""}
Portfolio: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${profile.username}/for/${job.company_slug}

MASTER PROFILE JSON:
${JSON.stringify(master)}

JOB (${job.org_type}): ${job.title} at ${job.company_name}
${job.description_md.slice(0, 12000)}`,
    maxOutputTokens: 3000,
  });
  return {
    ...o,
    linkedin_note: o.linkedin_note.length > 300 ? o.linkedin_note.slice(0, 297).trimEnd() + "…" : o.linkedin_note,
    follow_up_after_days: Math.min(21, Math.max(3, Math.round(o.follow_up_after_days || 7))),
    who_to_contact: o.who_to_contact.slice(0, 3),
  };
}

/**
 * Generate tailored CV + cover letter + pitch + outreach for one pipeline row.
 * Runs in the background (after()) with the service role, always scoped by user_id.
 */
export async function runAssetGeneration(userId: string, pipelineId: string) {
  const admin = createAdminClient();
  try {
    const { data: row } = await admin.from("user_pipeline").select("*, jobs(*)").eq("id", pipelineId).eq("user_id", userId).single();
    if (!row) throw new Error("Application not found");
    const job = (Array.isArray(row.jobs) ? row.jobs[0] : row.jobs) as JobRow;
    const { profile, master } = await loadUserContext(admin, userId);
    if (!profile || !master) throw new Error("Upload your CV first.");

    const [app, outreach] = await Promise.all([tailorApplication(profile, master, job), generateOutreach(profile, master, job)]);
    const { error } = await admin
      .from("user_pipeline")
      .update({
        tailored_cv_json: app.tailored_cv,
        cover_letter_md: app.cover_letter_md,
        custom_pitch_headline: app.custom_pitch_headline,
        custom_pitch_intro: app.custom_pitch_intro,
        featured_project_ids: app.featured_project_ids,
        company_slug: job.company_slug,
        outreach_json: outreach,
        assets_status: "ready",
        assets_error: null,
      })
      .eq("id", pipelineId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    await logEvent(admin, userId, pipelineId, "assets_ready", "Tailored CV, cover letter, pitch page and outreach kit generated");
  } catch (e) {
    const msg = (e as Error).message || "Generation failed";
    console.error("[runAssetGeneration]", pipelineId, msg);
    await admin.from("user_pipeline").update({ assets_status: "error", assets_error: msg.slice(0, 500) }).eq("id", pipelineId).eq("user_id", userId);
    await logEvent(admin, userId, pipelineId, "assets_error", msg.slice(0, 300));
  }
}
