/**
 * Unified color-coding system for all grades, scores, and ratings.
 *
 * Problem: The app has multiple grading scales from different sources:
 *   - PFF grades: 0–100 (90+ elite, 80+ great, 70+ average, 60+ below avg)
 *   - ESPN grades: 0–100 (same tiers as PFF)
 *   - NFL.com grades: ~5.0–7.2 (7.0+ elite, 6.7+ great, 6.4+ good, 6.0+ avg)
 *   - Gridiron grades: ~6.0–9.0 (8.0+ elite, 7.5+ great, 7.0+ good, 6.5+ avg)
 *   - DraftBuzz grades: 0–100 (same tiers as ESPN)
 *   - Rivals ratings: ~5.0–6.0 (5.9+ elite, 5.8+ great, 5.7+ good)
 *   - 24/7 Sports: ~80–100 (94+ elite, 90+ great, 86+ good, 82+ avg)
 *   - Bleacher Report: ~6.0–8.0 (7.5+ elite, 7.0+ great, 6.5+ good)
 *   - PFF percentiles (position boards): 0–1 where 1.0 = best
 *   - PFF percentiles (player table):   0–1 where 0.0 = best (inverted)
 *
 * Solution: Detect the scale from the source/label name and apply correct thresholds.
 */

// ── PFF stat direction sets ──────────────────────────────────────────────────
// These stats are INVERTED: a lower raw value is better.
// Derived from "PFF Stats Inversions or Neutral.xlsx".

const PFF_LOWER_IS_BETTER = new Set([
  // CB
  "Comp. %", "Completion %",
  "Passer Rating", "Passer Rating Alwd",
  "Missed Tackles", "Missed Tkl Rate", "Missed Tackle Rate",
  // DT / ED (shared with CB for Missed Tackle Rate)
  // LB
  "Pass Rat. All.", "Pass Rating All.",
  // IOL / OT
  "Penalties",
  "Hits", "Hits Allowed",
  "Sacks", "Sacks Allowed",
  "Hurries", "Hurries Allowed",
  "Pressures", "Pressures Allowed",
  // TE / WR
  "Drop %",
  // SAF (Missed Tackles / Missed Tackle Rate already listed)
  "Missed Tkls",
]);

// These stats are NEUTRAL: they provide context but no good/bad direction.
const PFF_NEUTRAL = new Set([
  // CB
  "Dropped Picks",
  "% In Man", "% In Zone",
  // LB / ED
  "ADORT", "ADOT",
  "TD / INT", "TD Allowed/Ints",
  "Recs/Tgts",
  // Snap counts & raw counting stats without direction
  "Tackles", "Assisted Tackles",
  "TDs", "Touchdowns",
  "Interceptions", "Picks",
  "Forced Incom.",
  "Coverage Stops", "Run Stops",
  "Batted Balls", "Forced Fumbles",
  "Total Pressures",
  // TE / WR counting stats
  "CCR", "Cont. Catch Ratio",
]);

// ── 5-tier color classes ────────────────────────────────────────────────────

const ELITE  = "text-blue-400 font-bold";     // top tier
const GREAT  = "text-green-400 font-semibold"; // above average
const GOOD   = "text-yellow-400";              // average / solid
const BELOW  = "text-orange-400";              // below average
const POOR   = "text-red-400";                 // bottom tier
const PLAIN  = "text-white";                   // no color (non-numeric / unknown)

/**
 * Convert a percentile (0–1, higher = better) to a color tier.
 * This is the canonical mapping used by all scale-specific functions.
 */
function colorFromPercentile(pct: number): string {
  if (pct >= 0.90) return ELITE;
  if (pct >= 0.70) return GREAT;
  if (pct >= 0.40) return GOOD;
  if (pct >= 0.20) return BELOW;
  return POOR;
}

// ── Scale-specific normalizers → percentile ─────────────────────────────────

/** PFF / ESPN / DraftBuzz: 0–100 scale (all use same thresholds) */
function pct100(v: number): number {
  // Map 60–95 range onto 0–1 (values below 60 → 0, above 95 → 1)
  return Math.max(0, Math.min(1, (v - 60) / 35));
}

/** NFL.com: ~5.0–7.2 scale */
function pctNfl(v: number): number {
  // 7.0+ elite, 5.8 is roughly avg for drafted prospects
  return Math.max(0, Math.min(1, (v - 5.8) / 1.4));
}

/** Gridiron: ~6.0–9.0 scale */
function pctGridiron(v: number): number {
  return Math.max(0, Math.min(1, (v - 6.5) / 2.0));
}

/** Rivals: ~5.0–6.0 scale */
function pctRivals(v: number): number {
  return Math.max(0, Math.min(1, (v - 5.5) / 0.5));
}

/** 24/7 Sports: ~80–100 scale */
function pct247(v: number): number {
  return Math.max(0, Math.min(1, (v - 82) / 16));
}

