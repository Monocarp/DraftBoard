"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutUser } from "@/app/(auth)/actions";

const NAV_ITEMS = [
  { href: "/", label: "Big Board" },
  { href: "/boards", label: "Position Boards" },
  { href: "/rankings", label: "Rankings" },
  { href: "/mocks", label: "Mock Drafts" },
  { href: "/players", label: "All Players" },
];

export default function Navigation({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-[#2a3a4e] bg-[#0d1320]/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 font-bold text-white text-sm">
              DB
            </div>
            <div>
              <span className="text-lg font-bold text-white">2026 Draft Board</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-orange-500/15 text-orange-400"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {/* Admin link */}
            <Link
              href="/admin"
              className={`ml-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                pathname.startsWith("/admin")
                  ? "border-orange-500/40 bg-orange-500/15 text-orange-400"
                  : "border-[#2a3a4e] text-gray-500 hover:text-gray-300 hover:border-gray-500"
              }`}
            >
              Admin
            </Link>

            {/* User auth */}
            {userEmail ? (
              <div className="ml-2 flex items-center gap-2">
                <span className="text-xs text-gray-500 max-w-[120px] truncate" title={userEmail}>{userEmail}</span>
                <button
                  onClick={() => logoutUser()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white border border-[#2a3a4e] hover:border-gray-500 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="ml-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white border border-[#2a3a4e] hover:border-orange-500/50 transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="sm:hidden p-2 text-gray-400 hover:text-white"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="sm:hidden pb-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-4 py-2 rounded-lg text-sm font-medium ${
                    isActive
                      ? "bg-orange-500/15 text-orange-400"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            <div className="border-t border-[#2a3a4e] mt-2 pt-2">
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className={`block px-4 py-2 rounded-lg text-sm font-medium ${
                  pathname.startsWith("/admin")
                    ? "bg-orange-500/15 text-orange-400"
                    : "text-gray-500 hover:text-white"
                }`}
              >
                Admin
              </Link>

              {userEmail ? (
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="text-xs text-gray-500 truncate max-w-[180px]" title={userEmail}>{userEmail}</span>
                  <button
                    onClick={() => { setMobileOpen(false); logoutUser(); }}
                    className="text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
