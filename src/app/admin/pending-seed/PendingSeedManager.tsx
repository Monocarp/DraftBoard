"use client";

import { useState, useMemo, useTransition } from "react";
import {
  createSeedPlayer,
  mapSeedPlayer,
  dismissSeedPlayer,
  type PendingSeedPlayer,
  type SeedPlayerOption,
} from "./actions";

// ─── Fuzzy helpers (same as PendingPlayersManager) ───────────────────────────

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

function topSuggestions(name: string, players: SeedPlayerOption[], n = 10): SeedPlayerOption[] {
  const key = compact(name);
  return [...players]
    .map((p) => ({ p, dist: levenshtein(key, compact(p.name)) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n)
    .map((x) => x.p);
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function SeedRow({
  entry,
  players,
  onResolved,
}: {
  entry: PendingSeedPlayer;
  players: SeedPlayerOption[];
  onResolved: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overrideName, setOverrideName] = useState(entry.name);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const suggestions = useMemo(
    () => topSuggestions(entry.name, players, 10),
    [entry.name, players]
  );

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createSeedPlayer(entry.id, overrideName !== entry.name ? overrideName : undefined);
      if (res.error) setError(res.error);
      else onResolved(entry.id);
    });
  }

  function handleMap() {
    if (!selectedId) return;
    setError(null);
    startTransition(async () => {
      const res = await mapSeedPlayer(entry.id, selectedId);
      if (res.error) setError(res.error);
      else onResolved(entry.id);
    });
  }

  function handleDismiss() {
    startTransition(async () => {
      await dismissSeedPlayer(entry.id);
      onResolved(entry.id);
    });
  }

  return (
    <div className="border border-[#2a3a4e] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-[#111827]">
        <div className="flex-1 min-w-0">
          <span className="font-medium text-white">{entry.name}</span>
          {entry.position && (
            <span className="ml-2 text-xs text-gray-400">{entry.position}</span>
          )}
          {entry.college && (
            <span className="ml-1 text-xs text-gray-500">· {entry.college}</span>
          )}
          {entry.conflict_reason && (
            <span className="ml-2 inline-flex items-center rounded-full bg-yellow-500/10 border border-yellow-500/30 px-2 py-0.5 text-xs text-yellow-400">
              {entry.conflict_reason}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {expanded ? "▲ collapse" : "▼ resolve"}
          </button>
          <button
            onClick={handleDismiss}
            disabled={isPending}
            className="text-xs text-gray-500 hover:text-red-400 disabled:opacity-40"
          >
            dismiss
          </button>
        </div>
      </div>

      {/* Resolution panel */}
      {expanded && (
        <div className="px-4 py-4 bg-[#0d1320] space-y-4 border-t border-[#2a3a4e]">
          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Option A: Create as new player (with optional name override) */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Create as new 2027 player
            </p>
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                value={overrideName}
                onChange={(e) => setOverrideName(e.target.value)}
                placeholder="Player name (edit to resolve slug conflict)"
                className="flex-1 min-w-0 rounded-lg border border-[#2a3a4e] bg-[#111827] px-3 py-1.5 text-sm text-white focus:border-orange-500 focus:outline-none"
              />
              <button
                onClick={handleCreate}
                disabled={isPending || !overrideName.trim()}
                className="rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {isPending ? "Creating…" : "Create player"}
              </button>
            </div>
            {overrideName !== entry.name && (
              <p className="mt-1 text-xs text-gray-500">
                Will create slug: <span className="text-gray-300 font-mono">{overrideName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}</span>
              </p>
            )}
          </div>

          {/* Option B: Map to existing 2027 player */}
          <div className="pt-2 border-t border-[#2a3a4e]">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Map to existing 2027 player
            </p>
            <div className="flex gap-2 flex-wrap">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                disabled={isPending}
                className="flex-1 min-w-0 rounded-lg border border-[#2a3a4e] bg-[#111827] px-3 py-1.5 text-sm text-white focus:border-orange-500 focus:outline-none disabled:opacity-50"
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
                disabled={isPending || !selectedId}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {isPending ? "Saving…" : "Map → name correction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PendingSeedManager({
  initialPending,
  players,
}: {
  initialPending: PendingSeedPlayer[];
  players: SeedPlayerOption[];
}) {
  const [pending, setPending] = useState(initialPending);

  function handleResolved(id: string) {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  if (pending.length === 0) {
    return (
      <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-12 text-center">
        <p className="text-gray-400">No pending seed players — all entries resolved.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {pending.map((entry) => (
        <SeedRow
          key={entry.id}
          entry={entry}
          players={players}
          onResolved={handleResolved}
        />
      ))}
    </div>
  );
}
