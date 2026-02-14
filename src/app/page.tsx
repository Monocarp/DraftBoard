import { getEnrichedBigBoard, getProfileCount } from "@/lib/data";
import BigBoardPage from "./BigBoardPage";

export default function Home() {
  const board = getEnrichedBigBoard();
  const profileCount = getProfileCount();
  return <BigBoardPage board={board} profileCount={profileCount} />;
}
