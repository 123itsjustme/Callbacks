import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scanCompanyForUser, searchRolesForUser } from "@/lib/discovery";
import { assessFit, loadUserContext, type JobRow } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Long-running discovery work, called with fetch() so it runs in parallel with
 * swipe actions (Server Actions are processed one at a time per client).
 * Body: { op: "scan", companyId } | { op: "search" } | { op: "fit", pipelineId }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  let body: { op?: string; companyId?: string; pipelineId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  try {
    if (body.op === "scan" && body.companyId) {
      const { data: link } = await supabase.from("user_companies").select("id").eq("user_id", user.id).eq("company_id", body.companyId).maybeSingle();
      if (!link) return NextResponse.json({ ok: false, error: "Not on your list" }, { status: 404 });
      const r = await scanCompanyForUser(user.id, body.companyId);
      return NextResponse.json({ ok: true, ...r });
    }
    if (body.op === "search") {
      const r = await searchRolesForUser(user.id);
      return NextResponse.json({ ok: true, ...r });
    }
    if (body.op === "fit" && body.pipelineId) {
      const { data: row } = await supabase.from("user_pipeline").select("fit_assessed_at, jobs(*)").eq("id", body.pipelineId).eq("user_id", user.id).maybeSingle();
      if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      if (row.fit_assessed_at) return NextResponse.json({ ok: true, skipped: true });
      const { profile, master } = await loadUserContext(supabase, user.id);
      if (!profile || !master) return NextResponse.json({ ok: false, error: "Upload your CV first" }, { status: 400 });
      const job = (Array.isArray(row.jobs) ? row.jobs[0] : row.jobs) as JobRow;
      const fit = await assessFit(profile, master, job);
      await supabase.from("user_pipeline").update({ ...fit, fit_assessed_at: new Date().toISOString() }).eq("id", body.pipelineId);
      return NextResponse.json({ ok: true, ...fit });
    }
    return NextResponse.json({ ok: false, error: "Unknown op" }, { status: 400 });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[api/discover]", body.op, msg);
    const friendly = /web.?search|not enabled/i.test(msg)
      ? "Web search isn't enabled for the Anthropic API key (Anthropic Console → Settings → Privacy)."
      : /no credits|insufficient_quota|credit balance/i.test(msg)
        ? "An AI provider account is out of credit."
        : msg;
    return NextResponse.json({ ok: false, error: friendly }, { status: 500 });
  }
}
