import "server-only";
import { cookies } from "next/headers";

const COOKIE_NAME = "draft_year";
const DEFAULT_YEAR = 2027;
const VALID_YEARS = [2026, 2027] as const;
export type DraftYear = (typeof VALID_YEARS)[number];

export async function getActiveDraftYear(): Promise<DraftYear> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return (VALID_YEARS as readonly number[]).includes(parsed)
    ? (parsed as DraftYear)
    : DEFAULT_YEAR;
}

/**
 * Page title for <title> / og:title, following the viewer's selected draft year
 * so the browser tab matches the year shown in the nav.
 *   siteTitle()            → "2027 NFL Draft Board"
 *   siteTitle("Rankings")  → "Rankings — 2027 Draft Board"
 */
export async function siteTitle(page?: string): Promise<string> {
  const year = await getActiveDraftYear();
  return page ? `${page} — ${year} Draft Board` : `${year} NFL Draft Board`;
}

export async function setActiveDraftYear(year: DraftYear): Promise<void> {
  "use server";
  const store = await cookies();
  store.set(COOKIE_NAME, String(year), {
    path: "/",
    httpOnly: false, // needs to be readable by client for optimistic toggle
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
