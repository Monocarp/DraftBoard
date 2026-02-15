import { getCorrections, ensureCorrectionsTable } from "./actions";
import { createSupabaseServer } from "@/lib/supabase-server";
import { CorrectionsManager } from "./CorrectionsManager";

export const metadata = { title: "Name Corrections — Admin" };

export default async function CorrectionsPage() {
  // Check if table exists
  const tableCheck = await ensureCorrectionsTable();

  if (!tableCheck.exists) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-4">Name Corrections</h1>
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-6">
          <h2 className="text-lg font-semibold text-yellow-400 mb-2">⚠️ Table Setup Required</h2>
          <p className="text-sm text-gray-400 mb-4">
            The <code className="text-yellow-300">name_corrections</code> table needs to be created in Supabase.
          </p>
          <pre className="rounded-lg bg-[#0a0f1a] p-4 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
            {tableCheck.error?.split("\n\n")[1]}
          </pre>
        </div>
      </div>
    );
  }

  // Fetch corrections with player names
  const corrections = await getCorrections();

  // Build a map of slug → player name
  const supabase = await createSupabaseServer();
  const slugs = [...new Set(corrections.map((c) => c.canonical_slug))];
  const playerMap: Record<string, string> = {};

  if (slugs.length > 0) {
    // Fetch in batches of 100
    for (let i = 0; i < slugs.length; i += 100) {
      const batch = slugs.slice(i, i + 100);
      const { data } = await supabase
        .from("players")
        .select("slug, name")
        .in("slug", batch);
      for (const p of data ?? []) {
        playerMap[p.slug] = p.name;
      }
    }
  }

  const enriched = corrections.map((c) => ({
    ...c,
    canonical_name: playerMap[c.canonical_slug] || c.canonical_slug,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Name Corrections</h1>
        <p className="mt-1 text-sm text-gray-400">
          Map variant player names to their canonical version. Applied automatically during data uploads.
        </p>
      </div>

      <CorrectionsManager corrections={enriched} />
    </div>
  );
}
