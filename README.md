# 2026 NFL Draft Board App

A Next.js web app built from a massive **2026 Draft Board 2.0.xlsx** workbook (255 sheets, ~10MB). A Python ETL pipeline (`extract.py`) converts the Excel data into JSON, which the Next.js app consumes at build/request time via server components.

---

## Architecture Overview

```
2026 Draft Board 2.0.xlsx   (255 sheets — source of truth)
        │
        ▼
   extract.py               (Python ETL — reads Excel, writes JSON)
        │
        ▼
     data/                   (JSON output — intermediate)
        │
        ▼  (copy step)
 draft-board-app/src/data/   (JSON consumed by Next.js)
        │
        ▼
   Next.js App               (server components read JSON via fs)
```

### Critical Architecture Rule

**`lib/data.ts`** uses `import "server-only"` and Node.js `fs` — it can ONLY be imported in server components (`page.tsx` files).

**`lib/types.ts`** is client-safe — contains all TypeScript interfaces and utility functions. Client components (`"use client"`) must import types from `@/lib/types`, NEVER from `@/lib/data`.

---

## Pages

| Route | Server Page | Client View | Description |
|-------|-------------|-------------|-------------|
| `/` | `app/page.tsx` | `app/BigBoardPage.tsx` | 3 tabs: Consensus (100), Bengals (35), Expanded (35) boards |
| `/boards` | `app/boards/page.tsx` | `app/boards/PositionBoardsView.tsx` | 9 position boards (CB, DT, ED, LB, IOL, OT, SAF, TE, WR) with collapsible detail rows |
| `/rankings` | `app/rankings/page.tsx` | `app/rankings/RankingsView.tsx` | Multi-source sortable ranking table (682 players × 15+ sources) |
| `/mocks` | `app/mocks/page.tsx` | `app/mocks/MockDraftsView.tsx` | 17 mock draft sources, single + side-by-side compare |
| `/players` | `app/players/page.tsx` | `app/players/` (PlayerGrid) | Card grid of all 141 profiled players |
| `/player/[slug]` | `app/player/[slug]/page.tsx` | `app/player/[slug]/PlayerDetailView.tsx` | Full player profile — overview, rankings, scouting, commentary tabs |
| `/player/[slug]` (404) | — | `app/player/[slug]/not-found.tsx` | "Profile In Progress" page for players without profiles |

### Page Pattern

Every route follows the same pattern:
1. **`page.tsx`** — server component, imports from `@/lib/data`, loads JSON, passes data as props
2. **`*View.tsx`** — `"use client"` component, receives data via props, handles interactivity

---

## Components

| Component | File | Used By | Notes |
|-----------|------|---------|-------|
| `Navigation` | `components/Navigation.tsx` | `app/layout.tsx` | Sticky top nav, mobile hamburger menu |
| `BoardTable` | `components/BoardTable.tsx` | `BigBoardPage` | Simple board table with search + position filter |
| `ExpandedBoardTable` | `components/ExpandedBoardTable.tsx` | `BigBoardPage` | Board table with collapsible rows (grades, ranks, summary) |
| `PositionBadge` | `components/PositionBadge.tsx` | Multiple | Color-coded position pill (colors defined in `types.ts`) |
| `PlayerGrid` | `components/PlayerGrid.tsx` | `/players` page | Card grid with search + position filter |

---

## Data Files

All JSON lives in `draft-board-app/src/data/` (copied from `data/` after extraction).

| File | Records | Description |
|------|---------|-------------|
| `big_board.json` | 100 + 35 + 35 | Consensus, Bengals, and Expanded boards |
| `position_boards.json` | 122 total | 9 position boards with grades, PFF scores, athletic data, strengths/weaknesses |
| `rankings.json` | 682 | Multi-source overall rankings |
| `positional_rankings.json` | 684 | Multi-source positional rankings |
| `adp.json` | 685 | Average draft position by source |
| `mocks.json` | 17 sources | Mock draft picks from each source |
| `players.json` | 141 | Player index (name, pos, school, etc.) |
| `profiles/*.json` | 141 files | Full detailed player profiles |
| `ras.json` | 0 (pre-Combine) | Athletic/RAS data (populates post-Combine) |
| `ages.json` | 845 | Player age data |

### Data Loader Functions (`lib/data.ts`)

