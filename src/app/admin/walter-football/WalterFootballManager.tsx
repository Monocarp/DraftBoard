"use client";

import { useState } from "react";
import { fetchWFPlayerList, importWFProfiles, type WFPlayerEntry, type WFImportResult } from "./actions";

export function WalterFootballManager() {
  const [cutoff, setCutoff] = useState("2025-10-01");
  const [fetching, setFetching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [players, setPlayers] = useState<WFPlayerEntry[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchDebug, setFetchDebug] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<WFImportResult | null>(null);

  async function handleFetch() {
    setFetching(true);
    setFetchError(null);
    setFetchDebug(null);
    setPlayers(null);
    setImportResult(null);
    try {
      const res = await fetchWFPlayerList(cutoff);
      if (res.debug) setFetchDebug(res.debug);
      if (res.error) {
        setFetchError(res.error);
      } else {
        setPlayers(res.players);
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setFetching(false);
    }
  }

  async function handleImport() {
    if (!players || players.length === 0) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await importWFProfiles(players);
      setImportResult(res);
    } catch (e) {
      setImportResult({
        success: false,
        imported: 0,
        skipped: 0,
        unmatched: [],
        errors: [e instanceof Error ? e.message : "Import failed"],
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">

      {/* Controls */}
      <div className="rounded-xl border border-[#2a3a4e] bg-[#1a2332] p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Cutoff date — only profiles updated on or after this date
            </label>
            <input
              type="date"
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
              className="rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
            />
          </div>

          <button
            onClick={handleFetch}
            disabled={fetching || importing}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {fetching ? "Fetching list…" : "1. Fetch Player List"}
          </button>

          {players && players.length > 0 && (
            <button
              onClick={handleImport}
              disabled={importing || fetching}
              className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {importing
                ? `Importing… (${players.length} profiles)`
                : `2. Import ${players.length} Profiles`}
            </button>
          )}
        </div>

        <p className="text-xs text-gray-500">
          Step 1 fetches the Walter Football scouting report index and filters by date.
          Step 2 visits each player URL, scrapes their profile, and saves it to Supabase.
        </p>
      </div>

      {/* Fetch error */}
      {fetchError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {fetchError}
        </div>
      )}

      {/* Debug info */}
      {fetchDebug && (
        <div className="rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-4 py-3 text-xs text-gray-500 font-mono">
          {fetchDebug}
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className={`rounded-xl border p-5 space-y-3 ${
          importResult.errors.length === 0
            ? "border-green-500/30 bg-green-500/10"
            : "border-yellow-500/30 bg-yellow-500/10"
        }`}>
          <p className="text-sm font-semibold text-white">Import complete</p>
          <div className="flex gap-6 text-sm">
            <span className="text-green-400">✓ {importResult.imported} imported</span>
            <span className="text-gray-400">{importResult.skipped} skipped</span>
            {importResult.unmatched.length > 0 && (
              <span className="text-yellow-400">{importResult.unmatched.length} unmatched</span>
            )}
            {importResult.errors.length > 0 && (
              <span className="text-red-400">{importResult.errors.length} errors</span>
            )}
          </div>
          {importResult.unmatched.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-yellow-400 hover:text-yellow-300">
                Unmatched players (not found in DB)
              </summary>
              <ul className="mt-2 space-y-0.5 text-gray-400 max-h-40 overflow-y-auto">
                {importResult.unmatched.map((n) => <li key={n}>· {n}</li>)}
              </ul>
            </details>
          )}
          {importResult.errors.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-red-400 hover:text-red-300">
                Errors
              </summary>
              <ul className="mt-2 space-y-0.5 text-gray-400 max-h-40 overflow-y-auto">
                {importResult.errors.map((e, i) => <li key={i}>· {e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Player list preview */}
      {players && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            {players.length === 0
              ? "No profiles found after the cutoff date."
              : `${players.length} profiles found — updated on or after ${cutoff}`}
          </p>

          {players.length > 0 && (
            <div className="rounded-xl border border-[#2a3a4e] overflow-hidden">
              <div className="grid grid-cols-[1fr_auto] gap-0 text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-2 bg-[#0d1320] border-b border-[#2a3a4e]">
                <span>Player</span>
                <span>Last Updated</span>
              </div>
              <div className="divide-y divide-[#2a3a4e] max-h-96 overflow-y-auto">
                {players.map((p) => (
                  <div key={p.url} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2.5 items-center hover:bg-white/5">
                    <div className="flex items-center gap-2 min-w-0">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-white hover:text-orange-400 truncate"
                      >
                        {p.name}
                      </a>
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{p.last_updated}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
