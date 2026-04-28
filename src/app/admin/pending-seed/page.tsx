import { getPendingSeedData } from "./actions";
import { PendingSeedManager } from "./PendingSeedManager";

export const revalidate = 0;

export default async function PendingSeedPage() {
  const { pending, players, pendingCount } = await getPendingSeedData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Pending Seed Players</h1>
        <p className="mt-1 text-sm text-gray-400">
          These 2027 players couldn&apos;t be auto-seeded due to duplicate names. Create each as
          a new player (rename to break the slug conflict) or map to an existing 2027 player.
        </p>
      </div>

      {pendingCount > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
          {pendingCount} unresolved player{pendingCount !== 1 ? "s" : ""} need attention.
        </div>
      )}

      <PendingSeedManager initialPending={pending} players={players} />
    </div>
  );
}
