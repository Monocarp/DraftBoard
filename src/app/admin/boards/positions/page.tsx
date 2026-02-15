import { createSupabaseServer } from "@/lib/supabase-server";
import { PositionBoardEditor } from "./PositionBoardEditor";

export default async function AdminPositionBoardsPage() {
  const supabase = await createSupabaseServer();

  const { data: entries } = await supabase
    .from("position_board_entries")
    .select("id, position_group, pos_rank, player_id, players(slug, name, position, college)")
    .order("pos_rank");

  const groups: Record<string, Array<{
    id: string;
    rank: number;
    playerName: string;
    position: string | null;
    college: string | null;
    slug: string;
  }>> = {};

  for (const e of entries ?? []) {
    const p = e.players as unknown as { slug: string; name: string; position: string | null; college: string | null };
    const group = e.position_group as string;
    if (!groups[group]) groups[group] = [];
    groups[group].push({
      id: e.id as string,
      rank: e.pos_rank as number,
      playerName: p.name,
      position: p.position,
      college: p.college,
      slug: p.slug,
    });
  }

  // Sort group keys in a sensible order
  const groupOrder = ["QB", "RB", "WR", "TE", "OT", "IOL", "ED", "DT", "LB", "CB", "SAF"];
  const sortedGroupNames = Object.keys(groups).sort((a, b) => {
    const ai = groupOrder.indexOf(a);
    const bi = groupOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Position Board Editor</h1>
        <p className="text-sm text-gray-400 mt-1">
          Drag to reorder within each position group.{" "}
          <a
            href="/admin/boards"
            className="text-orange-400 hover:text-orange-300 transition-colors"
          >
            ← Big Boards
          </a>
        </p>
      </div>

      <PositionBoardEditor groups={groups} groupOrder={sortedGroupNames} />
    </div>
  );
}
