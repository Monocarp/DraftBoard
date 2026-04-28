/**
 * College name normalization against the 148-school canonical list.
 *
 * Pipeline (all synchronous — async flushing done by caller):
 *   1. Case-insensitive exact match against CANONICAL_COLLEGES
 *   2. Check collegeCorrections cache (loaded from college_corrections table)
 *   3. Fuzzy token-sort-ratio match
 *      - Score >= 0.88, single unambiguous winner → auto-apply + add to corrections cache
 *      - Score >= 0.88, multiple matches within 0.05 of each other → flag ambiguous
 *      - Score < 0.88 → flag unrecognized
 *   Flagged entries are queued in pendingColleges for later DB flush.
 */

// ─── Canonical list (151 schools) ───────────────────────────────────────────

export const CANONICAL_COLLEGES: string[] = [
  "Air Force",
  "Akron",
  "Alabama",
  "App State",
  "Arizona",
  "Arizona State",
  "Arkansas",
  "Arkansas State",
  "Army",
  "Auburn",
  "Ball State",
  "Baylor",
  "Boise State",
  "Boston College",
  "Bowling Green",
  "Buffalo",
  "BYU",
  "Cal",
  "Central Michigan",
  "Charlotte",
  "Cincinnati",
  "Clemson",
  "Coastal Carolina",
  "Colorado",
  "Colorado State",
  "Delaware",
  "Duke",
  "E. Carolina",
  "E. Mich",
  "FAU",
  "FIU",
  "Florida",
  "Florida State",
  "Fresno State",
  "Georgia",
  "Georgia Southern",
  "Georgia State",
  "Georgia Tech",
  "Hawai'i",
  "Houston",
  "Illinois",
  "Incarnate Word",
  "Indiana",
  "Iowa",
  "Iowa State",
  "Jacksonville State",
  "James Madison",
  "Kansas",
  "Kansas State",
  "Kennesaw State",
  "Kent State",
  "Kentucky",
  "Liberty",
  "Louisiana",
  "Louisiana Tech",
  "Louisville",
  "LSU",
  "Maryland",
  "Marshall",
  "Memphis",
  "Miami (FL)",
  "Miami (OH)",
  "Michigan",
  "Michigan State",
  "Middle Tennessee",
  "Minnesota",
  "Mississippi State",
  "Missouri",
  "Missouri State",
  "Montana",
  "Morgan State",
  "MSU Moorehead",
  "Navy",
  "NC State",
  "Nebraska",
  "Nevada",
  "New Mexico",
  "New Mexico State",
  "North Carolina",
  "North Dakota State",
  "North Texas",
  "Northern Illinois",
  "Northwestern",
  "Notre Dame",
  "Ohio",
  "Ohio State",
  "Oklahoma",
  "Oklahoma State",
  "Old Dominion",
  "Ole Miss",
  "Oregon",
  "Oregon State",
  "Penn State",
  "Pittsburgh",
  "Purdue",
  "Rice",
  "Rutgers",
  "Sacramento State",
  "Sam Houston",
  "San Diego State",
  "San Jose State",
  "Savannah State",
  "SC State",
  "SE Louisiana",
  "Slippery Rock",
  "SMU",
  "South Alabama",
  "South Carolina",
  "Southern Miss",
  "Stanford",
  "Stephen F. Austin",
  "Syracuse",
  "TCU",
  "Temple",
  "Tennessee",
  "Texas",
  "Texas A&M",
  "Texas State",
  "Texas Tech",
  "Toledo",
  "Troy",
  "Tulane",
  "Tulsa",
  "UAB",
  "UCF",
  "UCLA",
  "UConn",
  "ULM",
  "Umass",
  "UNLV",
  "USC",
  "USF",
  "Utah",
  "Utah State",
  "UTEP",
  "UTSA",
  "Vanderbilt",
  "Virginia",
  "Virginia State",
  "Virginia Tech",
  "Wake Forest",
  "Washington",
  "Washington State",
  "Weber State",
  "West Virginia",
  "Western Kentucky",
  "Western Michigan",
  "Wisconsin",
  "Wyoming",
  "Youngstown State",
];

// Pre-computed lowercase set for O(1) exact lookups
const CANONICAL_LOWER = new Map<string, string>(
  CANONICAL_COLLEGES.map((c) => [c.toLowerCase(), c])
);

// ─── String similarity helpers ───────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, n + 1, ...curr);
  }
  return prev[n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Token-sort ratio: sort words alphabetically then compare */
function tokenSortSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .sort()
      .join(" ");
  return similarity(normalize(a), normalize(b));
}

function bestSimilarity(a: string, b: string): number {
  return Math.max(similarity(a.toLowerCase(), b.toLowerCase()), tokenSortSimilarity(a, b));
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type CollegeCorrectionsCache = Map<string, string>; // lowercased variant → canonical
export type PendingCollegesMap = Map<string, string | undefined>; // rawName → source

const AUTO_THRESHOLD = 0.88;
const AMBIGUITY_MARGIN = 0.05;

/**
 * Normalize a raw college name to a canonical form.
 *
 * Returns the canonical name if resolved, or the trimmed raw value if not.
 * Unresolved entries are queued into `pendingColleges` for later DB flush.
 */
export function normalizeCollege(
  raw: string,
  corrections: CollegeCorrectionsCache,
  pendingColleges: PendingCollegesMap,
  source?: string,
): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  // Step 1: Exact case-insensitive match against canonical list
  const exactCanonical = CANONICAL_LOWER.get(trimmed.toLowerCase());
  if (exactCanonical) return exactCanonical;

  // Step 2: Check corrections cache (loaded from college_corrections table)
  const correction = corrections.get(trimmed.toLowerCase());
  if (correction) return correction;

  // Step 3: Fuzzy matching
  const scored = CANONICAL_COLLEGES.map((c) => ({
    canonical: c,
    score: bestSimilarity(trimmed, c),
  })).sort((a, b) => b.score - a.score);

  const top = scored[0];

  if (top.score >= AUTO_THRESHOLD) {
    // Check for ambiguity: any other candidate within AMBIGUITY_MARGIN of top
    const ambiguous = scored.filter(
      (s, i) => i > 0 && top.score - s.score <= AMBIGUITY_MARGIN && s.score >= AUTO_THRESHOLD
    );

    if (ambiguous.length === 0) {
      // Unambiguous — auto-apply and cache so subsequent rows skip fuzzy work
      corrections.set(trimmed.toLowerCase(), top.canonical);
      return top.canonical;
    }
    // Ambiguous (e.g. "Miami" matches both Miami (FL) and Miami (OH)) — flag
    if (!pendingColleges.has(trimmed)) {
      pendingColleges.set(trimmed, source);
    }
    return trimmed;
  }

  // Below threshold — flag as unrecognized
  if (!pendingColleges.has(trimmed)) {
    pendingColleges.set(trimmed, source);
  }
  return trimmed;
}
