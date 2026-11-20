import { renderToBuffer } from "@react-pdf/renderer";
import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseMaster } from "@/lib/jobs";
import type { TailoredCV } from "@/lib/ai/schemas";
import { PdfCvDocument, type PdfCv } from "@/components/pdf-cv-document";
import { ACTIVE_PITCH_STATUSES, slugify } from "@/lib/utils";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILE_COLS = "id, username, full_name, headline, location, contact_email, social_links, is_public";

type Profile = { id: string; username: string; full_name: string; headline: string | null; location: string | null; contact_email: string | null; social_links: Record<string, string> | null; is_public: boolean };

/**
 * GET /api/pdf/master?u=<username>  -> public master CV (or your own if signed in and no ?u)
 * GET /api/pdf/<pipelineId>         -> tailored CV. Public while the pitch is active (approved/applied/interview/offer); always for the owner.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/pdf/[pipelineId]">) {
  const { pipelineId } = await ctx.params;
  const admin = createAdminClient();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  let cv: PdfCv;

  if (pipelineId === "master") {
    const u = req.nextUrl.searchParams.get("u");
    const q = admin.from("profiles").select(PROFILE_COLS);
    const { data } = u ? await q.eq("username", u.toLowerCase()).maybeSingle() : user ? await q.eq("id", user.id).maybeSingle() : { data: null };
    profile = data as Profile | null;
    if (!profile || (!profile.is_public && profile.id !== user?.id)) return new Response("Not found", { status: 404 });
    const { data: m } = await admin.from("master_profiles").select("structured_data").eq("user_id", profile.id).maybeSingle();
    const master = parseMaster(m?.structured_data);
    cv = base(profile, master);
  } else {
    if (!UUID.test(pipelineId)) return new Response("Not found", { status: 404 });
    const { data: row } = await admin.from("user_pipeline").select("user_id, status, tailored_cv_json, jobs(company_name)").eq("id", pipelineId).maybeSingle();
    if (!row || !row.tailored_cv_json) return new Response("Not found", { status: 404 });
    const isOwner = user?.id === row.user_id;
    if (!isOwner && !(ACTIVE_PITCH_STATUSES as readonly string[]).includes(row.status)) return new Response("Not found", { status: 404 });
    const { data: p } = await admin.from("profiles").select(PROFILE_COLS).eq("id", row.user_id).single();
    profile = p as Profile;
    const { data: m } = await admin.from("master_profiles").select("structured_data").eq("user_id", row.user_id).maybeSingle();
    const master = parseMaster(m?.structured_data);
    const t = row.tailored_cv_json as TailoredCV;
    const job = (Array.isArray(row.jobs) ? row.jobs[0] : row.jobs) as { company_name: string } | null;
    cv = {
      ...base(profile, master),
      preparedFor: job?.company_name ?? null,
      summary: t.summary,
      experience: t.experience,
      projects: t.projects,
      skills: t.selected_skills,
    };
  }

  const buffer = await renderToBuffer(<PdfCvDocument cv={cv} />);
  const filename = `${slugify(profile!.full_name)}-cv${cv.preparedFor ? `-${slugify(cv.preparedFor)}` : ""}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function base(profile: Profile, master: ReturnType<typeof parseMaster>): PdfCv {
  return {
    name: profile.full_name,
    headline: profile.headline,
    location: profile.location,
    email: profile.contact_email,
    website: profile.social_links?.website ?? profile.social_links?.linkedin ?? null,
    summary: master.summary,
    experience: master.experience,
    projects: master.projects,
    skills: master.skills,
    education: master.education,
    awards: master.awards,
  };
}
