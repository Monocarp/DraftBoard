import { getPendingData } from "./actions";
import { PendingPlayersManager } from "./PendingPlayersManager";

export const revalidate = 0;

export default async function PendingPlayersPage() {
  const { pending, players, pendingCount } = await getPendingData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Pending Players</h1>
        <p className="mt-1 text-sm text-gray-400">
          These names were uploaded but couldn&apos;t be matched to any existing player.
          Map each to an existing player (adds a name correction) or create a new player row.
        </p>
      </div>

      {pendingCount > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
          {pendingCount} unresolved name{pendingCount !== 1 ? "s" : ""} need attention.
        </div>
      )}

      <PendingPlayersManager initialPending={pending} players={players} />
    </div>
  );
}
