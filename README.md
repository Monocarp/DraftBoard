# 2026 NFL Draft Board App

A Next.js 15 web app backed by **Supabase** (PostgreSQL + Auth). Data is ingested via Python scraping scripts and a CSV upload admin panel. All pages are server-rendered and query Supabase directly at request time.

---

## Architecture Overview

```
Python scrapers / CSV uploads
        │
        ▼
   Supabase (PostgreSQL)        ← source of truth
        │
        ▼
   lib/data.ts                  (server-only Supabase queries)
        │
        ▼
   Next.js Server Components    (page.tsx files)
        │
        ▼
   "use client" View Components (interactivity, no DB access)
```

### Critical Architecture Rules

- **`lib/data.ts`** uses `import "server-only"` — ONLY importable in server components. Never import it from a `"use client"` component.
- **`lib/types.ts`** is client-safe — all TypeScript interfaces live here. Client components import types from `@/lib/types`, never `@/lib/data`.
- **Two Supabase clients:**
  - Plain `supabase` (public reads — boards, rankings, players)
  - `createSupabaseServer()` (session-aware — user boards, admin actions, RLS-protected tables)
- **Admin actions** require both a valid session AND `user.email === process.env.ADMIN_EMAIL`.

---

## Pages

| Route | Description | Caching |
|-------|-------------|---------|
| `/` | Big Board — 4 tabs: Consensus, Bengals, Expanded, My Board | `force-dynamic` (user board) |
| `/boards` | 9 position boards with collapsible detail rows + My Rankings toggle | `revalidate=3600` |
| `/rankings` | Multi-source sortable ranking table (15+ sources, top-300 default with show-all toggle) | `revalidate=3600` |
| `/mocks` | 17+ mock draft sources, single + side-by-side compare | `revalidate=3600` |
| `/player/[slug]` | Full player profile — overview, rankings, scouting, commentary, media tabs | `revalidate=3600` |
| `/login` | User login (email/password) | — |
| `/register` | User registration (email/password) | — |
| `/admin/upload` | CSV upload panel for all data types | admin-only |
| `/admin/cleanup` | Audit + delete incomplete player records | admin-only |
| `/admin/boards` | Manage consensus board entries | admin-only |

Every public route has a co-located `error.tsx` (error boundary with retry) and `loading.tsx` (skeleton UI).

### Page Pattern

1. **`page.tsx`** — server component, imports from `@/lib/data`, fetches from Supabase, passes data as props
2. **`*View.tsx`** — `"use client"` component, receives data via props, handles all interactivity

---

## Components

| Component | File | Notes |
|-----------|------|-------|
| `Navigation` | `components/Navigation.tsx` | Sticky top nav, mobile hamburger |
| `BoardTable` | `components/BoardTable.tsx` | Simple board table with search + position filter |
| `ExpandedBoardTable` | `components/ExpandedBoardTable.tsx` | Board table with collapsible grade/summary rows |
| `PositionBadge` | `components/PositionBadge.tsx` | Color-coded position pill (colors in `types.ts`) |
| `PlayerGrid` | `components/PlayerGrid.tsx` | Card grid with search + position filter |
| `UserBoardEditor` | `components/UserBoardEditor.tsx` | Drag-to-reorder personal board; add/remove players; copy consensus; inline save-error feedback |

---

## Database (Supabase)

### Key Tables

| Table | Description |
|-------|-------------|
| `players` | Core player records (name, slug, position, college, bio, overview JSON, profile data) |
| `rankings` | Overall rankings by source (slug + source + rank_value) |
| `positional_rankings` | Positional rankings by source |
| `player_rankings` | Per-player overall + positional rank per source |
| `board_entries` | Consensus / named board entries (rank + board_label) |
| `adp_entries` | ADP values by source |
| `mock_picks` | Mock draft picks by source |
| `commentary` | Scouting commentary sections by source |
| `player_comps` | Player comparisons by source |
| `projected_rounds` | Projected draft round by source |
| `position_board_entries` | Position board data with grades and athletic scores |
| `source_dates` | Last-updated date per source (ranking / mock) |
| `user_boards` | User personal big board (RLS — user sees only own rows) |
| `user_position_ranks` | User personal position rankings (RLS) |

### Data Loader Functions (`lib/data.ts`)

- `getBigBoard()` → consensus + bengals + expanded boards
- `getPositionBoards()` → 9 position boards
- `getPlayers()` → player index for grid/search
- `getPlayerProfile(slug)` → full profile with all related data
- `getAllPlayerSlugs()` → for `generateStaticParams` (players with profiles only)
- `getMocks()` → mock picks grouped by source
- `getRankings()` → multi-source ranking table with source dates
- `getADP()` → ADP table with consensus ADP
- `getUserBoard()` → session-aware personal board (RLS)
- `getUserPositionRanks()` → session-aware position ranks (RLS)

### Hidden Sources

Sources in `HIDDEN_SOURCES = new Set(["Bleacher", "Con", "Premier Con."])` are filtered from all public views — used internally for consensus computation only.

---

## Data Ingestion

Data is loaded into Supabase via two methods:

### 1. Admin CSV Upload (`/admin/upload`)

Upload CSVs with column mapping for:
- Overall rankings, positional rankings, ADP
- Mock drafts, source dates
- PFF scores, DraftBuzz grades, Athletic scores, site ratings
- NFL profiles, Bleacher profiles, ESPN profiles, TDN profiles
- Bio data, Walter scouting reports, PFF big board

Each import auto-updates `source_dates` and calls `revalidatePath()` on all public routes.

### 2. Python Scraping Scripts (root of DBs folder)

