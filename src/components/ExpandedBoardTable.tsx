"use client";

import { useState } from "react";
import Link from "next/link";
import PositionBadge from "./PositionBadge";
import { normalizePosition, ALL_POSITIONS } from "@/lib/types";
import type { ExpandedBoardPlayer } from "@/lib/types";

export default function ExpandedBoardTable({
  players,
  title,
}: {
  players: ExpandedBoardPlayer[];
  title: string;
}) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (slug: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(slug)) {
      newExpanded.delete(slug);
    } else {
      newExpanded.add(slug);
    }
    setExpandedRows(newExpanded);
  };

  const expandAll = () => {
    setExpandedRows(new Set(filtered.map((p) => p.slug)));
  };
  const collapseAll = () => {
    setExpandedRows(new Set());
  };

  const filtered = players.filter((p) => {
    const matchesSearch =
      !search ||
      p.player.toLowerCase().includes(search.toLowerCase()) ||
      p.school.toLowerCase().includes(search.toLowerCase());
    const matchesPos =
      posFilter === "ALL" || normalizePosition(p.position) === posFilter;
    return matchesSearch && matchesPos;
  });

  const presentPositions = new Set(players.map((p) => normalizePosition(p.position)));
  const visiblePositions = ALL_POSITIONS.filter(
    (p) => p === "ALL" || presentPositions.has(p)
  );

  return (
    <div>
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search players or schools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#2a3a4e] bg-[#111827] py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
          />
        </div>

        {/* Position filter pills */}
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

      {/* Expand/Collapse All */}
      <div className="mb-2 flex gap-2">
        <button
          onClick={expandAll}
          className="rounded-md px-3 py-1 text-xs font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors"
        >
          Expand All
        </button>
        <button
          onClick={collapseAll}
          className="rounded-md px-3 py-1 text-xs font-medium bg-[#1a2332] text-gray-400 hover:text-white border border-[#2a3a4e] transition-colors"
        >
          Collapse All
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#2a3a4e] bg-[#111827]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#2a3a4e] text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-2 sm:px-4 py-2 sm:py-3 w-8 sm:w-12"></th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 w-10 sm:w-16">#</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3">Player</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 w-16 sm:w-20">Pos</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 hidden sm:table-cell">School</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 w-16 hidden md:table-cell">Age</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 w-16 hidden md:table-cell">Year</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, idx) => {
              const isExpanded = expandedRows.has(p.slug);
              return (
                <>
                  <tr key={p.slug + idx} className="border-b border-[#2a3a4e]/50 board-row">
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <button
                        onClick={() => toggleRow(p.slug)}
                        className="text-gray-400 hover:text-orange-400 transition-colors"
                        aria-label={isExpanded ? "Collapse" : "Expand"}
                      >
                        <svg
                          className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <span className="text-sm font-bold text-gray-500">
                        {p.rank}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <Link
                        href={`/player/${p.slug}`}
                        className="text-sm font-semibold text-white hover:text-orange-400 transition-colors"
                      >
                        {p.player}
                      </Link>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <PositionBadge position={p.position} />
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-gray-400 hidden sm:table-cell">{p.school}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-gray-400 hidden md:table-cell">{p.age ?? "-"}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-gray-400 hidden md:table-cell">{p.year ?? "-"}</td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${p.slug}-expanded`} className="border-b border-[#2a3a4e]/50">
                      <td colSpan={7} className="px-3 sm:px-4 py-3 sm:py-4 bg-[#0d1117]">
                        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
                          {/* Grades */}
                          {Object.keys(p.grades).length > 0 && (
                            <div className="w-full sm:w-auto sm:min-w-[110px]">
                              <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">
                                Grades
                              </h4>
                              <div className="space-y-0.5">
                                {Object.entries(p.grades).map(([source, grade]) => (
                                  <div key={source} className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400 text-left">{source}</span>
                                    <span className="text-xs font-semibold text-white text-right">
                                      {grade === "TBD" ? "—" : grade}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Ranks */}
                          {Object.keys(p.ranks).length > 0 && (
                            <div className="w-full sm:w-auto sm:min-w-[110px]">
                              <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">
                                Rankings
                              </h4>
                              <div className="space-y-0.5">
                                {Object.entries(p.ranks).map(([source, rank]) => (
                                  <div key={source} className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400 text-left">{source}</span>
                                    <span className="text-xs font-semibold text-white text-right">
                                      #{rank}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Summary */}
                          {p.summary && (
                            <div className="flex-1 w-full sm:w-auto">
                              <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">
                                Summary
                              </h4>
                              <p className="text-xs text-gray-300 leading-relaxed">
                                {p.summary}
                              </p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-gray-500">
            No players match your search.
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-600">
        Showing {filtered.length} of {players.length} players
      </p>
    </div>
  );
}
