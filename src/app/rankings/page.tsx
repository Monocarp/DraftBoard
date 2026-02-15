import { getRankings } from "@/lib/data";
import RankingsView from "./RankingsView";

export const metadata = {
  title: "Rankings — 2026 Draft Board",
  description: "Multi-source consensus rankings for the 2026 NFL Draft.",
};

export default async function RankingsPage() {
  const data = await getRankings();
  return <RankingsView rankings={data.players} sourceDates={data.source_dates} />;
}
