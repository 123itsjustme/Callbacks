import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured } from "./ai/models";
import { ProfileReviewSchema, type ProfileReview } from "./ai/schemas";
import { CV_REVIEW_PROMPT, LINKEDIN_REVIEW_PROMPT } from "./ai/prompts";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

function normalize(r: ProfileReview, kind: "cv" | "linkedin"): ProfileReview {
  return {
    ...r,
    overall_score: clamp(r.overall_score, 0, 100),
    categories: r.categories.slice(0, 6).map((c) => ({ ...c, score: clamp(c.score, 0, 10) })),
    strengths: r.strengths.slice(0, 4),
    improvements: r.improvements.slice(0, 7),
    consistency_issues: kind === "cv" ? [] : r.consistency_issues.slice(0, 10),
  };
}

async function context(db: SupabaseClient, userId: string) {
  const [{ data: profile }, { data: master }] = await Promise.all([
    db.from("profiles").select("headline, target_roles, preferred_org_types, location").eq("id", userId).single(),
    db.from("master_profiles").select("raw_cv_text, linkedin_text").eq("user_id", userId).single(),
  ]);
  if (!master?.raw_cv_text) throw new Error("Upload your CV first.");
  const targets = `Target roles: ${(profile?.target_roles ?? []).join(", ") || "infer from CV"}
Preferred organisation types: ${(profile?.preferred_org_types ?? []).join(", ")}
Location: ${profile?.location ?? "unknown"}`;
  return { targets, cvText: master.raw_cv_text as string, linkedinText: (master.linkedin_text as string | null) ?? null };
}

async function save(db: SupabaseClient, userId: string, kind: "cv" | "linkedin", review: ProfileReview) {
  const { error } = await db.from("profile_reviews").insert({ user_id: userId, kind, overall_score: review.overall_score, review });
  if (error) throw new Error(error.message);
  return review;
}

export async function reviewCv(db: SupabaseClient, userId: string) {
  const { targets, cvText } = await context(db, userId);
  const review = await generateStructured({
    schema: ProfileReviewSchema,
    system: CV_REVIEW_PROMPT,
    prompt: `${targets}\n\nCV TEXT (as extracted from the uploaded file):\n${cvText.slice(0, 40000)}`,
    maxOutputTokens: 5000,
  });
  return save(db, userId, "cv", normalize(review, "cv"));
}

export async function reviewLinkedIn(db: SupabaseClient, userId: string, linkedinText: string) {
  const { targets, cvText } = await context(db, userId);
  await db.from("master_profiles").update({ linkedin_text: linkedinText.slice(0, 60000), linkedin_updated_at: new Date().toISOString() }).eq("user_id", userId);
  const review = await generateStructured({
    schema: ProfileReviewSchema,
    system: LINKEDIN_REVIEW_PROMPT,
    prompt: `${targets}\n\nLINKEDIN PROFILE TEXT:\n${linkedinText.slice(0, 30000)}\n\nCV TEXT (reference for consistency):\n${cvText.slice(0, 30000)}`,
    maxOutputTokens: 5000,
  });
  return save(db, userId, "linkedin", normalize(review, "linkedin"));
}
