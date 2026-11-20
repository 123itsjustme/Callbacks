import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import type { Metadata } from "next";
import { getPublicPitch, getPublicPortfolio, recordPitchView } from "@/lib/portfolio";
import { PublicPortfolioView } from "@/components/public-portfolio-view";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/[username]/for/[companySlug]">): Promise<Metadata> {
  const { username, companySlug } = await params;
  const data = await getPublicPortfolio(username);
  if (!data) return { title: "Not found" };
  const pitch = await getPublicPitch(data.profile.id, companySlug);
  return {
    title: { absolute: pitch ? `${data.profile.full_name} for ${pitch.companyName}` : data.profile.full_name },
    description: pitch?.headline ?? data.profile.bio ?? undefined,
    robots: { index: false, follow: false },
  };
}

export default async function PitchPage({ params }: PageProps<"/[username]/for/[companySlug]">) {
  const { username, companySlug } = await params;
  const data = await getPublicPortfolio(username);
  if (!data) notFound();
  const pitch = await getPublicPitch(data.profile.id, companySlug);
  // Unknown or inactive company slug: fall back cleanly to the main portfolio.
  if (!pitch) redirect(`/${data.profile.username}`);

  // Count views from everyone except the owner previewing their own page; runs after the response.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id !== data.profile.id) after(() => recordPitchView(data.profile.username, pitch.companySlug));

  return (
    <PublicPortfolioView
      profile={data.profile}
      master={data.master}
      pdfHref={`/api/pdf/${pitch.pipelineId}`}
      pitch={{ companyName: pitch.companyName, headline: pitch.headline, intro: pitch.intro, featuredProjectIds: pitch.featuredProjectIds, jobTitle: pitch.jobTitle }}
    />
  );
}
