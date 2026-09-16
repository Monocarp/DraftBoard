"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";

export interface AdminBadgeCounts {
  pendingPlayers: number;
  pendingColleges: number;
  pendingSeed: number;
  podcastReview: number;
}

interface NavItem {
  href: string;
  label: string;
  badge?: keyof AdminBadgeCounts;
  /** Extra path prefixes that should also highlight this item. */
  matches?: string[];
}

// Grouped by task. Queues with badges sit together at the top so anything
// waiting on you is visible at a glance.
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Needs attention",
    items: [
      { href: "/admin/pending-players", label: "Pending players", badge: "pendingPlayers" },
      { href: "/admin/college-review", label: "Colleges", badge: "pendingColleges" },
      { href: "/admin/pending-seed", label: "Seed conflicts", badge: "pendingSeed" },
      { href: "/admin/podcasts", label: "Podcasts", badge: "podcastReview" },
    ],
  },
  {
    title: "Import data",
    items: [
      { href: "/admin/upload", label: "Upload" },
      { href: "/admin/walter-football", label: "Walter Football" },
      { href: "/admin/draftbuzz", label: "DraftBuzz" },
    ],
  },
  {
    title: "Players & boards",
    items: [
      { href: "/admin", label: "Players", matches: ["/admin/player"] },
      { href: "/admin/boards", label: "Boards" },
    ],
  },
  {
    title: "Data quality",
    items: [
      { href: "/admin/corrections", label: "Corrections" },
      { href: "/admin/positions", label: "Positions" },
      { href: "/admin/cleanup", label: "Cleanup" },
      { href: "/admin/dates", label: "Dates" },
      { href: "/admin/priorities", label: "Priorities" },
    ],
  },
  {
    title: "Site",
    items: [
      { href: "/admin/updates", label: "Updates" },
      { href: "/admin/colors", label: "Colors" },
    ],
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  // "/admin" is a prefix of every admin route, so it only matches exactly.
  if (item.href === "/admin") {
    return pathname === "/admin" || (item.matches ?? []).some((m) => pathname === m || pathname.startsWith(m + "/"));
  }
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function NavLinks({ counts, onNavigate }: { counts: AdminBadgeCounts; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-3.5">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-3 mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{group.title}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              const count = item.badge ? counts[item.badge] : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1 text-sm transition-colors ${
                      active
                        ? "bg-orange-500/10 text-white font-medium"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <span>{item.label}</span>
                    {count > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-500 px-1.5 text-[11px] font-bold text-black">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="border-t border-[#2a3a4e] pt-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="block rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          ← Back to site
        </Link>
      </div>
    </nav>
  );
}

function Account({ email }: { email: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 truncate text-xs text-gray-500" title={email}>{email}</p>
      <div className="shrink-0"><LogoutButton /></div>
    </div>
  );
}

/**
 * Admin navigation. Renders inside the root layout, which already provides the
 * public site nav (sticky, 64px) and a centered max-w-7xl column — so this is a
 * column beside the page content, not a full-height fixed panel.
 *   • xl (1280px) and up: sidebar that sticks below the site nav and scrolls on its own.
 *   • below xl: an "Admin menu" button that opens a slide-out drawer, so smaller
 *     laptops keep full-width content.
 */
export function AdminSidebar({ counts, email }: { counts: AdminBadgeCounts; email: string }) {
  const [open, setOpen] = useState(false);
  const waiting = counts.pendingPlayers + counts.pendingColleges + counts.pendingSeed + counts.podcastReview;

  // Links close the drawer themselves (onNavigate); Escape closes it too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Below xl: menu button above the page content */}
      <div className="xl:hidden mb-5">
        <button
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Admin menu
          {waiting > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-500 px-1.5 text-[11px] font-bold text-black">
              {waiting > 99 ? "99+" : waiting}
            </span>
          )}
        </button>
      </div>

      {/* xl and up: sticky sidebar column. The <aside> stretches to the page height
          (parent is a non-aligned flex row) so the inner panel can stick while scrolling. */}
      <aside className="hidden xl:block w-56 shrink-0" aria-label="Admin navigation">
        <div className="sticky top-[5.5rem] flex max-h-[calc(100vh-6rem)] flex-col rounded-xl border border-[#2a3a4e] bg-[#0d1320]">
          <p className="shrink-0 border-b border-[#2a3a4e] px-4 py-2.5 text-sm font-bold text-white">Admin</p>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            <NavLinks counts={counts} />
          </div>
          <div className="shrink-0 border-t border-[#2a3a4e] px-4 py-3">
            <Account email={email} />
          </div>
        </div>
      </aside>

      {/* Drawer (below xl). z-[60] sits above the site nav (z-50). */}
      {open && (
        <div className="xl:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Admin menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-[#2a3a4e] bg-[#0d1320]">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#2a3a4e] px-4">
              <span className="text-base font-bold text-white">Admin</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close admin menu"
                className="rounded-lg p-2 text-gray-400 hover:text-white hover:bg-white/5"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              <NavLinks counts={counts} onNavigate={() => setOpen(false)} />
            </div>
            <div className="shrink-0 border-t border-[#2a3a4e] px-4 py-4">
              <Account email={email} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
