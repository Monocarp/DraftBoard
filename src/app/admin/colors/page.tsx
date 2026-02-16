import type { Metadata } from "next";

export const metadata: Metadata = { title: "Color Reference — Admin" };

/* ── Threshold data (mirrors src/lib/colors.ts normalizers) ────────────── */

const TIERS = [
  { label: "Elite",     pct: "≥ 90th", cls: "bg-blue-400",   text: "text-blue-400 font-bold" },
  { label: "Great",     pct: "≥ 70th", cls: "bg-green-400",  text: "text-green-400 font-semibold" },
  { label: "Good",      pct: "≥ 40th", cls: "bg-yellow-400", text: "text-yellow-400" },
  { label: "Below Avg", pct: "≥ 20th", cls: "bg-orange-400", text: "text-orange-400" },
  { label: "Poor",      pct: "< 20th", cls: "bg-red-400",    text: "text-red-400" },
  { label: "Neutral",   pct: "—",      cls: "bg-white",      text: "text-white" },
];

/* Each scale: the normalizer is (v - floor) / range → 0–1 percentile.
   We reverse-engineer the breakpoint values from the tier percentiles. */
function breakpoints(floor: number, range: number) {
  return {
    elite: +(floor + range * 0.90).toFixed(2),
    great: +(floor + range * 0.70).toFixed(2),
    good:  +(floor + range * 0.40).toFixed(2),
    below: +(floor + range * 0.20).toFixed(2),
  };
}

const SCALES = [
  { name: "PFF / ESPN / DraftBuzz", range: "0 – 100", examples: "25 Grade, ESPN, DraftBuzz", ...breakpoints(60, 35) },
  { name: "NFL.com",                range: "5.0 – 7.2", examples: "NFL, NFL.com",            ...breakpoints(5.8, 1.4) },
  { name: "Gridiron",               range: "6.0 – 9.0", examples: "Gridiron",                ...breakpoints(6.5, 2.0) },
  { name: "Rivals",                 range: "5.0 – 6.0", examples: "Rivals",                  ...breakpoints(5.5, 0.5) },
  { name: "24/7 Sports",            range: "80 – 100",  examples: "24/7 Sports, 247",        ...breakpoints(82, 16) },
  { name: "Bleacher Report",        range: "6.0 – 8.0", examples: "Bleacher, Bleacher Report",...breakpoints(6.0, 2.0) },
];

const LOWER_IS_BETTER: Record<string, string[]> = {
  "CB":      ["Comp. %", "Completion %", "Passer Rating", "Passer Rating Alwd", "Missed Tackles", "Missed Tkl Rate", "Missed Tackle Rate"],
  "DT / ED": ["Missed Tackle Rate", "Missed Tkl Rate"],
  "LB":      ["Completion %", "Pass Rat. All.", "Pass Rating All.", "Missed Tkl Rate"],
  "IOL / OT":["Penalties", "Hits Allowed", "Sacks Allowed", "Hurries Allowed", "Pressures Allowed", "Hits", "Sacks", "Hurries", "Pressures"],
  "SAF":     ["Missed Tackles", "Missed Tackle Rate", "Missed Tkl Rate", "Passer Rating Alwd"],
  "TE / WR": ["Drop %", "Missed Tkls"],
};

const NEUTRAL_STATS = [
  "Dropped Picks", "% In Man", "% In Zone", "ADORT", "ADOT",
  "TD / INT", "TD Allowed/Ints", "Recs/Tgts",
  "Tackles", "Assisted Tackles", "TDs", "Touchdowns",
  "Interceptions", "Picks", "Forced Incom.",
  "Coverage Stops", "Run Stops", "Batted Balls", "Forced Fumbles",
  "Total Pressures", "CCR", "Cont. Catch Ratio",
];

/* ── Per-position PFF stat inventory ─────────────────────────────────── */
type Dir = "higher" | "lower" | "neutral";
interface PffStat { metric: string; board?: string; dir: Dir; range: string; example: number }
interface PosGroup { pos: string; stats: PffStat[] }