- `getBigBoard()` → `BigBoard` (consensus + bengals + expanded)
- `getPositionBoards()` → `Record<string, PositionBoardPlayer[]>`
- `getPlayers()` → `PlayerIndex[]`
- `getPlayerProfile(slug)` → `PlayerProfile | null`
- `getAllPlayerSlugs()` → `string[]`
- `getMocks()` → `Record<string, MockPick[]>`
- `getRankings()` → `RankingEntry[]`
- `getADP()` → `ADPEntry[]`

---

## ETL Pipeline (`extract.py`)

Located at **`C:\Users\hetze\OneDrive\Desktop\DBs\extract.py`**. Requires the `.venv` in the same directory.

### Python Environment

- **Python 3.14** (venv at `.venv/`)
- **Packages**: `pandas`, `openpyxl`
- **CRITICAL**: Must set `$env:PYTHONIOENCODING="utf-8"` on Windows before running (emoji/unicode in player data)

### Excel Sheet Layout (255 sheets)

The workbook contains these categories of sheets:

| Category | Count | Examples |
|----------|-------|---------|
| Boards | 14 | Big Board, Expanded Big Board, CB Board, ED Board, etc. |
| Mocks | 19 | Bleacher Mock, Kiper Mock Draft, Walter Mock, etc. |
| Rankings | 24 | Overall_Ranking, CB_Ranking, ED_Ranking, ESPN Rankings, etc. |
| Data | 21 | RAS Data, Age Sheet, NFL Profiles, Bleacher Profiles, etc. |
| Templates | 14 | Template, Comp sheets |
| Player Profiles | ~155 | One sheet per player (form-like, 339 rows × 32 cols) |
| Skipped | 8 | Cover Sheet, How To Use, etc. |

### Extraction Functions

| Function | Source Sheet(s) | Output | Notes |
|----------|----------------|--------|-------|
| `extract_big_board()` | Big Board | consensus + bengals arrays | Bengals side has no rank column (col 7=player) |
| `extract_expanded_board()` | Expanded Big Board | expanded array | Uses openpyxl directly; 6 rows per player |
| `extract_position_boards()` | CB/DT/ED/LB/IOL/OT/SAF/TE/WR Board | dict of position → players | Uses openpyxl; 7 rows per player |
| `extract_overall_rankings()` | Overall_Ranking | rankings array | Sources in cols 7+ |
| `extract_positional_rankings()` | *_Ranking sheets | positional rankings | |
| `extract_adp()` | ADP sheet | ADP array | |
| `extract_all_mocks()` | *Mock* sheets | dict of source → picks | |
| `extract_ras_data()` | RAS Data | athletic profiles | Filtered to Year 2025/2026/TBD only |
| `extract_age_data()` | Age Sheet | age records | |
| `extract_nfl_profiles()` | NFL Profiles | 50 profiles by slug | Tabular; overwrites NFL.com commentary |
| `extract_bleacher_profiles()` | Bleacher Profiles | 225 profiles by slug | Tabular; overwrites Bleacher commentary |
| `extract_walter_scouting()` | Walter Scouting Reports | 24 profiles by slug | Tabular; overwrites Walter commentary |
| `extract_espn_analysis()` | ESPN Rankings | 100 entries by slug | Col 8 has analysis text (16 have text) |
| `extract_ringer_rankings()` | Ringer Rankings | 32 profiles by slug | Replaces Ringer commentary; also enriches player_comps |
| `extract_player_profile()` | Individual player sheets | Full profile JSON | Form-like layout; merges source data from above |
| `extract_skills_traits()` | (within player sheet) | skills/traits dict | 5 categories at cols 0, 5, 11, 17, 23 |
| `extract_commentary()` | (within player sheet) | commentary array | Skips "kiper" and "the ringer" entries |

### Key Extraction Details

- **Player profile sheets** are form-like (not tabular): data is at fixed row/col positions
- **Commentary merging**: Source-specific sheets (NFL Profiles, Bleacher Profiles, Walter Scouting, ESPN Rankings, Ringer Rankings) provide cleaner data than what's scraped from the embedded forms — the pipeline replaces form-scraped commentary with these
- **Player comps enrichment**: `player_comps` dict is enriched from Ringer (strips "SHADES OF..."), NFL.com, and Bleacher comparison fields
- **Skills & Traits**: 5 categories at columns 0 (Character), 5 (Tackling), 11 (Coverage Skills), 17 (Mental/Discipline), 23 (Athleticism)
- **`DATA_SHEETS` list**: Sheets listed here are excluded from being treated as player profile sheets
- **Slugs**: Generated via `slugify()` — lowercase, strip `'.'`, replace non-alphanumeric with `-`

---

## Styling

