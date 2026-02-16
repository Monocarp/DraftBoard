import { getPlayerProfile } from "@/lib/data";
import { notFound } from "next/navigation";
import { cache } from "react";
import PlayerDetailView from "./PlayerDetailView";

export const dynamic = "force-dynamic";

// Deduplicate getPlayerProfile between generateMetadata and page component
const getCachedProfile = cache((slug: string) => getPlayerProfile(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getCachedProfile(slug);
  if (!profile) return { title: "Player Not Found" };
  return {
    title: `${profile.name} — 2026 Draft Board`,
    description: `${profile.name} (${profile.position}) — ${profile.college}. Scouting report, rankings, and analysis.`,
  };
}

export default async function PlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getCachedProfile(slug);
  if (!profile) notFound();
  return <PlayerDetailView profile={profile} />;
}
