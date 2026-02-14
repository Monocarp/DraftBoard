"use client";

import { useState } from "react";
import Link from "next/link";
import PositionBadge from "./PositionBadge";
import { normalizePosition, ALL_POSITIONS } from "@/lib/types";
import type { PlayerIndex } from "@/lib/types";

export default function PlayerGrid({ players }: { players: PlayerIndex[] }) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("ALL");

  const filtered = players.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.college || "").toLowerCase().includes(search.toLowerCase());
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
      {/* Filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search players or schools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#2a3a4e] bg-[#111827] py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-orange-500/50 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {visiblePositions.map((pos) => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
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

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((p) => (
          <Link
            key={p.slug}
            href={`/player/${p.slug}`}
            className="group rounded-xl border border-[#2a3a4e] bg-[#111827] p-4 transition-all hover:border-orange-500/30 hover:bg-[#1a2332]"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-white group-hover:text-orange-400 transition-colors">
                {p.name}
              </h3>
              <PositionBadge position={p.position} />
            </div>
            <p className="text-sm text-gray-400">{p.college}</p>
            <div className="mt-3 flex gap-4 text-xs text-gray-500">
              {p.height && <span>{p.height}</span>}
              {p.weight && <span>{p.weight} lbs</span>}
              {p.age && <span>Age {p.age}</span>}
              {p.year && <span>{p.year}</span>}
            </div>
            {p.projected_round && (
              <div className="mt-2">
                <span className="rounded-full bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 text-xs text-orange-400">
                  Proj: {p.projected_round}
                </span>
              </div>
            )}
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-16 text-center text-gray-500">No players match your filters.</div>
      )}
      <p className="mt-4 text-xs text-gray-600">
        Showing {filtered.length} of {players.length} players
      </p>
    </div>
  );
}
