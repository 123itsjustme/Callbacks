import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { distributeJobs, loadUserVectors, scanCompany, type CompanyRow } from "@/lib/discovery";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Daily watchlist scan. Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const deadline = started + 250_000; // leave headroom under maxDuration
  const admin = createAdminClient();
  const users = await loadUserVectors();
  if (!users.length) return NextResponse.json({ ok: true, message: "No users with a master profile yet." });

  // Least-recently scanned first, so every company gets covered across runs.
  const { data: companies, error } = await admin
    .from("target_companies")
    .select("*")
    .order("last_scraped_at", { ascending: true, nullsFirst: true })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const report: { company: string; found?: number; added?: number; error?: string }[] = [];
  const newJobIds: string[] = [];
  for (const c of companies ?? []) {
    if (Date.now() > deadline) break;
    try {
      const { found, added } = await scanCompany(c as CompanyRow, users, deadline);
      newJobIds.push(...added.map((j) => j.id));
      report.push({ company: c.name, found, added: added.length });
    } catch (e) {
      report.push({ company: c.name, error: (e as Error).message });
      await admin.from("target_companies").update({ last_scraped_at: new Date().toISOString() }).eq("id", c.id);
    }
  }
  const matches = await distributeJobs(newJobIds, users);
  return NextResponse.json({ ok: true, seconds: Math.round((Date.now() - started) / 1000), newJobs: newJobIds.length, pipelineMatches: matches, report });
}
