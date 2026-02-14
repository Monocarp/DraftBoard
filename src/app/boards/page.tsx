import { getPositionBoards } from "@/lib/data";
import PositionBoardsView from "./PositionBoardsView";

export const metadata = {
  title: "Position Boards — 2026 Draft Board",
  description: "Positional scouting boards with grades, PFF scores, and analysis.",
};

export default function PositionBoardsPage() {
  const boards = getPositionBoards();
  return <PositionBoardsView boards={boards} />;
}
