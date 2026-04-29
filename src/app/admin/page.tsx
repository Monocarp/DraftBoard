import { createClient } from "@supabase/supabase-js";
import { AdminPlayerList } from "./AdminPlayerList";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const draftYear = year === "2027" ? 2027 : 2026;

  const db = createServiceClient();

  // Paginate through all players for the selected draft year
  const allPlayers: Record<string, unknown>[] = [];
  let page = 0;
  while (true) {
    const { data } = await db
      .from("players")
      .select("id, name, slug, position, college, year, projected_round, overview, draft_year")
      .eq("draft_year", draftYear)
      .order("name")
      .range(page * 1000, page * 1000 + 999);
    if (!data || data.length === 0) break;
    allPlayers.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  // Mark which players have profiles (non-empty overview)
  const playerList = allPlayers.map((p) => ({
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

      {/* Draft year tabs */}
      <div className="flex gap-1 rounded-lg border border-[#2a3a4e] bg-[#0d1320] p-1 w-fit mb-5">
        {[2026, 2027].map((y) => (
          <a
            key={y}
            href={`/admin?year=${y}`}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              draftYear === y
                ? "bg-orange-500/20 text-orange-400"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {y}
          </a>
        ))}
      </div>

      <AdminPlayerList players={playerList} />
    </div>
  );
}
