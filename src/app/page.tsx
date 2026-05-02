import { getEnrichedBigBoard, getProfileCount, getUserBoard } from "@/lib/data";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getActiveDraftYear } from "@/lib/draft-year";
import BigBoardPage from "./BigBoardPage";

export const dynamic = "force-dynamic"; // User board requires session — cannot cache

export default async function Home() {
  const [board, profileCount, supabase, draftYear] = await Promise.all([
    getEnrichedBigBoard(),
    getProfileCount(),
    createSupabaseServer(),
    getActiveDraftYear(),
  ]);

  const { data: { user } } = await supabase.auth.getUser();
  const userBoard = user ? await getUserBoard(user.id) : null;

  return (
    <BigBoardPage
      board={board}
      profileCount={profileCount}
      userBoard={userBoard}
      isLoggedIn={!!user}
      draftYear={draftYear}
    />
  );
}