const PFF_STATS_BY_POS: PosGroup[] = [
  { pos: "CB", stats: [
    { metric: "Coverage Grade",  board: "Cov. Grade",    dir: "higher",  range: "70 – 91",   example: 85.4 },
    { metric: "Forced Inc. Rate",board: "Forced Inc Rate",dir: "higher", range: "16 – 31",   example: 22.7 },
    { metric: "Man Coverage",                             dir: "higher",  range: "60 – 74",   example: 68.3 },
    { metric: "Zone Coverage",                            dir: "higher",  range: "72 – 75",   example: 73.5 },
    { metric: "Tackling",        board: "Tackling",      dir: "higher",  range: "68 – 79",   example: 74.1 },
    { metric: "Run Def Grade",   board: "Run. Def",      dir: "higher",  range: "74 – 89",   example: 81.2 },
    { metric: "Completion %",    board: "Comp. %",       dir: "lower",   range: "37 – 71",   example: 52.0 },
    { metric: "Passer Rating",                            dir: "lower",   range: "79 – 95",   example: 86.3 },
    { metric: "Missed Tackles",                           dir: "lower",   range: "5 – 12",    example: 8 },
    { metric: "Missed Tkl Rate", board: "Missed Tkl Rate",dir: "lower",  range: "7 – 14",    example: 10.5 },
    { metric: "Interceptions",   board: "Picks",         dir: "neutral", range: "0 – 4",     example: 2 },
    { metric: "Forced Incom.",                            dir: "neutral", range: "8 – 10",    example: 9 },
    { metric: "Dropped Picks",                            dir: "neutral", range: "0 – 1",     example: 1 },
    { metric: "% In Man",                                 dir: "neutral", range: "32 – 40",   example: 36.1 },
    { metric: "% In Zone",                                dir: "neutral", range: "49 – 59",   example: 54.2 },
    { metric: "Coverage Stops",                           dir: "neutral", range: "2 – 14",    example: 7 },
  ]},
  { pos: "SAF", stats: [
    { metric: "Coverage Grade",  board: "Cov. Grade",    dir: "higher",  range: "85 – 92",   example: 88.4 },
    { metric: "Forced Inc. Rate",board: "Forced Inc Rate",dir: "higher", range: "8 – 31",    example: 18.5 },
    { metric: "Run Def Grade",   board: "Run. Def",      dir: "higher",  range: "73 – 90",   example: 82.7 },
    { metric: "Tackling Grade",  board: "Tackling",      dir: "higher",  range: "61 – 89",   example: 77.3 },
    { metric: "Passer Rating Alwd", board: "Pass Rating All.", dir: "lower", range: "45 – 70", example: 56.2 },
    { metric: "Missed Tackles",                           dir: "lower",   range: "8 – 16",    example: 11 },
    { metric: "Missed Tackle Rate", board: "Missed Tkl Rate", dir: "lower", range: "8 – 17", example: 12.3 },
    { metric: "Interceptions",   board: "Picks",         dir: "neutral", range: "2 – 4",     example: 3 },
    { metric: "TD Allowed/Ints",                          dir: "neutral", range: "0/2 – 3/4", example: 0 },
    { metric: "Coverage Stops",                           dir: "neutral", range: "8 – 14",    example: 11 },
    { metric: "Run Stops",                                dir: "neutral", range: "12 – 22",   example: 16 },
    { metric: "Tackles",                                  dir: "neutral", range: "58 – 66",   example: 62 },
    { metric: "Assisted Tackles",                         dir: "neutral", range: "11 – 28",   example: 19 },
  ]},
  { pos: "ED", stats: [
    { metric: "Pass Rush Grade", board: "Pass Rush",     dir: "higher",  range: "70 – 94",   example: 84.1 },
    { metric: "True Pass Rush",  board: "Tr. Pass Rush", dir: "higher",  range: "65 – 94",   example: 79.6 },
    { metric: "PR Win Rate",     board: "PR Win Rate",   dir: "higher",  range: "9 – 24",    example: 16.3 },
    { metric: "Run Def. Grade",  board: "Run Def.",      dir: "higher",  range: "69 – 91",   example: 80.4 },
    { metric: "Run Stop %",      board: "Run Stop %",    dir: "higher",  range: "3 – 13",    example: 7.8 },
    { metric: "Tackling Grade",                           dir: "higher",  range: "50 – 80",   example: 65.2 },
    { metric: "Missed Tackle Rate",                       dir: "lower",   range: "8 – 23",    example: 14.5 },
    { metric: "Sacks",           board: "Sacks",         dir: "lower",   range: "3 – 12",    example: 7 },
    { metric: "Hits",            board: "Hits",          dir: "lower",   range: "2 – 13",    example: 6 },
    { metric: "Hurries",                                  dir: "lower",   range: "9 – 46",    example: 24 },
    { metric: "Total Pressures",                          dir: "neutral", range: "21 – 61",   example: 38 },
    { metric: "Batted Balls",                             dir: "neutral", range: "0 – 3",     example: 1 },
    { metric: "Forced Fumbles",                           dir: "neutral", range: "0 – 3",     example: 1 },
  ]},
  { pos: "DT", stats: [
    { metric: "Pass Rush Grade", board: "Pass Rush",     dir: "higher",  range: "58 – 77",   example: 68.4 },
    { metric: "True Pass Rush",  board: "Tr. Pass Rush", dir: "higher",  range: "60 – 75",   example: 67.3 },
    { metric: "PR Win Rate",     board: "PR Win Rate",   dir: "higher",  range: "4 – 11",    example: 7.2 },
    { metric: "Run Def. Grade",  board: "Run Def.",      dir: "higher",  range: "69 – 91",   example: 79.8 },
    { metric: "Run Stop %",      board: "Run Stop %",    dir: "higher",  range: "5 – 14",    example: 9.3 },
    { metric: "Tackling Grade",                           dir: "higher",  range: "25 – 66",   example: 45.6 },
    { metric: "Missed Tackle Rate",                       dir: "lower",   range: "10 – 50",   example: 22.0 },
    { metric: "Sacks",           board: "Sacks",         dir: "lower",   range: "0 – 5",     example: 2 },
    { metric: "Hits",            board: "Hits",          dir: "lower",   range: "0 – 4",     example: 2 },
    { metric: "Hurries",                                  dir: "lower",   range: "3 – 22",    example: 11 },
    { metric: "Total Pressures",                          dir: "neutral", range: "3 – 30",    example: 14 },
    { metric: "Batted Balls",                             dir: "neutral", range: "0 – 2",     example: 1 },
    { metric: "Forced Fumbles",                           dir: "neutral", range: "0",         example: 0 },
  ]},
  { pos: "LB", stats: [
    { metric: "Pass Rush Grade", board: "Pass Rush",     dir: "higher",  range: "58 – 82",   example: 70.1 },
    { metric: "Run Def. Grade",  board: "Run Def.",      dir: "higher",  range: "80 – 95",   example: 87.3 },
    { metric: "Run Stop %",      board: "Run Stop %",    dir: "higher",  range: "6 – 15",    example: 10.8 },
    { metric: "Tackling Grade",  board: "Tackling",      dir: "higher",  range: "58 – 92",   example: 76.4 },
    { metric: "Coverage",        board: "Coverage",      dir: "higher",  range: "51 – 92",   example: 71.5 },
    { metric: "Forced Inc Rate",                          dir: "higher",  range: "0 – 7",     example: 3.5 },
    { metric: "Completion %",                             dir: "lower",   range: "67 – 87",   example: 77.2 },
    { metric: "Pass Rat. All.",  board: "Pass Rating All.", dir: "lower", range: "62 – 115",  example: 88.5 },
    { metric: "Missed Tkl Rate",                          dir: "lower",   range: "5 – 16",    example: 9.4 },
    { metric: "Tackles",         board: "Tackles",       dir: "neutral", range: "37 – 94",   example: 65 },
    { metric: "ADORT",                                    dir: "neutral", range: "1.9 – 3.3", example: 2.6 },
    { metric: "Coverage Stops",                           dir: "neutral", range: "9 – 27",    example: 16 },
    { metric: "Recs/Tgts",                                dir: "neutral", range: "—",         example: 0 },
    { metric: "TD / INT",                                 dir: "neutral", range: "0/2 – 2/4", example: 0 },
  ]},
  { pos: "OT", stats: [
    { metric: "Run Block Grade", board: "Run Blk",       dir: "higher",  range: "62 – 83",   example: 74.5 },
    { metric: "Pass Block Grade",board: "Pass Blk",      dir: "higher",  range: "62 – 93",   example: 78.3 },
    { metric: "True Pass Set",   board: "True Pass",     dir: "higher",  range: "60 – 89",   example: 75.6 },
    { metric: "Pass Block Efficiency", board: "Pass Blk Eff", dir: "higher", range: "98 – 99", example: 98.8 },
    { metric: "Zone Grade",      board: "Zone",          dir: "higher",  range: "65 – 87",   example: 76.0 },
    { metric: "Gap Grade",       board: "Gap",           dir: "higher",  range: "54 – 80",   example: 66.5 },
    { metric: "Sacks Allowed",   board: "Sacks",         dir: "lower",   range: "0 – 3",     example: 1 },
    { metric: "Hits Allowed",    board: "Hits",          dir: "lower",   range: "0 – 3",     example: 1 },
    { metric: "Hurries Allowed", board: "Hurries",       dir: "lower",   range: "5 – 13",    example: 8 },
    { metric: "Pressures Allowed", board: "Pressures",   dir: "lower",   range: "5 – 15",    example: 10 },
    { metric: "Penalties",       board: "Penalties",     dir: "lower",   range: "2 – 7",     example: 4 },
  ]},
  { pos: "IOL", stats: [
    { metric: "Run Block Grade", board: "Run Blk",       dir: "higher",  range: "63 – 87",   example: 75.0 },
    { metric: "Pass Block Grade",board: "Pass Blk",      dir: "higher",  range: "65 – 87",   example: 76.1 },
    { metric: "True Pass Set",   board: "True Pass",     dir: "higher",  range: "54 – 91",   example: 72.4 },
    { metric: "Pass Block Efficiency", board: "Pass Blk Eff", dir: "higher", range: "98 – 99", example: 98.5 },
    { metric: "Zone Grade",      board: "Zone",          dir: "higher",  range: "64 – 93",   example: 78.5 },
    { metric: "Gap Grade",       board: "Gap",           dir: "higher",  range: "57 – 71",   example: 63.9 },
    { metric: "Sacks Allowed",   board: "Sacks",         dir: "lower",   range: "0 – 3",     example: 1 },
    { metric: "Hits Allowed",    board: "Hits",          dir: "lower",   range: "0 – 3",     example: 1 },
    { metric: "Hurries Allowed", board: "Hurries",       dir: "lower",   range: "2 – 15",    example: 7 },
    { metric: "Pressures Allowed", board: "Pressures",   dir: "lower",   range: "4 – 20",    example: 11 },
    { metric: "Penalties",       board: "Penalties",     dir: "lower",   range: "1 – 9",     example: 4 },
  ]},
  { pos: "WR", stats: [
    { metric: "Receiving Grade", board: "Receiving",     dir: "higher",  range: "79 – 91",   example: 85.3 },
    { metric: "Yards/ Routes Run", board: "Y/RR",        dir: "higher",  range: "2.3 – 3.1", example: 2.68 },
    { metric: "Contested Catch", board: "Contested",     dir: "higher",  range: "44 – 86",   example: 65.0 },
    { metric: "Grade vs Man",    board: "Vs. Man",       dir: "higher",  range: "75 – 90",   example: 82.4 },
    { metric: "YAC/Reception",   board: "YAC/ Rec",     dir: "higher",  range: "4.3 – 6.4", example: 5.3 },
    { metric: "Elusiveness",                              dir: "higher",  range: "36 – 51",   example: 43.5 },
    { metric: "Deep Yards",                               dir: "higher",  range: "115 – 453", example: 284 },
    { metric: "Drop %",          board: "Drop %",        dir: "lower",   range: "0 – 4",     example: 2.1 },
    { metric: "Missed Tkls Forced", board: "Missed Tkls",dir: "lower",   range: "6 – 21",    example: 12 },
    { metric: "ADOT",                                     dir: "neutral", range: "7.7 – 14.6",example: 11.2 },
    { metric: "Touchdowns",                               dir: "neutral", range: "4 – 11",    example: 7 },
  ]},
  { pos: "TE", stats: [
    { metric: "Receiving Grade", board: "Rec. Gr.",      dir: "higher",  range: "65 – 85",   example: 75.1 },
    { metric: "Pass Block Grade",board: "Pass Blk",      dir: "higher",  range: "62 – 77",   example: 69.4 },
    { metric: "Run Block Grade",                          dir: "higher",  range: "51 – 68",   example: 59.7 },
    { metric: "Yards Per Route Run",                      dir: "higher",  range: "1.1 – 2.6", example: 1.80 },
    { metric: "YAC Per Reception", board: "YAC/ Rec",    dir: "higher",  range: "4.8 – 6.1", example: 5.5 },
    { metric: "Drop %",          board: "Drop %",        dir: "lower",   range: "0 – 12",    example: 5.8 },
    { metric: "Missed Tkles Forced", board: "Missed Tkls", dir: "lower", range: "2 – 9",     example: 5 },
    { metric: "Cont. Catch Ratio", board: "CCR",         dir: "neutral", range: "41 – 80",   example: 60.6 },
    { metric: "Touchdowns",      board: "TDs",           dir: "neutral", range: "0 – 8",     example: 4 },
  ]},
];

