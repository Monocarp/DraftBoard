import { createSupabaseServer } from "@/lib/supabase-server";
import { BigBoardEditor } from "./BigBoardEditor";

export default async function AdminBoardsPage() {
  const supabase = await createSupabaseServer();

  const { data: entries } = await supabase
    .from("board_entries")
    .select("id, board_type, rank, player_id, players(slug, name, position, college)")
    .order("rank");

  const boards = {
    consensus: [] as Array<{ id: string; rank: number; playerName: string; position: string | null; college: string | null; slug: string }>,
    bengals: [] as Array<{ id: string; rank: number; playerName: string; position: string | null; college: string | null; slug: string }>,
    expanded: [] as Array<{ id: string; rank: number; playerName: string; position: string | null; college: string | null; slug: string }>,
  };

  for (const e of entries ?? []) {
    const p = e.players as unknown as { slug: string; name: string; position: string | null; college: string | null };
    const entry = {
      id: e.id as string,
      rank: e.rank as number,
      playerName: p.name,
      position: p.position,
      college: p.college,
      slug: p.slug,
    };
    const bt = e.board_type as keyof typeof boards;
    if (boards[bt]) boards[bt].push(entry);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Board Editor</h1>
        <p className="text-sm text-gray-400 mt-1">
          Drag to reorder, search to add, ✕ to remove.{" "}
          <a
            href="/admin/boards/positions"
            className="text-orange-400 hover:text-orange-300 transition-colors"
          >
            Position Boards →
          </a>
        </p>
      </div>

      <BigBoardEditor boards={boards} />
    </div>
  );
}
