import { getPositionBoards, getUserPositionRanks } from "@/lib/data";
import { createSupabaseServer } from "@/lib/supabase-server";
import PositionBoardsView from "./PositionBoardsView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Position Boards — 2026 Draft Board",
  description: "Positional scouting boards with grades, PFF scores, and analysis.",
};

export default async function PositionBoardsPage() {
  const [boards, supabase] = await Promise.all([
    getPositionBoards(),
    createSupabaseServer(),
  ]);

  const { data: { user } } = await supabase.auth.getUser();
  const userRanks = user ? await getUserPositionRanks(user.id) : null;

  return (
    <PositionBoardsView
      boards={boards}
      userRanks={userRanks}
      isLoggedIn={!!user}
    />
  );
}
