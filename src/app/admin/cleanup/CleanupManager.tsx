"use client";

import { useState } from "react";
import {
  auditIncompletePlayers,
  removeIncompletePlayer,
  type IncompletPlayer,
} from "./actions";

export function CleanupManager() {
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState<IncompletPlayer[] | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAudit() {
    setLoading(true);
    setError(null);
    setPlayers(null);
    setRemoved(new Set());
    setSkipped(new Set());
    try {
      const result = await auditIncompletePlayers();
      setPlayers(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(p: IncompletPlayer) {
    setActing(p.id);
    try {
      const result = await removeIncompletePlayer(p.id, p.slug);
      if (result.success) {
        setRemoved((prev) => new Set(prev).add(p.id));
      } else {
        setError(result.error ?? "Delete failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setActing(null);
    }
  }

  function handleSkip(id: string) {
    setSkipped((prev) => new Set(prev).add(id));
  }

  const pending = players?.filter(
    (p) => !removed.has(p.id) && !skipped.has(p.id),
  );
  const totalData = (p: IncompletPlayer) =>
    Object.values(p.dataCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Run Audit Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={runAudit}
          disabled={loading}
          className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {loading ? "Scanning…" : "Run Audit"}
        </button>
        {players && (
          <span className="text-sm text-gray-400">
            Found {players.length} incomplete player{players.length !== 1 ? "s" : ""}
            {removed.size > 0 && (
              <span className="text-red-400"> · {removed.size} removed</span>
            )}
            {skipped.size > 0 && (
              <span className="text-gray-500"> · {skipped.size} skipped</span>
            )}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* No results */}
      {players && players.length === 0 && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          ✓ All players have valid position and college data. Nothing to clean up.
        </div>
      )}

      {/* All resolved */}
      {players && players.length > 0 && pending?.length === 0 && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          ✓ All {players.length} players reviewed — {removed.size} removed, {skipped.size} skipped.
        </div>
      )}

      {/* Player Cards */}
      {pending && pending.length > 0 && (
        <div className="space-y-3">
          {pending.map((p) => {
            const dataCount = totalData(p);
            const isActing = acting === p.id;

            return (
              <div
                key={p.id}
                className="rounded-xl border border-[#2a3a4e] bg-[#1a2332] p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">
                        {p.name}
                      </span>
                      {p.hasProfile && (
                        <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                          HAS PROFILE
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex items-center gap-3 text-xs">
                      <span className={p.position && !new Set(["", "TBD", "tbd", "N/A", "—"]).has(p.position.trim()) ? "text-gray-400" : "text-red-400 font-semibold"}>
                        Position: {p.position || "—"}
                      </span>
                      <span className={p.college && !new Set(["", "TBD", "tbd", "N/A", "—"]).has(p.college.trim()) ? "text-gray-400" : "text-red-400 font-semibold"}>
                        School: {p.college || "—"}
                      </span>
                    </div>

                    {/* Data counts */}
                    {dataCount > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(p.dataCounts).map(([table, count]) => (
                          <span
                            key={table}
                            className="inline-block rounded bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-400"
                          >
                            {table}: {count}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[10px] text-gray-600">
                        No related data in any table
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleSkip(p.id)}
                      disabled={isActing}
                      className="rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-50 transition-colors"
                    >
                      Keep
                    </button>
                    <button
                      onClick={() => handleRemove(p)}
                      disabled={isActing}
                      className="rounded-lg bg-red-500/20 border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                    >
                      {isActing ? "Deleting…" : "Remove"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {players === null && !loading && (
        <div className="rounded-lg bg-[#111827] border border-[#2a3a4e] p-4 text-xs text-gray-500 space-y-1">
          <p>
            <strong className="text-gray-400">What this does:</strong> Scans for players with missing or
            &quot;TBD&quot; position or college fields.
          </p>
          <p>
            Each result shows the player&apos;s data footprint across all tables.
            Players with existing data (rankings, mocks, etc.) will have that data deleted too.
          </p>
          <p>
            Use <strong className="text-green-400">Keep</strong> to skip a player or{" "}
            <strong className="text-red-400">Remove</strong> to delete them and all their related data.
          </p>
        </div>
      )}
    </div>
  );
}
