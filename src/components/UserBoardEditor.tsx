"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import Link from "next/link";
import PositionBadge from "./PositionBadge";
import type { BoardPlayer } from "@/lib/types";
import {
  addToUserBoard,
  removeFromUserBoard,
  reorderUserBoard,
  searchPlayersForBoard,
} from "@/app/user-board/actions";

type SearchResult = { slug: string; name: string; position: string | null; college: string | null };

export default function UserBoardEditor({ initialPlayers }: { initialPlayers: BoardPlayer[] }) {
  const [players, setPlayers] = useState(initialPlayers);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (value.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      const results = await searchPlayersForBoard(value);
      // Filter out players already on the board
      const slugsOnBoard = new Set(players.map((p) => p.slug));
      setSearchResults(results.filter((r) => !slugsOnBoard.has(r.slug)));
      setSearching(false);
    }, 300);
  }, [players]);

  const handleAdd = (result: SearchResult) => {
    // Optimistically add to local state
    const newPlayer: BoardPlayer = {
      rank: players.length + 1,
      player: result.name,
      position: result.position ?? "",
      school: result.college ?? "",
      slug: result.slug,
    };
    setPlayers((prev) => [...prev, newPlayer]);
    setSearch("");
    setSearchResults([]);
    setShowSearch(false);

    startTransition(async () => {
      const res = await addToUserBoard(result.slug);
      if (res.error) {
        // Revert on error
        setPlayers((prev) => prev.filter((p) => p.slug !== result.slug));
      }
    });
  };

  const handleRemove = (slug: string) => {
    const removed = players.find((p) => p.slug === slug);
    setPlayers((prev) => {
      const next = prev.filter((p) => p.slug !== slug);
      return next.map((p, i) => ({ ...p, rank: i + 1 }));
    });

    startTransition(async () => {
      const res = await removeFromUserBoard(slug);
      if (res.error && removed) {
        // Revert on error
        setPlayers((prev) => [...prev, removed].sort((a, b) => a.rank - b.rank));
      }
    });
  };

  // ─── Drag & Drop ──────────────────────────────────────────────────────────

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = (dropIdx: number) => {
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }

    setPlayers((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dropIdx, 0, moved);
      return next.map((p, i) => ({ ...p, rank: i + 1 }));
    });

    const reordered = (() => {
      const next = [...players];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dropIdx, 0, moved);
      return next;
    })();

    startTransition(async () => {
      await reorderUserBoard(reordered.map((p) => p.slug));
    });

    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        {/* Add player search */}
        <div className="relative flex-1">
          {showSearch ? (
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search players to add..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-blue-500/50 bg-[#111827] py-2 pl-10 pr-10 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => { setShowSearch(false); setSearch(""); setSearchResults([]); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Search results dropdown */}
              {(searchResults.length > 0 || searching) && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-[#2a3a4e] bg-[#1a2332] shadow-xl z-50">
                  {searching ? (
                    <div className="px-4 py-3 text-sm text-gray-500">Searching...</div>
                  ) : (
                    searchResults.map((r) => (
                      <button
                        key={r.slug}
                        onClick={() => handleAdd(r)}
                        className="w-full px-4 py-2.5 text-left hover:bg-blue-500/10 transition-colors flex items-center gap-3 border-b border-[#2a3a4e]/50 last:border-0"
                      >
                        <PositionBadge position={r.position} />
                        <span className="text-sm font-medium text-white">{r.name}</span>
                        <span className="text-xs text-gray-500 ml-auto">{r.college}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="w-full sm:w-auto rounded-lg border border-dashed border-blue-500/40 bg-[#111827] px-4 py-2 text-sm text-blue-400 hover:border-blue-500 hover:text-blue-300 transition-colors flex items-center gap-2"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Player
            </button>
          )}
        </div>

        <p className="text-xs text-gray-500 self-center">
          {players.length} player{players.length !== 1 ? "s" : ""} · Drag to reorder
        </p>
      </div>

      {/* Board table */}
      <div className="overflow-x-auto rounded-xl border border-[#2a3a4e] bg-[#111827]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#2a3a4e] text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-2 sm:px-3 py-2 sm:py-3 w-8"></th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 w-10 sm:w-16">#</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3">Player</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 w-16 sm:w-20">Pos</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 hidden sm:table-cell">School</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a3a4e]/50">
            {players.map((p, idx) => (
              <tr
                key={p.slug}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                className={`transition-colors cursor-grab active:cursor-grabbing ${
                  dragIdx === idx
                    ? "opacity-40"
                    : dragOverIdx === idx
                      ? "bg-blue-500/10 border-t-2 border-blue-500"
                      : "hover:bg-[#1a2332]"
                }`}
              >
                <td className="px-2 sm:px-3 py-2 sm:py-3">
                  <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3">
                  <span className="text-sm font-bold text-gray-500">{idx + 1}</span>
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3">
                  <Link
                    href={`/player/${p.slug}`}
                    className="text-sm font-semibold text-white hover:text-blue-400 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {p.player}
                  </Link>
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3">
                  <PositionBadge position={p.position} />
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-gray-400 hidden sm:table-cell">
                  {p.school}
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3">
                  <button
                    onClick={() => handleRemove(p.slug)}
                    className="text-gray-600 hover:text-red-400 transition-colors"
                    title="Remove from board"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {players.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-gray-500 mb-2">Your board is empty</p>
            <p className="text-sm text-gray-600">
              Click &ldquo;Add Player&rdquo; above to start building your personal big board.
            </p>
          </div>
        )}
      </div>

      {isPending && (
        <div className="mt-2 text-xs text-blue-400 animate-pulse">Saving...</div>
      )}
    </div>
  );
}
