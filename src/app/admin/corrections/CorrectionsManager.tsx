"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import {
  addCorrection,
  deleteCorrection,
  bulkAddCorrections,
  searchPlayersForCorrection,
} from "./actions";
import type { NameCorrection } from "./actions";

// ─── Helpers ────────────────────────────────────────────────────────────────

function toSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CorrectionsManager({
  corrections: initialCorrections,
}: {
  corrections: NameCorrection[];
}) {
  const [corrections, setCorrections] = useState(initialCorrections);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Add form state
  const [variantName, setVariantName] = useState("");
  const [playerQuery, setPlayerQuery] = useState("");
  const [playerResults, setPlayerResults] = useState<{ slug: string; name: string; position: string | null }[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<{ slug: string; name: string } | null>(null);
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  // Import state
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Filter corrections
  const filtered = corrections.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.variant_name.toLowerCase().includes(q) ||
      c.canonical_slug.includes(q) ||
      (c.canonical_name ?? "").toLowerCase().includes(q)
    );
  });

  // ─── Add correction ────────────────────────────────────────────────────

  const handlePlayerSearch = async (query: string) => {
    setPlayerQuery(query);
    setSelectedPlayer(null);
    if (query.length < 2) { setPlayerResults([]); return; }
    const results = await searchPlayersForCorrection(query);
    setPlayerResults(results);
  };

  const handleAdd = async () => {
    if (!variantName.trim()) { setAddError("Enter the variant name."); return; }
    if (!selectedPlayer) { setAddError("Select a target player."); return; }

    setAdding(true);
    setAddError("");

    const res = await addCorrection(variantName.trim(), selectedPlayer.slug);
    if (res.success) {
      setCorrections((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          variant_name: variantName.trim(),
          canonical_slug: selectedPlayer.slug,
          canonical_name: selectedPlayer.name,
          created_at: new Date().toISOString(),
        },
      ]);
      setVariantName("");
      setPlayerQuery("");
      setSelectedPlayer(null);
      setShowAdd(false);
    } else {
      setAddError(res.error ?? "Failed to add correction.");
    }
    setAdding(false);
  };

  // ─── Delete correction ─────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    const res = await deleteCorrection(id);
    if (res.success) {
      setCorrections((prev) => prev.filter((c) => c.id !== id));
      setDeleteId(null);
    }
  };

  // ─── Import from CSV ───────────────────────────────────────────────────

  const handleImportFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as Record<string, string>[];
        if (rows.length === 0) return;

        // Detect columns: look for "Incorrect"/"Correct" or "variant"/"canonical"
        const headers = results.meta.fields || [];
        let variantCol = headers.find((h) =>
          /incorrect|variant|from|wrong|alt/i.test(h)
        );
        let canonicalCol = headers.find((h) =>
          /correct|canonical|to|proper|right/i.test(h)
        );

        // Fallback to first two columns
        if (!variantCol && headers.length >= 2) variantCol = headers[0];
        if (!canonicalCol && headers.length >= 2) canonicalCol = headers[1];

        if (!variantCol || !canonicalCol) {
          setImportResult({ inserted: 0, skipped: 0, errors: ["Could not detect Incorrect/Correct columns."] });
          return;
        }

        // Build corrections: canonical is the player slug
        const corrections = rows
          .filter((r) => r[variantCol!]?.trim() && r[canonicalCol!]?.trim())
          .map((r) => ({
            variant_name: r[variantCol!].trim(),
            canonical_slug: toSlug(r[canonicalCol!].trim()),
          }));

        setImporting(true);
        const res = await bulkAddCorrections(corrections);
        setImportResult(res);
        setImporting(false);

        // Refresh the list
        window.location.reload();
      },
    });
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Stats + actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-400">
          <span className="text-white font-medium">{corrections.length}</span> corrections
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowImport(!showImport); setShowAdd(false); }}
            className="rounded-lg border border-[#2a3a4e] px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors"
          >
            📄 Import CSV
          </button>
          <button
            onClick={() => { setShowAdd(!showAdd); setShowImport(false); }}
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 transition-colors"
          >
            + Add Correction
          </button>
        </div>
      </div>

      {/* Import CSV panel */}
      {showImport && (
        <div className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-5">
          <h3 className="text-sm font-medium text-white mb-2">Import Corrections from CSV</h3>
          <p className="text-xs text-gray-500 mb-3">
            Upload a CSV with <code className="text-gray-400">Incorrect</code> and <code className="text-gray-400">Correct</code> columns.
            The &ldquo;Correct&rdquo; name will be converted to a slug for matching.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="rounded-lg border border-dashed border-[#2a3a4e] px-4 py-2 text-sm text-gray-400 hover:border-orange-500/50 hover:text-orange-400 transition-colors"
          >
            {importing ? "Importing..." : "Choose File"}
          </button>

          {importResult && (
            <div className="mt-3 rounded-lg bg-[#0a0f1a] p-3 text-xs">
              <span className="text-green-400">{importResult.inserted} added</span>
              {importResult.skipped > 0 && (
                <span className="text-gray-500 ml-3">{importResult.skipped} already existed</span>
              )}
              {importResult.errors.length > 0 && (
                <div className="mt-2 text-red-400">
                  {importResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add single correction panel */}
      {showAdd && (
        <div className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-5">
          <h3 className="text-sm font-medium text-white mb-3">Add Name Correction</h3>

          {addError && (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {addError}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Variant Name (the &ldquo;wrong&rdquo; name that appears in uploads)</label>
              <input
                type="text"
                value={variantName}
                onChange={(e) => setVariantName(e.target.value)}
                placeholder='e.g. "Cam Ward" or "JaKobi Lane"'
                className="w-full max-w-md rounded-lg border border-[#2a3a4e] bg-[#1a2535] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>

            <div className="relative">
              <label className="block text-xs text-gray-400 mb-1">Maps to player</label>
              {selectedPlayer ? (
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-400">
                    ✓ {selectedPlayer.name} <span className="text-gray-500">({selectedPlayer.slug})</span>
                  </span>
                  <button
                    onClick={() => { setSelectedPlayer(null); setPlayerQuery(""); }}
                    className="text-gray-500 hover:text-red-400 text-sm"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={playerQuery}
                    onChange={(e) => handlePlayerSearch(e.target.value)}
                    placeholder="Search for the correct player..."
                    className="w-full max-w-md rounded-lg border border-[#2a3a4e] bg-[#1a2535] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none"
                  />
                  {playerResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full max-w-md rounded-lg border border-[#2a3a4e] bg-[#0d1320] shadow-xl max-h-48 overflow-y-auto">
                      {playerResults.map((p) => (
                        <button
                          key={p.slug}
                          onClick={() => {
                            setSelectedPlayer({ slug: p.slug, name: p.name });
                            setPlayerResults([]);
                            setPlayerQuery(p.name);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#1a2535] transition-colors flex items-center justify-between"
                        >
                          <span>{p.name}</span>
                          <span className="text-xs text-gray-600">{p.position}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <button
              onClick={handleAdd}
              disabled={adding}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {adding ? "Adding..." : "Add Correction"}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search corrections..."
          className="w-full max-w-sm rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none"
        />
      </div>

      {/* Corrections list */}
      <div className="rounded-xl border border-[#2a3a4e] overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-[#0d1320] border-b border-[#2a3a4e]">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Variant Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">→</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Canonical Player</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Slug</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-600">
                  {search ? "No corrections match your search." : "No corrections yet. Add one or import from CSV."}
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="border-b border-[#2a3a4e]/50 hover:bg-[#0d1320]/50">
                  <td className="px-4 py-2.5 text-gray-300 font-mono text-xs">{c.variant_name}</td>
                  <td className="px-4 py-2.5 text-gray-600">→</td>
                  <td className="px-4 py-2.5 text-white">{c.canonical_name ?? c.canonical_slug}</td>
                  <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{c.canonical_slug}</td>
                  <td className="px-4 py-2.5 text-right">
                    {deleteId === c.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="text-xs text-red-400 hover:text-red-300 font-medium"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeleteId(null)}
                          className="text-xs text-gray-500 hover:text-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteId(c.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Info box */}
      <div className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-5">
        <h3 className="text-sm font-medium text-white mb-2">How Name Normalization Works</h3>
        <div className="text-xs text-gray-500 space-y-1.5">
          <p>During upload, player names are automatically normalized before matching:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li><strong className="text-gray-400">Periods removed</strong> — &ldquo;Jr.&rdquo; → &ldquo;Jr&rdquo;, &ldquo;T.J.&rdquo; → &ldquo;TJ&rdquo;, &ldquo;K.C.&rdquo; → &ldquo;KC&rdquo;</li>
            <li><strong className="text-gray-400">Corrections table</strong> — Exact variant → canonical player match</li>
            <li><strong className="text-gray-400">Exact slug match</strong> — Name converted to slug, matched against DB</li>
            <li><strong className="text-gray-400">Compact matching</strong> — Strips apostrophes/hyphens for comparison, so &ldquo;JaKobi&rdquo; matches &ldquo;Ja&apos;Kobi&rdquo;</li>
            <li><strong className="text-gray-400">Auto-create</strong> — If still no match, a new player record is created</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
