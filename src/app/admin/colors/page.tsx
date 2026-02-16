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

      {/* ── PFF Stat Direction ────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-5">
        <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-1">PFF Stat Direction</h2>
        <p className="text-xs text-gray-500 mb-4">
          PFF metrics are colored based on direction. Most stats are &quot;higher is better&quot;.
          Stats listed below are exceptions.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lower is Better */}
          <div className="border-l-4 border-orange-500 pl-4">
            <h3 className="text-sm font-semibold text-orange-400 mb-3">↓ Lower is Better</h3>
            <p className="text-xs text-gray-500 mb-3">
              Color is inverted — a low value gets blue/green, a high value gets red.
            </p>
            <div className="space-y-3">
              {Object.entries(LOWER_IS_BETTER).map(([pos, stats]) => (
                <div key={pos}>
                  <span className="text-xs font-semibold text-white">{pos}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {stats.map((s) => (
                      <span
                        key={s}
                        className="inline-block rounded-md bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 text-[11px] text-orange-300"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Neutral */}
          <div className="border-l-4 border-gray-500 pl-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">— Neutral (No Color)</h3>
            <p className="text-xs text-gray-500 mb-3">
              These stats provide context but have no directional meaning. Shown in plain white.
            </p>
            <div className="flex flex-wrap gap-1">
              {NEUTRAL_STATS.map((s) => (
                <span
                  key={s}
                  className="inline-block rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[11px] text-gray-400"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 border-l-4 border-blue-500 pl-4">
          <h3 className="text-sm font-semibold text-blue-400 mb-2">↑ Higher is Better (Default)</h3>
          <p className="text-xs text-gray-500">
            All other PFF metrics — grades, coverage scores, pass rush, receiving, run blocking, etc. — follow
            the standard color direction where higher values earn better colors.
          </p>
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