/** Bleacher Report: ~6.0–8.0 scale */
function pctBleacher(v: number): number {
  return Math.max(0, Math.min(1, (v - 6.0) / 2.0));
}

// ── Source detection ────────────────────────────────────────────────────────

/**
 * Detect which numeric scale a grade label belongs to and return the
 * appropriate color class.
 *
 * @param label - The source/key name (e.g. "ESPN", "NFL.com", "25 Grade")
 * @param value - The raw numeric value
 */
export function getGradeColor(label: string, value: number): string {
  const lc = label.toLowerCase();

  // PFF year grades (e.g. "24 Grade", "25 Grade", "2025 Grade")
  if (/\d+\s*grade/i.test(label) || /grade/i.test(label)) {
    return colorFromPercentile(pct100(value));
  }
  // ESPN
  if (lc.includes("espn")) return colorFromPercentile(pct100(value));
  // NFL / NFL.com
  if (lc === "nfl" || lc === "nfl.com") return colorFromPercentile(pctNfl(value));
  // Gridiron
  if (lc.includes("gridiron")) return colorFromPercentile(pctGridiron(value));
  // DraftBuzz / Draftbuzz
  if (lc.includes("draftbuzz") || lc.includes("draft buzz")) return colorFromPercentile(pct100(value));
  // Rivals
  if (lc.includes("rivals")) return colorFromPercentile(pctRivals(value));
  // 24/7 Sports / 247
  if (lc.includes("24/7") || lc.includes("247")) return colorFromPercentile(pct247(value));
  // Bleacher Report / Bleacher
  if (lc.includes("bleacher")) return colorFromPercentile(pctBleacher(value));

  // Pass Blk / Run Blk (PFF 0-100 sub-grades stored directly in grades)
  if (lc.includes("blk") || lc.includes("block")) return colorFromPercentile(pct100(value));

  // Fallback: if it looks like a 0-100 scale value, use that
  if (value >= 10 && value <= 100) return colorFromPercentile(pct100(value));
  // If 5-10 range, assume NFL.com-like
  if (value >= 5 && value < 10) return colorFromPercentile(pctNfl(value));

  return PLAIN;
}

/**
 * Color a PFF score using percentile data from position boards.
 * Position board percentiles are 0–1 where 1.0 = best in the group.
 * These percentiles are already correctly oriented for all stats
 * (including lower-is-better stats). Neutral stats get no color.
 */
export function getPffColorByPercentile(metric: string, percentile: number): string {
  if (PFF_NEUTRAL.has(metric)) return PLAIN;
  return colorFromPercentile(percentile);
}

/**
 * Color a PFF score from the player profile page.
 *
 * Player-table percentiles are NAIVE RANK: 0.0 = highest raw value, 1.0 = lowest.
 * For "higher is better" stats, 0.0 = best → we flip with (1 - pct).
 * For "lower is better" stats, 0.0 = highest value = WORST → keep as-is (pct).
 * For neutral stats, return PLAIN (no color).
 *
 * @param metric - The PFF metric name (e.g. "Coverage Grade", "Drop %")
 * @param percentile - The stored percentile (0 = highest raw value)
 */
export function getPffColorForProfile(metric: string, percentile: number): string {
  if (PFF_NEUTRAL.has(metric)) return PLAIN;
  if (PFF_LOWER_IS_BETTER.has(metric)) {
    // Stored pct: 0 = highest value = worst → low pct = bad → use directly
    return colorFromPercentile(percentile);
  }
  // Default: higher is better → 0 = best → flip
  return colorFromPercentile(1 - percentile);
}

/**
 * Color a PFF score by its raw value (0-100 scale).
 * Used as fallback when no percentile data is available.
 * Respects stat direction: for inverted stats, flips the scale.
 * For neutral stats, returns PLAIN.
 */
export function getPffColorByValue(metric: string, value: number): string {
  if (PFF_NEUTRAL.has(metric)) return PLAIN;
  if (PFF_LOWER_IS_BETTER.has(metric)) {
    // Lower value = better → invert before mapping
    return colorFromPercentile(1 - pct100(value));
  }
  return colorFromPercentile(pct100(value));
}

/**
 * Color a site rating value given the source name.
 * Site ratings use heterogeneous scales per source.
 */
export function getSiteRatingColor(source: string, value: number): string {
  return getGradeColor(source, value);
}

/**
 * Color a DraftBuzz category grade (0–100 scale).
 */
export function getDraftBuzzGradeColor(value: number): string {
  return colorFromPercentile(pct100(value));
}

/**
 * Parse a potentially messy grade value into a number.
 * Handles: 89, "89.0", "89.0 / 100", "6.8", "TBD", "N/A"
 */
export function parseGradeValue(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return isNaN(raw) ? null : raw;
  const s = String(raw).split("/")[0].trim();
  if (!s || s === "TBD" || s === "N/A" || s === "#N/A" || s === "Unranked") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ── Re-exports for convenience ──────────────────────────────────────────────
export { ELITE, GREAT, GOOD, BELOW, POOR, PLAIN };