- **Dark theme** with custom CSS variables in `globals.css`
  - `--bg-primary: #0a0f1a`, `--accent: #f97316` (orange)
  - Background panels: `#111827`, borders: `#2a3a4e`
- **Ranking number colors** (used in RankingsView):
  - Top 15: Purple (`text-purple-400`)
  - 16–50: Green (`text-green-400`)
  - 51–100: Yellow (`text-yellow-400`)
  - 101–200: Gray (`text-gray-400`)
  - 200+: Red (`text-red-400`)
- **Position badge colors**: Defined in `POSITION_COLORS` map in `lib/types.ts`

---

## Running Locally

```powershell
cd draft-board-app
npm install
npm run dev
```

Open **http://localhost:3000**

---

## Update Workflow

When the Excel file is updated, run these 3 steps:

### 1. Re-extract the data

```powershell
cd "C:\Users\hetze\OneDrive\Desktop\DBs"
$env:PYTHONIOENCODING = "utf-8"
.venv\Scripts\python.exe extract.py
```

### 2. Copy data into the app

```powershell
Copy-Item -Recurse -Force "data\*" "draft-board-app\src\data\"
```

### 3. Verify

If the dev server is running (`npm run dev`), it hot-reloads — just refresh the browser.

---

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19 + TypeScript**
- **Tailwind CSS v4** (dark theme)
- **Python 3.14 + pandas + openpyxl** (ETL pipeline)
- **Node.js v24.11.1, npm 11.6.2**

## Project Structure

```
C:\Users\hetze\OneDrive\Desktop\DBs\
├── 2026 Draft Board 2.0.xlsx    # Source Excel workbook (255 sheets)
├── extract.py                    # Python ETL pipeline
├── .venv/                        # Python virtual environment
├── data/                         # ETL output (JSON)
│   ├── big_board.json
│   ├── position_boards.json
│   ├── rankings.json
│   ├── positional_rankings.json
│   ├── adp.json
│   ├── mocks.json
│   ├── ras.json
│   ├── ages.json
│   ├── players.json
│   └── profiles/                 # 141 individual player JSONs
└── draft-board-app/              # Next.js application
    └── src/
        ├── app/
        │   ├── layout.tsx        # Root layout (Navigation + dark bg)
        │   ├── page.tsx          # → BigBoardPage.tsx
        │   ├── BigBoardPage.tsx  # Big Board (3 tabs: Consensus/Bengals/Expanded)
        │   ├── boards/
        │   │   ├── page.tsx      # → PositionBoardsView.tsx
        │   │   └── PositionBoardsView.tsx  # 9 position boards with collapsible details
        │   ├── rankings/
        │   │   ├── page.tsx      # → RankingsView.tsx
        │   │   └── RankingsView.tsx
        │   ├── mocks/
        │   │   ├── page.tsx      # → MockDraftsView.tsx
        │   │   └── MockDraftsView.tsx
        │   ├── players/
        │   │   └── page.tsx      # Uses PlayerGrid component
        │   └── player/[slug]/
        │       ├── page.tsx      # → PlayerDetailView.tsx (or not-found)
        │       ├── PlayerDetailView.tsx
        │       └── not-found.tsx  # "Profile In Progress" fallback
        ├── components/
        │   ├── Navigation.tsx
        │   ├── BoardTable.tsx
        │   ├── ExpandedBoardTable.tsx
        │   ├── PlayerGrid.tsx
        │   └── PositionBadge.tsx
        ├── data/                  # JSON (copied from ../../../data/)
        │   └── profiles/
        └── lib/
            ├── data.ts            # Server-only data loaders (uses fs)
            └── types.ts           # Client-safe types + POSITION_COLORS
```

## Known Gotchas

1. **`fs` module error**: If a `"use client"` component imports from `@/lib/data`, you get a build error. Always import types from `@/lib/types` in client components.
2. **Unicode encoding**: Windows terminal needs `$env:PYTHONIOENCODING="utf-8"` before running `extract.py` or it crashes on emoji/special chars.
3. **RAS Data filtering**: `extract_ras_data()` filters to `Year in (2025, 2026, "TBD")` — stray 2024 records exist in the sheet.
4. **Player profiles not found**: Not all 682 ranked players have profile sheets — only ~155 sheets exist, ~141 parse successfully. Players without profiles see the custom not-found page.
5. **Expanded Big Board** uses `openpyxl` directly (not pandas) because the merged-cell layout doesn't parse well with `pd.read_excel`.
6. **Position boards** also use `openpyxl` directly for the same reason. Layout is 7 rows per player.