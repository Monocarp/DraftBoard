# NFL Draft Board — Complete Technical Context

> **Last Updated:** May 1, 2026
> **Repository:** https://github.com/Monocarp/DraftBoard
> **Live Site:** Auto-deploys to Vercel on push to `main`
> **Supabase Project:** https://cmapsylsrsglhfdwquwe.supabase.co

This is the single source of truth for understanding the codebase. It replaces both the old `CONTEXT.md` and `CONTEXT_INTERNALS.md`.

---

## Table of Contents

1. [Stack & Architecture](#1-stack--architecture)
2. [Project Structure](#2-project-structure)
3. [Database Schema](#3-database-schema)
4. [Data Flow Overview](#4-data-flow-overview)
5. [Player Lifecycle](#5-player-lifecycle)
6. [Bio Data & Source Priority](#6-bio-data--source-priority)
7. [Name Resolution Pipeline](#7-name-resolution-pipeline)
8. [Data Import System](#8-data-import-system)
9. [Profile & Skills System](#9-profile--skills-system)
10. [AI Commentary Analysis](#10-ai-commentary-analysis)
11. [Unified Color System](#11-unified-color-system)
12. [Source Tiers & Consensus Formula](#12-source-tiers--consensus-formula)
13. [Public-Facing Pages](#13-public-facing-pages)
14. [Admin Backend](#14-admin-backend)
15. [Shared Components](#15-shared-components)
16. [Authentication & Middleware](#16-authentication--middleware)
17. [Key Concepts & Gotchas](#17-key-concepts--gotchas)
18. [Environment & Deployment](#18-environment--deployment)
19. [Dependencies](#19-dependencies)
20. [Operations Guide](#20-operations-guide)

---

## 1. Stack & Architecture

| Layer | Technology | Version |
|---|---|---|
| **Framework** | Next.js (App Router) | 16.1.6 |
| **Language** | TypeScript | 5 |
| **UI** | React + Tailwind CSS | 19.2.3 / v4 |
| **Database** | Supabase (PostgreSQL) | — |
| **Auth** | Supabase Auth (email/password) | — |
| **AI Analysis** | Anthropic Claude Haiku (`claude-haiku-4-5`) | SDK 0.39.0 |
| **Hosting** | Vercel (auto-deploy from GitHub `main`) | — |
| **Drag & Drop** | @dnd-kit/core + @dnd-kit/sortable | 6.3.1 / 10.0.0 |
| **File Parsing** | PapaParse (CSV/TSV), SheetJS/xlsx (Excel) | 5.5.3 / 0.18.5 |
| **Analytics** | @vercel/analytics | 1.6.1 |

### Core Architecture Pattern

```
 CSV/XLSX Upload (admin)
        │
        ▼
 ┌─────────────────────┐
 │  Name Resolution    │  resolvePlayerId() → 5-step pipeline
 │  (upload/actions.ts)│
 └──────────┬──────────┘
            │
            ▼
 ┌─────────────────────┐
 │  Supabase           │  PostgreSQL — source of truth
 │  (22 tables)        │
 └──────────┬──────────┘
            │
            ▼
 ┌─────────────────────┐
 │  lib/data.ts        │  server-only read layer (import "server-only")
 └──────────┬──────────┘
            │
            ▼
 ┌─────────────────────┐
 │  page.tsx (Server)  │  fetches data, passes as props
 └──────────┬──────────┘
            │
            ▼
 ┌─────────────────────┐
 │  *View.tsx (Client) │  "use client" — handles all interactivity
 └─────────────────────┘
```

### Critical Architecture Rules

- **`lib/data.ts`** has `import "server-only"` — NEVER import from a `"use client"` component.
- **`lib/types.ts`** is client-safe — all TypeScript interfaces live here. Client components import only from `@/lib/types`.
- **Three Supabase clients:**

| File | Usage | Auth |
|---|---|---|
| `src/lib/supabase.ts` | Server data reads (`data.ts` public queries) | Anon key, no cookies |
| `src/lib/supabase-server.ts` | Server actions + user queries (auth-aware) | Anon key + cookies |
| `src/lib/supabase-browser.ts` | Client components (login form) | Anon key + browser cookies |

- **Admin actions** require `user.email === process.env.ADMIN_EMAIL` — checked at the top of every server action.
- **User data** (`user_boards`, `user_position_ranks`) MUST use `createSupabaseServer()` — plain client has no session, RLS returns zero rows.
- `next.config.ts` sets `experimental.serverActions.bodySizeLimit = "10mb"` for large uploads.

---

## 2. Project Structure

```
src/
├── lib/
│   ├── types.ts                  # ALL TypeScript interfaces + constants (client-safe)
│   │                             #   → RANKING_SOURCES (14), BIO_SOURCES (14), SOURCE_WEIGHTS
│   │                             #   → POSITION_COLORS, POS_ALIASES, normalizePosition()
│   ├── data.ts                   # Read-only data layer (server-only)
│   │                             #   → fetchAll(), HIDDEN_SOURCES, CONSENSUS_SOURCES
│   ├── colors.ts                 # Unified scale-aware color system (grades, PFF, DraftBuzz)
│   ├── normalize-college.ts      # College name normalization + CANONICAL_COLLEGES (151 schools)
│   ├── position-templates.ts     # Position-based skills_traits + draftbuzz_grades templates
│   │                             #   → POSITION_TEMPLATES, resolveTemplate(), SKILLS_TRAITS_TEMPLATE
│   ├── supabase.ts               # Supabase client (public reads)
│   ├── supabase-server.ts        # Supabase client (cookie/session-aware)
│   └── supabase-browser.ts       # Supabase client (browser)
│
├── components/
│   ├── Navigation.tsx            # Sticky top nav, auth state, mobile hamburger
│   ├── BoardTable.tsx            # Ranked table with search + position filter
│   ├── ExpandedBoardTable.tsx    # Expandable rows: grades, ranks, summary
│   ├── PlayerGrid.tsx            # Card grid with search + position filter
│   ├── PositionBadge.tsx         # Color-coded position pill (via types.ts)
│   └── UserBoardEditor.tsx       # Personal board: search/add, drag-to-reorder, remove
│
└── app/
    ├── layout.tsx                # Root layout (Inter font, dark theme, nav, analytics, PWA)
    ├── page.tsx                  # Home — Big Board (force-dynamic)
    ├── BigBoardPage.tsx          # Client: Bengals/Consensus/Expanded/My Board tabs
    ├── globals.css               # Global styles + Tailwind base
    │
    ├── players/page.tsx          # Players index (profiled players only)
    ├── boards/
    │   ├── page.tsx              # Server → PositionBoardsView (revalidate=3600)
    │   └── PositionBoardsView.tsx
    ├── rankings/
    │   ├── page.tsx              # Server → RankingsView (revalidate=3600)
    │   └── RankingsView.tsx
    ├── mocks/
    │   ├── page.tsx              # Server → MockDraftsView (revalidate=3600)
    │   └── MockDraftsView.tsx
    ├── player/[slug]/
    │   ├── page.tsx              # SSR profile, force-dynamic, detects isAdmin
    │   ├── PlayerDetailView.tsx  # Client: Overview + Scouting tabs; AI Analyze buttons (admin)
    │   └── not-found.tsx         # "Profile In Progress" placeholder
    │
    ├── (auth)/
    │   ├── actions.ts            # loginUser, registerUser, logoutUser
    │   ├── login/page.tsx
    │   └── register/page.tsx
    │
    ├── user-board/
    │   └── actions.ts            # User board CRUD (all RLS-protected)
    │
    └── admin/
        ├── layout.tsx            # Admin chrome: nav tabs, badge counts, sign out
        ├── page.tsx              # Player list (search, profile filter, quick actions)
        ├── AdminPlayerList.tsx
        ├── actions.ts            # Login/logout
        ├── LogoutButton.tsx
        ├── login/page.tsx
        │
        ├── player/               # Player CRUD
        │   ├── actions.ts        # savePlayer, deletePlayer, createProfile (template seeding)
        │   ├── analyzeCommentary.ts  # AI analysis server action (Claude Haiku)
        │   ├── PlayerEditorForm.tsx  # 14-field form + 6 JSON textareas + validation
        │   ├── SkillsTraitsEditor.tsx  # Skills/traits card editor (auto-resize textareas)
        │   ├── [slug]/page.tsx
        │   └── new/page.tsx
        │
        ├── upload/               # Data Import System
        │   ├── page.tsx
        │   ├── actions.ts        # 16 importer functions + helpers (~2,700 lines)
        │   └── UploadManager.tsx # 5-step wizard (16 data types, 10MB limit)
        │
        ├── boards/               # Board Editor
        │   ├── page.tsx, actions.ts, BigBoardEditor.tsx, SortableBoardEditor.tsx
        │   └── positions/
        │       └── page.tsx, PositionBoardEditor.tsx
        │
        ├── corrections/          # Name Corrections (variant → canonical slug)
        │   └── page.tsx, actions.ts, CorrectionsManager.tsx
        ├── positions/            # Position Audit (non-canonical position strings)
        │   └── page.tsx, PositionAudit.tsx
        ├── dates/                # Source Date Management
        │   └── page.tsx, actions.ts, SourceDatesManager.tsx
        ├── priorities/           # Bio Source Priority Manager
        │   └── page.tsx, PriorityManager.tsx
        ├── colors/page.tsx       # Static color system reference
        ├── cleanup/              # Data Cleanup (2 tabs)
        │   ├── page.tsx, CleanupTabs.tsx
        │   ├── CleanupManager.tsx    # Tab 1: players with missing pos/college
        │   ├── SchoolAuditTab.tsx    # Tab 2: non-canonical school names
        │   └── actions.ts
        ├── college-review/       # Pending college name approvals (badge count)
        │   └── page.tsx, actions.ts, CollegeReviewManager.tsx
        ├── pending-players/      # Unresolved upload names (badge count)
        │   └── page.tsx, actions.ts, PendingPlayersManager.tsx
        ├── pending-seed/         # 2027 player slug conflict queue (badge count)
        │   └── page.tsx, actions.ts, PendingSeedManager.tsx
        ├── walter-football/      # Walter Football scraper trigger
        │   └── page.tsx, actions.ts, WalterFootballManager.tsx
        └── updates/              # Site update log
            └── page.tsx, actions.ts, UpdatesManager.tsx
```

---

## 3. Database Schema

### `players` — Central Table

Every player has exactly one row. The `overview` column gates public visibility.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Auto-generated |
| `name` | text | Full display name (diacritics preserved) |
| `slug` | text (unique) | URL-friendly identifier, e.g. `cam-ward` |
| `position` | text | Canonical abbreviation (QB, WR, ED, CB, OT, OG, C, DT, LB, SAF, RB, TE, K, P) |
| `college` | text | Canonical school name from `CANONICAL_COLLEGES` |
| `height` | text | e.g. `6'2"` |
| `weight` | text | e.g. `215` |
| `age` | numeric | Current age |
| `dob` | text | Date of birth |
| `year` | text | Eligibility (Jr, Sr, rSr, 5th, etc.) |
| `projected_round` | text | e.g. `1`, `2`, `3-4` |
| `projected_role` | text | **Manually authored — NEVER overwritten by imports** |
| `ideal_scheme` | text | e.g. `Zone`, `Power` |
| `games` | integer | College games played |
| `snaps` | integer | College snap count |
| `strengths` | text | **Manually authored — NEVER overwritten by imports** |
| `weaknesses` | text | **Manually authored — NEVER overwritten by imports** |
| `accolades` | text | Awards, honors |
| `player_summary` | text | **Manually authored — NEVER overwritten by imports** |
| **`overview`** | **jsonb** | **Profile visibility gate** — player is public iff `overview != '{}'` |
| `site_ratings` | jsonb | `{ "NFL.com": "6.5", "ESPN": "92", ... }` |
| `pff_scores` | jsonb | `{ "Coverage Grade": { "value": "89.2", "percentile": 0.95 }, ... }` |
| `athletic_scores` | jsonb | `{ "40 Time": { "result": "4.42", "grade": "9.1" }, ... }` |
| `draftbuzz_grades` | jsonb | `{ "Tackling": 85, "Coverage": 72, ... }` |
| `alignments` | jsonb | `{ "Slot": { "2025": 45, "career": 120 }, ... }` |
| `skills_traits` | jsonb | `{ "Ball Skills": { "positives": "...", "negatives": "..." }, ... }` |
| `bio_sources` | jsonb | Per-source bio values for priority resolution (see §6) |
| `analyzed_sources` | jsonb (array) | Sources already run through AI analysis — prevents re-analysis |
| `draft_year` | integer | 2026 (or 2027 for seeded future players) |

### Relational Tables

| Table | Key Columns | Notes |
|---|---|---|
| `board_entries` | player_id, board_type, rank, grades (jsonb), ranks (jsonb), summary | Board labels: `consensus`, `bengals`, `expanded` |
| `position_board_entries` | player_id, position_group, pos_rank, pff_scores, grades, athletic_scores, strengths, weaknesses | — |
| `rankings` | slug, source, rank_value | Keyed by slug (no FK). Used by `/rankings` page |
| `positional_rankings` | slug, source, rank_value, position | Keyed by slug. Used by `/boards` |
| `player_rankings` | player_id, source, overall_rank, positional_rank | FK → players.id. Used by player profiles |
| `adp_entries` | player_id, source, adp_value | — |
| `mock_picks` | player_id, source, pick_number, team, player_name, position, college, draft_year | — |
| `player_comps` | player_id, source, comp | — |
| `projected_rounds` | player_id, source, round | — |
| `commentary` | player_id, source, sections (jsonb array of `{title, text}`) | — |
| `media_links` | player_id, description, source, url | — |
| `injury_history` | player_id, detail, recovery_time, year | — |
| `ages` | player_id, age_final | Age tracking table |
| `source_dates` | source, source_type, date, draft_year | Last-updated date per source |
| `name_corrections` | variant_name, canonical_slug | Manual name resolution overrides |
| `college_corrections` | variant (unique), canonical | College name normalization map |
| `pending_players` | id, name, source, status, draft_year | Unresolved upload names (status: `pending`) |
| `pending_colleges` | id, raw_name, source, created_at | Unrecognized college names from uploads |
| `pending_seed_players` | id, name, position, college, draft_year | 2027 players blocked by slug conflicts |
| `user_boards` | id, user_id (FK auth.users), player_id (FK players), rank | RLS: `auth.uid() = user_id` |
| `user_position_ranks` | id, user_id, player_id, position_group, rank | RLS: `auth.uid() = user_id` |
| `site_updates` | id, date, title, body, draft_year | Site update log |

### RLS (Row-Level Security)

| Table | RLS | Policy |
|---|---|---|
| `user_boards` | ✅ Enabled | SELECT/INSERT/UPDATE/DELETE where `auth.uid() = user_id` |
| `user_position_ranks` | ✅ Enabled | SELECT/INSERT/UPDATE/DELETE where `auth.uid() = user_id` |
| All other tables | ❌ Disabled | Public read; admin-only write enforced by middleware |

---

## 4. Data Flow Overview

```
 CSV/XLSX file uploaded via /admin/upload
        │
        ▼ (UploadManager 5-step wizard)
 ┌──────────────────────────────────────┐
 │  1. Select data type (16 types)      │
 │  2. Upload file (≤10MB)              │
 │  3. Map columns (auto + manual)      │
 │  4. Preview (first 5 rows shown)     │
 │  5. Import + results summary         │
 └───────────────┬──────────────────────┘
                 │
                 ▼
 ┌──────────────────────────────────────┐
 │  resolvePlayerId() — 5-step lookup   │
 │  1. name_corrections table           │
 │  2. Exact slug match                 │
 │  3. Compact slug (+ diacritics)      │
 │  4. Jaro-Winkler fuzzy (≥0.92, gated │
 │     by position/college confirmation)│
 │  5. Queue to pending_players         │
 └───────────────┬──────────────────────┘
                 │
                 ▼
 ┌──────────────────────────────────────┐
 │  16 Specialized Importers            │
 │  → Relational tables                 │
 │  → JSON columns on players           │
 │  → bio_sources → priority resolution │
 └───────────────┬──────────────────────┘
                 │
                 ▼
 ┌──────────────────────────────────────┐
 │  Supabase PostgreSQL                 │
 │  revalidatePath() on all routes      │
 └───────────────┬──────────────────────┘
                 │
                 ▼
 ┌──────────────────────────────────────┐
 │  lib/data.ts (server-only reads)     │
 │  HIDDEN_SOURCES filtered everywhere  │
 │  fetchAll() paginates past 1000 rows │
 └───────────────┬──────────────────────┘
                 │
                 ▼
 ┌──────────────────────────────────────┐
 │  Next.js SSR pages → public site     │
 └──────────────────────────────────────┘
```

---

## 5. Player Lifecycle

### States

1. **No record** — Doesn't exist in the database.
2. **Record exists, no profile** — Row in `players` with `overview = {}`. Visible in admin only.
3. **Record exists, has profile** — `overview != {}`. Publicly visible on `/players` and `/player/[slug]`.

### How Players Get Created

- **Auto-created by importers** — `resolvePlayerId()` creates a minimal record when a name can't be matched.
- **Manually via `/admin/player/new`** — Admin creates with full form.

### How Profiles Get Activated

Profiles are **never** auto-created by data importers. They must be explicitly activated:

1. **From `/admin`** — Click **"+ Profile"** on any player → calls `createProfile()`.
2. **From `/admin/player/[slug]`** — Orange **"Create Profile"** banner (only visible when `overview = {}`).

`createProfile()` seeds the `overview` field from existing top-level columns AND seeds position-specific templates into `skills_traits` and `draftbuzz_grades` if those fields are currently empty (see §9).

### How Profile Data Accumulates

Data importers write to JSON columns (`pff_scores`, `draftbuzz_grades`, `athletic_scores`, etc.) **regardless of whether the player has a profile**. When the profile is later activated, all pre-imported data appears immediately.

---

## 6. Bio Data & Source Priority

The `bio_sources` JSONB column stores per-field, per-source values:

```json
{
  "pff": { "age": "22" },
  "draftbuzz": { "age": "21", "dob": "3/15/2004", "games": "36", "snaps": "2100" },
  "__priority": { "pff": 4, "draftbuzz": 1 }
}
```

### Default Source Priority (highest wins per field)

| Priority | Source Key | Display Names |
|---|---|---|
| 4 (highest) | `pff` | "PFF", "pff scores" |
| 3 | `site_ratings` | "site ratings" |
| 2 | `nfl_com` | "NFL.com", "nfl", "NFL" |
| 2 | `cbs` | "CBS", "cbs sports" |
| 1 | `draftbuzz` | "DraftBuzz", "draft buzz" |
| 0 | `espn` | "ESPN", "espn" |
| 0 (lowest) | `manual` | — |

Priorities are runtime-customizable via `/admin/priorities`.

### 10 Bio Fields

```ts
type BioField = "age" | "dob" | "games" | "snaps" | "height" | "weight"
              | "year" | "position" | "college" | "projected_round";
```

### Resolution Flow (`writeBioSources`)

1. Normalize source key via `BIO_SOURCE_ALIASES`
2. Strip null/empty/`#N/A`; normalize height and weight
3. Fetch existing `bio_sources` JSON
4. Merge new values under source key, store explicit priority
5. For each of 10 bio fields, find value from highest-priority source
6. Write winning values to top-level player columns + updated `bio_sources`

### `normalizeHeight` / `normalizeWeight`

```
"6-1" | "6 01" | 73 (raw inches 60–84)  →  "6'1""
"215 lbs" | "215.5"                      →  "215"
```

---

## 7. Name Resolution Pipeline

### Text Normalizers

```ts
normalizeName(s)   // strip periods, collapse whitespace  →  "D.J. Smith Jr." → "DJ Smith Jr"
compactSlug(s)     // strip ALL non-alphanumeric          →  "D'Andre O'Neal" → "dandresoneal"
toSlug(s)          // URL slug                            →  "Cam Ward" → "cam-ward"
stripDiacritics(s) // NFD decompose + strip combining marks → "Ángel" → "Angel" (comparison only, never stored)
```

### `resolvePlayerId()` — 5-Step Lookup

```
Input: raw name (+ optional position, college hints from CSV row)
  │
  ▼  Step 1: Check name_corrections table (cached)
  │         Variant → canonical_slug → player id
  │
  ▼  Step 2: Exact slug match
  │         toSlug(normalizeName(input)) matches players.slug
  │
  ▼  Step 3: Compact slug match
  │         compactSlug of input matches players.compact OR players.compactNfd
  │         If multiple hits → tiebreak by extrasScore:
  │           position match = +2 pts, college first-word match = +1 pt
  │           Accept only if one candidate uniquely leads with score > 0
  │
  ▼  Step 4: Jaro-Winkler fuzzy (≥ 0.92 similarity)
  │         Only accepted if extrasScore > 0 (position OR college confirms)
  │         Full Jaro-Winkler implementation (no external library)
  │
  ▼  Step 5: Queue to pending_players (status = "pending")
             Returns null — admin resolves via /admin/pending-players
```

### ImportCaches

Built fresh per import batch by `buildCaches()`. NOT shared across requests.

```ts
interface PlayerCacheEntry {
  id: string; slug: string; name: string;
  compact: string;       // compactSlug(name)
  compactNfd: string;    // compactSlug(stripDiacritics(name))
  position: string | null;
  college: string | null;
}

interface ImportCaches {
  playerCache: PlayerCacheEntry[];
  correctionsCache: Map<string, string>;  // normalized variant → canonical slug
  collegeCorrections: Map<string, string>; // college variant → canonical college
  pendingColleges: Map<string, string>;    // colleges to flush after batch
  draftYear: number;
}
```

---

## 8. Data Import System

### The 16 Data Types

#### Relational Importers

| Type Key | Target Tables | Source Required |
|---|---|---|
| `rankings` | `rankings` + `player_rankings` (+ `positional_rankings` if mapped) | ✓ (14 canonical sources) |
| `mocks` | `mock_picks` | ✓ (free text) |
| `source_dates` | `source_dates` | ✗ |
| `bio_data` | `bio_sources` → top-level player columns | ✓ (14 canonical sources) |

> **`rankings`:** Both overall rank and position rank are now optional. If only position rank is provided, only `positional_rankings` and `player_rankings` are written; `rankings` table is skipped.

> **Mock safety pattern:** Build all rows in memory → only delete existing after full array built → batch insert 100 at a time. If row build fails, nothing is deleted.

#### Profile Importers (JSON columns on `players`)

| Type Key | Writes To | Notes |
|---|---|---|
| `pff_scores` | `pff_scores`, `alignments`, `overview`, `bio_sources` (age) | 3-phase: extract → percentile-rank → write. 12 position templates. |
| `draftbuzz_grades` | `draftbuzz_grades`, `overview`, `bio_sources` (age, dob, games, snaps) | Position-group sheet |
| `athletic_scores` | `athletic_scores` | RAS / combine data |
| `site_ratings` | `site_ratings`, `overview` | NFL.com / ESPN / Gridiron / Bleacher grades |

#### Multi-Table Importers

| Type Key | Source Label | Destinations |
|---|---|---|
| `nfl_profiles` | "NFL.com" | `player_rankings` + `site_ratings` + `overview` + `player_comps` + `commentary` + `bio_sources` |
| `bleacher_profiles` | "Bleacher Report" | `player_rankings` + `site_ratings` + `overview` + `player_comps` + `projected_rounds` + `commentary` |
| `espn_profiles` | "ESPN" | `player_rankings` + `site_ratings` + `overview` + `commentary` |
| `pff_big_board` | "PFF" (ranking) + "PFF" (content) | `rankings` + `player_rankings` + `bio_sources` + `commentary` (Bottom Line, Summary, Pros/Cons) + `player_comps` |
| `pff_preseason` | "PFF Preseason" | `commentary` only (one blob per player) |
| `miller_profiles` | "Matt Miller" | `commentary` only (one blob per player) |

> All multi-table importers respect **Protected Fields** — they never overwrite `players.strengths`, `players.weaknesses`, `players.player_summary`, or `players.projected_role`.

### PFF Import — 3-Phase Process

1. **Extract** — Parse CSV, map columns by 12 position templates (CB, SAF, DT, EDGE, LB, OL, OT, IOL, QB, RB, WR, TE). Extract alignment snap data.
2. **Percentile Rank** — Group by position, rank all players per metric, compute 0.0–1.0 percentile. Result: `{ value: "89.2", percentile: 0.95 }`.
3. **Write** — Merge pff_scores, alignments, overview. Write age via `writeBioSources()`.

### College Name Normalization

During any import that touches the college field:
1. Check `collegeCorrections` cache (from `college_corrections` table)
2. If exact match (case-insensitive) to `CANONICAL_COLLEGES` → accept
3. If fuzzy match ≥ 0.88 → auto-apply + add to corrections
4. If ambiguous or < 0.88 → queue to `pending_colleges` for admin review

### Canonical Ranking Sources (14 total)

```ts
// Tier 1 (weight 2.0)
"PFF", "ESPN", "Brugler", "NFL.com"
// Tier 2 (weight 1.0)
"Bleacher Report", "CBS", "Walter Football", "PFSN", "Matt Miller"
// Tier 3 (weight 0.5)
"DraftBuzz", "Tankathon", "Kiper", "Yates", "DraftTek"
```

Source name input in UploadManager uses a hardcoded tiered `<optgroup>` dropdown (not generated from the array) — update both `RANKING_SOURCES` in `types.ts` AND the dropdown in `UploadManager.tsx` when adding a source.

### Source Abbreviations (for AI analysis display)

| Source | Abbreviation |
|---|---|
| PFF | PFF |
| PFF Preseason | PFF-Pre |
| Bleacher Report | BR |
| Walter Football | WF |
| NFL.com | NFL |
| The Ringer | Ringer |
| First Draft | FD |
| NFL Draft Buzz | NFLDB |
| ESPN | ESPN |
| NFL Stock Exchange | NFLSE |
| Mel Kiper | Kiper |
| Todd McShay | McShay |
| The Beast (Brugler) | Beast |
| Dane Brugler | Brugler |
| Matt Miller | Miller |
| Daniel Jeremiah | DJ |
| Jordan Reid | Reid |
| The Draft Network | TDN |
| Field Yates | Yates |

Unlisted sources fall back to their full name.

---

## 9. Profile & Skills System

### Profile Visibility Gate

A player "has a profile" iff `overview != '{}'`. This controls:
- Appearance on `/players` page
- Profile page at `/player/[slug]`
- Profile count in admin header

### Position Templates (`lib/position-templates.ts`)

`POSITION_TEMPLATES` maps each position to its skills_traits categories and draftbuzz_grades categories. `resolveTemplate(position)` handles aliases (OT/IOL → OL, DE → EDGE, IDL → DT, etc.).

When `createProfile()` is called and `skills_traits` / `draftbuzz_grades` are empty, they are seeded from the template. This is non-destructive — existing data is never replaced.

### Skills & Traits Structure

```ts
skills_traits: Record<string, { positives: string | null; negatives: string | null }>
```

Example categories by position (LB):
- "Instincts/Processing/Production"
- "Physical/Athletic Traits"
- "Coverage Ability"
- "Pass Rush Skills"
- "Run Defense/Tackling"

### `SkillsTraitsEditor.tsx`

- Auto-resizing textareas: `height = "auto"` then `height = scrollHeight + "px"` on every change
- `resize-none overflow-hidden` classes (not `resize-y`)

### Player Detail View (PlayerDetailView.tsx)

**Overview Tab:** Name, position badge, college, projected round → Key Stats (H/W/Age/Year/Games/Snaps/Scheme/Role) → Player Comps → Round Projections → Summary/Strengths/Weaknesses/Accolades → PFF Scores grid (direction-aware coloring) → Athletic Testing → Rankings/ADP by source → Site Ratings → DraftBuzz Grades → Injury History → Snap Alignments

**Scouting Tab:**
- Skills & Traits breakdown (2-col grid, `white-space: pre-wrap`)
- Commentary accordion by source (hidden sources filtered)
- When `isAdmin`: "Analyze" button per source → calls `analyzeCommentary()` server action

**Admin features on player page** (when `isAdmin = true`):
- "Edit Profile" pencil-icon link to `/admin/player/[slug]`
- "Analyze" button per commentary source
- "✓ Analyzed" indicator if source in `analyzed_sources`

---

## 10. AI Commentary Analysis

### How It Works

Server action: `src/app/admin/player/analyzeCommentary.ts`

1. Fetch player (id, position, skills_traits, analyzed_sources)
2. Check `analyzed_sources` — return error if source already analyzed (prevents duplicates)
3. `resolveTemplate(position)` → get category names
4. Build Claude Haiku prompt: extract verbatim quotes from commentary sections into skills_traits categories
5. Call `claude-haiku-4-5` via Anthropic SDK
6. Parse JSON response: `{ "Category Name": { "positives": "...", "negatives": "..." } }`
7. Append `"verbatim quote" (ABBR)` lines (newline-separated) to existing category strings
8. Update `players.skills_traits` + append source to `players.analyzed_sources`

### Quote Format

```
"verbatim quote from the source text" (ABBR)
```

Newline-separated per entry within a category's positives or negatives string.

### Re-analysis Protection

If a source is already in `analyzed_sources`, the action returns an error. To re-run: manually remove the source from `analyzed_sources` in Supabase.

### Required Env Var

`ANTHROPIC_API_KEY` — must be set in both `.env.local` and Vercel Environment Variables.

---

## 11. Unified Color System (`lib/colors.ts`)

### 5-Tier Color Scale

| Tier | Class | Threshold |
|---|---|---|
| Elite | `text-blue-400 font-bold` | ≥ 90th pct |
| Great | `text-green-400 font-semibold` | ≥ 70th pct |
| Good | `text-yellow-400` | ≥ 40th pct |
| Below Avg | `text-orange-400` | ≥ 20th pct |
| Poor | `text-red-400` | < 20th pct |
| Neutral | `text-white` | (PLAIN) |

Internal `colorFromPercentile(pct)` is the canonical mapper. Only `PLAIN` is exported.

### Exported Functions

| Function | Purpose |
|---|---|
| `getGradeColor(label, value)` | Auto-detect scale from label, color by value |
| `getPffColorByPercentile(metric, pct)` | Position board PFF coloring (stored pct, 1.0 = best) |
| `getPffColorForProfile(metric, pct)` | Player profile PFF coloring (0.0 = highest raw, flips higher-is-better) |
| `getPffColorByValue(metric, value)` | Fallback: color by raw 0–100 value |
| `getDraftBuzzGradeColor(value)` | DraftBuzz category grade (0–100) |
| `parseGradeValue(raw)` | Parse messy grade strings to number |

### Grade Scale Detection Order (`getGradeColor`)

ESPN → NFL.com → Gridiron → DraftBuzz → Rivals → 24/7 → Bleacher → `/grade/i` regex → `/blk|block/i` → fallback by value range

| Source(s) | Raw Range | Formula |
|---|---|---|
| PFF grades, ESPN, DraftBuzz | 0–100 | `(v - 60) / 35` |
| NFL.com | 5.0–7.2 | `(v - 5.8) / 1.4` |
| Gridiron | 6.0–9.0 | `(v - 6.5) / 2.0` |
| Rivals | 5.0–6.0 | `(v - 5.5) / 0.5` |
| 24/7 | 80–100 | `(v - 82) / 16` |
| Bleacher | 6.0–8.0 | `(v - 6.0) / 2.0` |

### PFF Stat Direction

- **Lower is Better:** Comp. %, Passer Rating, Missed Tackles, Missed Tkl Rate, Pass Rat. All., Penalties, Hits/Sacks/Hurries/Pressures Allowed, Drop %, Missed Tkls
- **Neutral (PLAIN):** Dropped Picks, % In Man/Zone, ADORT, ADOT, TD/INT, Tackles, Interceptions, Coverage/Run Stops, Batted Balls, Forced Fumbles, Total Pressures, CCR
- **Higher is Better:** All grades, receiving stats, pass rush production, etc.

### OL Metric Rename in `data.ts`

For IOL/OT position boards, bare DL metric names are renamed to their OL equivalents and their percentiles flipped:
```
"Hits" → "Hits Allowed"  (percentile: 1 - original)
"Sacks" → "Sacks Allowed"
"Hurries" → "Hurries Allowed"
"Pressures" → "Pressures Allowed"
```

---

## 12. Source Tiers & Consensus Formula

### Source Weights

```ts
SOURCE_WEIGHTS: Record<string, number> = {
  // Tier 1 (2.0)
  "PFF": 2.0, "ESPN": 2.0, "Brugler": 2.0, "NFL.com": 2.0,
  // Tier 2 (1.0)
  "Bleacher Report": 1.0, "CBS": 1.0, "Walter Football": 1.0, "PFSN": 1.0, "Matt Miller": 1.0,
  // Tier 3 (0.5)
  "DraftBuzz": 0.5, "Tankathon": 0.5, "Kiper": 0.5, "Yates": 0.5, "DraftTek": 0.5,
}
```

### Consensus Formula

```
score = Σ(weight_i × percentile_i) / Σ(weight_i)
percentile_i = 1 - (rank_i - 1) / (n_i - 1)
```

Ranks are assigned as integers before filtering. Sources not ranking a player are skipped (their weight is excluded from the denominator too).

### Hidden Sources (filtered from all public queries)

```ts
HIDDEN_SOURCES = new Set(["Bleacher", "Con", "Premier Con."])
```

| Name | Reason |
|---|---|
| `"Bleacher"` | Legacy — superseded by `"Bleacher Report"` |
| `"Con"` | Internal consensus ADP computation artifact |
| `"Premier Con."` | Legacy computed consensus from original Excel migration |

### Ranking Number Colors (display)

| Range | Class |
|---|---|
| 1–15 | `text-purple-400` |
| 16–50 | `text-green-400` |
| 51–100 | `text-yellow-400` |
| 101–200 | `text-gray-400` |
| 201+ | `text-red-400` |

---

## 13. Public-Facing Pages

| Route | Server Component | Data Function(s) | Key Feature |
|---|---|---|---|
| `/` | `page.tsx` | `getEnrichedBigBoard()`, `getUserBoard()` | 4 tabs: Bengals (default) / Consensus / Expanded / My Board |
| `/players` | `page.tsx` | `getPlayers()`, `getProfileCount()` | Card grid, profiled players only |
| `/player/[slug]` | `page.tsx` | `getPlayerProfile(slug)`, `auth.getUser()` | Full profile; `isAdmin` passed to view |
| `/boards` | `page.tsx` | `getPositionBoards()`, `getUserPositionRanks()` | 9 position group tabs, expandable rows |
| `/rankings` | `page.tsx` | `getRankings()`, `getADP()` | Source tabs, position filters, source dates |
| `/mocks` | `page.tsx` | `getMocks()` | Single source / side-by-side compare, team filter |
| `/login` | — | — | Redirects to `/` if already logged in |
| `/register` | — | — | Redirects to `/` if already logged in |

Every public route has `error.tsx` (retry boundary) and `loading.tsx` (skeleton UI).

### `lib/data.ts` Key Functions

| Function | Returns | Notes |
|---|---|---|
| `getEnrichedBigBoard()` | `BigBoard` | Consensus + bengals + expanded; joins `ages` table |
| `getPlayers()` | `PlayerIndex[]` | `overview != '{}'` filter |
| `getPlayerProfile(slug)` | `PlayerProfile \| null` | React `cache()` dedup; 7 parallel sub-queries |
| `getMocks()` | `{ mocks, mock_dates }` | Grouped by source, HIDDEN filtered |
| `getRankings()` | `{ players, source_dates }` | HIDDEN filtered |
| `getPositionBoards()` | `Record<string, PositionBoardPlayer[]>` | OL metric rename, dynamic ranks from CONSENSUS_SOURCES |
| `getUserBoard(userId)` | `BoardPlayer[]` | Uses `createSupabaseServer()` (RLS) |
| `getUserPositionRanks(userId)` | `Record<string, Array<...>>` | Uses `createSupabaseServer()` (RLS) |

`fetchAll<T>()` paginates past Supabase's 1000-row limit. **Throws** on error.

---

## 14. Admin Backend

### 16 Admin Routes

| Route | Purpose |
|---|---|
| `/admin` | Player list (search, profile status filter, Edit, Create Profile, Delete) |
| `/admin/login` | Admin login form |
| `/admin/player/new` | Create player |
| `/admin/player/[slug]` | Edit player (14 fields, 6 JSON textareas, Skills/Traits editor, Create Profile banner) |
| `/admin/upload` | 5-step import wizard, 16 data types, 10MB limit |
| `/admin/boards` | Drag-and-drop Consensus/Bengals/Expanded board editor |
| `/admin/boards/positions` | Drag-and-drop position board editor |
| `/admin/corrections` | Name corrections (variant → canonical slug); audit + merge duplicates |
| `/admin/positions` | Position audit — find/fix non-canonical position strings |
| `/admin/dates` | Source date management (view/edit last-updated per source) |
| `/admin/priorities` | Bio source priority manager; re-resolves fields on change |
| `/admin/cleanup` | **Tab 1:** Players with missing position/college (cascading delete) **Tab 2:** Non-canonical school names (fix + back-fill or dismiss) |
| `/admin/college-review` | Approve/map/dismiss entries from `pending_colleges` (badge count in nav) |
| `/admin/pending-players` | Resolve unmatched upload names: map to existing player or create new (badge count) |
| `/admin/pending-seed` | Resolve 2027 players blocked by slug conflicts (badge count) |
| `/admin/walter-football` | Trigger Walter Football scraper |
| `/admin/updates` | Site update log entries |
| `/admin/colors` | Static color system visual reference |

### Admin Nav (layout.tsx)

Players · Boards · Upload · Corrections · Positions · Dates · Priorities · Colors · Cleanup · Walter Football · Pending (🔴) · Colleges (🔴) · Seed (🔴) · Updates · ← Back to Site

Badge counts (yellow dot) are shown on Pending, Colleges, and Seed when there are items to resolve.

### Player Editor

- 14 top-level fields (name, slug, position, college, height, weight, age, dob, year, games, snaps, projected_round, projected_role, ideal_scheme, strengths, weaknesses, accolades, player_summary)
- 6 JSON textareas (overview, site_ratings, pff_scores, athletic_scores, draftbuzz_grades, alignments) — all validated with `JSON.parse()` before submit
- Visual `SkillsTraitsEditor` for skills_traits categories with auto-resize textareas
- **Protected fields** (`strengths`, `weaknesses`, `player_summary`, `projected_role`) are only editable here — never overwritten by data importers

### Delete Player

Cascades across all 13 child tables in order. Redirects to `/admin` on success.

---

## 15. Shared Components

### `Navigation.tsx`

Sticky top nav. Active tab highlighting. Mobile hamburger. Auth-aware:
- Admin: all tabs + Admin link + email + Sign Out
- Regular user: all tabs + email + Sign Out
- Not logged in: all tabs + Sign In

### `BoardTable.tsx`

Ranked table with search bar + position filter pills. Links to `/player/[slug]`.

### `ExpandedBoardTable.tsx`

Extends BoardTable with expandable rows showing grades (color-coded), per-source ranks, and summary text. Expand/collapse all.

### `UserBoardEditor.tsx`

Personal board editor. Search to add players (calls `searchPlayersForBoard`), drag-to-reorder via @dnd-kit, remove button, "Copy Consensus Board" to bulk-seed. Empty state with prompt.

### `PlayerGrid.tsx`

Card grid with search + position filter. Shows name, position badge, college, bio stats, projected round.

### `PositionBadge.tsx`

Colored pill via `normalizePosition()` + `getPositionColor()`. Displays "—" for null.

---

## 16. Authentication & Middleware

### Auth Provider

Supabase Auth (email/password, multi-user registration). Admin is identified solely by email matching `ADMIN_EMAIL` env var.

### `middleware.ts` (catch-all, excludes static files)

- Calls `supabase.auth.getUser()` on every route to refresh session tokens
- `/admin/login`: redirect to `/admin` if already admin
- `/admin/*`: redirect to `/` (non-admin) or `/admin/login` (unauthenticated)
- `/login`, `/register`: redirect to `/` if already logged in

### User Features (logged-in, non-admin)

| Feature | Location | How |
|---|---|---|
| My Board | Home `/` → "My Board" tab | `UserBoardEditor` — add, reorder, remove, copy consensus |
| My Rankings | `/boards` → "My Rankings" toggle | Per-position reordering; "Copy Default Order" to seed |

---

## 17. Key Concepts & Gotchas

### The Overview Gate

`overview = {}` means no profile. Data importers write to `pff_scores` etc. but never touch `overview`. Profiles are activated explicitly. This is intentional — import data can accumulate before the profile goes live.

### JSON Column Architecture

Profile data (pff_scores, draftbuzz_grades, skills_traits, etc.) is stored as JSONB columns rather than relational tables because:
1. Each position has different metrics
2. Data is always read/written as a unit per player
3. Simplifies the import pipeline

### Two Position Normalization Systems

| System | Location | Maps To |
|---|---|---|
| `normalizePffPosition()` | upload/actions.ts | PFF template keys (DI→DT, DE→EDGE, G→IOL) |
| `normalizePosition()` + `POS_ALIASES` | types.ts | Display abbreviations (EDGE→ED, OLB→ED, DB→CB, OL→OT) |

These are independent. Don't confuse them.

### Slug is the Cross-Table Key for Rankings

`rankings` and `positional_rankings` are keyed by `slug` string (no FK). `player_rankings` uses `player_id` FK. When deleting a player, both slug-keyed and player_id-keyed tables must be cleaned.

### Adding a New Ranking Source

Three places to update:
1. `RANKING_SOURCES` in `src/lib/types.ts`
2. `BIO_SOURCES` in `src/lib/types.ts` (if applicable)
3. `SOURCE_WEIGHTS` in `src/lib/types.ts`
4. Tier 2 `<optgroup>` in `UploadManager.tsx` (hardcoded dropdown, NOT auto-generated from `RANKING_SOURCES`)

### Diacritics in Player Names

Diacritics are **preserved in stored data**. `stripDiacritics()` is only used on the lookup side (computing `compactNfd` for matching). Never strip diacritics from `players.name`.

### Revalidation

After any data mutation, `revalidatePath()` is called on:
`/`, `/rankings`, `/mocks`, `/boards`, `/players`, `/player` (layout), `/admin`, `/admin/cleanup`

### Legacy JSON Files

`src/data/` contains original JSON files from before the Supabase migration. Not used as primary data source. Kept for reference only.

---

## 18. Environment & Deployment

### Environment Variables

| Variable | Used By |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All Supabase clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin layout (badge counts with service role) |
| `ADMIN_EMAIL` | `middleware.ts` + `layout.tsx` — gates `/admin/*` |
| `ANTHROPIC_API_KEY` | `analyzeCommentary.ts` — Claude Haiku AI analysis |

All 5 must be set in both `.env.local` (local dev) and Vercel Environment Variables (production).

### Deployment

Push to `main` → Vercel auto-builds → live in ~2 minutes.

### Local Development

```powershell
cd draft-board-app
npm install
npm run dev       # http://localhost:3000
```

---

## 19. Dependencies

### Production

| Package | Version | Purpose |
|---|---|---|
| `next` | 16.1.6 | Next.js framework |
| `react` / `react-dom` | 19.2.3 | React |
| `@supabase/supabase-js` | ^2.95.3 | Supabase client |
| `@supabase/ssr` | ^0.8.0 | Supabase SSR cookie helpers |
| `@anthropic-ai/sdk` | ^0.39.0 | Claude Haiku AI analysis |
| `@dnd-kit/core` | ^6.3.1 | Drag-and-drop core |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable lists |
| `@dnd-kit/utilities` | ^3.2.2 | CSS transform utilities |
| `@vercel/analytics` | ^1.6.1 | Analytics |
| `papaparse` | ^5.5.3 | CSV/TSV parser |
| `xlsx` | ^0.18.5 | Excel file parser |
| `server-only` | ^0.0.1 | Prevents accidental client import of data.ts |

### Dev

| Package | Version |
|---|---|
| `tailwindcss` / `@tailwindcss/postcss` | ^4 |
| `typescript` | ^5 |
| `eslint` / `eslint-config-next` | ^9 / 16.1.6 |
| `@types/node`, `@types/react`, `@types/react-dom`, `@types/papaparse` | Various |

---

## 20. Operations Guide

### Import new rankings data
1. `/admin/upload` → "Rankings" → upload file → map columns → select source name → Import
2. Source date auto-updates. Both `rankings` and `player_rankings` are written.
3. Overall Rank is optional — can import position-only rankings without it.

### Import scouting commentary (PFF, PFF Preseason, Matt Miller, etc.)
1. `/admin/upload` → select appropriate type (e.g. "Matt Miller Profiles") → upload → map `Player Name` and `Commentary` columns → Import
2. Commentary is stored in `commentary` table under that source name.
3. After import, go to player profile → Scouting tab → "Analyze" to extract skills/traits via AI.

### Create a player profile
1. `/admin` → find player → click **"+ Profile"**
2. Skills/traits and draftbuzz template are auto-seeded from position template if fields are empty.
3. Player immediately visible on `/players` and `/player/[slug]`.

### Add a name correction (upload matched wrong player or unresolved)
1. `/admin/corrections` → search for canonical player → "Add Variant" → enter the bad name
2. Or: `/admin/pending-players` → find unresolved entry → map to existing player (creates correction automatically)

### Fix non-canonical school names
1. `/admin/cleanup` → "School Names" tab → Run Audit → pick canonical from dropdown → Apply
2. Correction is written and all matching players are back-filled immediately.

### Fix non-canonical positions
1. `/admin/positions` → Run Audit → fix individual or fix-all

### Handle pending name queue after an upload
1. `/admin/pending-players` (nav badge shows count) → map each to an existing player or create new

### Run AI analysis on commentary
1. Go to `/player/[slug]` → Scouting tab
2. Find the commentary source → click "Analyze" (admin only)
3. Extracts verbatim quotes into skills_traits categories; marks source as analyzed
4. To re-run: remove the source from `players.analyzed_sources` in Supabase SQL editor

### Update PFF scores
1. `/admin/upload` → "PFF Scores + Alignments" → upload XLSX → map Player Name + Position columns → Import
2. Percentile-ranks all players by position. Writes to `pff_scores`, `alignments`, `overview`.

### Update Walter Football scouting reports
1. `/admin/walter-football` → trigger scrape or upload
