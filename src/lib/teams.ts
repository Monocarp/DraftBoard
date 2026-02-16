/**
 * NFL Team name normalization.
 *
 * Mock draft CSVs use inconsistent team names – sometimes the full franchise
 * name ("New York Jets"), sometimes the short nickname ("Jets"), sometimes
 * with a trade indicator like "Dallas Cowboys (Via Packers)".
 *
 * This module provides a canonical mapping and a normalizeTeam() utility
 * that always returns { team: "<Nickname>", tradeNote: "via <Team>" | null }.
 */

// ── Full-name → short nickname ─────────────────────────────────────────────
const FULL_TO_SHORT: Record<string, string> = {
  "arizona cardinals": "Cardinals",
  "atlanta falcons": "Falcons",
  "baltimore ravens": "Ravens",
  "buffalo bills": "Bills",
  "carolina panthers": "Panthers",
  "chicago bears": "Bears",
  "cincinnati bengals": "Bengals",
  "cleveland browns": "Browns",
  "dallas cowboys": "Cowboys",
  "denver broncos": "Broncos",
  "detroit lions": "Lions",
  "green bay packers": "Packers",
  "houston texans": "Texans",
  "indianapolis colts": "Colts",
  "jacksonville jaguars": "Jaguars",
  "kansas city chiefs": "Chiefs",
  "las vegas raiders": "Raiders",
  "los angeles chargers": "Chargers",
  "los angeles rams": "Rams",
  "miami dolphins": "Dolphins",
  "minnesota vikings": "Vikings",
  "new england patriots": "Patriots",
  "new orleans saints": "Saints",
  "new york giants": "Giants",
  "new york jets": "Jets",
  "philadelphia eagles": "Eagles",
  "pittsburgh steelers": "Steelers",
  "san francisco 49ers": "49ers",
  "seattle seahawks": "Seahawks",
  "tampa bay buccaneers": "Buccaneers",
  "tennessee titans": "Titans",
  "washington commanders": "Commanders",
};

// Also build a set of valid short names for quick lookup
const VALID_SHORT_NAMES = new Set(Object.values(FULL_TO_SHORT));

/**
 * Normalize a raw team string from a CSV.
 *
 * Examples:
 *   "New York Jets"                → { team: "Jets",    tradeNote: null }
 *   "Jets"                         → { team: "Jets",    tradeNote: null }
 *   "Dallas Cowboys (Via Packers)" → { team: "Cowboys", tradeNote: "via Packers" }
 *   "Cowboys (via Packers)"        → { team: "Cowboys", tradeNote: "via Packers" }
 *   "Cleveland Browns (via Jaguars)" → { team: "Browns", tradeNote: "via Jaguars" }
 */
export function normalizeTeam(raw: string): { team: string; tradeNote: string | null } {
  if (!raw?.trim()) return { team: "TBD", tradeNote: null };

  let teamPart = raw.trim();
  let tradeNote: string | null = null;

  // Extract parenthetical trade note: "(via Packers)", "(Via Jaguars)", etc.
  const viaMatch = teamPart.match(/\(\s*(via\s+.+?)\s*\)/i);
  if (viaMatch) {
    tradeNote = viaMatch[1].replace(/\s+/g, " ").trim();
    // Normalize casing: "via Packers"
    tradeNote = "via " + tradeNote.slice(4).trim();
    teamPart = teamPart.replace(viaMatch[0], "").trim();

    // The team inside the trade note may also need normalizing
    const noteTeamRaw = tradeNote.slice(4).trim();
    const noteNormalized = resolveShortName(noteTeamRaw);
    tradeNote = `via ${noteNormalized}`;
  }

  const team = resolveShortName(teamPart);
  return { team, tradeNote };
}

/**
 * Resolve a team string (full or short) to its canonical short nickname.
 * Falls through to the original string if unrecognized.
 */
function resolveShortName(input: string): string {
  const trimmed = input.trim();

  // Already a valid short name?
  if (VALID_SHORT_NAMES.has(trimmed)) return trimmed;

  // Check case-insensitively
  for (const name of VALID_SHORT_NAMES) {
    if (name.toLowerCase() === trimmed.toLowerCase()) return name;
  }

  // Full name lookup
  const lower = trimmed.toLowerCase();
  if (FULL_TO_SHORT[lower]) return FULL_TO_SHORT[lower];

  // Partial match: try matching the last word(s) against short names
  // e.g. "NY Jets" → "Jets"
  const words = trimmed.split(/\s+/);
  if (words.length > 1) {
    const lastWord = words[words.length - 1];
    for (const name of VALID_SHORT_NAMES) {
      if (name.toLowerCase() === lastWord.toLowerCase()) return name;
    }
  }

  // Unrecognized – return as-is
  return trimmed;
}

/**
 * Combine a normalized team + trade note back into a display string.
 * e.g. "Cowboys", "via Packers" → "Cowboys (via Packers)"
 */
export function formatTeamWithTrade(team: string, tradeNote: string | null): string {
  if (!tradeNote) return team;
  return `${team} (${tradeNote})`;
}

// ── Source name normalization ──────────────────────────────────────────────

/**
 * Map of common source-name variants → canonical name.
 * Add entries here whenever a source gets uploaded under multiple names.
 */
const SOURCE_ALIASES: Record<string, string> = {
  "nfl.com": "NFL",
  "nfl com": "NFL",
  // Add more as needed, e.g.:
  // "cbs sports": "CBS",
  // "pro football focus": "PFF",
};

/**
 * Normalize a source name entered in the upload form.
 * Strips whitespace, collapses case-insensitive aliases.
 */
export function normalizeSourceName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  return SOURCE_ALIASES[lower] ?? trimmed;
}