/* helper: compute PFF grade color for an example value + direction */
function pffExampleColor(value: number, dir: Dir): string {
  if (dir === "neutral") return "text-white";
  // Use pct100 scale for grade-like values, skip direction flip for display
  const raw = Math.max(0, Math.min(1, (value - 60) / 35));
  const pct = dir === "lower" ? 1 - raw : raw;
  if (pct >= 0.90) return "text-blue-400 font-bold";
  if (pct >= 0.70) return "text-green-400 font-semibold";
  if (pct >= 0.40) return "text-yellow-400";
  if (pct >= 0.20) return "text-orange-400";
  return "text-red-400";
}

const DIR_BADGE: Record<Dir, { cls: string; icon: string; label: string }> = {
  higher:  { cls: "bg-blue-500/10 border-blue-500/20 text-blue-300",   icon: "↑", label: "Higher" },
  lower:   { cls: "bg-orange-500/10 border-orange-500/20 text-orange-300", icon: "↓", label: "Lower" },
  neutral: { cls: "bg-white/5 border-white/10 text-gray-400",          icon: "—", label: "Neutral" },
};

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function ColorsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Color System Reference</h1>
        <p className="mt-1 text-sm text-gray-400">
          How grades, PFF scores, and ratings are color-coded across the app.
        </p>
      </div>

      {/* ── Tier Legend ──────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-4">Color Tiers</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {TIERS.map((t) => (
            <div key={t.label} className="rounded-lg bg-[#0a0f1a] p-3 text-center">
              <div className={`mx-auto mb-2 h-4 w-12 rounded ${t.cls}`} />
              <p className={`text-sm font-semibold ${t.text}`}>{t.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">Percentile {t.pct}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Grade Scale Breakpoints ──────────────────────────────────── */}
      <section className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-1">Grade Scale Breakpoints</h2>
        <p className="text-xs text-gray-500 mb-4">
          Each source uses a different numeric range. These are the raw values where color tiers change.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#2a3a4e] text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Scale</th>
                <th className="px-3 py-2 text-center">
                  <span className="text-red-400">Poor</span>
                </th>
                <th className="px-3 py-2 text-center">
                  <span className="text-orange-400">Below&nbsp;Avg</span>
                </th>
                <th className="px-3 py-2 text-center">
                  <span className="text-yellow-400">Good</span>
                </th>
                <th className="px-3 py-2 text-center">
                  <span className="text-green-400">Great</span>
                </th>
                <th className="px-3 py-2 text-center">
                  <span className="text-blue-400">Elite</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {SCALES.map((s) => (
                <tr key={s.name} className="border-b border-[#2a3a4e]/50">
                  <td className="px-3 py-2.5">
                    <span className="text-sm font-semibold text-white">{s.name}</span>
                    <span className="block text-[10px] text-gray-500">{s.examples}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">{s.range}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-red-400">&lt; {s.below}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-orange-400">{s.below}+</td>
                  <td className="px-3 py-2.5 text-center text-xs text-yellow-400">{s.good}+</td>
                  <td className="px-3 py-2.5 text-center text-xs text-green-400">{s.great}+</td>
                  <td className="px-3 py-2.5 text-center text-xs font-bold text-blue-400">{s.elite}+</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Live Sample Values ────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-1">Live Examples</h2>
        <p className="text-xs text-gray-500 mb-4">
          Sample values for each source showing the exact color they produce.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SCALES.map((s) => {
            const samples = [s.elite + 1, s.great, s.good, s.below, s.below - (s.great - s.good)].map(
              (v) => +v.toFixed(2)
            );
            return (
              <div key={s.name} className="rounded-lg bg-[#0a0f1a] p-4">
                <h3 className="text-xs font-semibold text-white mb-2">{s.name}</h3>
                <div className="space-y-1">
                  {samples.map((v) => {
                    const pctVal =
                      s.name.includes("PFF") || s.name.includes("ESPN") || s.name.includes("DraftBuzz")
                        ? (v - 60) / 35
                        : s.name.includes("NFL")
                        ? (v - 5.8) / 1.4
                        : s.name.includes("Gridiron")
                        ? (v - 6.5) / 2.0
                        : s.name.includes("Rivals")
                        ? (v - 5.5) / 0.5
                        : s.name.includes("24/7")
                        ? (v - 82) / 16
                        : (v - 6.0) / 2.0;
                    const pct = Math.max(0, Math.min(1, pctVal));
                    const tier =
                      pct >= 0.9 ? "text-blue-400 font-bold"
                      : pct >= 0.7 ? "text-green-400 font-semibold"
                      : pct >= 0.4 ? "text-yellow-400"
                      : pct >= 0.2 ? "text-orange-400"
                      : "text-red-400";
                    return (
                      <div key={v} className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{v}</span>
                        <span className={`text-xs tabular-nums ${tier}`}>{v}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── PFF Stats by Position ────────────────────────────────────── */}
      <section className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-1">PFF Stat Color Reference — By Position</h2>
        <p className="text-xs text-gray-500 mb-2">
          Every PFF metric, its direction, range, and the color it produces.
          The &quot;Board&quot; column shows the abbreviated label used on position boards when it differs from the profile name.
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-blue-300">↑ Higher is Better</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 text-orange-300">↓ Lower is Better <span className="text-orange-400/60">(color inverted)</span></span>
          <span className="inline-flex items-center gap-1 rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-gray-400">— Neutral <span className="text-gray-500">(plain white)</span></span>
        </div>

        <div className="space-y-6">
          {PFF_STATS_BY_POS.map((group) => (
            <div key={group.pos}>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <span className="inline-flex h-6 min-w-[2.5rem] items-center justify-center rounded bg-orange-500/20 px-2 text-[11px] font-bold text-orange-400">{group.pos}</span>
                <span className="text-gray-600 text-xs font-normal">{group.stats.length} metrics</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#2a3a4e] text-[10px] font-medium uppercase tracking-wider text-gray-500">
                      <th className="px-2 py-1.5">Metric (Profile)</th>
                      <th className="px-2 py-1.5">Board Label</th>
                      <th className="px-2 py-1.5 text-center">Direction</th>
                      <th className="px-2 py-1.5 text-center">Typical Range</th>
                      <th className="px-2 py-1.5 text-center">Example</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.stats.map((s) => {
                      const badge = DIR_BADGE[s.dir];
                      return (
                        <tr key={s.metric} className="border-b border-[#2a3a4e]/30">
                          <td className="px-2 py-1.5 text-xs text-white">{s.metric}</td>
                          <td className="px-2 py-1.5 text-xs text-gray-500">{s.board || "—"}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] ${badge.cls}`}>
                              {badge.icon} {badge.label}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-center text-xs text-gray-400 tabular-nums">{s.range}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={`text-xs tabular-nums ${pffExampleColor(s.example, s.dir)}`}>{s.example}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg bg-[#0a0f1a] p-4 text-xs text-gray-400 space-y-2">
          <p><strong className="text-white">How direction affects coloring:</strong></p>
          <p>
            <span className="text-blue-300 font-semibold">↑ Higher is Better</span> — Raw value mapped to 0–100 PFF scale, higher percentile = better color.
            A Coverage Grade of 90+ → <span className="text-blue-400 font-bold">Elite (blue)</span>.
          </p>
          <p>
            <span className="text-orange-300 font-semibold">↓ Lower is Better</span> — Scale is <em>inverted</em>. A low Completion % allowed (37%) →
            <span className="text-blue-400 font-bold"> Elite (blue)</span>, while a high Completion % allowed (71%) →
            <span className="text-red-400"> Poor (red)</span>.
          </p>
          <p>
            <span className="text-gray-400">— Neutral</span> — No color applied. These are context stats (snap counts, raw totals) with no inherent
            good/bad direction. Always shown in <span className="text-white">white</span>.
          </p>
        </div>
      </section>

      {/* ── Name Variants ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-1">PFF Metric Name Variants</h2>
        <p className="text-xs text-gray-500 mb-4">
          Some metrics appear under different names in profiles vs boards. The color system matches on all known variants.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#2a3a4e] text-[10px] font-medium uppercase tracking-wider text-gray-500">
                <th className="px-2 py-1.5">Concept</th>
                <th className="px-2 py-1.5">Profile Variant(s)</th>
                <th className="px-2 py-1.5">Board Variant(s)</th>
                <th className="px-2 py-1.5 text-center">Direction</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {[
                { concept: "Missed Tackle Rate", profile: "Missed Tackle Rate, Missed Tkl Rate", board: "Missed Tkl Rate", dir: "lower" as Dir },
                { concept: "Missed Tackles Forced", profile: "Missed Tkles Forced, Missed Tkls Forced", board: "Missed Tkls", dir: "lower" as Dir },
                { concept: "Passer Rating Allowed", profile: "Passer Rating Alwd, Pass Rat. All.", board: "Pass Rating All.", dir: "lower" as Dir },
                { concept: "Run Defense Grade", profile: "Run Def Grade, Run Def. Grade", board: "Run. Def, Run Def.", dir: "higher" as Dir },
                { concept: "Yards Per Route Run", profile: "Yards Per Route Run, Yards/ Routes Run", board: "Y/RR", dir: "higher" as Dir },
                { concept: "Yearly Grade", profile: "25 Grade, 2025 Grade, 24 Grade, etc.", board: "—", dir: "higher" as Dir },
                { concept: "OL Pressure (Sacks)", profile: "Sacks Allowed", board: "Sacks", dir: "lower" as Dir },
                { concept: "DL Pressure (Sacks)", profile: "Sacks", board: "Sacks", dir: "lower" as Dir },
              ].map((row) => {
                const badge = DIR_BADGE[row.dir];
                return (
                  <tr key={row.concept} className="border-b border-[#2a3a4e]/30">
                    <td className="px-2 py-1.5 font-semibold text-white">{row.concept}</td>
                    <td className="px-2 py-1.5 text-gray-400">{row.profile}</td>
                    <td className="px-2 py-1.5 text-gray-400">{row.board}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] ${badge.cls}`}>
                        {badge.icon} {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Percentile Context ────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-1">Percentile Sources</h2>
        <p className="text-xs text-gray-500 mb-4">
          PFF scores have percentile data that drives coloring. The meaning differs by context.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg bg-[#0a0f1a] p-4">
            <h3 className="text-xs font-semibold text-white mb-1">Position Boards</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Percentiles are pre-computed within each board group (e.g. all 20 CBs).
              <span className="text-green-400 font-semibold"> 1.0 = best</span>,
              <span className="text-red-400"> 0.0 = worst</span>.
              Already corrected for stat direction — lower-is-better stats have their percentiles flipped in the data.
            </p>
          </div>
          <div className="rounded-lg bg-[#0a0f1a] p-4">
            <h3 className="text-xs font-semibold text-white mb-1">Player Profiles</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Percentiles are naive rank across all players at the position.
              <span className="text-green-400 font-semibold"> 0.0 = highest raw value</span>,
              <span className="text-red-400"> 1.0 = lowest raw value</span>.
              The color system flips for higher-is-better stats and keeps as-is for lower-is-better stats.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
