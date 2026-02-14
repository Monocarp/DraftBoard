import { getPlayerProfile, getAllPlayerSlugs } from "@/lib/data";
import { notFound } from "next/navigation";
import PlayerDetailView from "./PlayerDetailView";

// Generate static params for all players at build time
export async function generateStaticParams() {
  const slugs = getAllPlayerSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = getPlayerProfile(slug);
  if (!profile) return { title: "Player Not Found" };
  return {
    title: `${profile.name} — 2026 Draft Board`,
    description: `${profile.name} (${profile.position}) — ${profile.college}. Scouting report, rankings, and analysis.`,
  };
}

export default async function PlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = getPlayerProfile(slug);
  if (!profile) notFound();
  return <PlayerDetailView profile={profile} />;
}
