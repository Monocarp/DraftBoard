"use client";

import { useState } from "react";
import Link from "next/link";
import PositionBadge from "./PositionBadge";
import { normalizePosition, ALL_POSITIONS } from "@/lib/types";
import type { BoardPlayer } from "@/lib/types";

export default function BoardTable({
  players,
  title,
}: {
  players: BoardPlayer[];
  title: string;
}) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");

  const filtered = players.filter((p) => {
    const matchesSearch =
      !search ||
      p.player.toLowerCase().includes(search.toLowerCase()) ||
      p.school.toLowerCase().includes(search.toLowerCase());
    const matchesPos =
      posFilter === "ALL" || normalizePosition(p.position) === posFilter;
    return matchesSearch && matchesPos;
  });

  // Get unique positions present in data
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

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#2a3a4e] bg-[#111827]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#2a3a4e] text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3 w-16">#</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3 w-20">Pos</th>
              <th className="px-4 py-3">School</th>
              <th className="px-4 py-3 w-16">Age</th>
              <th className="px-4 py-3 w-16">Year</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a3a4e]/50">
            {filtered.map((p, idx) => (
              <tr key={p.slug + idx} className="board-row">
                <td className="px-4 py-3">
                  <span className="text-sm font-bold text-gray-500">
                    {p.rank}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/player/${p.slug}`}
                    className="text-sm font-semibold text-white hover:text-orange-400 transition-colors"
                  >
                    {p.player}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <PositionBadge position={p.position} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">{p.school}</td>
                <td className="px-4 py-3 text-sm text-gray-400">{p.age ?? "-"}</td>
                <td className="px-4 py-3 text-sm text-gray-400">{p.year ?? "-"}</td>
              </tr>
            ))}
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
