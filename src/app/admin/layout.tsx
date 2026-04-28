import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase-server";
import { LogoutButton } from "./LogoutButton";

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
  let pendingCount = 0;
  try {
    const { count } = await supabase
      .from("pending_players")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    pendingCount = count ?? 0;
  } catch { /* table may not exist yet */ }

  let pendingCollegesCount = 0;
  try {
    const { count } = await supabase
      .from("pending_colleges")
      .select("id", { count: "exact", head: true });
    pendingCollegesCount = count ?? 0;
  } catch { /* table may not exist yet */ }

  let pendingSeedCount = 0;
  try {
    const { count } = await supabase
      .from("pending_seed_players")
      .select("id", { count: "exact", head: true });
    pendingSeedCount = count ?? 0;
  } catch { /* table may not exist yet */ }

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      {/* Admin top bar */}
      <nav className="sticky top-0 z-50 border-b border-[#2a3a4e] bg-[#0d1320]/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin" className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 font-bold text-white text-xs">
                  DB
                </div>
                <span className="text-base font-bold text-white">Admin</span>
              </Link>

              <div className="hidden sm:flex items-center gap-1 ml-4">
                <Link
                  href="/admin"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Players
                </Link>
                <Link
                  href="/admin/boards"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Boards
                </Link>
                <Link
                  href="/admin/upload"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Upload
                </Link>
                <Link
                  href="/admin/corrections"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Corrections
                </Link>
                <Link
                  href="/admin/positions"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Positions
                </Link>
                <Link
                  href="/admin/dates"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Dates
                </Link>
                <Link
                  href="/admin/priorities"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Priorities
                </Link>
                <Link
                  href="/admin/colors"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Colors
                </Link>
                <Link
                  href="/admin/cleanup"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cleanup
                </Link>
                <Link
                  href="/admin/walter-football"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Walter&nbsp;Football
                </Link>
                <Link
                  href="/admin/pending-players"
                  className="relative px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Pending
                  {pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-500 px-1 text-[10px] font-bold text-black">
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/admin/college-review"
                  className="relative px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Colleges
                  {pendingCollegesCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-500 px-1 text-[10px] font-bold text-black">
                      {pendingCollegesCount > 99 ? "99+" : pendingCollegesCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/admin/pending-seed"
                  className="relative px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Seed
                  {pendingSeedCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-500 px-1 text-[10px] font-bold text-black">
                      {pendingSeedCount > 99 ? "99+" : pendingSeedCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/admin/updates"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Updates
                </Link>
                <Link
                  href="/"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  ← Back to Site
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 hidden sm:block">{user.email}</span>
              <LogoutButton />
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
