import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addCompanyJobsForUser, distributeJobs, loadUserVectors, scanCompany, type CompanyRow } from "@/lib/discovery";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Daily scan of every company at least one user keeps. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const deadline = started + 250_000;
  const admin = createAdminClient();
  const users = await loadUserVectors();
  if (!users.length) return NextResponse.json({ ok: true, message: "No users with a master profile yet." });

  const { data: links } = await admin.from("user_companies").select("user_id, company_id").eq("status", "active");
  const followers = new Map<string, string[]>();
  for (const l of links ?? []) followers.set(l.company_id, [...(followers.get(l.company_id) ?? []), l.user_id]);
  if (!followers.size) return NextResponse.json({ ok: true, message: "No followed companies yet." });

  // Least-recently scanned first, so every followed company gets covered across runs.
  const { data: companies, error } = await admin
    .from("target_companies")
    .select("*")
    .in("id", [...followers.keys()])
    .order("last_scraped_at", { ascending: true, nullsFirst: true })
    .limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const report: { company: string; found?: number; added?: number; error?: string }[] = [];
  const newJobIds: string[] = [];
  let followerMatches = 0;
  for (const c of companies ?? []) {
    if (Date.now() > deadline) break;
    try {
      const { found, added } = await scanCompany(c as CompanyRow, users, deadline);
      newJobIds.push(...added.map((j) => j.id));
      for (const uid of followers.get(c.id) ?? []) {
        const u = users.find((x) => x.user_id === uid);
        if (u) followerMatches += await addCompanyJobsForUser(uid, u.vec, c.id);
      }
      report.push({ company: c.name, found, added: added.length });
    } catch (e) {
      report.push({ company: c.name, error: (e as Error).message });
      await admin.from("target_companies").update({ last_scraped_at: new Date().toISOString() }).eq("id", c.id);
    }
  }
  const poolMatches = await distributeJobs(newJobIds, users);
  return NextResponse.json({ ok: true, seconds: Math.round((Date.now() - started) / 1000), newJobs: newJobIds.length, followerMatches, poolMatches, report });
}
