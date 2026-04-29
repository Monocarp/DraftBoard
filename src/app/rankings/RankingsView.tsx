"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import PositionBadge from "@/components/PositionBadge";
import { normalizePosition, ALL_POSITIONS, SOURCE_WEIGHTS } from "@/lib/types";
import type { RankingEntry } from "@/lib/types";

export default function RankingsView({ rankings, sourceDates }: { rankings: RankingEntry[]; sourceDates: Record<string, string> }) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const [sortSource, setSortSource] = useState("Consensus");
  const [showAll, setShowAll] = useState(false);

  // Get all available sources
  const sources = useMemo(() => {
    const srcSet = new Set<string>();
    rankings.forEach((r) => Object.keys(r.source_rankings).forEach((s) => srcSet.add(s)));
    return Array.from(srcSet).sort();
  }, [rankings]);

  // Compute per-source list sizes (non-null entries) for percentile normalisation
  const listSizes = useMemo(() => {
    const sizes: Record<string, number> = {};
    rankings.forEach((r) =>
      Object.entries(r.source_rankings).forEach(([src, v]) => {
        if (typeof v === "number") sizes[src] = (sizes[src] ?? 0) + 1;
      })
    );
    return sizes;
  }, [rankings]);

  // Default: Tier 1 + Tier 2 sources checked; Tier 3 unchecked
  const defaultSources = useMemo(() => {
    const tier1and2 = ["PFF", "ESPN", "Brugler", "NFL.com", "Bleacher Report", "CBS", "Walter Football"];
    return new Set(tier1and2.filter(s => sources.includes(s)));
  }, [sources]);

  const [selectedSources, setSelectedSources] = useState<Set<string>>(defaultSources);

  const toggleSource = (source: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  };

  const toggleAllSources = () => {
    if (selectedSources.size === sources.length) {
      setSelectedSources(new Set());
    } else {
      setSelectedSources(new Set(sources));
    }
  };

  // Format date from "2026-02-03 00:00:00" to "2/3"
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const match = dateStr.match(/^\d{4}-(\d{2})-(\d{2})/);
    if (match) {
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);
      return `${month}/${day}`;
    }
    return dateStr;
  };

  // Compute consensus rank + sort
  const processed = useMemo(() => {
    return rankings
      .map((r) => {
        // Weighted-percentile consensus using only selected sources
        let totalWeight = 0;
        let totalScore = 0;
        let sourceCount = 0;
        Object.entries(r.source_rankings).forEach(([src, v]) => {
          if (!selectedSources.has(src) || typeof v !== "number") return;
          const n = listSizes[src] ?? 1;
          const pct = n < 2 ? 1 : Math.max(0, Math.min(1, 1 - (v - 1) / (n - 1)));
          const w = SOURCE_WEIGHTS[src] ?? 0.5;
          totalWeight += w;
          totalScore += w * pct;
          sourceCount++;
        });
        const consensus = totalWeight > 0 ? totalScore / totalWeight : -1;
        return { ...r, consensus, sourceCount };
      })
      .filter((r) => {
        const matchesSearch =
          !search ||
          r.player.toLowerCase().includes(search.toLowerCase()) ||
          (r.school || "").toLowerCase().includes(search.toLowerCase());
        const matchesPos =
          posFilter === "ALL" || normalizePosition(r.position) === posFilter;
        return matchesSearch && matchesPos;
      })
      .sort((a, b) => {
        if (sortSource === "Consensus") return b.consensus - a.consensus; // higher score = better
        const aVal = typeof a.source_rankings[sortSource] === "number" ? (a.source_rankings[sortSource] as number) : 9999;
        const bVal = typeof b.source_rankings[sortSource] === "number" ? (b.source_rankings[sortSource] as number) : 9999;
        return aVal - bVal;
      })
      .slice(0, showAll ? undefined : 300);
  }, [rankings, search, posFilter, sortSource, selectedSources, showAll]);

  const presentPositions = new Set(rankings.map((r) => normalizePosition(r.position)));
  const visiblePositions = ALL_POSITIONS.filter((p) => p === "ALL" || presentPositions.has(p));

  // Only show selected sources in the table
  const displaySources = sources.filter((s) => selectedSources.has(s));
  
  // Add Consensus to sources dropdown
  const sortOptions = ["Consensus", ...sources];

  // Dynamic column width and truncation based on number of sources
  const getSourceDisplay = (source: string) => {
    const count = displaySources.length;
    if (count <= 4) return source;
    if (count <= 8) return source.length > 10 ? source.slice(0, 9) : source;
    if (count <= 12) return source.length > 7 ? source.slice(0, 6) : source;
    return source.length > 5 ? source.slice(0, 4) : source;
  };

  const getSourceWidth = () => {
    const count = displaySources.length;
    if (count <= 4) return "w-20";
    if (count <= 8) return "w-16";
    if (count <= 12) return "w-14";
    return "w-12";
  };

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Rankings</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-400">
          {rankings.length} players tracked across {sources.length} ranking sources.
        </p>
      </div>

      {/* Source Selector */}
      <div className="mb-4 rounded-xl border border-[#2a3a4e] bg-[#111827] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Ranking Sources</h3>
          <button
            onClick={toggleAllSources}
            className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
          >
            {selectedSources.size === sources.length ? "Deselect All" : "Select All"}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {sources.map((source) => (
            <label
              key={source}
              className="flex items-center gap-2 text-xs text-gray-300 hover:text-white cursor-pointer"
              title={sourceDates[source] ? `Updated: ${sourceDates[source]}` : undefined}
            >
              <input
                type="checkbox"
                checked={selectedSources.has(source)}
                onChange={() => toggleSource(source)}
                className="rounded border-[#2a3a4e] bg-[#0d1117] text-orange-500 focus:ring-orange-500/50 focus:ring-offset-0"
              />
              <div className="flex flex-col">
                <span>{source}</span>
                {sourceDates[source] && (
                  <span className="text-[10px] text-gray-500">{formatDate(sourceDates[source])}</span>
                )}
              </div>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {selectedSources.size} of {sources.length} sources selected • Average calculated from selected sources
        </p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#2a3a4e] bg-[#111827] py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-orange-500/50 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {visiblePositions.map((pos) => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                posFilter === pos
                  ? "bg-orange-500 text-white"
                  : "bg-[#1a2332] text-gray-400 hover:text-white border border-[#2a3a4e]"
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* Sort by source */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-gray-500">Sort by:</span>
        <select
          value={sortSource}
          onChange={(e) => setSortSource(e.target.value)}
          className="rounded-lg border border-[#2a3a4e] bg-[#111827] px-3 py-1.5 text-xs text-white focus:outline-none"
        >
          {sortOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Rankings table */}
      <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#2a3a4e] text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-2 sm:px-3 py-2 sm:py-3 w-12">Score</th>
              <th className="px-2 sm:px-3 py-2 sm:py-3">Player</th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 w-16">Pos</th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 hidden sm:table-cell">School</th>
              {displaySources.map((s) => (
                <th
                  key={s}
                  className={`px-1.5 sm:px-3 py-2 sm:py-3 ${getSourceWidth()} text-center cursor-pointer hover:text-orange-400 transition-colors whitespace-nowrap overflow-hidden ${sortSource === s ? "text-orange-400" : ""}`}
                  onClick={() => setSortSource(s)}
                  title={s}
                >
                  {getSourceDisplay(s)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a3a4e]/50">
            {processed.map((r, i) => (
              <tr key={r.slug + i} className="board-row">
                <td className="px-2 sm:px-3 py-2">
                  {(() => {
                    const score = r.consensus >= 0 ? r.consensus * 100 : null;
                    const color = score === null ? "text-gray-600"
                      : score >= 90 ? "text-purple-400"
                      : score >= 70 ? "text-green-400"
                      : score >= 40 ? "text-yellow-400"
                      : score >= 20 ? "text-gray-400"
                      : "text-red-400";
                    return (
                      <span className={`text-xs font-bold ${color}`}>
                        {score !== null ? score.toFixed(1) : "—"}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-2 sm:px-3 py-2">
                  <Link href={`/player/${r.slug}`} className="text-xs sm:text-sm font-semibold text-white hover:text-orange-400 transition-colors">
                    {r.player}
                  </Link>
                </td>
                <td className="px-2 sm:px-3 py-2">
                  <PositionBadge position={r.position} />
                </td>
                <td className="px-2 sm:px-3 py-2 text-xs text-gray-400 hidden sm:table-cell">{r.school}</td>
                {displaySources.map((s) => {
                  const val = r.source_rankings[s];
                  const num = typeof val === "number" ? val : null;
                  return (
                    <td key={s} className="px-1.5 sm:px-3 py-2 text-center">
                      <span className={`text-xs font-medium ${num && num <= 15 ? "text-purple-400" : num && num <= 50 ? "text-green-400" : num && num <= 100 ? "text-yellow-400" : num && num <= 200 ? "text-gray-300" : num ? "text-red-400" : "text-gray-600"}`}>
                        {num ? Math.round(num) : val === "Unranked" ? "NR" : "—"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-gray-600">Showing {processed.length} players</p>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
        >
          {showAll ? "Show top 300" : `Show all ${rankings.length}`}
        </button>
      </div>
    </div>
  );
}
