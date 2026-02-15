import { createSupabaseServer } from "@/lib/supabase-server";
import { UploadManager } from "./UploadManager";

export const metadata = { title: "Upload Data — Admin" };

export default async function UploadPage() {
  const supabase = await createSupabaseServer();

  // Pre-fetch existing source counts per data type for the overview
  const [
    { count: rankingsCount },
    { count: posRankingsCount },
    { count: adpCount },
    { count: mocksCount },
    { count: playerRankingsCount },
    { count: sourceDatesCount },
  ] = await Promise.all([
    supabase.from("rankings").select("id", { count: "exact", head: true }),
    supabase.from("positional_rankings").select("id", { count: "exact", head: true }),
    supabase.from("adp_entries").select("id", { count: "exact", head: true }),
    supabase.from("mock_picks").select("id", { count: "exact", head: true }),
    supabase.from("player_rankings").select("id", { count: "exact", head: true }),
    supabase.from("source_dates").select("id", { count: "exact", head: true }),
  ]);

  const stats = {
    rankings: rankingsCount ?? 0,
    positional_rankings: posRankingsCount ?? 0,
    adp: adpCount ?? 0,
    mocks: mocksCount ?? 0,
    player_rankings: playerRankingsCount ?? 0,
    source_dates: sourceDatesCount ?? 0,
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Upload Data</h1>
        <p className="mt-1 text-sm text-gray-400">
          Import rankings, ADP, mocks, and other data from CSV or Excel files.
        </p>
      </div>

      {/* Current data overview */}
      <div className="mb-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Rankings", count: stats.rankings, color: "text-blue-400" },
          { label: "Pos. Rankings", count: stats.positional_rankings, color: "text-purple-400" },
          { label: "ADP", count: stats.adp, color: "text-green-400" },
          { label: "Mocks", count: stats.mocks, color: "text-orange-400" },
          { label: "Player Rankings", count: stats.player_rankings, color: "text-cyan-400" },
          { label: "Source Dates", count: stats.source_dates, color: "text-yellow-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-4">
            <div className={`text-2xl font-bold ${s.color}`}>{s.count.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <UploadManager />
    </div>
  );
}
