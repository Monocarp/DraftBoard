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
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium text-white">{pk.team}</td>
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
  const toggleSource = (src: string) => {
    if (compareSources.includes(src)) {
      setCompareSources(compareSources.filter((s) => s !== src));
    } else if (compareSources.length < 5) {
      setCompareSources([...compareSources, src]);
    }
  };

  // Get max picks across selected sources (first round = 32)
  const maxPicks = Math.min(
    32,
    Math.max(...compareSources.map((s) => mocks[s]?.length || 0))
  );

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
      <p className="text-xs text-gray-500 mb-4">Select up to 5 sources to compare (first round).</p>

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
            {Array.from({ length: maxPicks }, (_, i) => i).map((pickIdx) => (
              <tr key={pickIdx} className="board-row">
                <td className="px-3 py-2">
                  <span className="text-xs font-bold text-gray-500">{pickIdx + 1}</span>
                </td>
                {compareSources.map((src) => {
                  const pick = mocks[src]?.[pickIdx];
                  return (
                    <td key={src} className="px-3 py-2">
                      {pick ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            {pick.slug ? (
                              <Link href={`/player/${pick.slug}`} className="text-xs font-semibold text-white hover:text-orange-400">
                                {pick.player}
                              </Link>
                            ) : (
                              <span className="text-xs text-white">{pick.player}</span>
                            )}
                            <PositionBadge position={pick.position} />
                          </div>
                          <p className="text-xs text-gray-500">{pick.team}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
