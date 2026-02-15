import { createSupabaseServer } from "@/lib/supabase-server";
import { AdminPlayerList } from "./AdminPlayerList";

export default async function AdminPage() {
  const supabase = await createSupabaseServer();

  const { data: players } = await supabase
    .from("players")
    .select("id, name, slug, position, college, year, projected_round, overview")
    .order("name");

  // Mark which players have profiles (non-empty overview)
  const playerList = (players ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    slug: p.slug as string,
    position: (p.position as string) ?? null,
    college: (p.college as string) ?? null,
    year: (p.year as string) ?? null,
    projected_round: (p.projected_round as string) ?? null,
    hasProfile: p.overview != null && JSON.stringify(p.overview) !== "{}",
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Player Management</h1>
          <p className="text-sm text-gray-400 mt-1">
            {playerList.length} players · {playerList.filter((p) => p.hasProfile).length} with profiles
          </p>
        </div>
        <a
          href="/admin/player/new"
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 transition-colors"
        >
          + New Player
        </a>
      </div>

      <AdminPlayerList players={playerList} />
    </div>
  );
}
