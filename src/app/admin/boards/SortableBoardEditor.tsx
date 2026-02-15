"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { searchPlayers } from "./actions";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BoardEntry {
  id: string;
  rank: number;
  playerName: string;
  position: string | null;
  college: string | null;
  slug: string;
}

interface SearchResult {
  slug: string;
  name: string;
  position: string | null;
  college: string | null;
}

// ─── Sortable Row ───────────────────────────────────────────────────────────

function SortableRow({
  entry,
  index,
  onRemove,
  removing,
}: {
  entry: BoardEntry;
  index: number;
  onRemove: (id: string) => void;
  removing: string | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-[#2a3a4e] ${isDragging ? "bg-[#1f2b3d]" : "board-row"}`}
    >
      {/* Drag handle */}
      <td className="px-2 py-2.5 w-10">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-gray-600 hover:text-gray-400 touch-none"
          title="Drag to reorder"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
      </td>
      <td className="px-3 py-2.5 text-gray-500 text-sm w-12 text-center font-mono">
        {index + 1}
      </td>
      <td className="px-3 py-2.5">
        <a
          href={`/player/${entry.slug}`}
          target="_blank"
          className="font-medium text-white hover:text-orange-400 transition-colors"
        >
          {entry.playerName}
        </a>
      </td>
      <td className="px-3 py-2.5 text-gray-400 text-sm">{entry.position ?? "—"}</td>
      <td className="px-3 py-2.5 text-gray-400 text-sm hidden sm:table-cell">{entry.college ?? "—"}</td>
      <td className="px-3 py-2.5 text-right w-16">
        <button
          onClick={() => onRemove(entry.id)}
          disabled={removing === entry.id}
          className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-30"
          title="Remove from board"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

// ─── Player Search ──────────────────────────────────────────────────────────

function PlayerSearch({
  onAdd,
  adding,
}: {
  onAdd: (slug: string) => void;
  adding: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    const res = await searchPlayers(q);
    setResults(res);
    setOpen(true);
    setSearching(false);
  }, []);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search player to add…"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            className="w-full rounded-lg border border-[#2a3a4e] bg-[#0d1320] pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
              …
            </div>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-[#2a3a4e] bg-[#1a2332] shadow-xl max-h-60 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.slug}
              type="button"
              disabled={adding}
              onClick={() => {
                onAdd(p.slug);
                setQuery("");
                setResults([]);
                setOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#1f2b3d] transition-colors flex items-center justify-between border-b border-[#2a3a4e] last:border-0 disabled:opacity-50"
            >
              <span>
                <span className="text-white font-medium">{p.name}</span>
                {p.position && <span className="text-gray-500 ml-2">{p.position}</span>}
              </span>
              <span className="text-gray-600 text-xs">{p.college}</span>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !searching && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-[#2a3a4e] bg-[#1a2332] shadow-xl px-4 py-3 text-sm text-gray-500">
          No players found
        </div>
      )}
    </div>
  );
}

// ─── Main Board Editor ──────────────────────────────────────────────────────

export function SortableBoardEditor({
  initialEntries,
  boardLabel,
  onReorder,
  onAdd,
  onRemove,
}: {
  initialEntries: BoardEntry[];
  boardLabel: string;
  onReorder: (orderedIds: string[]) => Promise<void>;
  onAdd: (playerSlug: string) => Promise<{ error?: string; success?: boolean }>;
  onRemove: (entryId: string) => Promise<{ error?: string; success?: boolean }>;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = entries.findIndex((e) => e.id === active.id);
    const newIndex = entries.findIndex((e) => e.id === over.id);
    const reordered = arrayMove(entries, oldIndex, newIndex);

    // Optimistic update
    setEntries(reordered);
    setSaving(true);

    try {
      await onReorder(reordered.map((e) => e.id));
    } catch {
      setEntries(entries); // rollback
    }
    setSaving(false);
  }

  async function handleAdd(playerSlug: string) {
    setAdding(true);
    setFeedback(null);
    const result = await onAdd(playerSlug);
    if (result?.error) {
      setFeedback({ type: "error", message: result.error });
    } else {
      setFeedback({ type: "success", message: "Player added" });
      // Refresh the page to get updated data
      window.location.reload();
    }
    setAdding(false);
  }

  async function handleRemove(entryId: string) {
    setRemoving(entryId);
    setFeedback(null);
    // Optimistic remove
    const prev = entries;
    setEntries(entries.filter((e) => e.id !== entryId));

    const result = await onRemove(entryId);
    if (result?.error) {
      setEntries(prev);
      setFeedback({ type: "error", message: result.error });
    }
    setRemoving(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">{boardLabel}</h2>
          <span className="text-xs text-gray-500">{entries.length} players</span>
          {saving && <span className="text-xs text-orange-400 animate-pulse">Saving…</span>}
        </div>
      </div>

      {/* Add player */}
      <div className="mb-4">
        <PlayerSearch onAdd={handleAdd} adding={adding} />
      </div>

      {feedback && (
        <div
          className={`mb-3 rounded-lg px-4 py-2 text-sm ${
            feedback.type === "error"
              ? "bg-red-500/10 border border-red-500/30 text-red-400"
              : "bg-green-500/10 border border-green-500/30 text-green-400"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Board table */}
      <div className="rounded-xl border border-[#2a3a4e] bg-[#1a2332] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a3a4e] text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-2 py-2.5 w-10"></th>
                <th className="px-3 py-2.5 w-12 text-center">#</th>
                <th className="px-3 py-2.5">Player</th>
                <th className="px-3 py-2.5">Pos</th>
                <th className="px-3 py-2.5 hidden sm:table-cell">School</th>
                <th className="px-3 py-2.5 w-16"></th>
              </tr>
            </thead>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={entries.map((e) => e.id)}
                strategy={verticalListSortingStrategy}
              >
                <tbody>
                  {entries.map((entry, i) => (
                    <SortableRow
                      key={entry.id}
                      entry={entry}
                      index={i}
                      onRemove={handleRemove}
                      removing={removing}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </div>

        {entries.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            No players on this board yet. Use the search above to add players.
          </div>
        )}
      </div>
    </div>
  );
}
