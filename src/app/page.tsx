import { getEnrichedBigBoard, getProfileCount } from "@/lib/data";
import BigBoardPage from "./BigBoardPage";

export default async function Home() {
  const board = await getEnrichedBigBoard();
  const profileCount = await getProfileCount();
  return <BigBoardPage board={board} profileCount={profileCount} />;
}
