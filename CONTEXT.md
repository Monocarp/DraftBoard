# NFL Draft Board — Complete Technical Context

> **Last Updated:** February 16, 2026 (g)
> **Repository:** https://github.com/Monocarp/DraftBoard
> **Live Site:** Auto-deploys to Vercel on push to `main`
> **Supabase Project:** https://cmapsylsrsglhfdwquwe.supabase.co
> **Companion doc:** [`CONTEXT_INTERNALS.md`](CONTEXT_INTERNALS.md) — module-level details (function signatures, constant values, color system, error handling)

---

## Table of Contents

1. [Stack & Architecture](#1-stack--architecture)
2. [Project Structure](#2-project-structure)
3. [Database Schema](#3-database-schema)
4. [Data Flow Overview](#4-data-flow-overview)
5. [Player Lifecycle](#5-player-lifecycle)
6. [Bio Data & Source Priority](#6-bio-data--source-priority)
7. [Name Normalization Pipeline](#7-name-normalization-pipeline)
8. [Data Import System](#8-data-import-system)
9. [Profile System](#9-profile-system)
10. [Unified Color System](#10-unified-color-system)
11. [Public-Facing Pages](#11-public-facing-pages)
12. [Admin Backend](#12-admin-backend)
13. [Shared Components](#13-shared-components)
14. [Authentication & Middleware](#14-authentication--middleware)
15. [Key Concepts & Gotchas](#15-key-concepts--gotchas)
16. [Environment & Deployment](#16-environment--deployment)
17. [Dependencies](#17-dependencies)
18. [Excel Workbook Reference](#18-excel-workbook-reference)
19. [Operations Guide](#19-operations-guide)
20. [Known Limitations & Deferred Items](#20-known-limitations--deferred-items)

---

## 1. Stack & Architecture

| Layer | Technology | Version |
|---|---|---|
| **Framework** | Next.js (App Router) | 16.1.6 |
| **Language** | TypeScript | 5 |
| **UI** | React + Tailwind CSS | 19.2.3 / v4 |
| **Database** | Supabase (PostgreSQL) | — |
| **Auth** | Supabase Auth (email/password) | — |
| **Hosting** | Vercel (auto-deploy from GitHub `main`) | — |
| **Drag & Drop** | @dnd-kit/core + @dnd-kit/sortable | 6.3.1 / 10.0.0 |
| **File Parsing** | PapaParse (CSV/TSV), SheetJS/xlsx (Excel) | 5.5.3 / 0.18.5 |
| **Analytics** | @vercel/analytics | 1.6.1 |
| **PWA** | Progressive Web App configured | — |

### Supabase Clients (3 variants)

| File | Usage | Auth Context |
|---|---|---|
| `src/lib/supabase.ts` | Server data reads (`data.ts` — public data) | Anon key, no cookies |
| `src/lib/supabase-server.ts` | Server actions + user data reads (`data.ts` user queries) | Anon key + cookies (auth-aware) |
| `src/lib/supabase-browser.ts` | Client components (login form) | Anon key + browser cookies |

> **Note:** `SUPABASE_SERVICE_ROLE_KEY` is defined in `.env.local` but never used in code. Public data tables have RLS disabled. User tables (`user_boards`, `user_position_ranks`) have RLS enabled with `auth.uid() = user_id` policies — queries MUST use the session-aware `createSupabaseServer()` client.

> **Config:** `next.config.ts` sets `experimental.serverActions.bodySizeLimit = "10mb"` for large file uploads.

---

## 2. Project Structure

```
src/
├── lib/                         # Shared utilities (see CONTEXT_INTERNALS.md for full API)
│   ├── types.ts                 # All TypeScript interfaces, position constants, POS_ALIASES, POSITION_COLORS
│   ├── data.ts                  # Read-only data fetching layer (server-only, HIDDEN_SOURCES, fetchAll pagination)
│   ├── colors.ts                # Unified scale-aware color system (grades, PFF, ratings, DraftBuzz)
│   ├── supabase.ts              # Supabase client (server reads, no cookies)
│   ├── supabase-server.ts       # Supabase client (server actions, cookie-aware)
│   └── supabase-browser.ts      # Supabase client (browser)
│
├── components/                  # Shared UI components
│   ├── Navigation.tsx           # Site-wide nav bar with active tab highlighting + mobile hamburger + auth state
│   ├── BoardTable.tsx           # Big Board table (consensus & bengals boards)
│   ├── ExpandedBoardTable.tsx   # Expanded board with expandable rows: grades, ranks, summary
│   ├── PlayerGrid.tsx           # Players index card grid with search/filter
│   ├── PositionBadge.tsx        # Color-coded position pill (normalizes + colors via types.ts)
│   └── UserBoardEditor.tsx      # Personal board editor (search/add, remove, drag-to-reorder)
│
├── app/                         # Next.js App Router pages
│   ├── layout.tsx               # Root layout (Inter font, dark theme, navigation, analytics, PWA)
│   ├── page.tsx                 # Home: Big Board (server component → BigBoardPage)
│   ├── BigBoardPage.tsx         # Client: Tabbed board view (Bengals default / Consensus / Expanded)
│   ├── globals.css              # Global styles + Tailwind
│   │
│   ├── players/page.tsx         # Players index (grid of all profiled players)
│   ├── boards/                  # Position Boards
│   │   ├── page.tsx             # Server component → PositionBoardsView
│   │   └── PositionBoardsView.tsx # Client: Tabbed by position group (CB, DT, ED, etc.)
│   ├── rankings/                # Rankings & ADP aggregation
│   │   ├── page.tsx             # Server component → RankingsView
│   │   └── RankingsView.tsx     # Client: Source tabs with position filters
│   ├── mocks/                   # Mock Drafts
│   │   ├── page.tsx             # Server component → MockDraftsView
│   │   └── MockDraftsView.tsx   # Client: Single source + compare view with team filter
│   │
│   ├── player/[slug]/           # Individual player profile
│   │   ├── page.tsx             # SSR with React cache() dedup for generateMetadata + page
│   │   ├── PlayerDetailView.tsx # Client: Full profile (2 tabs: Overview + Scouting)
│   │   └── not-found.tsx        # "Profile In Progress" placeholder
│   │
│   ├── (auth)/                  # Auth route group (login/register, no URL prefix)
│   │   ├── actions.ts           # loginUser, registerUser, logoutUser server actions
│   │   ├── login/page.tsx       # Public login form (email/password)
│   │   └── register/page.tsx    # Public registration form (email/password/confirm)
│   │
│   ├── user-board/
│   │   └── actions.ts           # User board CRUD: add, remove, reorder, search, populate, position ranks
│   │
│   └── admin/                   # Auth-protected admin backend (13 routes, see §12)
│       ├── layout.tsx           # Admin chrome (nav tabs, auth gate, sign out)
│       ├── page.tsx             # Player Management (search, profile filter, quick actions)
│       ├── AdminPlayerList.tsx  # Client: Searchable/filterable player table
│       ├── actions.ts           # Login/logout server actions
│       ├── LogoutButton.tsx     # Sign out button
│       ├── login/page.tsx       # Admin login form
│       │
│       ├── player/              # Player CRUD
│       │   ├── actions.ts       # savePlayer, deletePlayer, createProfile
│       │   ├── PlayerEditorForm.tsx   # Full edit form (14 fields + 6 JSON textareas + validation)
│       │   ├── SkillsTraitsEditor.tsx # Visual skills/traits card editor (~30 autocomplete categories)
│       │   ├── [slug]/page.tsx  # Edit existing player
│       │   └── new/page.tsx     # Create new player
│       │
│       ├── upload/              # Data Import System
│       │   ├── page.tsx         # Upload page with 5 stats cards
│       │   ├── actions.ts       # 14 importer functions + helpers (2,322 lines)
│       │   └── UploadManager.tsx # 5-step wizard UI (14 data type cards, 10MB limit)
│       │
│       ├── corrections/         # Name Corrections
│       │   ├── page.tsx, actions.ts, CorrectionsManager.tsx
│       │
│       ├── colors/page.tsx      # Color System Reference (static visual reference)
│       ├── cleanup/             # Data Cleanup (players with missing pos/college)
│       │   ├── page.tsx, CleanupManager.tsx
│       ├── positions/           # Position Audit (non-canonical position strings)
│       │   ├── page.tsx, PositionAudit.tsx
│       ├── priorities/          # Bio Priority Manager
│       │   ├── page.tsx, PriorityManager.tsx
│       ├── dates/               # Source Date Management
│       │   ├── page.tsx, actions.ts, SourceDatesManager.tsx
│       │
│       └── boards/              # Board Editor (drag-and-drop)
│           ├── page.tsx, actions.ts, BigBoardEditor.tsx, SortableBoardEditor.tsx
│           └── positions/
│               ├── page.tsx, PositionBoardEditor.tsx
│
├── data/                        # Legacy JSON files (no longer primary source, kept in repo)
│   ├── adp.json, ages.json, big_board.json, mocks.json, players.json,
│   ├── position_boards.json, positional_rankings.json, rankings.json, ras.json
│   └── profiles/               # 141 player profile JSON files (legacy)
│
└── middleware.ts                # Auth middleware (protects /admin/*, refreshes session)
```

---

## 3. Database Schema

### Supabase Tables (17 total)

#### Core Player Table

**`players`** — The central table. Every player has a row here.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Auto-generated |
| `name` | text | Full display name |
| `slug` | text (unique) | URL-friendly identifier |
| `position` | text | Position abbreviation (QB, WR, ED, CB, etc.) |
| `college` | text | School name |
| `height` | text | e.g. `6'2"` (canonicalized by normalizeHeight) |
| `weight` | text | e.g. `215` (stripped of "lbs" by normalizeWeight) |
| `age` | numeric | Current age |
| `dob` | text | Date of birth string |
| `year` | text | Eligibility (Jr, Sr, rSr, etc.) |
| `projected_round` | text | e.g. `1`, `2`, `3-4` |
| `projected_role` | text | e.g. `Day 1 Starter` (**manually authored — never overwritten by imports**) |
| `ideal_scheme` | text | e.g. `Zone`, `Power` |
| `games` | integer | College games played |
| `snaps` | integer | College snap count |
| `strengths` | text | **Manually authored** scouting text |
| `weaknesses` | text | **Manually authored** scouting text |
| `accolades` | text | Awards, honors |
| `player_summary` | text | **Manually authored** overview paragraph |
| **`overview`** | **jsonb** | **Key-value bio/ratings — GATES profile visibility** |
| `site_ratings` | jsonb | `{ "NFL.com": "6.5", "ESPN": "92", ... }` |
| `pff_scores` | jsonb | `{ "Coverage Grade": { "value": "89.2", "percentile": 0.95 }, ... }` |
| `athletic_scores` | jsonb | `{ "40 Time": { "result": "4.42", "grade": "9.1" }, ... }` |
| `draftbuzz_grades` | jsonb | `{ "Tackling": 85, "Coverage": 72, ... }` |
| `alignments` | jsonb | `{ "Slot": { "2025": 45, "career": 120 }, ... }` |
| `skills_traits` | jsonb | `{ "Ball Skills": { "positives": "...", "negatives": "..." }, ... }` |
| **`bio_sources`** | **jsonb** | **Per-source bio values for priority resolution** (see §6) |

> **Critical:** A player "has a profile" if and only if `overview != '{}'`. This gates visibility on `/players`, profile page generation, and admin profile counts.

#### Relational Tables

| Table | Key Columns | Relationship |
|---|---|---|
| `board_entries` | player_id, board_type, rank, grades, ranks, summary | FK → players.id |
| `position_board_entries` | player_id, position_group, pos_rank, pff_scores, grades, athletic_scores, strengths, weaknesses | FK → players.id |
| `rankings` | slug, source, rank_value, position, position_rank | Keyed by slug |
| `positional_rankings` | slug, source, rank, position | Keyed by slug |
| `player_rankings` | player_id, source, overall_rank, positional_rank | FK → players.id |
| `adp_entries` | player_id, source, adp_value | FK → players.id |
| `mock_picks` | player_id, source, pick_number, team, player_name, position, college | FK → players.id |
| `player_comps` | player_id, source, comp | FK → players.id |
| `projected_rounds` | player_id, source, round | FK → players.id |
| `commentary` | player_id, source, sections (jsonb array of {title, text}) | FK → players.id |
| `media_links` | player_id, description, source, url | FK → players.id |
| `injury_history` | player_id, detail, recovery_time, year | FK → players.id |
| `ages` | player_id, age_final | FK → players.id |
| `source_dates` | id, source, source_type, date | Standalone |
| `name_corrections` | id, variant_name, canonical_slug | Standalone |
| `user_boards` | id, user_id (FK auth.users), player_id (FK players), rank, UNIQUE(user_id, player_id) | Per-user big board |
| `user_position_ranks` | id, user_id (FK auth.users), player_id (FK players), position_group, rank, UNIQUE(user_id, player_id, position_group) | Per-user position rankings |

#### Table Relationships Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │                  players                     │
                    │  id, name, slug, position, college, ...     │
                    │  overview{}, pff_scores{}, bio_sources{}    │
                    └──────────────────┬──────────────────────────┘
                                       │ player_id (FK)
          ┌───────────┬───────────┬────┼────┬──────────┬──────────┐
          ▼           ▼           ▼    ▼    ▼          ▼          ▼
    board_entries  adp_entries  mock  ages  comps  commentary  injuries
                               picks       proj_rounds  media_links
                                           player_rankings

    Slug-keyed (no FK):
    ┌──────────┐  ┌──────────────────┐
    │ rankings │  │ positional_ranks │
    └──────────┘  └──────────────────┘

    User-scoped (FK → auth.users + players, RLS-protected):
    ┌──────────────┐  ┌──────────────────────┐
    │ user_boards  │  │ user_position_ranks  │
    └──────────────┘  └──────────────────────┘

    Standalone:
    ┌──────────────┐  ┌──────────────────┐
    │ source_dates │  │ name_corrections │
    └──────────────┘  └──────────────────┘
```

---

## 4. Data Flow Overview

```
 Excel Workbook / Standalone Files        CSV/XLSX Upload
 (2026 Draft Board 2.0.xlsx,              via /admin/upload
  PFF Stats, NFL Profiles, etc.)
        │                                        │
        │  (exported as CSV per sheet)           │
        ▼                                        ▼
 ┌──────────────────────────────────────────────────────┐
 │           Upload Manager (5-step wizard)              │
 │  1. Select data type (14 types)                      │
 │  2. Upload file (CSV/TSV/XLSX, ≤ 10 MB)             │
 │  3. Map columns (auto-detect + manual override)      │
 │  4. Preview & Import                                 │
 │  5. Done (results summary)                           │
 └──────────────────────┬───────────────────────────────┘
                        │
                        ▼
 ┌──────────────────────────────────────────────────────┐
 │           Name Normalization Pipeline                 │
 │  1. Strip periods, collapse whitespace               │
 │  2. Check name_corrections table                     │
 │  3. Match by slug                                    │
 │  4. Fuzzy match by compact slug                      │
 │  5. Auto-create player if no match                   │
 └──────────────────────┬───────────────────────────────┘
                        │
                        ▼
 ┌──────────────────────────────────────────────────────┐
 │             14 Specialized Importers                  │
 │                                                      │
 │  Relational importers → dedicated tables             │
 │  Profile importers → JSON columns on players         │
 │  Multi-table importers → rankings + grades + comps   │
 │  Bio data → bio_sources + priority resolution        │
 └──────────────────────┬───────────────────────────────┘
                        │
                        ▼
 ┌──────────────────────────────────────────────────────┐
 │              Supabase (PostgreSQL)                    │
 │         17 tables, 700+ player records                │
 └──────────────────────┬───────────────────────────────┘
                        │
                        ▼
 ┌──────────────────────────────────────────────────────┐
 │          data.ts (server-only read layer)             │
 │  fetchAll() pagination (1000-row pages)              │
 │  HIDDEN_SOURCES filtering on all public queries      │
 │  Error logging on all Supabase calls                 │
 └──────────────────────┬───────────────────────────────┘
                        │
                        ▼
 ┌──────────────────────────────────────────────────────┐
 │           Public Next.js Pages (SSR)                  │
 │  / (Big Board), /players, /player/[slug],            │
 │  /boards, /rankings, /mocks                          │
 └──────────────────────────────────────────────────────┘
```

---

## 5. Player Lifecycle

### States

1. **No record** — Player doesn't exist in the database.
2. **Record exists, no profile** — Has a row in `players` with basic info but `overview = {}`. Appears in admin list but NOT on the public site.
3. **Record exists, has profile** — Has `overview != {}`. Appears publicly on `/players` and has a profile page at `/player/[slug]`.

### How players get created

- **Auto-created by importers** — When uploading rankings, mocks, ADP, etc., if a player name can't be resolved, `resolvePlayerId()` auto-creates a minimal player record.
- **Manually via /admin/player/new** — Admin creates with full form fields.

### How profiles get activated

Profiles are **NOT** auto-created by data importers. They must be explicitly activated:

1. **From `/admin`** — Click **"+ Profile"**. Calls `createProfile()` which seeds `overview` from top-level columns.
2. **From `/admin/player/[slug]`** — Orange **"Create Profile"** banner with position template dropdown.
3. **By manually editing `overview` JSON** — Setting it to anything non-empty activates the profile.

### How profile data accumulates

Data importers write to JSON columns (`pff_scores`, `draftbuzz_grades`, `athletic_scores`, etc.) **regardless of whether the player has a profile**. When the profile is later activated, all pre-imported data is immediately visible.

---

## 6. Bio Data & Source Priority

The `bio_sources` JSONB column stores per-field, per-source values:

```json
{
  "draftbuzz": { "age": "21", "dob": "3/15/2004", "games": "36", "snaps": "2100" },
  "pff": { "age": "22" },
  "__priority": { "pff": 4, "draftbuzz": 1 }
}
```

### Default Source Priority (highest wins)

| Priority | Source Key | Aliases |
|---|---|---|
| 4 (highest) | `pff` | "PFF", "pff scores" |
| 3 | `site_ratings` | "site ratings" |
| 2 | `nfl_com` | "NFL.com", "nfl", "NFL" |
| 2 | `cbs` | "CBS", "cbs sports" |
| 1 | `draftbuzz` | "DraftBuzz", "draft buzz" |
| 0 (lowest) | `manual` | — |

Priorities are customizable at runtime via `/admin/priorities`.

### Resolution flow

When any importer writes bio data, `writeBioSources()`:
1. Writes values under the source's key in `bio_sources` JSON
2. Iterates all 10 bio fields: `age`, `dob`, `games`, `snaps`, `height`, `weight`, `year`, `position`, `college`, `projected_round`
3. For each field, finds the value from the highest-priority source
4. Writes the winning value to the top-level column
5. Logs errors on failure (does not throw)

---

## 7. Name Normalization Pipeline

### Steps (in order)

1. **`normalizeName()`** — Strip periods, collapse whitespace. `"D.J. Smith Jr."` → `"DJ Smith Jr"`
2. **`compactSlug()`** — Strip ALL non-alphanumeric chars. `"D'Andre O'Neal"` → `"dandresoneal"`
3. **`toSlug()`** — Standard URL slug. `"Cam Ward"` → `"cam-ward"`

### `resolvePlayerId()` — 4-step resolution

```
Input: raw player name (+ optional position, college)
  │
  ▼
Step 1: Check name_corrections table (cached in ImportCaches)
  │
  ▼
Step 2: Exact slug match via toSlug(normalizeName(input))
  │
  ▼
Step 3: Compact slug match (fuzzy — handles apostrophes, hyphens, periods)
  │
  ▼
Step 4: Auto-create new player record (uses position/college from import row)
```

### ImportCaches Pattern

Each import batch builds a fresh `ImportCaches` object (NOT shared across requests):
- `playerCache`: All players loaded with `{id, slug, name, compact}`
- `correctionsCache`: All `name_corrections` rows as `Map<normalizedVariant, canonicalSlug>`

---

## 8. Data Import System

### The 14 Data Types

#### Relational Importers (write to dedicated tables)

| Type | Target Table(s) | Strategy | Source Required |
|---|---|---|---|
| `rankings` | `rankings` + `player_rankings` (+ `positional_rankings` if position_rank mapped) | Upsert by slug + source | ✓ |
| `positional_rankings` | `positional_rankings` + `player_rankings` | Upsert by slug + source | ✓ |
| `adp` | `adp_entries` | Upsert by player_id + source | ✓ |
| `mocks` | `mock_picks` | Build-all-then-delete-old pattern (safety) | ✓ |
| `source_dates` | `source_dates` | Upsert by source + source_type | ✗ |
| `bio_data` | `bio_sources` JSON → top-level columns | Priority-based resolution via `writeBioSources()` | ✓ |

#### Profile Importers (write to JSON columns on `players`)

| Type | JSON Column(s) | Strategy | Bio Source |
|---|---|---|---|
| `pff_scores` | `pff_scores`, `alignments`, `overview` | 3-phase: extract → percentile-rank → merge (12 position templates) | `"pff"` (age) |
| `draftbuzz_grades` | `draftbuzz_grades`, `overview` | Merge per position group | `"draftbuzz"` (age, dob, games, snaps) |
| `athletic_scores` | `athletic_scores` | Merge RAS data | — |
| `site_ratings` | `site_ratings`, `overview` | Merge + write to overview | — |

#### Multi-Table Importers (write to multiple destinations)

| Type | Destinations | Source Name |
|---|---|---|
| `nfl_profiles` | `player_rankings`, `site_ratings` JSON, `overview` JSON, `player_comps`, `commentary`, `bio_sources` (eligibility→year) | "NFL.com" |
| `bleacher_profiles` | `player_rankings`, `site_ratings` JSON, `overview` JSON, `player_comps`, `projected_rounds`, `commentary` | "Bleacher Report" |
| `espn_profiles` | `player_rankings`, `site_ratings` JSON, `overview` JSON, `commentary` (Analysis) | "ESPN" |
| `tdn_profiles` | `player_rankings`, `projected_rounds`, `commentary` (Summary, Strengths, Concerns) | "The Draft Network" |

**All multi-table importers respect Protected Fields** — they never overwrite `players.strengths`, `players.weaknesses`, `players.player_summary`, or `players.projected_role`.

### Mock Import Safety Pattern

1. Build ALL new `mock_picks` rows into an array
2. Only after full array is built: delete existing rows for that source
3. Batch-insert new rows (100 at a time)
4. If step 1 fails, no data is deleted

### Ranking Table Consolidation

Three tables store ranking data, consumed by different pages:

| Table | Primary Consumer | Key Columns |
|---|---|---|
| `rankings` | `/rankings` page | slug, source, rank_value |
| `positional_rankings` | `/boards` position boards | slug, source, rank, position |
| `player_rankings` | `/player/[slug]` profiles | player_id, source, overall_rank, positional_rank |

Ranking importers auto-cascade writes to keep these in sync.

### Source Date Auto-Update

When importing `rankings` or `mocks`, the dispatcher auto-upserts `source_dates` with today's date.

### PFF Import — 3-Phase Process

1. **Extract** — Parse CSV, map columns per position template (12 templates: CB, SAF, DT, EDGE, LB, OL, OT, IOL, QB, RB, WR, TE). Each defines 12–18 metrics. Also extracts alignment data.
2. **Percentile Rank** — Groups by position, ranks all players per metric, computes percentile (0.0–1.0). Result: `{ value: "89.2", percentile: 0.95 }`.
3. **Write** — Merges PFF scores, alignments, and overview. Writes bio data (age) through `writeBioSources()`.

### Upload Manager UI

5-step wizard: Select Type → Upload File → Map Columns → Preview → Done

- **10 MB file size limit** enforced before parsing
- **Auto-mapping** via fuzzy column name matching
- **File formats**: CSV, TSV, TXT (PapaParse), XLSX, XLS (SheetJS)
- **Bio Priority selector** for `rankings` and `bio_data` types

---

## 9. Profile System

### What makes a "profile"

A player has a profile when `overview != '{}'`. This gates:
- Visibility on `/players` page
- Profile page at `/player/[slug]`
- Profile count display in admin header

### Profile Detail View (`PlayerDetailView.tsx`)

**Overview Tab:**
- Header: name, position badge, college, projected round card
- Key Stats Row: Height, Weight, Age, Year, Games, Snaps, Scheme, Role
- Player Comps row (from `player_comps`, hidden sources filtered)
- Round Projections row (from `projected_rounds`, hidden sources filtered)
- Summary, Strengths, Weaknesses, Accolades
- PFF Scores grid — direction-aware percentile coloring, values rounded to 1 decimal
- Athletic Testing (RAS data)
- Overall Rankings, Positional Rankings, ADP by Source
- Site Ratings (scale-aware), DraftBuzz Grades, Injury History, Snap Alignments

**Scouting Tab:**
- Skills & Traits Breakdown (categories with positives/negatives)
- Commentary accordion (per source, titled sections, hidden sources filtered)

### Position Templates

12 templates define position-specific metrics:
```
CB, SAF, DT, EDGE, LB, OL, OT, IOL, QB, RB, WR, TE
```

---

## 10. Unified Color System

> Full constant values, function signatures, and PFF stat member lists: see [`CONTEXT_INTERNALS.md`](CONTEXT_INTERNALS.md) §1

All grade and PFF color coding flows through `src/lib/colors.ts`.

### 5-Tier Color Scale

| Tier | Color | Tailwind Class | Percentile Threshold |
|------|-------|----------------|---------------------|
| Elite | Blue bold | `text-blue-400 font-bold` | ≥ 90th |
| Great | Green semi-bold | `text-green-400 font-semibold` | ≥ 70th |
| Good | Yellow | `text-yellow-400` | ≥ 40th |
| Below Avg | Orange | `text-orange-400` | ≥ 20th |
| Poor | Red | `text-red-400` | < 20th |
| Neutral | White | `text-white` | N/A |

Only `PLAIN` ("text-white") is exported. Tier constants are internal-only.

### Grade Scale Detection (`getGradeColor`)

Detection order: ESPN → NFL → Gridiron → DraftBuzz → Rivals → 24/7 → Bleacher → `/grade/i` regex → `/blk|block/i` → fallback by value range.

| Source(s) | Raw Range | Normalizer |
|-----------|-----------|------------|
| PFF year grades, ESPN, DraftBuzz | 0–100 | `(v - 60) / 35` |
| NFL.com | 5.0–7.2 | `(v - 5.8) / 1.4` |
| Gridiron | 6.0–9.0 | `(v - 6.5) / 2.0` |
| Rivals | 5.0–6.0 | `(v - 5.5) / 0.5` |
| 24/7 Sports | 80–100 | `(v - 82) / 16` |
| Bleacher Report | 6.0–8.0 | `(v - 6.0) / 2.0` |

### PFF Stat Direction Awareness

- **Lower is Better**: Comp. %, Passer Rating, Missed Tackles, Missed Tkl Rate, Pass Rat. All., Penalties, Hits/Sacks/Hurries/Pressures Allowed, Drop %, Missed Tkls
- **Neutral** (plain white): Dropped Picks, % In Man/Zone, ADORT, TD/INT, Tackles, Interceptions, Coverage/Run Stops, Batted Balls, Forced Fumbles, Total Pressures, CCR
- **Higher is Better**: Everything else (grades, Coverage Grade, Pass Rush, Receiving, etc.)

### Context-Specific Percentile Handling

| Context | Function | Behavior |
|---------|----------|----------|
| Position Boards | `getPffColorByPercentile(metric, pct)` | Trusts stored percentile (1.0 = best). Neutral → PLAIN. |
| Player Profiles | `getPffColorForProfile(metric, pct)` | Naive rank: 0.0 = highest raw. Flips higher-is-better with `1 - pct`. |
| Fallback | `getPffColorByValue(metric, value)` | Colors by raw 0–100 value, respects direction. |

### OL Metric Disambiguation (in `data.ts`)

For IOL/OT position boards, bare metric names are renamed to avoid confusion with DL/ED stats:
- `"Hits"` → `"Hits Allowed"`, `"Sacks"` → `"Sacks Allowed"`, `"Hurries"` → `"Hurries Allowed"`, `"Pressures"` → `"Pressures Allowed"`
- Their naive percentiles are flipped (`1 - pct`) since for OL these are "lower is better"
- DT/EDGE keep bare names where higher = better

---

## 11. Public-Facing Pages

| Route | Data Source | Key Feature |
|---|---|---|
| `/` (Home) | `getEnrichedBigBoard()` + `getUserBoard()` | Tabbed: Bengals (default) / Consensus / Expanded / My Board (logged in). Stats row. |
| `/players` | `getPlayers()` + `getProfileCount()` | Card grid, search + position filter. Only profiled players. |
| `/player/[slug]` | `getCachedProfile()` (React `cache()` dedup) | Full profile, Overview + Scouting tabs. `force-dynamic`. |
| `/boards` | `getPositionBoards()` + `getUserPositionRanks()` | 9 position group tabs. Expandable rows. "My Rankings" toggle (logged in). |
| `/login` | — | Public login form (email/password). Redirects to `/` if already logged in. |
| `/register` | — | Public registration form. Redirects to `/` if already logged in. |
| `/rankings` | `getRankings()` + `getADP()` | Source tabs, position filters, source dates. |
| `/mocks` | `getMocks()` | Single Source / Compare view with team filter. |

### Data Layer (`data.ts`)

Server-only module. Key patterns:
- **`fetchAll()`** — Paginates past Supabase's 1000-row limit. **Throws** on errors.
- **`HIDDEN_SOURCES`** — `Set(["Bleacher", "Con", "Premier Con."])`. Filtered from all public queries.
- **`CONSENSUS_SOURCES`** — `["Brugler", "NFL.com", "CBS", "PFF", "ESPN"]`. Used to compute "Avg" on position boards.
- **Error handling** — All Supabase calls log errors via `console.error`. `fetchAll()` throws; others log and fall back to empty data.

---

## 12. Admin Backend

### Admin Pages (13 routes)

| Route | Purpose | Key Actions |
|---|---|---|
| `/admin` | Player management | Search, profile status filter, Edit links, Create Profile |
| `/admin/login` | Auth | Email/password login form |
| `/admin/player/new` | Create player | Full 14-field form |
| `/admin/player/[slug]` | Edit player | 14 fields + 6 validated JSON textareas + Skills/Traits editor + Create Profile banner |
| `/admin/upload` | Data import | 5-step wizard, 14 data types, 5 stats cards, 10MB limit |
| `/admin/boards` | Big Board editor | Drag-and-drop for Consensus/Bengals/Expanded |
| `/admin/boards/positions` | Position Board editor | Drag-and-drop for 11 position groups |
| `/admin/corrections` | Name corrections | Variant→canonical mappings. Audit + merge for duplicates. |
| `/admin/positions` | Position audit | Finds non-canonical positions. Fix-one or fix-all. |
| `/admin/dates` | Source dates | View/edit "last updated" for ranking and mock sources |
| `/admin/priorities` | Bio priorities | View/change source priorities. Re-resolves fields on change. |
| `/admin/cleanup` | Data cleanup | Players with missing position/college. Cascading delete. |
| `/admin/colors` | Color reference | Static visual: tier swatches, scale breakpoints, PFF stat directions. |

### Admin Layout Navigation

Top nav: Players · Boards · Upload · Corrections · Positions · Dates · Priorities · Colors · Cleanup · Back to Site

### Player Editor JSON Validation

All 6 JSON textareas (`overview`, `site_ratings`, `pff_scores`, `athletic_scores`, `draftbuzz_grades`, `alignments`) are validated with `JSON.parse()` before submit. Invalid JSON shows an error and prevents save.

### Delete Player

Cascading delete across all 13 child tables. Redirects to `/admin` on success.

---

## 13. Shared Components

| Component | Props | Purpose |
|-----------|-------|---------|
| `BoardTable` | `players: BoardPlayer[]`, `title: string` | Ranked table with search + position pills. Links to `/player/[slug]`. |
| `ExpandedBoardTable` | `players: ExpandedBoardPlayer[]`, `title: string` | Expandable rows: grades (color-coded), ranks, summary. `<React.Fragment key>`. Expand/collapse all. |
| `Navigation` | `userEmail?: string`, `isAdmin?: boolean` | Sticky top nav: Big Board, Position Boards, Rankings, Mock Drafts, All Players. Admin link (admin only). User email + Sign Out or Sign In link. Mobile hamburger. |
| `UserBoardEditor` | `initialPlayers: BoardPlayer[]`, `consensusBoard?: BoardPlayer[]` | My Board editor: search to add, drag to reorder, remove. "Copy Consensus Board" button. Empty state with seed prompt. |
| `PlayerGrid` | `players: PlayerIndex[]` | Card grid with search + position filter. Name, badge, college, bio stats, projected round. |
| `PositionBadge` | `position: string` | Colored pill via `normalizePosition()` + `getPositionColor()`. Shows "—" for null. |

---

## 14. Authentication & Middleware

- **Provider:** Supabase Auth (email/password, multi-user registration)
- **Admin gate:** `ADMIN_EMAIL` env var — only this email can access `/admin/*`
- **Middleware:** `src/middleware.ts` — catch-all matcher (excludes static files)
- **Session refresh:** Calls `supabase.auth.getUser()` on every route to keep tokens alive

### Route Rules

| Route | Rule |
|---|---|
| `/admin/login` | Public. Redirects to `/admin` if user is admin. |
| `/admin/*` | Requires `user.email === ADMIN_EMAIL`. Non-admin users → `/`. Unauthenticated → `/admin/login`. |
| `/login`, `/register` | Public. Redirects to `/` if already logged in. |
| All other routes | Public. Session refreshed via middleware. |

### Auth Files

| File | Purpose |
|---|---|
| `middleware.ts` | Session refresh, admin gate (`ADMIN_EMAIL`), auth page redirects |
| `src/app/(auth)/actions.ts` | `loginUser()`, `registerUser()`, `logoutUser()` server actions |
| `src/app/(auth)/login/page.tsx` | Public login form (email/password) |
| `src/app/(auth)/register/page.tsx` | Public registration form (email/password/confirm, min 6 chars) |
| `src/app/user-board/actions.ts` | User board CRUD (all require `auth.uid()`) |

### User Features (logged-in, non-admin)

| Feature | Location | Description |
|---|---|---|
| **My Board** | Home page (`/`) → "My Board" tab | Personal big board. Search to add, drag to reorder, remove players. "Copy Consensus Board" to auto-populate. |
| **My Rankings** | Position Boards (`/boards`) → "My Rankings" toggle | Per-position reordering. "Copy Default Order" to seed. Drag to reorder. Remove individual players. |

### Navigation Auth Awareness

- **Admin user:** Shows all nav + Admin link + email + Sign Out
- **Regular user:** Shows all nav + email + Sign Out (no Admin link)
- **Not logged in:** Shows all nav + Sign In link
- Props: `userEmail` and `isAdmin` passed from root `layout.tsx`

### RLS (Row Level Security)

| Table | RLS | Policy |
|---|---|---|
| `user_boards` | ✅ Enabled | SELECT/INSERT/UPDATE/DELETE: `auth.uid() = user_id` |
| `user_position_ranks` | ✅ Enabled | SELECT/INSERT/UPDATE/DELETE: `auth.uid() = user_id` |
| All other tables | ❌ Disabled | Public read, admin-only write (enforced by middleware) |

> **Critical:** User data queries (`getUserBoard`, `getUserPositionRanks`) MUST use `createSupabaseServer()` (session-aware), NOT the plain `supabase` client. The plain client has no session → `auth.uid()` is null → RLS returns zero rows.

---

## 15. Key Concepts & Gotchas

### The Overview Gate

A player "has a profile" iff `overview != '{}'`. Data importers write to `pff_scores` etc. but leave `overview` empty — the player has data but no visible profile until explicitly activated.

### JSON Column Architecture

Profile data is stored as JSON columns rather than relational tables because each position has different metrics and data is always read/written as a unit per player.

### Hidden Sources

`HIDDEN_SOURCES = Set(["Bleacher", "Con", "Premier Con."])`:

| Source | Reason |
|---|---|
| `"Bleacher"` | Superseded by `"Bleacher Report"` from bleacher_profiles importer |
| `"Con"` | Internal consensus ADP — used to compute `consensus_adp` then hidden |
| `"Premier Con."` | Legacy computed consensus from original Excel migration |

### Protected Fields (Never Overwritten by Imports)

| Field | Column |
|---|---|
| Strengths | `players.strengths` |
| Weaknesses | `players.weaknesses` |
| Player Summary | `players.player_summary` |
| Projected Role | `players.projected_role` |

Import data goes to `commentary` table instead.

### Position Board Dynamic Rankings

Overall Rank and POS Rank on position boards are computed at read time from `player_rankings` using `CONSENSUS_SOURCES`, not stored on `position_board_entries`. "Avg" = simple average of available sources.

### Two Position Normalization Systems

| System | Location | Purpose | Examples |
|--------|----------|---------|---------|
| `normalizePffPosition()` | upload/actions.ts | Maps to PFF template keys | DI→DT, DE→EDGE, G→IOL |
| `POS_ALIASES` / `normalizePosition()` | types.ts | Maps to display abbreviations | EDGE→ED, OLB→ED, WDE→ED, DB→CB, OL→OT |

### Revalidation

After data mutations, `revalidatePath()` busts SSR cache on: `/admin`, `/players`, `/`, `/rankings`, `/mocks`, `/player/[slug]`, admin layout.

### Legacy JSON Files

`src/data/` contains original JSON files from before the Supabase migration. **No longer used as primary data source** but remain in the repo.

---

## 16. Environment & Deployment

### Environment Variables

| Variable | Where Used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All Supabase clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Defined but **unused** |
| `ADMIN_EMAIL` | `middleware.ts` + `layout.tsx` — gates `/admin/*` access and Admin nav link |

All vars must also be set in Vercel Environment Variables for production.

### Deployment

1. Push to `main` on GitHub → Vercel auto-builds → site is live
2. All pages server-render on demand (`force-dynamic` on player pages)

### Local Development

```bash
cd draft-board-app
npm run dev          # Next.js dev server on port 3000
```

### Python Environment (migration scripts only)

```bash
cd C:\Users\hetze\OneDrive\Desktop\DBs
.venv\Scripts\Activate.ps1   # Python 3.14 venv
```

---

## 17. Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.1.6 | Next.js framework |
| `react` / `react-dom` | 19.2.3 | React |
| `@supabase/supabase-js` | ^2.95.3 | Supabase client |
| `@supabase/ssr` | ^0.8.0 | Supabase SSR helpers (cookie auth) |
| `@dnd-kit/core` | ^6.3.1 | Drag-and-drop |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable lists |
| `@dnd-kit/utilities` | ^3.2.2 | CSS transform utilities |
| `@vercel/analytics` | ^1.6.1 | Analytics |
| `papaparse` | ^5.5.3 | CSV/TSV parser |
| `xlsx` | ^0.18.5 | Excel parser (~1MB bundle) |
| `server-only` | ^0.0.1 | Prevents data.ts client import |

### Dev

| Package | Version |
|---------|---------|
| `tailwindcss` / `@tailwindcss/postcss` | ^4 |
| `typescript` | ^5 |
| `eslint` / `eslint-config-next` | ^9 / 16.1.6 |
| `@types/node`, `@types/react`, `@types/react-dom`, `@types/papaparse` | Various |

---

## 18. Excel Workbook Reference

**File:** `C:\Users\hetze\OneDrive\Desktop\DBs\2026 Draft Board 2.0.xlsx` (255+ sheets)

| Category | Example Sheets | Imported As |
|---|---|---|
| Big Board | Consensus Board, Bengals Board, Expanded Board | Initial migration only |
| Rankings | CBS, ESPN, PFF, NFL, Dane Brugler, etc. | `rankings` |
| Positional Rankings | CBS QB, ESPN WR, etc. | `positional_rankings` |
| Mock Drafts | CBS Mock, ESPN Mock, etc. | `mocks` |
| ADP | ADP sheet | `adp` |
| PFF Stats | PFF_Stats CB, PFF_Stats QB, etc. | `pff_scores` |
| DraftBuzz | DB CB, DB QB, etc. | `draftbuzz_grades` |
| Athletic | RAS Data | `athletic_scores` |
| Grades | Grades sheet (NFL/ESPN/Gridiron/Bleacher columns) | `site_ratings` |

### Standalone Upload Files

| File | Contents | Imported As |
|---|---|---|
| `PFF Stats *.xlsx` | All positions, 173 columns | `pff_scores` |
| `NFL Profiles *.xlsx` | Top ~50 prospects | `nfl_profiles` |
| `Bleacher Profiles *.xlsx` | ~225 prospects | `bleacher_profiles` |

---

## 19. Operations Guide

### Import new ranking data
1. `/admin/upload` → "Overall Rankings" → upload → map columns → enter source name → import
2. Source date auto-updates. `player_rankings` auto-syncs.

### Create a profile
1. `/admin` → find player (filter "No Profile") → **"+ Profile"**
2. Player immediately appears on `/players`

### Add a name correction
1. `/admin/corrections` → search canonical player → add variant → audit → merge if duplicates

### Update PFF data
1. `/admin/upload` → "PFF Scores + Alignments" → upload combined XLSX → verify match stats → import

### Import source profiles (NFL.com / Bleacher / ESPN / TDN)
1. `/admin/upload` → select profile type → upload → map columns → import
2. Rankings, grades, comps, commentary written. Manual fields never overwritten.

### Fix non-canonical positions
1. `/admin/positions` → review → fix-one or fix-all

### Clean up orphan players
1. `/admin/cleanup` → review → remove or skip

---

## 20. Known Limitations & Deferred Items

See [`TECH_DEBT_FIXES.md`](TECH_DEBT_FIXES.md) for the full audit (29 items) with status tracking.

**Completed:** #1–10, #12, #15, #17, #18, #23, #25, #26 (19 of 29)

**Deferred (10 items):**

| # | Issue | Reason |
|---|-------|--------|
| 11 | No ISR / generateStaticParams | Current traffic fine; ensures fresh data |
| 13 | PFF percentiles semantically inverted for lower-is-better stats | Display layer compensates correctly |
| 14 | Source names not case-normalized | Single admin, consistent workflow |
| 16 | Only first Excel sheet parsed | Not yet needed |
| 19 | Athletic scores empty state cosmetic | No functional impact |
| 20 | Inconsistent age typing (string vs number) | Works as-is |
| 21 | Accessibility gaps (aria-labels, keyboard) | Large effort, no functional impact |
| 22 | ~~No admin role check~~ | ✅ **Fixed** — `ADMIN_EMAIL` env var gates `/admin/*` access |
| 24 | fetchAll() no ORDER BY | No observed issues |
| 27–29 | Slug collisions, form constraints, xlsx bundle | Low priority |
