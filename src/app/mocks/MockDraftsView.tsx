"use client";

import { useState } from "react";
import Link from "next/link";
import PositionBadge from "@/components/PositionBadge";
import type { MockPick } from "@/lib/types";

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function MockDraftsView({
  mocks,
  mockDates,
}: {
  mocks: Record<string, MockPick[]>;
  mockDates: Record<string, string>;
}) {
  const sources = Object.keys(mocks).sort();
  const [selectedSource, setSelectedSource] = useState(sources[0] || "");
  const [viewMode, setViewMode] = useState<"single" | "compare">("single");
  const [compareSources, setCompareSources] = useState<string[]>(sources.slice(0, 3));

  const picks = mocks[selectedSource] || [];

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Mock Drafts</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-400">
          {sources.length} mock draft sources aggregated. Compare picks across analysts.
        </p>
      </div>

      {/* View mode toggle */}
      <div className="flex gap-1 rounded-lg bg-[#111827] border border-[#2a3a4e] p-1 mb-6 w-fit">
        <button
          onClick={() => setViewMode("single")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            viewMode === "single" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          Single Source
        </button>
        <button
          onClick={() => setViewMode("compare")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            viewMode === "compare" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          Compare
        </button>
      </div>

      {viewMode === "single" ? (
        <>
          {/* Source selector */}
          <div className="mb-4 flex flex-wrap gap-2">
            {sources.map((src) => (
              <button
                key={src}
                onClick={() => setSelectedSource(src)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex flex-col items-center gap-0.5 ${
                  selectedSource === src
                    ? "bg-orange-500 text-white"
                    : "bg-[#1a2332] text-gray-400 hover:text-white border border-[#2a3a4e]"
                }`}
              >
                <span>{src} ({mocks[src].length})</span>
                {mockDates[src] && (
                  <span className={`text-[10px] ${
                    selectedSource === src ? "text-orange-100" : "text-gray-500"
                  }`}>
                    {formatDate(mockDates[src])}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Single mock table */}
          <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2a3a4e] text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-2 sm:px-4 py-2 sm:py-3 w-12 sm:w-16">Pick</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3">Team</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3">Player</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 w-16 sm:w-20">Pos</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 hidden sm:table-cell">College</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a3a4e]/50">
                {picks.map((pk, i) => (
                  <tr key={i} className="board-row">
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <span className="text-sm font-bold text-gray-500">{pk.pick}</span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-white">
                      {pk.team}
                      {pk.tradeNote && (
                        <span className="text-[10px] sm:text-xs text-gray-500 ml-1">({pk.tradeNote})</span>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      {pk.slug ? (
                        <Link href={`/player/${pk.slug}`} className="text-xs sm:text-sm font-semibold text-white hover:text-orange-400 transition-colors">
                          {pk.player}
                        </Link>
                      ) : (
                        <span className="text-xs sm:text-sm text-white">{pk.player}</span>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <PositionBadge position={pk.position} />
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-gray-400 hidden sm:table-cell">{pk.college}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        /* Compare view */
        <CompareView mocks={mocks} sources={sources} compareSources={compareSources} setCompareSources={setCompareSources} mockDates={mockDates} />
      )}
    </div>
  );
}

function CompareView({
  mocks,
  sources,
  compareSources,
  setCompareSources,
  mockDates,
}: {
  mocks: Record<string, MockPick[]>;
  sources: string[];
  compareSources: string[];
  setCompareSources: (s: string[]) => void;
  mockDates: Record<string, string>;
}) {
  const [teamFilter, setTeamFilter] = useState<string>("ALL");

  const maxSources = teamFilter === "ALL" ? 5 : 10;

  const toggleSource = (src: string) => {
    if (compareSources.includes(src)) {
      setCompareSources(compareSources.filter((s) => s !== src));
    } else if (compareSources.length < maxSources) {
      setCompareSources([...compareSources, src]);
    }
  };

  // Collect all unique teams from selected sources (normalized, no trade notes)
  const allTeams = Array.from(
    new Set(
      compareSources.flatMap((s) => (mocks[s] || []).map((p) => p.team).filter(Boolean) as string[])
    )
  ).sort();

  // Build the rows to display
  const rows: { pickNum: number; picks: Record<string, MockPick | undefined> }[] = [];

  if (teamFilter === "ALL") {
    // Default: show picks 1–32 by pick number
    const maxPicks = Math.min(
      32,
      Math.max(...compareSources.map((s) => mocks[s]?.length || 0))
    );
    for (let i = 0; i < maxPicks; i++) {
      const picks: Record<string, MockPick | undefined> = {};
      for (const src of compareSources) picks[src] = mocks[src]?.[i];
      rows.push({ pickNum: i + 1, picks });
    }
  } else {
    // Team filter: find all pick numbers where ANY selected source has this team
    const pickNums = new Set<number>();
    for (const src of compareSources) {
      for (const p of mocks[src] || []) {
        // Match on normalized team name (trade note is separate)
        if (p.team === teamFilter && p.pick != null) pickNums.add(p.pick);
      }
    }
    const sortedPicks = Array.from(pickNums).sort((a, b) => a - b);
    for (const num of sortedPicks) {
      const picks: Record<string, MockPick | undefined> = {};
      for (const src of compareSources) {
        picks[src] = (mocks[src] || []).find((p) => p.pick === num);
      }
      rows.push({ pickNum: num, picks });
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {sources.map((src) => (
          <button
            key={src}
            onClick={() => toggleSource(src)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex flex-col items-center gap-0.5 ${
              compareSources.includes(src)
                ? "bg-orange-500 text-white"
                : "bg-[#1a2332] text-gray-400 hover:text-white border border-[#2a3a4e]"
            }`}
          >
            <span>{src}</span>
            {mockDates[src] && (
              <span className={`text-[10px] ${
                compareSources.includes(src) ? "text-orange-100" : "text-gray-500"
              }`}>
                {formatDate(mockDates[src])}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Controls row: instructions + team filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <p className="text-xs text-gray-500">Select up to {maxSources} sources to compare{teamFilter === "ALL" ? " (first round)" : ""}.</p>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Team:</label>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-lg border border-[#2a3a4e] bg-[#111827] px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500/50"
          >
            <option value="ALL">All Teams</option>
            {allTeams.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-8 text-center">
          <p className="text-sm text-gray-400">No picks found for {teamFilter}.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2a3a4e] text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-3 py-3 w-12">#</th>
                {compareSources.map((src) => (
                  <th key={src} className="px-2 sm:px-3 py-2 sm:py-3 min-w-[140px] sm:min-w-[180px]">
                    <div>{src}</div>
                    {mockDates[src] && (
                      <div className="text-[10px] font-normal text-gray-500 mt-0.5">{formatDate(mockDates[src])}</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3a4e]/50">
              {rows.map((row) => {
                const isTeamRow = teamFilter !== "ALL";
                return (
                  <tr key={row.pickNum} className="board-row">
                    <td className="px-3 py-2">
                      <span className="text-xs font-bold text-gray-500">{row.pickNum}</span>
                    </td>
                    {compareSources.map((src) => {
                      const pick = row.picks[src];
                      const isMatch = isTeamRow && pick?.team === teamFilter;
                      return (
                        <td key={src} className={`px-3 py-2 ${isTeamRow && !isMatch ? "opacity-40" : ""}`}>
                          {pick ? (
                            <div>
                              <div className="flex items-center gap-1.5">
                                {pick.slug ? (
                                  <Link href={`/player/${pick.slug}`} className={`text-xs font-semibold hover:text-orange-400 ${isMatch ? "text-orange-400" : "text-white"}`}>
                                    {pick.player}
                                  </Link>
                                ) : (
                                  <span className={`text-xs ${isMatch ? "text-orange-400 font-semibold" : "text-white"}`}>{pick.player}</span>
                                )}
                                <PositionBadge position={pick.position} />
                              </div>
                              <p className="text-xs text-gray-500">
                                {pick.team}
                                {pick.tradeNote && (
                                  <span className="text-[10px] text-gray-600 ml-1">({pick.tradeNote})</span>
                                )}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-600">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
