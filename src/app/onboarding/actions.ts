"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { extractCvText } from "@/lib/cv-text";
import { generateStructured } from "@/lib/ai/models";
import { ParsedCVSchema } from "@/lib/ai/schemas";
import { CV_PARSER_PROMPT } from "@/lib/ai/prompts";
import { embedText, profileEmbeddingText, toPgVector } from "@/lib/ai/embeddings";
import { matchExistingJobs } from "@/lib/jobs";
import { uniqueUsername, validateUsername } from "@/lib/profile";
import { AVAILABILITY_OPTIONS, slugify } from "@/lib/utils";

const MAX_BYTES = 4 * 1024 * 1024;

export type OnboardResult =
  | { ok: true; username: string; fullName: string; headline: string; bio: string; availability: string; counts: { experience: number; projects: number; skills: number }; matches: number; matchError?: string }
  | { ok: false; error: string };

export async function uploadCvAction(formData: FormData): Promise<OnboardResult> {
  try {
    const { supabase, user } = await requireUser();
    const file = formData.get("cv");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a PDF or DOCX file." };
    if (file.size > MAX_BYTES) return { ok: false, error: "That file is over 4MB — export a lighter PDF and try again." };

    const rawText = (await extractCvText(file)).trim();
    if (rawText.length < 200) return { ok: false, error: "We couldn't read much text from that file. If it's a scanned PDF, export it as text-based PDF or DOCX." };

    // Keep a copy of the original in private storage: cvs/<uid>/<timestamp>-<name>
    const path = `${user.id}/${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, ""))}${file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ""}`;
    const upload = await supabase.storage.from("cvs").upload(path, file, { contentType: file.type || undefined, upsert: true });
    if (upload.error) console.warn("CV storage upload failed:", upload.error.message);

    const parsed = await generateStructured({
      schema: ParsedCVSchema,
      system: CV_PARSER_PROMPT,
      prompt: `RAW CV TEXT:\n\n${rawText.slice(0, 60000)}`,
      maxOutputTokens: 16000,
    });

    // De-duplicate ids so tailoring can reference them safely.
    const dedupe = <T extends { id: string }>(items: T[]) => {
      const seen = new Set<string>();
      return items.map((it, i) => {
        let id = slugify(it.id) || `item-${i + 1}`;
        while (seen.has(id)) id = `${id}-${i + 1}`;
        seen.add(id);
        return { ...it, id };
      });
    };
    const structured = {
      summary: parsed.summary,
      experience: dedupe(parsed.experience),
      projects: dedupe(parsed.projects),
      skills: [...new Set(parsed.skills)],
      education: parsed.education,
      awards: parsed.awards,
    };

    const { data: existing } = await supabase.from("profiles").select("username, availability_status").eq("id", user.id).maybeSingle();
    const username = existing?.username ?? (await uniqueUsername(supabase, parsed.full_name, user.id));
    const availability = existing?.availability_status ?? "Open to opportunities";

    const profileRow = {
      id: user.id,
      username,
      full_name: parsed.full_name,
      headline: parsed.headline,
      bio: parsed.bio,
      location: parsed.location ?? null,
      contact_email: parsed.contact_email || user.email || null,
      target_roles: parsed.inferred_target_roles,
      preferred_org_types: parsed.inferred_org_types.length ? parsed.inferred_org_types : ["agency", "indie", "publisher", "client"],
      availability_status: availability,
    };
    const { error: pErr } = await supabase.from("profiles").upsert(profileRow, { onConflict: "id" });
    if (pErr) return { ok: false, error: pErr.message.includes("username") ? "Username clash — please try again." : pErr.message };

    const embedding = await embedText(profileEmbeddingText({ headline: parsed.headline, target_roles: parsed.inferred_target_roles, data: structured }));
    const { error: mErr } = await supabase
      .from("master_profiles")
      .upsert({ user_id: user.id, raw_cv_text: rawText, structured_data: structured, embedding: toPgVector(embedding) }, { onConflict: "user_id" });
    if (mErr) return { ok: false, error: mErr.message };

    let matches = 0;
    let matchError: string | undefined;
    try {
      matches = await matchExistingJobs(supabase, user.id, embedding);
    } catch (e) {
      matchError = (e as Error).message;
    }

    revalidatePath("/dashboard", "layout");
    return {
      ok: true,
      username,
      fullName: parsed.full_name,
      headline: parsed.headline,
      bio: parsed.bio,
      availability,
      counts: { experience: structured.experience.length, projects: structured.projects.length, skills: structured.skills.length },
      matches,
      matchError,
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: (e as Error).message || "Something went wrong parsing your CV." };
  }
}

export async function saveBasicsAction(formData: FormData): Promise<{ ok: boolean; error?: string; username?: string }> {
  const { supabase, user } = await requireUser();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const usernameError = validateUsername(username);
  if (usernameError) return { ok: false, error: usernameError };
  const availability = String(formData.get("availability_status") ?? "");
  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      headline: String(formData.get("headline") ?? "").trim() || null,
      bio: String(formData.get("bio") ?? "").trim() || null,
      availability_status: AVAILABILITY_OPTIONS.includes(availability) ? availability : availability.slice(0, 60) || null,
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.code === "23505" ? "That username is taken." : error.message };
  revalidatePath(`/${username}`);
  return { ok: true, username };
}
