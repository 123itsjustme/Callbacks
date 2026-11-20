import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicPortfolio } from "@/lib/portfolio";
import { PublicPortfolioView } from "@/components/public-portfolio-view";

export async function generateMetadata({ params }: PageProps<"/[username]">): Promise<Metadata> {
  const { username } = await params;
  const data = await getPublicPortfolio(username);
  if (!data) return { title: "Not found" };
  return {
    title: { absolute: `${data.profile.full_name} — ${data.profile.headline ?? "Portfolio"}` },
    description: data.profile.bio ?? undefined,
  };
}

export default async function PortfolioPage({ params }: PageProps<"/[username]">) {
  const { username } = await params;
  const data = await getPublicPortfolio(username);
  if (!data) notFound();
  return <PublicPortfolioView profile={data.profile} master={data.master} pdfHref={`/api/pdf/master?u=${encodeURIComponent(data.profile.username)}`} />;
}
