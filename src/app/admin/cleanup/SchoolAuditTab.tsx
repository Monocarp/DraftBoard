"use client";

import { useState } from "react";
import { CANONICAL_COLLEGES } from "@/lib/normalize-college";
import {
  auditSchoolNames,
  applySchoolCorrection,
  dismissSchoolVariant,
  type SchoolVariant,
} from "./actions";

export function SchoolAuditTab() {
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<SchoolVariant[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [corrected, setCorrected] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function runAudit() {
    setLoading(true);
    setError(null);
    setVariants(null);
    setDismissed(new Set());
    setCorrected(new Set());
    setSelections({});
    setCustomInputs({});
    try {
      const result = await auditSchoolNames();
      setVariants(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(raw: string) {
    const canonical = selections[raw] === "__custom__"
      ? (customInputs[raw] ?? "").trim()
      : (selections[raw] ?? "").trim();
    if (!canonical) return;
    setActing(raw);
    setError(null);
    try {
      const result = await applySchoolCorrection(raw, canonical);
      if (result.error) {
        setError(result.error);
      } else {
        setCorrected((prev) => new Set(prev).add(raw));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setActing(null);
    }
  }

  async function handleDismiss(raw: string) {
    setActing(raw);
    setError(null);
    try {
      const result = await dismissSchoolVariant(raw);
      if (result.error) {
        setError(result.error);
      } else {
        setDismissed((prev) => new Set(prev).add(raw));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dismiss failed");
    } finally {
      setActing(null);
    }
  }

  const pending = variants?.filter((v) => !dismissed.has(v.raw) && !corrected.has(v.raw));

  return (
    <div className="space-y-6">
      {/* Run Audit */}
      <div className="flex items-center gap-4">
        <button
          onClick={runAudit}
          disabled={loading}
          className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {loading ? "Scanning…" : "Run Audit"}
        </button>
        {variants && (
          <span className="text-sm text-gray-400">
            Found {variants.length} unrecognized school value{variants.length !== 1 ? "s" : ""}
            {corrected.size > 0 && (
              <span className="text-green-400"> · {corrected.size} corrected</span>
            )}
            {dismissed.size > 0 && (
              <span className="text-gray-500"> · {dismissed.size} dismissed</span>
            )}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {variants && variants.length === 0 && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          ✓ All player school names are canonical or already have corrections.
        </div>
      )}

      {variants && variants.length > 0 && pending?.length === 0 && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          ✓ All {variants.length} variants reviewed — {corrected.size} corrected, {dismissed.size} dismissed.
        </div>
      )}

      {pending && pending.length > 0 && (
        <div className="space-y-3">
          {pending.map((v) => {
            const isActing = acting === v.raw;
            const sel = selections[v.raw] ?? "";
            const isCustom = sel === "__custom__";
            const customVal = customInputs[v.raw] ?? "";
            const canApply = sel && (sel !== "__custom__" || customVal.trim().length > 0);

            return (
              <div
                key={v.raw}
                className="rounded-xl border border-[#2a3a4e] bg-[#1a2332] p-4"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    {/* Raw value + affected players */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-red-300">
                        &quot;{v.raw}&quot;
                      </span>
                      <span className="rounded bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-400">
                        {v.playerIds.length} player{v.playerIds.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {v.playerNames.slice(0, 5).join(", ")}
                      {v.playerNames.length > 5 && ` + ${v.playerNames.length - 5} more`}
                    </p>

                    {/* Canonical picker */}
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <select
                        value={sel}
                        onChange={(e) => setSelections((prev) => ({ ...prev, [v.raw]: e.target.value }))}
                        disabled={isActing}
                        className="rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-2 py-1.5 text-xs text-white focus:border-orange-500 focus:outline-none disabled:opacity-50"
                      >
                        <option value="">— map to canonical —</option>
                        {CANONICAL_COLLEGES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        <option value="__custom__">Other (type below)…</option>
                      </select>

                      {isCustom && (
                        <input
                          type="text"
                          value={customVal}
                          onChange={(e) => setCustomInputs((prev) => ({ ...prev, [v.raw]: e.target.value }))}
                          placeholder="Type canonical name…"
                          disabled={isActing}
                          className="rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none disabled:opacity-50 w-48"
                        />
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 mt-1">
                    <button
                      onClick={() => handleApply(v.raw)}
                      disabled={isActing || !canApply}
                      className="rounded-lg bg-green-500/20 border border-green-500/30 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/30 disabled:opacity-40 transition-colors"
                    >
                      {isActing ? "Saving…" : "Apply"}
                    </button>
                    <button
                      onClick={() => handleDismiss(v.raw)}
                      disabled={isActing}
                      className="rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-50 transition-colors"
                    >
                      Keep as-is
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {variants === null && !loading && (
        <div className="rounded-lg bg-[#111827] border border-[#2a3a4e] p-4 text-xs text-gray-500 space-y-1">
          <p>
            <strong className="text-gray-400">What this does:</strong> Scans all player school values and
            finds any that aren&apos;t in the canonical list and don&apos;t already have a correction.
          </p>
          <p>
            For each variant, pick the correct canonical school from the dropdown and click{" "}
            <strong className="text-green-400">Apply</strong> — this writes a correction and back-fills all
            matching players immediately.
          </p>
          <p>
            Click <strong className="text-gray-300">Keep as-is</strong> to dismiss a value you want to leave
            unchanged (it won&apos;t show up again on the next scan).
          </p>
        </div>
      )}
    </div>
  );
}
