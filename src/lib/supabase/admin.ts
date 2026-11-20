import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS — only use on the server for:
 * cron scraping, inserting shared jobs, and whitelisted public portfolio reads.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
