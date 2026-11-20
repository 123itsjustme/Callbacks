"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { MasterDataSchema } from "@/lib/ai/schemas";
import { embedText, profileEmbeddingText, toPgVector } from "@/lib/ai/embeddings";
import { validateUsername } from "@/lib/profile";

type R = { ok: true; message: string } | { ok: false; error: string };
const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export async function saveProfileAction(_: R | null, fd: FormData): Promise<R> {
  const { supabase, user } = await requireUser();
  const username = String(fd.get("username") ?? "").trim().toLowerCase();
  const uErr = validateUsername(username);
  if (uErr) return { ok: false, error: uErr };
  const { data: before } = await supabase.from("profiles").select("username").eq("id", user.id).single();

  const social: Record<string, string> = {};
  for (const k of ["website", "linkedin", "instagram", "behance"]) {
    const v = String(fd.get(`social_${k}`) ?? "").trim();
    if (v) social[k] = /^https?:\/\//.test(v) ? v : `https://${v}`;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      full_name: String(fd.get("full_name") ?? "").trim(),
      headline: String(fd.get("headline") ?? "").trim() || null,
      bio: String(fd.get("bio") ?? "").trim() || null,
      location: String(fd.get("location") ?? "").trim() || null,
      availability_status: String(fd.get("availability_status") ?? "").trim() || null,
      contact_email: String(fd.get("contact_email") ?? "").trim() || null,
      target_roles: list(fd.get("target_roles")),
      preferred_org_types: fd.getAll("preferred_org_types").map(String),
      is_public: fd.get("is_public") === "on",
      social_links: social,
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.code === "23505" ? "That username is taken." : error.message };
  revalidatePath("/dashboard", "layout");
  revalidatePath(`/${username}`);
  if (before && before.username !== username) revalidatePath(`/${before.username}`);
  return { ok: true, message: "Profile saved." };
}

export async function saveMasterAction(_: R | null, fd: FormData): Promise<R> {
  const { supabase, user } = await requireUser();
  let parsed;
  try {
    parsed = MasterDataSchema.safeParse(JSON.parse(String(fd.get("structured_data") ?? "{}")));
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (!parsed.success) return { ok: false, error: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const ids = [...parsed.data.experience, ...parsed.data.projects].map((x) => x.id);
  if (new Set(ids).size !== ids.length) return { ok: false, error: "Every experience and project id must be unique." };

  const { data: profile } = await supabase.from("profiles").select("headline, target_roles, username").eq("id", user.id).single();
  let embedding: string | undefined;
  try {
    embedding = toPgVector(await embedText(profileEmbeddingText({ headline: profile?.headline, target_roles: profile?.target_roles, data: parsed.data })));
  } catch (e) {
    console.warn("re-embed failed", e);
  }
  const { error } = await supabase
    .from("master_profiles")
    .update({ structured_data: parsed.data, ...(embedding ? { embedding } : {}) })
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };
  if (profile) revalidatePath(`/${profile.username}`);
  return { ok: true, message: embedding ? "Master profile saved and re-indexed for matching." : "Saved (matching index not refreshed — check OPENAI_API_KEY)." };
}
