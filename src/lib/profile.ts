import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RESERVED_USERNAMES, slugify } from "./utils";

export const USERNAME_RE = /^[a-z0-9][a-z0-9-]{1,38}$/;

export function validateUsername(u: string): string | null {
  if (!USERNAME_RE.test(u)) return "Use 2–39 lowercase letters, numbers or hyphens.";
  if (RESERVED_USERNAMES.has(u)) return "That username is reserved.";
  return null;
}

/** Pick an available username derived from the person's name. */
export async function uniqueUsername(supabase: SupabaseClient, fullName: string, userId: string) {
  let base = slugify(fullName).slice(0, 30) || "me";
  if (base.length < 2 || RESERVED_USERNAMES.has(base)) base = `${base}-folio`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await supabase.from("profiles").select("id, is_public").eq("username", candidate).maybeSingle();
    // Private profiles aren't visible via RLS; the unique constraint catches those on insert.
    if (!data || data.id === userId) return candidate;
  }
  return `${base}-${userId.slice(0, 6)}`;
}
