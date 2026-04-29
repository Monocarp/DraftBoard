"use client";

import { useState, useMemo, useTransition } from "react";
import {
  mapPendingPlayer,
  createPlayerFromPending,
  skipPendingPlayer,
  skipAllFromSource,
  type PendingPlayer,
  type PlayerOption,
} from "./actions";

// ─── Levenshtein distance for fuzzy matching ────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function compact(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function topSuggestions(variant: string, players: PlayerOption[], n = 10): PlayerOption[] {
  const key = compact(variant);
  return [...players]
    .map((p) => ({ p, dist: levenshtein(key, compact(p.name)) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n)
    .map((x) => x.p);
}

// ─── Row component ──────────────────────────────────────────────────────────

function PendingRow({
  entry,
  players,
  onResolved,
}: {
  entry: PendingPlayer;
  players: PlayerOption[];
  onResolved: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const suggestions = useMemo(() => topSuggestions(entry.variant_name, players, 10), [entry.variant_name, players]);

  async function handleMap() {
    if (!selectedId) return;
    setError(null);
    startTransition(async () => {
      const res = await mapPendingPlayer(entry.id, selectedId);
      if (res.error) setError(res.error);
      else onResolved(entry.id);
    });
  }

  async function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createPlayerFromPending(entry.id);
      if (res.error) setError(res.error);
      else onResolved(entry.id);
    });
  }

  async function handleSkip() {
    startTransition(async () => {
      await skipPendingPlayer(entry.id);
      onResolved(entry.id);
    });
  }

  return (
    <div className="border border-[#2a3a4e] rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-[#111827]">
        <div className="flex-1 min-w-0">
          <span className="font-medium text-white">{entry.variant_name}</span>
          {entry.position && <span className="ml-2 text-xs text-gray-400">{entry.position}</span>}
          {entry.college && <span className="ml-1 text-xs text-gray-500">· {entry.college}</span>}
          {entry.source && (
            <span className="ml-2 inline-flex items-center rounded-full bg-[#1a2332] border border-[#2a3a4e] px-2 py-0.5 text-xs text-gray-500">
              {entry.source}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {expanded ? "▲ collapse" : "▼ resolve"}
          </button>
          <button
            onClick={handleSkip}
            disabled={isPending}
            className="text-xs text-gray-500 hover:text-red-400 disabled:opacity-40"
          >
            skip
          </button>
        </div>
      </div>

      {/* Expanded resolution panel */}
      {expanded && (
        <div className="px-4 py-4 bg-[#0d1320] space-y-4 border-t border-[#2a3a4e]">
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {/* Map to existing */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Map to existing player</p>
            <div className="flex gap-2 flex-wrap">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="flex-1 min-w-0 rounded-lg border border-[#2a3a4e] bg-[#111827] px-3 py-1.5 text-sm text-white focus:border-orange-500 focus:outline-none"
              >
                <option value="">— Top 10 closest matches —</option>
                {suggestions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.position ? ` · ${p.position}` : ""}{p.college ? ` · ${p.college}` : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={handleMap}
                disabled={!selectedId || isPending}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {isPending ? "Saving…" : "Map → name_corrections"}
              </button>
            </div>
          </div>

          {/* Create new */}
          <div className="flex items-center justify-between pt-2 border-t border-[#2a3a4e]">
            <p className="text-xs text-gray-500">
              Not in the DB? Create a new player row for <span className="text-white">{entry.variant_name}</span>.
            </p>
            <button
              onClick={handleCreate}
              disabled={isPending}
              className="rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-40 transition-colors whitespace-nowrap ml-4"
            >
              {isPending ? "Creating…" : "Create new player"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PendingPlayersManager({
  initialPending,
  players,
}: {
  initialPending: PendingPlayer[];
  players: PlayerOption[];
}) {
  const [pending, setPending] = useState<PendingPlayer[]>(initialPending);
  const [isPending, startTransition] = useTransition();

  const sources = useMemo(
    () => [...new Set(pending.map((p) => p.source).filter(Boolean) as string[])],
    [pending]
  );

  function handleResolved(id: string) {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  function handleSkipSource(source: string) {
    startTransition(async () => {
      await skipAllFromSource(source);
      setPending((prev) => prev.filter((p) => p.source !== source));
    });
  }

  if (pending.length === 0) {
    return (
      <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-12 text-center">
        <p className="text-gray-400">No pending players — all uploads resolved cleanly.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk actions */}
      {sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Skip all from source:</span>
          {sources.map((s) => (
            <button
              key={s}
              onClick={() => handleSkipSource(s)}
              disabled={isPending}
              className="text-xs rounded-full border border-[#2a3a4e] px-3 py-1 text-gray-400 hover:text-red-400 hover:border-red-500/30 disabled:opacity-40 transition-colors"
            >
              {s} ({pending.filter((p) => p.source === s).length})
            </button>
          ))}
        </div>
      )}

      {/* Rows */}
      <div className="space-y-2">
        {pending.map((entry) => (
          <PendingRow
            key={entry.id}
            entry={entry}
            players={players}
            onResolved={handleResolved}
          />
        ))}
      </div>
    </div>
  );
}
