"use client";

import { useState } from "react";
import {
  auditPositions,
  fixPosition,
  fixAllPositions,
} from "./actions";
import type { PositionAuditResult, PositionMismatch } from "./actions";

export function PositionAudit() {
  const [auditing, setAuditing] = useState(false);
  const [result, setResult] = useState<PositionAuditResult | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixingAll, setFixingAll] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Editable overrides per raw position (in case user wants to change the target)
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const handleAudit = async () => {
    setAuditing(true);
    setResult(null);
    setFeedback(null);
    setOverrides({});
    try {
      const r = await auditPositions();
      setResult(r);
    } catch (err) {
      setFeedback({ type: "error", msg: String(err) });
    }
    setAuditing(false);
  };

  const handleFixOne = async (m: PositionMismatch) => {
    const target = overrides[m.raw] || m.canonical;
    if (target.startsWith("⚠")) {
      setFeedback({ type: "error", msg: `Cannot auto-fix "${m.raw}" — no known canonical position. Set one manually.` });
      return;
    }
    setFixing(m.raw);
    setFeedback(null);
    try {
      const res = await fixPosition(m.raw, target);
      if (res.success) {
        setFeedback({ type: "success", msg: `Fixed "${m.raw}" → "${target}" (${res.updated} players)` });
        // Remove from results
        setResult((prev) =>
          prev
            ? {
                ...prev,
                mismatches: prev.mismatches.filter((x) => x.raw !== m.raw),
                nonCanonicalCount: prev.nonCanonicalCount - m.count,
              }
            : null,
        );
      } else {
        setFeedback({ type: "error", msg: res.error || "Failed" });
      }
    } catch (err) {
      setFeedback({ type: "error", msg: String(err) });
    }
    setFixing(null);
  };

  const handleFixAll = async () => {
    setFixingAll(true);
    setFeedback(null);
    try {
      const res = await fixAllPositions();
      setFeedback({
        type: res.errors.length > 0 ? "error" : "success",
        msg: `Fixed ${res.fixed} position label${res.fixed !== 1 ? "s" : ""}, updated ${res.totalUpdated} player${res.totalUpdated !== 1 ? "s" : ""}` +
          (res.errors.length > 0 ? `. Errors: ${res.errors.join("; ")}` : ""),
      });
      // Re-audit to refresh
      const r = await auditPositions();
      setResult(r);
    } catch (err) {
      setFeedback({ type: "error", msg: String(err) });
    }
    setFixingAll(false);
  };

  return (
    <div className="space-y-6">
      {/* Header + Audit button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-400">
            Scan all players for non-canonical position labels and fix them.
          </p>
        </div>
        <button
          onClick={handleAudit}
          disabled={auditing}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {auditing ? "Scanning..." : "Run Audit"}
        </button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-gray-400">Total players:</span>{" "}
                <span className="text-white font-medium">{result.totalPlayers}</span>
              </div>
              <div>
                <span className="text-gray-400">Non-canonical:</span>{" "}
                <span className={`font-medium ${result.nonCanonicalCount > 0 ? "text-yellow-400" : "text-green-400"}`}>
                  {result.nonCanonicalCount}
                </span>
              </div>
              <div>
                <span className="text-gray-400">No position:</span>{" "}
                <span className="text-gray-500">{result.nullCount}</span>
              </div>
            </div>
          </div>

          {result.mismatches.length === 0 ? (
            <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-400">
              ✓ All player positions use canonical labels.
            </div>
          ) : (
            <>
              {/* Fix All button */}
              <div className="flex justify-end">
                <button
                  onClick={handleFixAll}
                  disabled={fixingAll || !!fixing}
                  className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {fixingAll ? "Fixing All..." : `Fix All (${result.mismatches.length} labels)`}
                </button>
              </div>

              {/* Mismatch table */}
              <div className="rounded-xl border border-[#2a3a4e] overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-[#0d1320] border-b border-[#2a3a4e]">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Current</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">→</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Canonical</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Players</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Examples</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.mismatches.map((m) => (
                      <tr key={m.raw} className="border-b border-[#2a3a4e]/50 hover:bg-[#0d1320]/50">
                        <td className="px-4 py-2.5">
                          <span className="rounded bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-xs text-red-400 font-mono">
                            {m.raw}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">→</td>
                        <td className="px-4 py-2.5">
                          {m.canonical.startsWith("⚠") ? (
                            <input
                              type="text"
                              value={overrides[m.raw] || ""}
                              onChange={(e) =>
                                setOverrides((prev) => ({ ...prev, [m.raw]: e.target.value.toUpperCase() }))
                              }
                              placeholder="Enter position..."
                              className="w-20 rounded border border-yellow-500/30 bg-[#1a2535] px-2 py-0.5 text-xs text-yellow-400 placeholder-gray-600 focus:border-orange-500 focus:outline-none"
                            />
                          ) : (
                            <span className="rounded bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-xs text-green-400 font-mono">
                              {overrides[m.raw] || m.canonical}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-white font-medium">
                          {m.count}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs truncate">
                          {m.examples.join(", ")}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => handleFixOne(m)}
                            disabled={fixing === m.raw || fixingAll}
                            className="rounded-lg border border-[#2a3a4e] px-3 py-1 text-xs text-gray-300 hover:text-white hover:border-white/20 disabled:opacity-50 transition-colors"
                          >
                            {fixing === m.raw ? "Fixing..." : "Fix"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Info box */}
      <div className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-5">
        <h3 className="text-sm font-medium text-white mb-2">Canonical Positions</h3>
        <div className="flex flex-wrap gap-2">
          {["QB", "RB", "WR", "TE", "OT", "OG", "C", "ED", "DT", "LB", "CB", "SAF", "K", "P"].map(
            (pos) => (
              <span
                key={pos}
                className="rounded bg-[#1a2535] border border-[#2a3a4e] px-2 py-0.5 text-xs text-gray-300 font-mono"
              >
                {pos}
              </span>
            ),
          )}
        </div>
        <div className="mt-3 text-xs text-gray-500 space-y-1">
          <p><strong className="text-gray-400">Auto-mapped aliases:</strong></p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 ml-2">
            <span>EDGE, DE, DE/ED, DL/ED, LB/ED → ED</span>
            <span>IDL, DI, DL, NT → DT</span>
            <span>HB, FB → RB</span>
            <span>T → OT</span>
            <span>G, IOL → OG</span>
            <span>ILB, MLB → LB</span>
            <span>S, FS, SS → SAF</span>
            <span>OC → C</span>
          </div>
        </div>
      </div>
    </div>
  );
}
