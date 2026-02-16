import { getEnrichedBigBoard, getProfileCount, getUserBoard } from "@/lib/data";
import { createSupabaseServer } from "@/lib/supabase-server";
import BigBoardPage from "./BigBoardPage";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [board, profileCount, supabase] = await Promise.all([
    getEnrichedBigBoard(),
    getProfileCount(),
    createSupabaseServer(),
  ]);

  const { data: { user } } = await supabase.auth.getUser();
  const userBoard = user ? await getUserBoard(user.id) : null;

  return (
    <BigBoardPage
      board={board}
      profileCount={profileCount}
      userBoard={userBoard}
      isLoggedIn={!!user}
    />
  );
}
