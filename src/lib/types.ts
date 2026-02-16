// ─── Types ──────────────────────────────────────────────────────────────────

export interface BoardPlayer {
  rank: number;
  player: string;
  position: string;
  school: string;
  slug: string;
  year?: string | null;
  age?: number | null;
}

export interface ExpandedBoardPlayer extends BoardPlayer {
  grades: Record<string, string | number>;
  ranks: Record<string, string | number>;
  summary: string | null;
}

export interface BigBoard {
  consensus: BoardPlayer[];
  bengals: BoardPlayer[];
  expanded: ExpandedBoardPlayer[];
}

export interface PlayerIndex {
  name: string;
  slug: string;
  position: string | null;
  college: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  year: string | null;
  projected_round: string | null;
  games: number | null;
}

export interface Ranking {
  source: string;
  overall_rank: number | null;
  positional_rank: string | null;
}

export interface Commentary {
  source: string;
  sections: { title: string | null; text: string }[];
}

export interface PlayerProfile {
  name: string;
  slug: string;
  position: string | null;
  college: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  dob: string | null;
  year: string | null;
  projected_round: string | null;
  games: number | null;
  snaps: number | null;
  overview: Record<string, string | null>;
  site_ratings: Record<string, string | null>;
  pff_scores: Record<string, string | null | { value: string | number | null; percentile: number | null }>;
  athletic_scores: Record<string, { result: string | null; grade: string | null }>;
  rankings: Ranking[];
  adp_by_source: Record<string, number | null>;
  projected_round_by_source: Record<string, string | null>;
  player_comps: Record<string, string>;
  strengths: string | null;
  weaknesses: string | null;
  accolades: string | null;
  player_summary: string | null;
  draftbuzz_grades: Record<string, number | null>;
  projected_role: string | null;
  ideal_scheme: string | null;
  alignments: Record<string, { "2025": number | null; career: number | null }>;
  skills_traits: Record<string, { positives: string | null; negatives: string | null }>;
  media_links: { description: string; source?: string; url?: string }[];
  commentary: Commentary[];
  injury_history: { detail: string; recovery_time: string | null; year: string | null }[];
}

export interface MockPick {
  pick: number | null;
  team: string | null;
  player: string | null;
  position: string | null;
  college: string | null;
  slug: string | null;
}

export interface RankingEntry {
  player: string;
  school: string | null;
  position: string | null;
  height: string | null;
  weight: string | null;
  eligibility: string | null;
  athletic_score: string | null;
  source_rankings: Record<string, number | string | null>;
  slug: string;
}

export interface ADPEntry {
  player: string;
  school: string | null;
  position: string | null;
  source_adps: Record<string, number | string | null>;
  consensus_adp: number | null;
  slug: string;
}

export interface PositionBoardPlayer {
  name: string;
  slug: string;
  position: string;
  school: string | null;
  pos_rank: number | null;
  height: string | null;
  weight: string | null;
  age: string | null;
  projected_role: string | null;
  projected_round: string | null;
  grades: Record<string, string | number>;
  pff_scores: Record<string, { value: string | number; percentile: number | null } | string | number>;
  athletic_scores: Record<string, string | number>;
  strengths: string | null;
  weaknesses: string | null;
  overall_rankings: Record<string, string | number>;
  pos_rankings: Record<string, string | number>;
}

// ─── Shared Constants ───────────────────────────────────────────────────────

export const ALL_POSITIONS = [
  "ALL", "QB", "RB", "WR", "TE", "OT", "OG", "C", "ED", "DT", "LB", "CB", "SAF", "K", "P",
] as const;


// ─── Position Colors (safe for client components) ───────────────────────────

/** Map non-standard position abbreviations to their canonical forms. */
const POS_ALIASES: Record<string, string> = {
  // Edge rushers → ED
  EDGE: "ED", DE: "ED", "DE/ED": "ED", "DL/ED": "ED", "LB/ED": "ED",
  DEED: "ED", DLED: "ED", LBED: "ED",
  OLB: "ED", WDE: "ED", SDE: "ED",
  // Interior DL → DT
  IDL: "DT", DI: "DT", DL: "DT", NT: "DT",
  // Backs
  HB: "RB", FB: "RB",
  // Offensive line
  T: "OT", OL: "OT",
  G: "OG", IOL: "OG",
  OC: "C",
  // Linebackers
  ILB: "LB", MLB: "LB",
  // Safeties
  S: "SAF", FS: "SAF", SS: "SAF",
  // Generic secondary
  DB: "CB",
  // Athlete → leave as-is (handled below)
};

export function normalizePosition(pos: string | null): string | null {
  if (!pos) return null;
  const upper = pos.trim().toUpperCase();
  return POS_ALIASES[upper] || upper;
}

export const POSITION_COLORS: Record<string, string> = {
  QB: "bg-red-500/20 text-red-400 border-red-500/30",
  RB: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  WR: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  TE: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  OT: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  OG: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  C: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  ED: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  DT: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  LB: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  CB: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  SAF: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  K: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  P: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  S: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  ATH: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

export function getPositionColor(pos: string | null): string {
  if (!pos) return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  return POSITION_COLORS[pos.toUpperCase()] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
}
