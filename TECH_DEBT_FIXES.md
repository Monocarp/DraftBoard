# Tech Debt Fixes — System Audit (February 16, 2026)

## 🔴 High Severity (should fix)

| # | Area | Issue | Status |
|---|------|-------|--------|
| 1 | **data.ts** | `getEnrichedBigBoard()` fetches `ages` table with raw `.select()` (no `fetchAll`) — silently drops players beyond the 1,000-row Supabase limit. Board age/year data can go missing without any error. | ✅ Fixed |
| 2 | **data.ts** | `getADP()` never fetches `source_dates` — always returns `{}`. The ADP section of `/rankings` can never show "last updated" dates. | ✅ Fixed |
| 3 | **data.ts** | HIDDEN_SOURCES filtering is inconsistently applied. Missing from `getPlayerProfile()` sub-queries for `player_comps`, `projected_rounds`, and `commentary`, and from `getMockDrafts()`. Hidden legacy sources leak to the frontend in those contexts. | ✅ Fixed |
| 4 | **colors.ts** | `"Sacks"`, `"Hits"`, `"Hurries"`, `"Pressures"` are in `PFF_LOWER_IS_BETTER` globally — correct for OL (allowed), but **wrong for DL/ED** where those are generated stats (higher = better). Colors are inverted for every EDGE and DT player's pressure stats on both position boards and player profiles. | ✅ Fixed |
| 5 | **colors.ts** | `getGradeColor()` checks the `/grade/i` regex *before* source-specific checks. A label like `"Gridiron Grade"` or `"NFL Grade"` would be misclassified as a 0–100 scale instead of its correct 6–9 or 5–7 scale. | ✅ Fixed |
| 6 | **PlayerEditorForm** | Invalid JSON in any JSON textarea (pff_scores, overview, etc.) is **silently replaced with `{}`** on submit — the admin could destroy all PFF data for a player with a stray comma. No validation, no warning. | ✅ Fixed |
| 7 | **PlayerEditorForm** | `deletePlayer` success leaves the user stranded on the deleted player's page with `saving=true` forever. No redirect (unlike the server action itself which calls `redirect`—but the client-side catch swallows it). | ✅ Fixed |
| 8 | **upload/actions.ts** | Module-level mutable `playerCache` and `correctionsCache` are shared across concurrent server requests. Two simultaneous imports could corrupt each other's cache or NPE if one calls `clearCaches()` while the other is mid-import. | ✅ Fixed |
| 9 | **upload/actions.ts** | Mock import does `DELETE ALL` then sequential `INSERT` with no transaction. If the insert loop fails partway, old data is gone and only partial new data remains. | ✅ Fixed |

## 🟡 Medium Severity (should address)

| # | Area | Issue | Status |
|---|------|-------|--------|
| 10 | **player/[slug]/page.tsx** | Both `generateMetadata()` and the page component call `getPlayerProfile()` independently — that's **14+ Supabase queries per page load** (7 parallel queries × 2 calls). Next.js doesn't deduplicate Supabase client calls. | ✅ Fixed |
| 11 | **player/[slug]/page.tsx** | `generateStaticParams` is never exported. Combined with `export const dynamic = "force-dynamic"`, every player page is server-rendered on every request with no caching. | Deferred — ISR not needed for current traffic |
| 12 | **upload/actions.ts** | `writeBioSources()` swallows all Supabase errors — the final `.update()` call doesn't check `error`. If the write fails, the import reports success. | ✅ Fixed |
| 13 | **upload/actions.ts** | PFF percentile computation ranks all metrics as higher-is-better. Lower-is-better metrics (Missed Tackles, Completion %, etc.) get inverted percentiles in the stored data. This is partially compensated by `getPffColorForProfile()` flipping them at display time, but the stored percentile values are semantically wrong. | Deferred — display-layer compensation works |
| 14 | **upload/actions.ts** | Source names aren't normalized — `"PFF"` vs `"pff"` vs `" PFF "` create separate entries. No trimming or case normalization. | Deferred — admin-only, current workflow is consistent |
| 15 | **UploadManager** | No file size limit check. Entire file is parsed into React state. A 500 MB drag-drop could freeze the browser. | ✅ Fixed |
| 16 | **UploadManager** | Only the first Excel sheet is parsed, with no selector. If data is on sheet 2, it's silently skipped. | Deferred — not yet needed |
| 17 | **ExpandedBoardTable** | Missing React `key` on Fragment in map — the key is on the first child `<tr>` instead of the fragment wrapper, causing React reconciliation warnings. | ✅ Fixed |
| 18 | **data.ts** | No error handling on several Supabase calls — errors are destructured but ignored. A transient Supabase outage silently returns empty data instead of surfacing an error. | ✅ Fixed |
| 19 | **PositionBoardsView** | Athletic scores section has no empty-state message. If `athletic_scores` is `{}`, the card renders a header with nothing underneath (no "No data yet"). | Deferred — cosmetic |
| 20 | **types.ts** | `PositionBoardPlayer.age` is typed `string | null` while `PlayerProfile.age` and `BoardPlayer.age` are `number | null`. Consumers must remember to `parseFloat()` in different contexts. | Deferred — working as-is |

## 🟢 Low Severity (nice to fix)

| # | Area | Issue | Status |
|---|------|-------|--------|
| 21 | **Accessibility** | System-wide gap: no `aria-label` on search inputs, no `role="tab"`/`aria-selected` on tab selectors, no keyboard handlers on sortable columns across all view components. | Deferred |
| 22 | **middleware.ts** | No role check — any authenticated Supabase user (not just admins) can access all `/admin` routes. Fine for a single-user app but a risk if more users are added. | Deferred — single-user app |
| 23 | **colors.ts** | `getSiteRatingColor()` is exported but never imported anywhere — dead code (pass-through to `getGradeColor`). Tier constants `ELITE`/`GREAT`/`GOOD`/`BELOW`/`POOR` are exported but never imported by any view. | ✅ Fixed |
| 24 | **data.ts** | `fetchAll()` doesn't enforce `ORDER BY` — paginated results could theoretically shift between pages if Postgres picks a different plan. | Deferred — no observed issues |
| 25 | **PlayerDetailView** | PFF raw values aren't rounded — `73.41928` renders with full precision instead of `73.4`. | ✅ Fixed |
| 26 | **types.ts** | Missing position aliases: `OLB`, `WDE`/`SDE`, `ATH`, `DB`, `OL` all fall through to gray/unknown. | ✅ Fixed |
| 27 | **upload/actions.ts** | Compact slug collisions — `"Ja'Von Smith"` and `"Javon Smith"` both compact to `"javonsmith"` and would silently match to whichever was created first. | Deferred — no collisions in current data |
| 28 | **PlayerEditorForm** | Age input has no min/max constraints. DOB is a plain text field (no date picker). Slug isn't auto-generated client-side. | Deferred — cosmetic |
| 29 | **package.json** | `xlsx` (SheetJS) is ~1MB and only needed for `.xlsx` parsing. Could be replaced with a lighter alternative or lazy-loaded. | Deferred |
