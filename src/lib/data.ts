import "server-only";
import path from "path";
import fs from "fs";

// Re-export types so server pages can import everything from @/lib/data
export type {
  BoardPlayer, BigBoard, PlayerIndex, Ranking, Commentary, PlayerProfile,
  MockPick, RankingEntry, ADPEntry, PositionBoardPlayer,
} from "./types";

import type {
  BigBoard, PlayerIndex, PlayerProfile, MockPick, RankingEntry, ADPEntry,
  PositionBoardPlayer,
} from "./types";

// ─── Data Loading ───────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "src", "data");

function loadJSON<T>(filename: string): T {
  const filePath = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export function getBigBoard(): BigBoard {
  return loadJSON<BigBoard>("big_board.json");
}

export function getPlayers(): PlayerIndex[] {
  return loadJSON<PlayerIndex[]>("players.json");
}

export function getPlayerProfile(slug: string): PlayerProfile | null {
  const filePath = path.join(DATA_DIR, "profiles", `${slug}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as PlayerProfile;
}

export function getAllPlayerSlugs(): string[] {
  const profilesDir = path.join(DATA_DIR, "profiles");
  if (!fs.existsSync(profilesDir)) return [];
  return fs
    .readdirSync(profilesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

export function getMocks(): { mocks: Record<string, MockPick[]>; mock_dates: Record<string, string> } {
  return loadJSON<{ mocks: Record<string, MockPick[]>; mock_dates: Record<string, string> }>("mocks.json");
}

export function getRankings(): { players: RankingEntry[]; source_dates: Record<string, string> } {
  return loadJSON<{ players: RankingEntry[]; source_dates: Record<string, string> }>("rankings.json");
}

export function getADP(): { players: ADPEntry[]; source_dates: Record<string, string> } {
  return loadJSON<{ players: ADPEntry[]; source_dates: Record<string, string> }>("adp.json");
}

export function getPositionBoards(): Record<string, PositionBoardPlayer[]> {
  return loadJSON<Record<string, PositionBoardPlayer[]>>("position_boards.json");
}

export function getAges(): Array<{ player: string; slug: string; age_final: string | number | null }> {
  return loadJSON<Array<{ player: string; slug: string; age_final: string | number | null }>>("ages.json");
}

/** Load the big board with year & age enriched from profiles + ages.json. */
export function getEnrichedBigBoard(): BigBoard {
  const board = getBigBoard();
  const ages = getAges();
  const ageMap = new Map(ages.map((a) => [a.slug, a.age_final]));

  const enrich = <T extends { slug: string }>(players: T[]) =>
    players.map((p) => {
      const profile = getPlayerProfile(p.slug);
      return {
        ...p,
        year: profile?.year ?? null,
        age: ageMap.get(p.slug) ?? null,
      };
    });

  return {
    consensus: enrich(board.consensus),
    bengals: enrich(board.bengals),
    expanded: enrich(board.expanded),
  };
}

/** Count of player profile JSON files. */
export function getProfileCount(): number {
  return getAllPlayerSlugs().length;
}