| Script | Purpose |
|--------|---------|
| `migrate_to_supabase.py` | Initial bulk migration from JSON files |
| `fix_beast_rankings.py` | Sync Brugler Beast overall + positional ranks |
| `rebuild_consensus_board.py` | Rebuild top-300 consensus from ESPN, Bleacher, Brugler, PFF |
| `remove_no_profile.py` | Delete all players with empty `overview` (no profile data) |
| `PFF_Com.py` | Scrape PFF commentary |
| `WF_profiles2.py` | Scrape Walter Football player profiles |
| `BR_Rank_Selenium.py` | Scrape Bleacher Report rankings |
| `BR_Reports_Selenium.py` | Scrape Bleacher Report scouting reports |

---

## Styling

- **Dark theme**: `bg-[#0a0f1a]` (root), `bg-[#111827]` (cards), `bg-[#1a2332]` (hover/skeleton), `border-[#2a3a4e]`
- **Accent**: `orange-500` for CTAs and highlights
- **Ranking number colors** (RankingsView):
  - Top 15: `text-purple-400`
  - 16–50: `text-green-400`
  - 51–100: `text-yellow-400`
  - 101–200: `text-gray-400`
  - 200+: `text-red-400`
- **Position badge colors**: `POSITION_COLORS` map in `lib/types.ts`

---

## Running Locally

```powershell
cd draft-board-app
npm install
npm run dev
```

Open **http://localhost:3000**

Requires `.env.local` with:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAIL=...
```

---

## Tech Stack

- **Next.js 15** (App Router, Turbopack)
- **React 19 + TypeScript**
- **Tailwind CSS v4** (dark theme)
- **Supabase** (PostgreSQL + Auth — RLS, service role for admin actions)
- **Python 3.x + pandas + supabase-py + selenium** (scraping + migration scripts)
- **Node.js + npm**

---

## Project Structure

```
C:\Users\hetze\OneDrive\Desktop\DBs\
├── .venv/                        # Python virtual environment
├── data/                         # Intermediate JSON (legacy / reference)
│   └── profiles/
├── migrate_to_supabase.py        # Bulk JSON → Supabase migration
├── fix_beast_rankings.py         # Brugler Beast rank sync
├── rebuild_consensus_board.py    # Consensus board rebuild
├── remove_no_profile.py          # Remove profileless players
├── PFF_Com.py                    # PFF commentary scraper
├── WF_profiles2.py               # Walter Football profile scraper
└── draft-board-app/              # Next.js application
    ├── middleware.ts              # Admin route protection
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── error.tsx          # Root error boundary
        │   ├── loading.tsx        # Root skeleton
        │   ├── page.tsx           # Big Board (force-dynamic)
        │   ├── BigBoardPage.tsx
        │   ├── boards/
        │   │   ├── page.tsx       # revalidate=3600
        │   │   ├── error.tsx
        │   │   ├── loading.tsx
        │   │   └── PositionBoardsView.tsx
        │   ├── rankings/
        │   │   ├── page.tsx       # revalidate=3600
        │   │   ├── error.tsx
        │   │   ├── loading.tsx
        │   │   └── RankingsView.tsx
        │   ├── mocks/
        │   │   ├── page.tsx       # revalidate=3600
        │   │   ├── error.tsx
        │   │   ├── loading.tsx
        │   │   └── MockDraftsView.tsx
        │   ├── player/[slug]/
        │   │   ├── page.tsx       # revalidate=3600
        │   │   ├── error.tsx
        │   │   ├── loading.tsx
        │   │   ├── PlayerDetailView.tsx
        │   │   └── not-found.tsx
        │   ├── (auth)/
        │   │   ├── actions.ts
        │   │   ├── login/page.tsx
        │   │   └── register/page.tsx
        │   ├── user-board/
        │   │   └── actions.ts     # User board CRUD (RLS)
        │   └── admin/
        │       ├── upload/
        │       │   └── actions.ts # All data import server actions
        │       ├── cleanup/
        │       │   └── actions.ts # Player audit + delete
        │       └── boards/
        │           └── actions.ts # Board entry management
        ├── components/
        │   ├── Navigation.tsx
        │   ├── BoardTable.tsx
        │   ├── ExpandedBoardTable.tsx
        │   ├── PlayerGrid.tsx
        │   ├── PositionBadge.tsx
        │   └── UserBoardEditor.tsx
        └── lib/
            ├── data.ts            # Server-only Supabase data loaders
            ├── supabase.ts        # Plain public client
            ├── supabase-server.ts # Session-aware client (RLS)
            ├── teams.ts           # Team name normalization
            └── types.ts           # Client-safe types + POSITION_COLORS
```

---

## Known Gotchas

1. **`server-only` import error**: If a `"use client"` component imports from `@/lib/data`, you get a build error. Always import types from `@/lib/types` in client components.
2. **RLS on user tables**: `user_boards` and `user_position_ranks` have Row Level Security. Queries MUST use `createSupabaseServer()` — the plain `supabase` client returns zero rows because `auth.uid()` is null.
3. **Admin auth**: Middleware protects `/admin` routes by redirecting non-admins. Server actions additionally check `user.email === process.env.ADMIN_EMAIL` — both guards must pass.
4. **Bracket paths in PowerShell**: The `player/[slug]` directory name contains brackets. Use `[IO.File]::WriteAllText()` or `-LiteralPath` instead of `Set-Content` when writing files to that directory.
5. **Home page is `force-dynamic`**: It fetches the user's personal board via session — it cannot be statically cached. All other public pages use `revalidate=3600`.