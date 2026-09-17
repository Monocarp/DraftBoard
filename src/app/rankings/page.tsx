import { getRankings } from "@/lib/data";
import RankingsView from "./RankingsView";
import { getActiveDraftYear, siteTitle } from "@/lib/draft-year";

export const revalidate = 3600;

export async function generateMetadata() {
  return {
    title: await siteTitle("Rankings"),
    description: `Multi-source consensus rankings for the ${await getActiveDraftYear()} NFL Draft.`,
  };
}

export default async function RankingsPage() {
  const data = await getRankings();
  return <RankingsView rankings={data.players} sourceDates={data.source_dates} />;
}
