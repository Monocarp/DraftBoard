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
