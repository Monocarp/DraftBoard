"use client";

import { useState } from "react";
import Link from "next/link";
import PositionBadge from "@/components/PositionBadge";
import type { PositionBoardPlayer } from "@/lib/types";
import { getGradeColor, getPffColorByPercentile, parseGradeValue, PLAIN } from "@/lib/colors";

const BOARD_ORDER = ["CB", "DT", "ED", "LB", "IOL", "OT", "SAF", "TE", "WR"];

export default function PositionBoardsView({
  boards,
}: {
  boards: Record<string, PositionBoardPlayer[]>;
}) {
  const [activeBoard, setActiveBoard] = useState(BOARD_ORDER[0]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (slug: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const players = boards[activeBoard] || [];
  
  const toggleExpandAll = () => {
    if (expandedRows.size === players.length) {
      setExpandedRows(new Set());
    } else {
      setExpandedRows(new Set(players.map(p => p.slug)));
    }
  };
  
  const allExpanded = expandedRows.size === players.length && players.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Position Boards</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-400">
          Detailed positional scouting boards with grades, PFF scores, athletic data, and scouting notes.
        </p>
      </div>

      {/* Board selector */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-[#111827] border border-[#2a3a4e] p-1">
          {BOARD_ORDER.filter((pos) => boards[pos]).map((pos) => (
            <button
              key={pos}
              onClick={() => { setActiveBoard(pos); setExpandedRows(new Set()); }}
              className={`rounded-md px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-colors ${
                activeBoard === pos
                  ? "bg-orange-500 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {pos} <span className="text-xs opacity-60">({boards[pos].length})</span>
            </button>
          ))}
        </div>
        
        <button
          onClick={toggleExpandAll}
          className="rounded-lg border border-[#2a3a4e] bg-[#111827] px-4 py-2 text-sm font-medium text-gray-400 hover:text-white hover:border-orange-500/50 transition-colors"
        >
          {allExpanded ? "Collapse All" : "Expand All"}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#2a3a4e] bg-[#111827]">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-[#111827]">
            <tr className="border-b border-[#2a3a4e] text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-2 sm:px-3 py-2 sm:py-3 w-8 sm:w-10"></th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 w-8 sm:w-10">#</th>
              <th className="px-2 sm:px-3 py-2 sm:py-3">Player</th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 hidden sm:table-cell">School</th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 hidden md:table-cell">Ht / Wt</th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 hidden md:table-cell">Age</th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 hidden lg:table-cell">Prj Round</th>
              <th className="px-2 sm:px-3 py-2 sm:py-3 hidden lg:table-cell">Role</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, idx) => {
              const isExpanded = expandedRows.has(p.slug);
              return (
                <PlayerRow
                  key={p.slug + idx}
                  player={p}
                  rank={idx + 1}
                  isExpanded={isExpanded}
                  onToggle={() => toggleRow(p.slug)}
                />
              );
            })}
          </tbody>
        </table>
        {players.length === 0 && (
          <div className="py-12 text-center text-gray-500">No players on this board.</div>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-600">
        {players.length} players on the {activeBoard} board
      </p>
    </div>
  );
}

function PlayerRow({
  player: p,
  rank,
  isExpanded,
  onToggle,
}: {
  player: PositionBoardPlayer;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-[#2a3a4e]/50 board-row">
        <td className="px-2 sm:px-3 py-2 sm:py-3">
          <button
            onClick={onToggle}
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
        <td className="px-2 sm:px-3 py-2 sm:py-3 text-sm font-bold text-gray-500">{p.pos_rank ?? rank}</td>
        <td className="px-2 sm:px-3 py-2 sm:py-3">
          <Link
            href={`/player/${p.slug}`}
            className="text-xs sm:text-sm font-semibold text-white hover:text-orange-400 transition-colors"
          >
            {p.name}
          </Link>
        </td>
        <td className="px-2 sm:px-3 py-2 sm:py-3 text-sm text-gray-400 hidden sm:table-cell">{p.school}</td>
        <td className="px-2 sm:px-3 py-2 sm:py-3 text-xs text-gray-400 hidden md:table-cell">
          {p.height && p.weight ? `${p.height} / ${p.weight}` : p.height || p.weight || "—"}
        </td>
        <td className="px-2 sm:px-3 py-2 sm:py-3 text-xs text-gray-400 hidden md:table-cell">{p.age || "—"}</td>
        <td className="px-2 sm:px-3 py-2 sm:py-3 hidden lg:table-cell">
          {p.projected_round ? (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-900/40 text-blue-200 border border-blue-700/50">
              {p.projected_round}
            </span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="px-2 sm:px-3 py-2 sm:py-3 text-xs text-gray-400 hidden lg:table-cell">{p.projected_role || "—"}</td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-[#2a3a4e]/50">
          <td colSpan={8} className="p-0">
            <ExpandedDetails player={p} />
          </td>
        </tr>
      )}
    </>
  );
}

function StatBlock({
  title,
  data,
  mode,
}: {
  title: string;
  data: Record<string, unknown>;
  mode: "grades" | "pff" | "athletic";
}) {
  const entries = Object.entries(data).filter(([, v]) => v != null && v !== "TBD" && v !== "#N/A");
  if (entries.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-1">
        {entries.map(([label, raw]) => {
          // Handle {value, percentile} objects from PFF scores
          const isObj = typeof raw === "object" && raw !== null && "value" in (raw as Record<string, unknown>);
          const displayVal = isObj ? (raw as { value: string | number }).value : raw;
          const percentile = isObj ? (raw as { percentile?: number }).percentile : undefined;

          let colorClass = PLAIN;

          if (mode === "pff" && percentile != null && !isNaN(percentile)) {
            // PFF scores: use within-board percentile (0–1, 1.0 = best)
            // Neutral stats get no color
            colorClass = getPffColorByPercentile(label, percentile);
          } else if (mode === "grades") {
            // Grades: detect scale from source name
            const num = parseGradeValue(displayVal);
            if (num != null) colorClass = getGradeColor(label, num);
          } else if (mode === "athletic") {
            // Athletic scores: no coloring (all TBD currently)
            colorClass = PLAIN;
          }

          return (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-400">{label}</span>
              <span className={`text-xs tabular-nums ${colorClass}`}>{String(displayVal)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankingsBlock({
  title,
  data,
}: {
  title: string;
  data: Record<string, string | number>;
}) {
  const entries = Object.entries(data).filter(([, v]) => v != null && v !== "TBD" && v !== "#N/A");
  if (entries.length === 0) return null;

  // Show Avg first, then individual sources sorted alphabetically
  const avg = entries.find(([k]) => k === "Avg");
  const rest = entries.filter(([k]) => k !== "Avg").sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="w-full sm:w-28">
      <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2 whitespace-nowrap">{title}</h4>
      <div className="space-y-1">
        {avg && (
          <div className="flex items-center justify-between gap-2 pb-1 mb-1 border-b border-[#2a3a4e]/50">
            <span className="text-xs font-semibold text-orange-400">Avg</span>
            <span className="text-xs font-bold text-orange-400 tabular-nums">{typeof avg[1] === "number" ? avg[1].toFixed(1) : avg[1]}</span>
          </div>
        )}
        {rest.map(([label, value]) => {
          const displayValue = typeof value === "number" ? Math.round(value) : value;
          return (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-400">{label}</span>
              <span className="text-xs font-semibold text-white tabular-nums">{displayValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BulletList({ title, text, variant }: { title: string; text: string; variant?: "strength" | "weakness" }) {
  // Text comes as "• Item 1\n• Item 2\n..."
  const items = text
    .split("\n")
    .map((s) => s.replace(/^[•\-]\s*/, "").trim())
    .filter(Boolean);

  const borderColor = variant === "strength" ? "border-green-500" : variant === "weakness" ? "border-red-500" : "border-orange-500";
  const bgColor = variant === "strength" ? "bg-green-500/5" : variant === "weakness" ? "bg-red-500/5" : "";

  return (
    <div className={`border-l-4 ${borderColor} ${bgColor} pl-3 py-2 -ml-1`}>
      <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">{title}</h4>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-gray-300 flex items-start gap-1.5">
            <span className="text-orange-400 mt-0.5">•</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExpandedDetails({ player: p }: { player: PositionBoardPlayer }) {
  return (
    <div className="bg-[#0d1117] px-3 sm:px-6 py-4 sm:py-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-4">
        {/* Grades */}
        <StatBlock title="Grades" data={p.grades} mode="grades" />

        {/* PFF Scores */}
        <StatBlock title="PFF Scores" data={p.pff_scores} mode="pff" />

        {/* Athletic Scores */}
        <StatBlock title="Athletic Scores" data={p.athletic_scores} mode="athletic" />

        {/* Strengths */}
        {p.strengths && <div className="lg:col-span-2"><BulletList title="Strengths" text={p.strengths} variant="strength" /></div>}

        {/* Weaknesses */}
        {p.weaknesses && <div className="lg:col-span-2"><BulletList title="Weaknesses" text={p.weaknesses} variant="weakness" /></div>}

        {/* Overall Rankings */}
        <RankingsBlock title="Overall Rank" data={p.overall_rankings} />

        {/* Positional Rankings */}
        <RankingsBlock title="POS Rank" data={p.pos_rankings} />
      </div>
    </div>
  );
}
