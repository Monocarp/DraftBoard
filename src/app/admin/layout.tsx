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
