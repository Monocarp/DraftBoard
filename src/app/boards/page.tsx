import { getPositionBoards } from "@/lib/data";
import PositionBoardsView from "./PositionBoardsView";

export const metadata = {
  title: "Position Boards — 2026 Draft Board",
  description: "Positional scouting boards with grades, PFF scores, and analysis.",
};

export default async function PositionBoardsPage() {
  const boards = await getPositionBoards();
  return <PositionBoardsView boards={boards} />;
}
