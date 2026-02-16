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
 */
export function getPffColorByPercentile(percentile: number): string {
  return colorFromPercentile(percentile);
}

/**
 * Color a PFF score from the player profile page.
 * Player-table percentiles are INVERTED: 0.0 = best, 1.0 = worst.
 * We flip them before applying the standard color mapping.
 */
export function getPffColorByInvertedPercentile(percentile: number): string {
  return colorFromPercentile(1 - percentile);
}

/**
 * Color a PFF score by its raw value (0-100 scale).
 * Used as fallback when no percentile data is available.
 */
export function getPffColorByValue(value: number): string {
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
