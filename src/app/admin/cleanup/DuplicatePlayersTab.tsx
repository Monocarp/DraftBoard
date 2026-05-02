"use client";

import { useState } from "react";
import {
  auditDuplicatePlayers,
  mergeDuplicatePlayers,
  type DuplicatePair,
  type DuplicatePlayer,
} from "./actions";

function dataTotal(counts: Record<string, number>) {
  return Object.values(counts).reduce((s, n) => s + n, 0);
}

function PlayerCard({
  player,
  isKeep,
  onMerge,
  acting,
}: {
  player: DuplicatePlayer;
  isKeep: boolean;
  onMerge: () => void;
  acting: boolean;
}) {
  const total = dataTotal(player.dataCounts);
  const tables = Object.entries(player.dataCounts);

  return (
    <div
      className={`flex-1 rounded-lg border p-4 ${
        isKeep ? "border-green-600 bg-green-950/20" : "border-[#2a3a4e] bg-[#0f1825]"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-semibold text-white">{player.name}</p>
          <p className="text-xs text-gray-400 font-mono">{player.slug}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {player.hasProfile && (
            <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded">
              Has Profile
            </span>
          )}
          <span className="text-xs text-gray-500">{player.draftYear}</span>
        </div>
      </div>

      <div className="text-xs text-gray-400 mb-3 space-y-0.5">
        <p>
          <span className="text-gray-500">Pos:</span> {player.position ?? <span className="text-red-400">—</span>}
          <span className="ml-3 text-gray-500">College:</span> {player.college ?? <span className="text-red-400">—</span>}
        </p>
        {tables.length > 0 ? (
          <p>
            <span className="text-gray-500">Data:</span>{" "}
            {tables.map(([t, c]) => `${t.replace(/_/g, " ")} (${c})`).join(", ")}
            <span className="ml-1 text-white font-medium">— {total} rows</span>
          </p>
        ) : (
          <p className="text-gray-600">No related data</p>
        )}
      </div>

      <button
        onClick={onMerge}
        disabled={acting}
        className="w-full py-1.5 text-xs font-medium rounded border border-green-600 text-green-400 hover:bg-green-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {acting ? "Merging…" : "Keep this one →"}
      </button>
    </div>
  );
}

export function DuplicatePlayersTab() {
  const [loading, setLoading] = useState(false);
  const [pairs, setPairs] = useState<DuplicatePair[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [merged, setMerged] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAudit() {
    setLoading(true);
    setError(null);
    setPairs(null);
    setDismissed(new Set());
    setMerged(new Set());
    try {
      const result = await auditDuplicatePlayers();
      setPairs(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleMerge(
    pair: DuplicatePair,
    keep: DuplicatePlayer,
    del: DuplicatePlayer,
  ) {
    setActing(pair.pairKey);
    setError(null);
    try {
      const result = await mergeDuplicatePlayers(keep.id, keep.slug, del.id, del.slug);
      if (result.error) {
        setError(result.error);
      } else {
        setMerged((prev) => new Set(prev).add(pair.pairKey));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setActing(null);
    }
  }

  const visiblePairs = pairs?.filter(
    (p) => !dismissed.has(p.pairKey) && !merged.has(p.pairKey),
  ) ?? [];

  const resolvedCount = (dismissed.size + merged.size);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Duplicate Players</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Finds players whose names match when stripped of punctuation and spacing.
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Scanning…" : pairs === null ? "Run Audit" : "Re-run Audit"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {pairs !== null && (
        <div className="mb-4 flex items-center gap-4 text-sm text-gray-400">
          <span>
            <span className="text-white font-medium">{pairs.length}</span> potential duplicate pair{pairs.length !== 1 ? "s" : ""} found
          </span>
          {resolvedCount > 0 && (
            <span>
              <span className="text-green-400 font-medium">{merged.size}</span> merged,{" "}
              <span className="text-gray-300 font-medium">{dismissed.size}</span> dismissed
            </span>
          )}
        </div>
      )}

      {visiblePairs.length === 0 && pairs !== null && (
        <div className="text-center py-12 text-gray-500">
          {pairs.length === 0
            ? "✓ No duplicate players found."
            : "All duplicates resolved."}
        </div>
      )}

      <div className="space-y-4">
        {visiblePairs.map((pair) => (
          <div
            key={pair.pairKey}
            className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded">
                {pair.reason}
              </span>
              <button
                onClick={() => setDismissed((prev) => new Set(prev).add(pair.pairKey))}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Dismiss
              </button>
            </div>

            <div className="flex gap-3 flex-col sm:flex-row">
              <PlayerCard
                player={pair.playerA}
                isKeep={false}
                onMerge={() => handleMerge(pair, pair.playerA, pair.playerB)}
                acting={acting === pair.pairKey}
              />
              <div className="flex items-center justify-center text-gray-600 font-bold text-lg sm:flex-col">
                ↔
              </div>
              <PlayerCard
                player={pair.playerB}
                isKeep={false}
                onMerge={() => handleMerge(pair, pair.playerB, pair.playerA)}
                acting={acting === pair.pairKey}
              />
            </div>

            {merged.has(pair.pairKey) && (
              <p className="mt-2 text-xs text-green-400">✓ Merged successfully</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
