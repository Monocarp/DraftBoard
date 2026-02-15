# NFL Draft Board — Complete Technical Context

> **Last Updated:** February 15, 2026
> **Repository:** https://github.com/Monocarp/DraftBoard
> **Live Site:** Auto-deploys to Vercel on push to `main`
> **Supabase Project:** https://cmapsylsrsglhfdwquwe.supabase.co

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
10. [Admin Backend](#10-admin-backend)
11. [Public-Facing Pages](#11-public-facing-pages)
12. [Authentication & Middleware](#12-authentication--middleware)
13. [Key Concepts & Gotchas](#13-key-concepts--gotchas)
14. [Environment & Deployment](#14-environment--deployment)
15. [Excel Workbook Reference](#15-excel-workbook-reference)

---

## 1. Stack & Architecture

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16.1.6 (App Router) |
| **Language** | TypeScript 5 |
| **UI** | React 19.2.3, Tailwind CSS v4 |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | Supabase Auth (email/password) |
| **Hosting** | Vercel (auto-deploy from GitHub `main`) |
| **Drag & Drop** | @dnd-kit/core + @dnd-kit/sortable |
| **File Parsing** | PapaParse (CSV/TSV), SheetJS/xlsx (Excel) |
| **Analytics** | @vercel/analytics |
| **PWA** | Progressive Web App configured |

### Supabase Clients (3 variants)

| File | Usage | Auth Context |
|---|---|---|
| `src/lib/supabase.ts` | Server data reads (`data.ts`) | Anon key, no cookies |
| `src/lib/supabase-server.ts` | Server actions (admin mutations) | Anon key + cookies (auth-aware) |
| `src/lib/supabase-browser.ts` | Client components (login form) | Anon key + browser cookies |

> **Note:** The `SUPABASE_SERVICE_ROLE_KEY` is defined in `.env.local` but never used in code. All server operations use the anon key with Row Level Security disabled.

> **Config:** `next.config.ts` sets `experimental.serverActions.bodySizeLimit = "10mb"` to handle large file uploads (e.g. PFF Stats with 173 columns).

---

## 2. Project Structure

```
src/
├── lib/                         # Shared utilities
│   ├── types.ts                 # All TypeScript interfaces & constants
│   ├── data.ts                  # Read-only data fetching layer (server-only)
│   ├── supabase.ts              # Supabase client (server reads)
│   ├── supabase-server.ts       # Supabase client (server actions, cookie-aware)
│   └── supabase-browser.ts      # Supabase client (browser)
│
├── components/                  # Shared UI components
│   ├── Navigation.tsx           # Site-wide nav bar with active tab highlighting
│   ├── BoardTable.tsx           # Big Board table (consensus & bengals)
│   ├── ExpandedBoardTable.tsx   # Expanded board with grades, ranks, summary
│   ├── PlayerGrid.tsx           # Players index grid with search/filter
│   └── PositionBadge.tsx        # Color-coded position pill
│
├── app/                         # Next.js App Router pages
│   ├── layout.tsx               # Root layout (dark theme, navigation, analytics)
│   ├── page.tsx                 # Home: Big Board (tabbed: Bengals/Consensus/Expanded)
│   ├── BigBoardPage.tsx         # Client component for tabbed board view
│   ├── globals.css              # Global styles + Tailwind
│   │
│   ├── players/page.tsx         # Players index page (grid of all profiled players)
│   ├── boards/                  # Position Boards page
│   ├── rankings/                # Rankings & ADP aggregation page
│   ├── mocks/                   # Mock Drafts page
│   │
│   ├── player/[slug]/           # Individual player profile
│   │   ├── page.tsx             # SSG with generateStaticParams + generateMetadata
│   │   ├── PlayerDetailView.tsx # Full profile view (2 tabs: Overview + Scouting)
│   │   └── not-found.tsx        # "Profile In Progress" placeholder
│   │
│   └── admin/                   # Auth-protected admin backend
│       ├── layout.tsx           # Admin chrome (nav, auth gate)
│       ├── page.tsx             # Player Management (list all players)
│       ├── AdminPlayerList.tsx  # Searchable/filterable player table
│       ├── actions.ts           # Login/logout server actions
│       ├── LogoutButton.tsx     # Sign out button
│       ├── login/page.tsx       # Admin login form
│       │
│       ├── player/              # Player CRUD
│       │   ├── actions.ts       # savePlayer, deletePlayer, createProfile
│       │   ├── PlayerEditorForm.tsx   # Full player edit form
│       │   ├── SkillsTraitsEditor.tsx # Visual skills/traits card editor
│       │   ├── [slug]/page.tsx  # Edit existing player
│       │   └── new/page.tsx     # Create new player
│       │
│       ├── upload/              # Data Import System
│       │   ├── page.tsx         # Upload page with stats cards (5 stat cards)
│       │   ├── actions.ts       # 11 importer functions + helpers
│       │   └── UploadManager.tsx # 5-step wizard UI (11 data type cards)
│       │
│       ├── corrections/         # Name Corrections
│       │   ├── page.tsx         # Corrections page
│       │   ├── actions.ts       # CRUD + audit/merge actions
│       │   └── CorrectionsManager.tsx # Search, add, import, audit UI
│       │
│       ├── dates/               # Source Date Management
│       │   ├── page.tsx         # Dates page
│       │   ├── actions.ts       # CRUD for source_dates
│       │   └── SourceDatesManager.tsx # Split Rankings/Mocks date editor
│       │
│       └── boards/              # Board Editor (drag-and-drop)
│           ├── page.tsx         # Big Board editor page
│           ├── actions.ts       # Board CRUD actions
│           ├── BigBoardEditor.tsx     # Tabbed board editor
│           ├── SortableBoardEditor.tsx # Reusable DnD list (used by both)
│           └── positions/
│               ├── page.tsx           # Position Board editor page
│               └── PositionBoardEditor.tsx # Tabbed by position group
│
├── data/                        # Legacy JSON files (no longer primary source)
│   ├── adp.json, ages.json, big_board.json, mocks.json, players.json,
│   ├── position_boards.json, positional_rankings.json, rankings.json, ras.json
│   └── profiles/               # 141 player profile JSON files (legacy)
│
└── middleware.ts                # Auth middleware (protects /admin/*)
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
| `height` | text | e.g. `6'2"` |
| `weight` | text | e.g. `215 lbs` |
| `age` | numeric | Current age |
| `dob` | text | Date of birth string |
| `year` | text | Eligibility (Jr, Sr, rSr, etc.) |
| `projected_round` | text | e.g. `1`, `2`, `3-4` |
| `projected_role` | text | e.g. `Day 1 Starter` |
| `ideal_scheme` | text | e.g. `Zone`, `Power` |
| `games` | integer | College games played |
| `snaps` | integer | College snap count |
| `strengths` | text | Freeform scouting text |
| `weaknesses` | text | Freeform scouting text |
| `accolades` | text | Awards, honors |
| `player_summary` | text | Overview paragraph |
| **`overview`** | **jsonb** | **Key-value bio/ratings (GATES profile visibility)** |
| `site_ratings` | jsonb | `{ "NFL.com": "6.5", "ESPN": "92", ... }` |
| `pff_scores` | jsonb | `{ "Coverage Grade": { "value": "89.2", "percentile": 0.95 }, ... }` |
| `athletic_scores` | jsonb | `{ "40 Time": { "result": "4.42", "grade": "9.1" }, ... }` |
| `draftbuzz_grades` | jsonb | `{ "Tackling": 85, "Coverage": 72, ... }` |
| `alignments` | jsonb | `{ "Slot": { "2025": 45, "career": 120 }, ... }` |
| `skills_traits` | jsonb | `{ "Ball Skills": { "positives": "...", "negatives": "..." }, ... }` |
| **`bio_sources`** | **jsonb** | **Per-source bio values for priority resolution** |

> **Critical:** A player "has a profile" if and only if `overview != '{}'`. This is the gate that controls visibility on the public `/players` page and in `getPlayers()`.

#### Relational Tables

| Table | Key Columns | Relationship |
|---|---|---|
| `board_entries` | player_id, board_type, rank, grades, ranks, summary | FK → players.id |
| `position_board_entries` | player_id, position_group, rank | FK → players.id |
| `rankings` | slug, source, rank, position, position_rank, college, source_type | Keyed by slug |
| `positional_rankings` | slug, source, rank, position, college, source_type | Keyed by slug |
| `player_rankings` | player_id, source, overall_rank, positional_rank | FK → players.id |
| `adp_entries` | player_id, source, adp_value | FK → players.id |
| `mock_picks` | player_id, source, pick_number, team, college | FK → players.id |
| `player_comps` | player_id, source, comp | FK → players.id |
| `projected_rounds` | player_id, source, round | FK → players.id |
| `commentary` | player_id, source, sections (jsonb) | FK → players.id |
| `media_links` | player_id, description, source, url | FK → players.id |
| `injury_history` | player_id, detail, recovery_time, year | FK → players.id |
| `ages` | player_id, age_final | FK → players.id |
| `source_dates` | id, source, source_type, date | Standalone |
| `name_corrections` | id, variant_name, canonical_slug | Standalone |

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

    Standalone:
    ┌──────────────┐  ┌──────────────────┐
    │ source_dates │  │ name_corrections │
    └──────────────┘  └──────────────────┘
```

---

## 4. Data Flow Overview

```
 Excel Workbook                      CSV/XLSX Upload
 (2026 Draft Board 2.0.xlsx)         via /admin/upload
        │                                   │
        │  (exported as CSV per sheet)      │
        ▼                                   ▼
 ┌─────────────────────────────────────────────────┐
 │           Upload Manager (5-step wizard)         │
 │  1. Select data type (11 types)                 │
 │  2. Upload file (CSV/TSV/XLSX)                  │
 │  3. Map columns (auto-detect + manual override) │
 │  4. Preview & Import                            │
 │  5. Done (results summary)                      │
 └─────────────────────┬───────────────────────────┘
                       │
                       ▼
 ┌─────────────────────────────────────────────────┐
 │           Name Normalization Pipeline            │
 │  1. Strip periods, collapse whitespace          │
 │  2. Check name_corrections table                │
 │  3. Match by slug                               │
 │  4. Fuzzy match by compact slug                 │
 │  5. Auto-create player if no match              │
 └─────────────────────┬───────────────────────────┘
                       │
                       ▼
 ┌─────────────────────────────────────────────────┐
 │              11 Specialized Importers            │
 │                                                 │
 │  Relational importers → dedicated tables        │
 │  Profile importers → JSON columns on players    │
 │  Bio data → bio_sources + priority resolution   │
 └─────────────────────┬───────────────────────────┘
                       │
                       ▼
 ┌─────────────────────────────────────────────────┐
 │              Supabase (PostgreSQL)               │
 │         17 tables, 700+ player records           │
 └─────────────────────┬───────────────────────────┘
                       │
                       ▼
 ┌─────────────────────────────────────────────────┐
 │          data.ts (server-only read layer)        │
 │  getPlayers(), getPlayerProfile(), getBigBoard() │
 │  getRankings(), getMockDrafts(), getADP(), etc.  │
 └─────────────────────┬───────────────────────────┘
                       │
                       ▼
 ┌─────────────────────────────────────────────────┐
 │           Public Next.js Pages (SSG/SSR)         │
 │  / (Big Board), /players, /player/[slug],       │
 │  /boards, /rankings, /mocks                     │
 └─────────────────────────────────────────────────┘
```

---

## 5. Player Lifecycle

### States

1. **No record** — Player doesn't exist in the database
2. **Record exists, no profile** — Player has a row in `players` with basic info (name, slug, position, college) but `overview = {}`. They appear in the admin list but NOT on the public site's `/players` page.
3. **Record exists, has profile** — Player has `overview != {}`. They appear publicly and have a full profile page at `/player/[slug]`.

### How players get created

- **Auto-created by importers** — When uploading rankings, mocks, ADP, etc., if a player name can't be resolved to an existing record, `resolvePlayerId()` auto-creates a minimal player record (name + slug + position + college if available).
- **Manually via /admin/player/new** — Admin can create a player with full form fields.

### How profiles get activated

Profiles are **NOT** auto-created by data importers. They must be explicitly activated:

1. **From the admin player list** (`/admin`) — Click the **"+ Profile"** button next to any player without a profile. This calls `createProfile()` which seeds `overview` from the player's top-level columns.
2. **From the player editor** (`/admin/player/[slug]`) — A prominent orange **"Create Profile"** banner appears for profile-less players, with a position template dropdown.
3. **By manually editing `overview` JSON** — Setting it to anything non-empty via the editor activates the profile.

### How profile data accumulates

Data importers (PFF, DraftBuzz, Athletic, Site Ratings) write to JSON columns on the player record (`pff_scores`, `draftbuzz_grades`, `athletic_scores`, `site_ratings`, `alignments`) **regardless of whether the player has a profile**. When the profile is later activated, all that pre-imported data is immediately visible.

---

## 6. Bio Data & Source Priority

The system tracks biographical data (age, DOB, height, weight, games, snaps, etc.) from multiple sources with a priority-based resolution system, modeled after the original Excel workbook's approach.

### How it works

The `bio_sources` JSONB column on `players` stores per-field, per-source values:

```json
{
  "draftbuzz": { "age": "21", "dob": "3/15/2004", "games": "36", "snaps": "2100" },
  "pff": { "age": "22" }
}
```

### Source Priority (highest wins)

| Priority | Source | Notes |
|---|---|---|
| 4 (highest) | `pff` | Premium, most accurate |
| 3 | `site_ratings` | Aggregated site grades |
| 2 | `nfl_com` | NFL.com profiles |
| 1 | `draftbuzz` | Comprehensive coverage, less accurate |
| 0 (lowest) | `manual` | Hand-entered fallback |

### Resolution flow

When any importer writes bio data, it calls `writeBioSources()` which:

1. Writes values under the source's key in `bio_sources` JSON
2. Iterates all bio fields: `age`, `dob`, `games`, `snaps`, `height`, `weight`, `year`, `position`, `college`, `projected_round`
3. For each field, finds the value from the highest-priority source
4. Writes the winning value to the top-level column

**Example:** DraftBuzz says age = 21, then PFF imports age = 22. PFF (priority 3) beats DraftBuzz (priority 1), so `players.age` becomes 22. If DraftBuzz is re-imported, PFF's value still holds.

### Bio fields tracked

| Field | Top-level Column | Type |
|---|---|---|
| `age` | `players.age` | numeric |
| `dob` | `players.dob` | text |
| `games` | `players.games` | integer |
| `snaps` | `players.snaps` | integer |
| `height` | `players.height` | text |
| `weight` | `players.weight` | text |
| `year` | `players.year` | text |
| `position` | `players.position` | text |
| `college` | `players.college` | text |
| `projected_round` | `players.projected_round` | text |

---

## 7. Name Normalization Pipeline

Player names come from many external sources with inconsistent formatting. The system uses a multi-layer normalization pipeline (in `upload/actions.ts`) to resolve names to player records.

### Steps (in order)

1. **`normalizeName()`** — Strip periods, collapse whitespace. `"D.J. Smith Jr."` → `"DJ Smith Jr"`
2. **`compactSlug()`** — Strip ALL non-alphanumeric chars for fuzzy matching. `"D'Andre O'Neal"` → `"dandresoneal"`
3. **`toSlug()`** — Standard URL slug. `"Cam Ward"` → `"cam-ward"`

### `resolvePlayerId()` — 4-step resolution

```
Input: raw player name (+ optional position, college hints)
  │
  ▼
Step 1: Check `name_corrections` table
        If variant_name matches → use canonical_slug → find player by slug
  │
  ▼
Step 2: Exact slug match
        toSlug(normalizeName(input)) → find in player cache
  │
  ▼
Step 3: Compact slug match (fuzzy)
        compactSlug(input) → match against compactSlug(all player names)
        Handles apostrophes, hyphens, periods, Jr/Sr suffixes
  │
  ▼
Step 4: Auto-create
        No match found → insert new player record
        Uses position/college from the import row if available
```

### The `name_corrections` Table

Managed at `/admin/corrections`. Maps known variant spellings to canonical slugs:

| variant_name | canonical_slug |
|---|---|
| `Tetairoa McMillan` | `tetaiora-mcmillan` |
| `AJ Haulcy` | `aj-haulcy` |
| `Cam Ward` | `cam-ward` |

The corrections audit system can detect when both a variant and canonical player record exist, then merge all related data from the variant into the canonical record.

---

## 8. Data Import System

### The 11 Data Types

#### Relational Importers (write to dedicated tables)

| Type | Target Table(s) | Strategy | Source Required |
|---|---|---|---|
| `rankings` | `rankings` + `player_rankings` (+ `positional_rankings` if position_rank mapped) | Upsert by slug + source; auto-syncs overall_rank & positional_rank to `player_rankings` | ✓ |
| `positional_rankings` | `positional_rankings` + `player_rankings` | Upsert by slug + source; auto-syncs positional_rank to `player_rankings` | ✓ |
| `adp` | `adp_entries` | Upsert by player_id + source | ✓ |
| `mocks` | `mock_picks` | Delete-all + reinsert per source | ✓ |
| `source_dates` | `source_dates` | Upsert by source + source_type | ✗ |

#### Profile Importers (write to JSON columns on `players`)

| Type | JSON Column(s) | Strategy | Bio Source |
|---|---|---|---|
| `pff_scores` | `pff_scores`, `alignments`, `overview` | 3-phase: extract → percentile-rank → merge | `"pff"` (age) |
| `draftbuzz_grades` | `draftbuzz_grades`, `overview` | Merge per position group | `"draftbuzz"` (age, dob, games, snaps) |
| `athletic_scores` | `athletic_scores` | Merge RAS data | — |
| `site_ratings` | `site_ratings`, `overview` | Merge + write to overview | — |

#### Multi-Table Importers

| Type | Target Tables | Strategy | Source Required |
|---|---|---|---|
| `nfl_profiles` | `player_rankings`, `site_ratings` JSON, `overview` JSON, `player_comps`, `commentary`, `bio_sources` | Writes rankings, grades, comps, scouting commentary, eligibility | ✗ (hardcoded "NFL.com") |
| `bleacher_profiles` | `player_rankings`, `site_ratings` JSON, `overview` JSON, `player_comps`, `projected_rounds`, `commentary` | Writes rankings, grades, comps, round projections, commentary | ✗ (hardcoded "Bleacher Report") |

### PFF Import — 3-Phase Process

The PFF importer is the most complex:

1. **Phase 1: Extract** — Parse CSV rows, map columns per position template (12 templates: CB, SAF, DT, EDGE, LB, OL, OT, IOL, QB, RB, WR, TE). Each template defines 12–18 metrics with CSV column → display label mapping. Also extracts alignment data (2025 snaps vs career snaps per alignment slot).

2. **Phase 2: Percentile Rank** — Groups all players by position group. For each metric, ranks all players and computes percentile (0.0–1.0). The result is `{ value: "89.2", percentile: 0.95 }` per metric.

3. **Phase 3: Write** — Merges PFF scores, alignments, and overview into existing player data. Writes bio data (age) through `writeBioSources()`.

### Position-Specific Column Mappings

**PFF_POSITION_COLUMNS** — Maps display labels to CSV column headers for each of 12 positions. Example for CB:
- `"Coverage Grade"` → CSV column `"Coverage Grade"`
- `"Passer Rating"` → CSV column `"Passer Rating Against"`
- `"Forced Inc. Rate"` → CSV column `"Forced Incom. Rate"`

**ALIGNMENT_COLUMNS** — Position-specific snap alignment slots:
- CB/SAF/LB: D-Line, Slot, Corner, Box, Deep (coverage alignments)
- DT/EDGE: A Gap, B Gap, Over Tackle, Outside Tackle, Off Ball (D-line alignments)
- OL/OT/IOL: LT, LG, C, RG, RT (O-line snap positions)
- WR: Slot, Wide
- TE: Slot, Inline

**DRAFTBUZZ_GRADE_COLUMNS** — Position-specific grade categories:
- CB: QBR Allowed, Tackling, Run Defense, Coverage, Zone, Man/Press
- QB: Short Passing, Medium Passing, Long Passing, Rush/Scramble
- OL: Pass Blocking Grade, Run Blocking Grade
- etc.

### NFL Profiles Import

The `nfl_profiles` importer ingests data from the NFL.com Profiles Excel file (e.g. `NFL Profiles 2.15.26.xlsx`). It writes to **5 destinations** while carefully avoiding overwriting manually-authored fields:

1. **`player_rankings`** — Overall Rank + Positional Rank (source "NFL.com")
2. **`site_ratings` JSON + `overview` JSON** — Prospect Grade as "NFL.com" key
3. **`player_comps`** — NFL Comparison (source "NFL.com", skips "N/A")
4. **`commentary`** — Overview, Strengths, Weaknesses, Sources Tell Us as titled sections (source "NFL.com")
5. **`bio_sources`** — Eligibility → year field via `writeBioSources("nfl_com", ...)`

**Column mappings (13):** player_name, position, school, rank, pos_rank, prospect_grade, prospect_grade_indicator, overview, strengths, weaknesses, sources_tell_us, nfl_comparison, eligibility.

**Does NOT write to:** `players.strengths`, `players.weaknesses`, `players.player_summary`, `players.projected_role` — these are manually authored (see Protected Fields).

### Bleacher Report Profiles Import

The `bleacher_profiles` importer ingests data from the Bleacher Report Profiles Excel file (e.g. `Bleacher Profiles 2.14.26.xlsx`). It writes to **5 destinations** while respecting protected fields:

1. **`player_rankings`** — Overall Rank (source "Bleacher Report")
2. **`site_ratings` JSON + `overview` JSON** — Grade as "Bleacher Report" key
3. **`player_comps`** — Pro Comparison (source "Bleacher Report", skips "N/A")
4. **`projected_rounds`** — Projected Round (source "Bleacher Report")
5. **`commentary`** — Overall, Positives, Negatives as titled sections (source "Bleacher Report")

**Column mappings (8):** player_name, overall_rank, grade, pro_comparison, projected_round, overall, positives, negatives.

**Does NOT write to:** `players.strengths`, `players.weaknesses`, `players.player_summary`, `players.projected_role` — these are manually authored (see Protected Fields).

### Ranking Table Consolidation

Three tables store ranking data, each consumed by different public pages:

| Table | Primary Consumer | Key Columns |
|---|---|---|
| `rankings` | `/rankings` page | slug, source, rank, position_rank |
| `positional_rankings` | `/boards` position boards | slug, source, rank, position |
| `player_rankings` | `/player/[slug]` profiles | player_id, source, overall_rank, positional_rank |

To keep these in sync, the ranking importers automatically cascade writes:

- **`importRankings()`** writes to `rankings` table, then upserts `player_rankings` with overall_rank. If `position_rank` is mapped and present, also writes to `positional_rankings` and includes positional_rank in the `player_rankings` upsert.
- **`importPositionalRankings()`** writes to `positional_rankings` table, then upserts/updates `player_rankings` with just the positional_rank field.

This means uploading via either Overall Rankings or Positional Rankings will automatically populate the profile page's ranking display.

### Source Date Auto-Update

When importing `rankings` or `mocks`, the dispatcher automatically upserts a `source_dates` entry with today's date for that source name. This keeps the "Last Updated" dates current without manual intervention.

### Upload Manager UI (5 Steps)

1. **Select Data Type** — Grid of 11 data type cards, each showing label and description
2. **Upload File** — Drag-and-drop or click to upload CSV/TSV/XLSX/XLS
3. **Map Columns** — Auto-maps by fuzzy name matching. Manual dropdown override per required column. Shows unmapped columns.
4. **Preview & Import** — 20-row table preview. Source name input (if required). Import button.
5. **Done** — Inserted/Updated/Skipped counts + error list. Option to import another.

---

## 9. Profile System

### What makes a "profile"

A player has a profile when their `overview` JSON column is non-empty (`!= {}`). This single field gates:

- Visibility on `/players` page (`getPlayers()` filters `overview != '{}'`)
- Profile page at `/player/[slug]` (via `generateStaticParams()`)
- Profile count display in admin header

### Profile data structure (on `players` table)

All profile data lives as JSON columns on the player row:

```
overview:          { "POS": "CB", "College": "Ohio State", "Height": "6'1\"", "Weight": "195", ... }
pff_scores:        { "Coverage Grade": { "value": "89.2", "percentile": 0.95 }, ... }
draftbuzz_grades:  { "Tackling": 85, "Coverage": 72, ... }
athletic_scores:   { "40 Time": { "result": "4.42", "grade": "9.1" }, ... }
site_ratings:      { "NFL.com": "6.5", "ESPN": "92", ... }
alignments:        { "Slot": { "2025": 45, "career": 120 }, ... }
skills_traits:     { "Ball Skills": { "positives": "...", "negatives": "..." }, ... }
bio_sources:       { "pff": { "age": "22" }, "draftbuzz": { "age": "21", "dob": "..." }, ... }
```

### Profile Detail View (`PlayerDetailView.tsx`)

Two tabs:

**Overview Tab:**
- Header: name, position badge, college, projected round card
- Key Stats Row: Height, Weight, Age, Year, Games, Snaps, Scheme, Role
- Player Comps (from `player_comps` table)
- Round Projections (from `projected_rounds` table)
- Summary, Strengths, Weaknesses, Accolades (text fields)
- PFF Scores grid with percentile color coding (green→yellow→red)
- Athletic Testing (RAS data)
- Overall Rankings, Positional Rankings, ADP by Source (from relational tables)
- Site Ratings, DraftBuzz Grades, Injury History, Snap Alignments

**Scouting Tab:**
- Skills & Traits Breakdown (categories with positives/negatives)
- Commentary accordion (per source, with titled sections)

### Position Templates

12 templates define which PFF metrics, DraftBuzz grades, and alignment slots are relevant per position. Used by the `createProfile()` action and the position template dropdown in the editor.

```
CB, SAF, DT, EDGE, LB, OL, OT, IOL, QB, RB, WR, TE
```

Position normalization maps variants to standard keys:
- `DE`, `ED`, `EDGE` → `EDGE`
- `IDL`, `DT`, `NT` → `DT`
- `S`, `FS`, `SS`, `SAF` → `SAF`
- `OG`, `C`, `IOL` → `IOL`
- `OT`, `T` → `OT`

---

## 10. Admin Backend

### Access

All `/admin/*` routes are protected by middleware. Auth is Supabase email/password. The login page is at `/admin/login`.

### Pages

| Route | Purpose |
|---|---|
| `/admin` | Player list with search, profile filter, Edit links, + Profile buttons |
| `/admin/player/new` | Create new player form |
| `/admin/player/[slug]` | Edit player — full form + Create Profile banner if no profile |
| `/admin/upload` | Data import wizard (11 types) with 5 stats cards |
| `/admin/boards` | Big Board editor (Consensus, Bengals, Expanded) with drag-and-drop |
| `/admin/boards/positions` | Position Board editor (11 position groups) with drag-and-drop |
| `/admin/corrections` | Name corrections manager + audit/merge system |
| `/admin/dates` | Source date editor (rankings + mock drafts) |

### Player Editor Features

- **Basic Information** — 14 fields (name, slug, position, college, height, weight, age, DOB, year, projected round, projected role, ideal scheme, games, snaps)
- **Scouting Notes** — Summary, strengths, weaknesses, accolades (textareas)
- **Skills & Traits** — Visual card editor with 30 autocomplete categories, per-category positives/negatives, reorder/add/delete
- **Advanced Data (JSON)** — Raw JSON textareas for overview, site_ratings, pff_scores, athletic_scores, draftbuzz_grades, alignments
- **Create Profile Banner** — Appears for players without profiles, with position template auto-detection and dropdown override
- **Delete Player** — Cascading delete across 13 related tables

### Board Editor Features

- Drag-and-drop reordering via @dnd-kit
- Player search to add (ILIKE search)
- Remove with optimistic updates
- Auto re-ranking on save
- Three big board types: Consensus, Bengals, Expanded
- Eleven position board groups

### Corrections Audit & Merge

The audit system detects when:
1. A correction maps `variant_name` → `canonical_slug`
2. Both the variant player AND canonical player exist as separate records
3. Both have data in various tables

The merge process:
1. Moves all `player_id` references from variant → canonical across 10 tables
2. Updates slug references in `rankings` and `positional_rankings`
3. Deletes the variant player record

---

## 11. Public-Facing Pages

| Route | Data Source | Rendering |
|---|---|---|
| `/` (Home) | `getEnrichedBigBoard()` | SSG — Tabbed: Bengals (default) / Consensus / Expanded |
| `/players` | `getPlayers()` + `getProfileCount()` | SSG — Searchable grid, filters by position |
| `/player/[slug]` | `getPlayerProfile()` | SSG via `generateStaticParams()` |
| `/boards` | `getPositionBoards()` | SSG — 11 position group tabs |
| `/rankings` | `getRankings()` + `getADP()` | SSG — Source tabs with position filters |
| `/mocks` | `getMockDrafts()` | SSG — Source tabs, round filter |

### Big Board (Home Page)

Three board types in tabs:
- **Bengals Board** (default tab) — Team-specific prospect rankings
- **Consensus Board** — Aggregated overall rankings
- **Expanded Board** — Includes grade breakdowns, source ranks, and summaries per player

### Data Layer (`data.ts`)

Server-only module that fetches from Supabase. Key pattern: uses `fetchAll()` helper to paginate past Supabase's 1000-row limit.

Important functions:
- `getPlayers()` — Filters on `overview != '{}'` (profile gate)
- `getPlayerProfile()` — Assembles full profile: player row + 7 parallel queries
- `getBigBoard()` / `getEnrichedBigBoard()` — Board entries with joined player data
- `getRankings()` — Grouped by slug with source dates
- `getMockDrafts()` — Grouped by source with source dates
- `getADP()` — Grouped by slug with consensus calculation
- `getPositionBoards()` — Position-specific boards with full stats

---

## 12. Authentication & Middleware

### Setup

- **Provider:** Supabase Auth (email/password only)
- **Middleware:** `src/middleware.ts` intercepts all `/admin/*` requests
- **Session refresh:** Middleware calls `supabase.auth.getUser()` to refresh the session token
- **Login:** `/admin/login` — email + password form → `signInWithPassword()`
- **Logout:** Server action calling `signOut()` → redirect to `/admin/login`

### Protection rules

| Route | Rule |
|---|---|
| `/admin/login` | Public. Redirects TO `/admin` if already authenticated. |
| `/admin/*` (everything else) | Requires auth. Redirects to `/admin/login` if no user. |
| All other routes | Public, no auth required. |

### Middleware matcher

```ts
config = { matcher: ["/admin/:path*"] }
```

---

## 13. Key Concepts & Gotchas

### The Overview Gate

**The single most important concept:** A player "has a profile" if and only if `JSON.stringify(player.overview) !== '{}'`. This gates:
- Public visibility on `/players`
- Static generation of `/player/[slug]` pages
- Profile count in admin header

If you write data to `pff_scores`, `draftbuzz_grades`, etc. but leave `overview` empty, the player has data but no visible profile. The profile must be explicitly activated via the "Create Profile" action.

### JSON Column Architecture

Profile-specific data is stored as JSON columns on the `players` table rather than in separate relational tables. This was a deliberate design choice because:
- Each position has different metrics (CB has coverage grades, OL has pass blocking grades)
- The data is always read/written as a complete unit per player
- It avoids complex position-specific table schemas

### Legacy JSON Files

The `src/data/` directory contains the original JSON files from before the Supabase migration. These are **no longer used as the primary data source** but remain in the repo. All data is now read from and written to Supabase.

### Position Abbreviation Inconsistency

Different sources use different abbreviations. The codebase has two normalization systems:
1. **`normalizePosition()` in `upload/actions.ts`** — Maps to template keys (EDGE, DT, SAF, IOL, OT)
2. **`POSITION_ALIASES` in `types.ts`** — Maps display abbreviations (HB→RB, EDGE→ED, WDE→ED, etc.)

These serve different purposes: the upload normalizer maps to data template keys, while the types normalizer maps to display abbreviations used in the UI.

**Extended normalizations in `normalizePosition()`:**
- `DI`, `DL` → `DT`
- `DE/ED`, `LB/ED` (slash-separated) → `EDGE` (slashes stripped before matching)
- `ILB`, `MLB` → `LB`
- `HB`, `FB` → `RB`
- `G` → `IOL`
- `TBD` and empty positions are silently skipped (not treated as errors)

### Protected Fields (Never Overwritten by Imports)

Certain player fields are **manually authored** by the admin and must never be overwritten by automated data imports:

| Field | Column | Reason |
|---|---|---|
| Strengths | `players.strengths` | Hand-written scouting analysis |
| Weaknesses | `players.weaknesses` | Hand-written scouting analysis |
| Player Summary | `players.player_summary` | Hand-written overview paragraph |
| Projected Role | `players.projected_role` | Manual evaluation (e.g. "Day 1 Starter") |

Import data that resembles these fields (e.g. NFL.com's Overview, Strengths, Weaknesses, Prospect Grade Indicator) goes into the `commentary` table or other non-destructive destinations instead. This separation ensures the admin's manual scouting work is preserved regardless of how many times data is re-imported.

### Percentile Color Coding

PFF scores display with percentile-based colors via `getPercentileColor()`:
- ≥ 90th percentile → bright green
- ≥ 75th → green
- ≥ 60th → lime
- ≥ 40th → yellow
- ≥ 25th → orange
- < 25th → red

### Revalidation

After any data mutation (import, save, delete), the system calls `revalidatePath()` on affected routes to bust the ISR/SSG cache. Common paths revalidated: `/admin`, `/players`, `/`, `/rankings`, `/mocks`, `/player/[slug]`.

---

## 14. Environment & Deployment

### Environment Variables

| Variable | Where Used | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All Supabase clients | `https://cmapsylsrsglhfdwquwe.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All Supabase clients | `eyJhbGci...` (anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Defined but unused | `eyJhbGci...` (service role key) |

> Both keys must also be set in Vercel Environment Variables for production.

### Deployment

1. Push to `main` on GitHub
2. Vercel auto-detects the push and builds
3. `next build` runs, generating static pages for all profiled players
4. Deploy completes, site is live

### Local Development

```bash
cd draft-board-app
npm run dev          # Starts Next.js dev server on port 3000
```

### Python Environment (for migration scripts)

```bash
cd C:\Users\hetze\OneDrive\Desktop\DBs
.venv\Scripts\Activate.ps1   # Python 3.14 venv
```

Used for one-off migration scripts, not part of the running application.

---

## 15. Excel Workbook Reference

**File:** `C:\Users\hetze\OneDrive\Desktop\DBs\2026 Draft Board 2.0.xlsx`
**Sheets:** 255+

The Excel workbook is the original data source. Key sheet categories:

| Category | Example Sheets | Imported As |
|---|---|---|
| Big Board | `Consensus Board`, `Bengals Board`, `Expanded Board` | Initial migration only |
| Rankings | `CBS`, `ESPN`, `PFF`, `NFL`, `Dane Brugler`, etc. | `rankings` type |
| Positional Rankings | `CBS QB`, `ESPN WR`, etc. | `positional_rankings` type |
| Mock Drafts | `CBS Mock`, `ESPN Mock`, etc. | `mocks` type |
| ADP | `ADP` sheet | `adp` type |
| PFF Stats | `PFF_Stats CB`, `PFF_Stats QB`, etc. (per position) | `pff_scores` type |
| DraftBuzz | `DB CB`, `DB QB`, etc. (per position) | `draftbuzz_grades` type |
| Athletic | `RAS Data` | `athletic_scores` type |
| Grades | `Grades` sheet with NFL/ESPN/Gridiron/Bleacher columns | `site_ratings` type |
| Bio Data | `Age`, `Weight`, `Height`, `Name`, `Position`, `Eligibility` sheets | Via bio_sources priority system |
| Player Profiles | Per-player sheets with scouting data | Initial migration only |

The Excel workbook uses a similar priority approach for bio data — separate sheets per field pull from different sources, with a final column that prioritizes the most authoritative source. This pattern is now replicated in the `bio_sources` priority system.

### Standalone Upload Files

| File | Format | Contents | Imported As |
|---|---|---|---|
| `PFF Stats 2.15.26.xlsx` | Single sheet `PFF_Stats`, 173 columns | All positions in one flat table (metrics + alignment snaps) | `pff_scores` |
| `NFL Profiles 2.15.26.xlsx` | Single sheet, 27 columns, ~50 rows | NFL.com top prospect profiles (grades, rankings, comps, scouting text) | `nfl_profiles` |
| `Bleacher Profiles 2.14.26.xlsx` | Single sheet, 13 columns, ~225 rows | Bleacher Report prospect profiles (grades, rankings, comps, round projections, commentary) | `bleacher_profiles` |

---

## Quick Reference: Common Operations

### Import new ranking data
1. Go to `/admin/upload`
2. Select "Overall Rankings" or "Positional Rankings"
3. Upload the CSV/Excel file
4. Map columns (player_name → name column, rank → rank column)
5. For Overall Rankings, optionally map `position_rank` to import positional rankings in the same pass
6. Enter source name (e.g. "CBS", "ESPN")
7. Import — source date is auto-updated, and `player_rankings` table is automatically synced for profile display

### Create a profile for a player
1. Go to `/admin`
2. Find the player (filter "No Profile" helps)
3. Click **"+ Profile"** for quick creation, or **"Edit"** then **"Create Profile"** for template selection
4. Player immediately appears on public `/players` page

### Add a name correction
1. Go to `/admin/corrections`
2. Search for the canonical player
3. Add the variant spelling
4. Run audit to check for duplicate records
5. Merge if duplicates found

### Update PFF data
1. Upload the combined PFF Stats XLSX file (all positions in one sheet)
2. Go to `/admin/upload` → "PFF Scores + Alignments"
3. Upload, verify column match stats (metrics: X/53, alignments: X/18), import
4. Percentiles auto-computed per position, bio data (age) flows through priority resolver
5. Unknown positions (DI, DL, TBD, etc.) are auto-normalized or silently skipped

### Import NFL.com Profiles
1. Upload the NFL Profiles XLSX file
2. Go to `/admin/upload` → "NFL.com Profiles"
3. Upload, map columns, import
4. Rankings, grades, comps, and scouting commentary are written (manual fields are never overwritten)

### Import Bleacher Report Profiles
1. Upload the Bleacher Profiles XLSX file
2. Go to `/admin/upload` → "Bleacher Report Profiles"
3. Upload, map columns (player_name required; overall_rank, grade, pro_comparison, projected_round, overall, positives, negatives optional)
4. Import — rankings, grades, comps, round projections, and commentary are written (manual fields are never overwritten)
