import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";
import { AdminSidebar } from "./AdminSidebar";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  // If not authenticated, render children bare (login page).
  // Middleware already handles redirects for protected routes.
  if (!user) {
    return <>{children}</>;
  }

  // Pending players count for nav badge (best-effort — ignore if table doesn't exist yet)
  const db = createServiceClient();
  let pendingCount = 0;
  try {
    const { count } = await db
      .from("pending_players")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    pendingCount = count ?? 0;
  } catch { /* table may not exist yet */ }

  let pendingCollegesCount = 0;
  try {
    const { count } = await db
      .from("pending_colleges")
      .select("id", { count: "exact", head: true });
    pendingCollegesCount = count ?? 0;
  } catch { /* table may not exist yet */ }

  let pendingSeedCount = 0;
  try {
    const { count } = await db
      .from("pending_seed_players")
      .select("id", { count: "exact", head: true });
    pendingSeedCount = count ?? 0;
  } catch { /* table may not exist yet */ }

  // Podcast extracts awaiting review or publishing
  let podcastReviewCount = 0;
  try {
    const { count } = await db
      .from("podcast_extracts")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "approved"]);
    podcastReviewCount = count ?? 0;
  } catch { /* table may not exist yet */ }

  // The root layout already renders the site nav and a centered max-w-7xl <main>;
  // this adds the admin sidebar as a column beside the page. On xl screens the row
  // widens past that column (up to 96rem, 1.5rem from the viewport edges) so the
  // sidebar doesn't eat into page width. Negative margins rather than a transform,
  // so position: fixed dialogs inside admin pages still anchor to the viewport.
  return (
    <div className="xl:flex xl:gap-8 xl:mx-[calc(50%_-_min(50vw_-_1.5rem,48rem))]">
      <AdminSidebar
        email={user.email ?? ""}
        counts={{
          pendingPlayers: pendingCount,
          pendingColleges: pendingCollegesCount,
          pendingSeed: pendingSeedCount,
          podcastReview: podcastReviewCount,
        }}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
