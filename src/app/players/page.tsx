import { getPlayers } from "@/lib/data";
import PlayerGrid from "@/components/PlayerGrid";

export const metadata = {
  title: "All Players — 2026 Draft Board",
  description: "Browse all 141 scouted players for the 2026 NFL Draft.",
};

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
