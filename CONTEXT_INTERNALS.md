# NFL Draft Board — Module Internals Reference

> **Last Updated:** February 16, 2026
> **Companion to:** [`CONTEXT.md`](CONTEXT.md)
> This document lists function signatures, constant values, and implementation details for all core modules. Consult this before reading source files.

---

## Table of Contents

1. [colors.ts — Unified Color System](#1-colorsts--unified-color-system)
2. [types.ts — Types, Position Constants, Interfaces](#2-typests--types-position-constants-interfaces)
3. [data.ts — Server-Only Data Layer](#3-datats--server-only-data-layer)
4. [actions.ts — Upload/Import Pipeline](#4-actionsts--uploadimport-pipeline)

---

## 1. colors.ts — Unified Color System

**File:** `src/lib/colors.ts` (232 lines)

### Exported Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `getGradeColor` | `(label: string, value: number): string` | Auto-detect scale from label, color by value |
| `getPffColorByPercentile` | `(metric: string, percentile: number): string` | Position board PFF coloring (pre-flipped pct) |
| `getPffColorForProfile` | `(metric: string, percentile: number): string` | Player profile PFF coloring (naive rank pct) |
| `getPffColorByValue` | `(metric: string, value: number): string` | Fallback PFF coloring by raw 0–100 value |
| `getDraftBuzzGradeColor` | `(value: number): string` | DraftBuzz category grade (0–100) |
| `parseGradeValue` | `(raw: unknown): number \| null` | Parse messy grade strings to number |
| `PLAIN` | (constant) `"text-white"` | Re-exported for non-colored text |

### Internal Constants (NOT exported)

```ts
const ELITE = "text-blue-400 font-bold";      // ≥ 90th percentile
const GREAT = "text-green-400 font-semibold";  // ≥ 70th percentile
const GOOD  = "text-yellow-400";               // ≥ 40th percentile
const BELOW = "text-orange-400";               // ≥ 20th percentile
const POOR  = "text-red-400";                  // < 20th percentile
const PLAIN = "text-white";                    // neutral / no color
```

### Internal Function: `colorFromPercentile(pct: number): string`

Canonical mapper — all scale-specific functions normalize to 0–1 then call this:
```
≥ 0.90 → ELITE  |  ≥ 0.70 → GREAT  |  ≥ 0.40 → GOOD  |  ≥ 0.20 → BELOW  |  < 0.20 → POOR
```

### Scale Normalizers (internal)

| Function | Scale | Formula | Used By |
|----------|-------|---------|---------|
| `pct100(v)` | 0–100 | `clamp((v - 60) / 35)` | PFF grades, ESPN, DraftBuzz |
| `pctNfl(v)` | 5.0–7.2 | `clamp((v - 5.8) / 1.4)` | NFL.com |
| `pctGridiron(v)` | 6.0–9.0 | `clamp((v - 6.5) / 2.0)` | Gridiron |
| `pctRivals(v)` | 5.0–6.0 | `clamp((v - 5.5) / 0.5)` | Rivals |
| `pct247(v)` | 80–100 | `clamp((v - 82) / 16)` | 24/7 Sports |
| `pctBleacher(v)` | 6.0–8.0 | `clamp((v - 6.0) / 2.0)` | Bleacher Report |

All clamp to `Math.max(0, Math.min(1, ...))`.

### `getGradeColor` Detection Order

1. `"espn"` → `pct100`
2. `"nfl"` → `pctNfl`
3. `"gridiron"` → `pctGridiron`
4. `"draftbuzz"` or `"draft buzz"` → `pct100`
5. `"rivals"` → `pctRivals`
6. `"24/7"` or `"247"` → `pct247`
7. `"bleacher"` → `pctBleacher`
8. `/grade/i` regex → `pct100` (catches PFF year grades like "24 Grade")
9. `"blk"` or `"block"` → `pct100` (PFF sub-grades)
10. Fallback: value 10–100 → `pct100`; value 5–<10 → `pctNfl`; else → `PLAIN`

### PFF_LOWER_IS_BETTER (complete — 16 members)

```ts
new Set([
  "Comp. %", "Completion %",
  "Passer Rating", "Passer Rating Alwd",
  "Missed Tackles", "Missed Tkl Rate", "Missed Tackle Rate",
  "Pass Rat. All.", "Pass Rating All.",
  "Penalties",
  "Hits Allowed", "Sacks Allowed", "Hurries Allowed", "Pressures Allowed",
  "Drop %",
  "Missed Tkls",
])
```

### PFF_NEUTRAL (complete — 22 members)

```ts
new Set([
  "Dropped Picks",
  "% In Man", "% In Zone",
  "ADORT", "ADOT",
  "TD / INT", "TD Allowed/Ints",
  "Recs/Tgts",
  "Tackles", "Assisted Tackles",
  "TDs", "Touchdowns",
  "Interceptions", "Picks",
  "Forced Incom.",
  "Coverage Stops", "Run Stops",
  "Batted Balls", "Forced Fumbles",
  "Total Pressures",
  "CCR", "Cont. Catch Ratio",
])
```

### PFF Coloring — Three Context Functions

| Function | Input Semantics | Neutral | Lower-is-Better | Higher-is-Better |
|----------|----------------|---------|-----------------|-----------------|
| `getPffColorByPercentile` | 1.0 = best (pre-flipped) | PLAIN | `colorFromPercentile(pct)` | `colorFromPercentile(pct)` |
| `getPffColorForProfile` | 0.0 = highest raw value | PLAIN | `colorFromPercentile(pct)` (0=worst, as-is) | `colorFromPercentile(1-pct)` (0=best, flip) |
| `getPffColorByValue` | Raw 0–100 | PLAIN | `colorFromPercentile(1 - pct100(v))` | `colorFromPercentile(pct100(v))` |

---

## 2. types.ts — Types, Position Constants, Interfaces

**File:** `src/lib/types.ts`

### ALL_POSITIONS

```ts
["ALL", "QB", "RB", "WR", "TE", "OT", "OG", "C", "ED", "DT", "LB", "CB", "SAF", "K", "P"]
```

### POS_ALIASES (complete — 27 mappings)

```ts
const POS_ALIASES: Record<string, string> = {
  // Edge → ED
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
};
```

### POSITION_COLORS (complete — 16 entries)

```ts
export const POSITION_COLORS: Record<string, string> = {
  QB:  "bg-red-500/20 text-red-400 border-red-500/30",
  RB:  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  WR:  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  TE:  "bg-orange-500/20 text-orange-400 border-orange-500/30",
  OT:  "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  OG:  "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  C:   "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  ED:  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  DT:  "bg-pink-500/20 text-pink-400 border-pink-500/30",
  LB:  "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  CB:  "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  SAF: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  K:   "bg-gray-500/20 text-gray-400 border-gray-500/30",
  P:   "bg-gray-500/20 text-gray-400 border-gray-500/30",
  S:   "bg-teal-500/20 text-teal-400 border-teal-500/30",
  ATH: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};
```

### `normalizePosition(pos: string | null): string | null`

```ts
if (!pos) return null;
const upper = pos.trim().toUpperCase();
return POS_ALIASES[upper] || upper;
```

### `getPositionColor(pos: string | null): string`

```ts
if (!pos) return "bg-gray-500/20 text-gray-400 border-gray-500/30";
return POSITION_COLORS[pos.toUpperCase()] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
```

### Exported Interfaces

#### Core Types

```ts
interface BoardPlayer {
  name: string; position: string; college: string; slug: string;
  projected_round: string; rank: number; board_type: string;
}

interface ExpandedBoardPlayer extends BoardPlayer {
  grades: Record<string, number | string>;
  ranks: Record<string, number | string>;
  summary: string;
}

interface PlayerIndex {
  name: string; slug: string; position: string; college: string;
  height: string; weight: string; age: number | string | null;
  year: string; projected_round: string; overview: Record<string, unknown>;
}

interface MockPick {
  source: string; pick_number: number; team: string;
  player_name: string; position: string; college: string; slug: string;
}

interface RankingEntry {
  slug: string; source: string; rank_value: number; position: string;
  position_rank: string | null;
}

interface ADPEntry {
  slug: string; source: string; adp_value: number; position: string;
  player_name: string;
}

interface PositionBoardPlayer {
  name: string; slug: string; position: string; college: string;
  pos_rank: number; position_group: string; strengths: string;
  weaknesses: string; overall_rank: number | string | null;
  pos_rank_avg: number | string | null;
  pff_scores: Record<string, { value: string; percentile: number }>;
  grades: Record<string, number | string>;
  athletic_scores: Record<string, { result: string; grade: string }>;
}
```

#### Player Profile Types

```ts
interface PlayerProfile {
  // Base info
  name: string; slug: string; position: string; college: string;
  height: string; weight: string; age: number | string | null;
  year: string; dob: string;
  // Projections
  projected_round: string; projected_role: string; ideal_scheme: string;
  games: number; snaps: number;
  // Text fields
  strengths: string; weaknesses: string; accolades: string; player_summary: string;
  // JSON columns
  overview: Record<string, unknown>;
  site_ratings: Record<string, string>;
  pff_scores: Record<string, { value: string; percentile: number }>;
  athletic_scores: Record<string, { result: string; grade: string }>;
  draftbuzz_grades: Record<string, number>;
  alignments: Record<string, Record<string, number>>;
  skills_traits: Record<string, { positives: string; negatives: string }>;
  bio_sources: Record<string, Record<string, string>>;
  // Relational data (loaded in parallel)
  comps: Array<{ source: string; comp: string }>;
  projected_rounds: Array<{ source: string; round: string }>;
  rankings: Array<{ source: string; overall_rank: number; positional_rank: number }>;
  commentary: Array<{ source: string; sections: Array<{ title: string; text: string }> }>;
  media_links: Array<{ description: string; source: string; url: string }>;
  injury_history: Array<{ detail: string; recovery_time: string; year: string }>;
}

interface BigBoard {
  consensus: BoardPlayer[];
  bengals: BoardPlayer[];
  expanded: ExpandedBoardPlayer[];
}
```

---

## 3. data.ts — Server-Only Data Layer

**File:** `src/lib/data.ts` (~580 lines)

Import: `import "server-only"` — prevents accidental client-side use.

### Constants

```ts
const HIDDEN_SOURCES = new Set(["Bleacher", "Con", "Premier Con."]);
const CONSENSUS_SOURCES = ["Brugler", "NFL.com", "CBS", "PFF", "ESPN"];
```

### `fetchAll<T>()` — Generic Paginator

```ts
async function fetchAll<T>(
  table: string,
  query: (from: any) => any,
): Promise<T[]>
```

- Pages of 1000 rows using `.range(offset, offset + 999)`
- Loops until page is shorter than 1000 or empty
- **Throws** on Supabase error: `new Error(\`Supabase error (${table}): ...\`)`

### Exported Functions

| Function | Return Type | Notes |
|----------|-------------|-------|
| `getBigBoard()` | `Promise<BigBoard>` | Returns consensus, bengals, expanded boards |
| `getEnrichedBigBoard()` | `Promise<BigBoard>` | Same + joins `ages` table for year/age display |
| `getPlayers()` | `Promise<PlayerIndex[]>` | Profiled players only (`overview != '{}'`) |
| `getPlayerProfile(slug)` | `Promise<PlayerProfile \| null>` | 8 parallel queries (player + 7 relations) with React `cache()` |
| `getAllPlayerSlugs()` | `Promise<string[]>` | All player slugs for admin |
| `getMocks()` | `Promise<{ mocks, mock_dates }>` | Grouped by source, HIDDEN filtered, with source_dates |
| `getRankings()` | `Promise<{ players, source_dates }>` | Filtered from HIDDEN, with ranking source_dates |
| `getADP()` | `Promise<{ players, source_dates }>` | Filtered from HIDDEN, with ADP source_dates |
| `getPositionBoards()` | `Promise<Record<string, PositionBoardPlayer[]>>` | Grouped by position_group, with dynamic ranks + OL metric rename |
| `getAges()` | `Promise<Array<{ player, slug, age_final }>>` | All age records |
| `getProfileCount()` | `Promise<number>` | Count of profiled players |

### `getPlayerProfile()` — Parallel Query Pattern

Loads player row, then runs 7 parallel sub-queries:
```ts
const [comps, projRounds, rankings, commentary, media, injuries, adp] = await Promise.all([
  /* 7 queries, each filtered by player_id, each with error logging */
]);
```
Each sub-query logs `console.error(...)` on failure and falls back to `[]`.

### OL Metric Rename + Percentile Flip

In `getPositionBoards()`, for IOL/OT groups:

```ts
const OL_RENAME: Record<string, string> = {
  "Hits": "Hits Allowed",
  "Sacks": "Sacks Allowed",
  "Hurries": "Hurries Allowed",
  "Pressures": "Pressures Allowed",
};

// For each renamed metric, flip the percentile:
// newPff[newName] = { value, percentile: 1 - originalPercentile }
```

### Position Board Dynamic Rankings

For each position group, fetches `player_rankings` for `CONSENSUS_SOURCES`, then:
- `overall_rank` = average of available `overall_rank` values (rounded to 1 decimal)
- `pos_rank_avg` = average of available `positional_rank` values (rounded to 1 decimal)

### Error Handling Summary

| Function | Error Behavior |
|----------|---------------|
| `fetchAll()` | **Throws** `new Error(...)` |
| `getPlayerProfile()` sub-queries | `console.error(...)`, fallback `[]` |
| `getMocks()` source_dates | `console.error(...)`, empty object fallback |
| `getRankings()` source_dates | `console.error(...)`, empty object fallback |
| `getADP()` source_dates | `console.error(...)`, empty object fallback |
| `getProfileCount()` | `console.error(...)`, returns `0` |
| `getEnrichedBigBoard()` ages | `console.error(...)`, empty map fallback |

---

## 4. actions.ts — Upload/Import Pipeline

**File:** `src/app/admin/upload/actions.ts` (~2,322 lines)

### ImportCaches Interface

```ts
interface ImportCaches {
  playerCache: PlayerCacheEntry[];        // { id, slug, name, compact }
  correctionsCache: Map<string, string>;  // normalizedVariantName → canonicalSlug
}
```

Built fresh per import batch by `buildCaches()`. NOT shared across requests.

### Name Resolution Functions

```ts
function normalizeName(name: string): string    // strip periods, collapse whitespace
function compactSlug(name: string): string       // strip ALL non-alphanumeric
function toSlug(name: string): string            // standard URL slug

async function resolvePlayerId(
  supabase, name, caches, position?, college?
): Promise<string>
// 4 steps: corrections → slug → compact → auto-create
```

### BIO_SOURCE_ALIASES (complete — 13 entries)

```ts
const BIO_SOURCE_ALIASES: Record<string, string> = {
  "pff": "pff",
  "pff scores": "pff",
  "draftbuzz": "draftbuzz",
  "draft buzz": "draftbuzz",
  "nfl.com": "nfl_com",
  "nfl": "nfl_com",
  "nfl_com": "nfl_com",
  "manual": "manual",
  "site_ratings": "site_ratings",
  "site ratings": "site_ratings",
  "cbs": "cbs",
  "cbs sports": "cbs",
  "espn": "espn",
};
```

### DEFAULT_SOURCE_PRIORITY (complete — 6 entries)

```ts
const DEFAULT_SOURCE_PRIORITY: Record<string, number> = {
  manual: 0,
  draftbuzz: 1,
  cbs: 2,
  nfl_com: 2,
  site_ratings: 3,
  pff: 4,
};
```

### Bio Fields (10 total)

```ts
type BioField = "age" | "dob" | "games" | "snaps" | "height" | "weight"
              | "year" | "position" | "college" | "projected_round";
```

### `writeBioSources()` — Priority Resolution

```ts
async function writeBioSources(
  supabase, playerId: string, source: string,
  values: Partial<Record<BioField, string | number | null>>,
  priority?: number
): Promise<void>
```

1. Normalize source key via `BIO_SOURCE_ALIASES`
2. Filter out null/empty/`#N/A` values; `normalizeHeight()` and `normalizeWeight()`
3. Fetch existing `bio_sources` JSONB
4. Merge new values under source key
5. Store priority if explicit
6. **Resolve best value per field**: for each of 10 bio fields, iterate all sources, pick value from highest-priority source (explicit `__priority` > `DEFAULT_SOURCE_PRIORITY` > `0`)
7. Build update payload: `bio_sources` JSON + resolved top-level columns
8. Upsert to `players` table; log error on failure (does not throw)

### `normalizeHeight(raw: string): string`

```
"6'1""  → "6'1""       (already canonical)
"6-1"   → "6'1""       (dash separator)
"6 01"  → "6'1""       (space separator)
73      → "6'1""       (raw inches 60–84 → convert)
other   → as-is
```

### `normalizeWeight(raw: string): string`

```
"215 lbs" → "215"      (strip suffix)
"215.5"   → "216"      (round to integer)
other     → as-is
```

### `normalizeCompName(name: string): string`

- Split on whitespace
- Roman numerals/suffixes (`II`, `III`, `IV`, `V`, `VI`, `VII`, `VIII`, `IX`, `X`, `JR`, `SR`) → keep uppercase
- All-caps words (length > 1, all alpha) → title-case
- Everything else → keep as-is
- Example: `"Bernhard RAIMANN"` → `"Bernhard Raimann"`

### PFF Position Column Templates (12 positions)

| Template Key | Example Metrics (subset) |
|---|---|
| `CB` | Overall Grade, Coverage Grade, Run Def. Grade, Comp. %, Passer Rating, Tackles, etc. |
| `SAF` | Overall Grade, Coverage Grade, Run Def. Grade, Missed Tkl Rate, Tackles, etc. |
| `DT` | Overall Grade, Run Def. Grade, Pass Rush Grade, Total Pressures, Hits, Sacks, etc. |
| `EDGE` | Overall Grade, Run Def. Grade, Pass Rush Grade, Total Pressures, Sacks, Hurries, etc. |
| `LB` | Overall Grade, Coverage Grade, Run Def. Grade, Tackling Grade, Pass Rat. All., etc. |
| `OL` | Overall Grade, Pass Blk Grade, Run Blk Grade, Penalties, Sacks Allowed, etc. |
| `OT` | Overall Grade, Pass Blk Grade, Run Blk Grade, Penalties, Hits Allowed, etc. |
| `IOL` | Overall Grade, Pass Blk Grade, Run Blk Grade, Penalties, Pressures Allowed, etc. |
| `QB` | Overall Grade, Passing Grade, Rushing Grade, Comp. %, Passer Rating, TD / INT, etc. |
| `RB` | Overall Grade, Receiving Grade, Pass Blk Grade, Run Grade, Missed Tkls, etc. |
| `WR` | Overall Grade, Receiving Grade, Route Running, Drop %, Yards/Route, etc. |
| `TE` | Overall Grade, Receiving Grade, Pass Blk Grade, Run Blk Grade, Drop %, etc. |

### Alignment Column Templates (10 positions)

Keys: `CB`, `SAF`, `LB`, `DT`, `EDGE`, `OL`, `OT`, `IOL`, `WR`, `TE`

Each lists snap count columns (e.g., CB: `"Slot"`, `"Wide"`, `"Box"`, `"Free Safety"`).

### DraftBuzz Grade Column Templates (13 positions)

Keys: `CB`, `SAF`, `DT`, `EDGE`, `DL`, `LB`, `OL`, `OT`, `IOL`, `QB`, `RB`, `WR`, `TE`

Each lists ~5–10 position-specific grading categories.

### Mock Import Safety Pattern

```
1. Build ALL new mock_picks rows into array (validate everything)
2. Only after full array built: DELETE existing rows for that source
3. Batch INSERT new rows (100 at a time)
→ If step 1 fails, no data is deleted
```

### Protected Fields (never overwritten by profile importers)

```ts
// NFL profiles, Bleacher profiles, ESPN profiles, TDN profiles:
// NEVER write to: players.strengths, players.weaknesses,
//                 players.player_summary, players.projected_role
```

### Importer → Destination Summary

| Importer | Destinations |
|----------|-------------|
| `importRankings` | `rankings` + `player_rankings` (+ `positional_rankings` if pos_rank) + `source_dates` |
| `importPositionalRankings` | `positional_rankings` + `player_rankings` + `source_dates` |
| `importADP` | `adp_entries` |
| `importMocks` | `mock_picks` + `source_dates` |
| `importBioData` | `bio_sources` JSON → top-level player columns |
| `importSourceDates` | `source_dates` |
| `importPffScores` | `pff_scores` + `alignments` + `overview` + `bio_sources` (age) |
| `importDraftBuzzGrades` | `draftbuzz_grades` + `overview` + `bio_sources` (age, dob, games, snaps) |
| `importAthleticScores` | `athletic_scores` |
| `importSiteRatings` | `site_ratings` + `overview` |
| `importNflProfiles` | `player_rankings` + `site_ratings` + `overview` + `player_comps` + `commentary` + `bio_sources` |
| `importBleacherProfiles` | `player_rankings` + `site_ratings` + `overview` + `player_comps` + `projected_rounds` + `commentary` |
| `importEspnProfiles` | `player_rankings` + `site_ratings` + `overview` + `commentary` (Analysis) |
| `importTdnProfiles` | `player_rankings` + `projected_rounds` + `commentary` (Summary, Strengths, Concerns) |
