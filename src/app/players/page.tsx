import { getPlayers } from "@/lib/data";
import PlayerGrid from "@/components/PlayerGrid";
import { getActiveDraftYear, siteTitle } from "@/lib/draft-year";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: await siteTitle("All Players"),
    description: `Browse every scouted player for the ${await getActiveDraftYear()} NFL Draft.`,
  };
}

export default async function PlayersPage() {
  const players = await getPlayers();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">All Players</h1>
        <p className="mt-1 text-gray-400">
          {players.length} players with detailed scouting profiles.
        </p>
      </div>
      <PlayerGrid players={players} />
    </div>
  );
}
