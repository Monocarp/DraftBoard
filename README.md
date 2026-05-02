# 2026 NFL Draft Board App

A Next.js 15 App Router web app for tracking the 2026 NFL Draft. Data is loaded through a CSV/Excel upload admin panel and displayed across Big Board, Position Boards, Rankings, Mock Drafts, and individual player profile pages.

**Live site:** Auto-deploys to Vercel on push to `main`
**Repository:** https://github.com/Monocarp/DraftBoard
**Supabase Project:** https://cmapsylsrsglhfdwquwe.supabase.co

> For full technical reference — database schema, data flow, import pipeline, auth, components, and everything else — see [CONTEXT.md](CONTEXT.md).

---

## Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript | 5 |
| UI | React + Tailwind CSS | 19.2.3 / v4 |
| Database | Supabase (PostgreSQL) | — |
| Auth | Supabase Auth (email/password) | — |
| AI Analysis | Anthropic Claude Haiku | claude-haiku-4-5 |
| Hosting | Vercel | — |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable | 6.3.1 / 10.0.0 |
| File Parsing | PapaParse (CSV/TSV), SheetJS/xlsx (Excel) | 5.5.3 / 0.18.5 |

---

## Running Locally

```powershell
cd draft-board-app
npm install
npm run dev        # starts at http://localhost:3000
```

### `.env.local` (required)

```
NEXT_PUBLIC_SUPABASE_URL=https://cmapsylsrsglhfdwquwe.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAIL=...
ANTHROPIC_API_KEY=...
```

All five variables must also be set in Vercel Environment Variables for production.

---

## Key Concepts (quick reference)

- **Profile visibility gate:** A player appears on the public site only when `overview != '{}'`. Data importers write to JSON columns regardless; profiles are activated manually.
- **Admin gate:** Only the user whose email matches `ADMIN_EMAIL` can access `/admin/*`.
- **Hidden sources:** `"Bleacher"`, `"Con"`, `"Premier Con."` are filtered from all public queries. They exist for internal computation only.
- **server-only:** `lib/data.ts` is marked `import "server-only"` — never import it in `"use client"` components. Use `lib/types.ts` for shared interfaces.
- **Consensus formula:** `score = Σ(weight × percentile) / Σ(weight)` where `percentile = 1 - (rank-1)/(n-1)`. Tier 1 = 2.0, Tier 2 = 1.0, Tier 3 = 0.5.

For full technical documentation, see [CONTEXT.md](CONTEXT.md).