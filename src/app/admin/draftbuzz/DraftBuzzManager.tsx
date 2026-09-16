"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { defaultDraftYear } from "@/lib/draftbuzz/mapping";
import {
  createRun, deleteRun, getRunDetail, getRuns, importRunStep,
  type ImportCounts, type RunDetail, type RunSummary,
} from "./actions";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const pct = (filled: number, of: number) => (of ? Math.round((filled / of) * 100) : 0);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

const card = "rounded-xl border border-[#2a3a4e] bg-[#1a2332] p-5";
const btn = "rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40";
const btnPrimary = `${btn} bg-orange-500 text-white hover:bg-orange-600`;
const btnGhost = `${btn} border border-[#2a3a4e] text-gray-300 hover:text-white hover:bg-white/5`;

// ─── Bookmarklet ────────────────────────────────────────────────────────────

/** Loads the latest collector from this site each time the bookmark is clicked. */
function bookmarkletCode(): string {
  const src = `${window.location.origin}/draftbuzz-collector.js`;
  return (
    "javascript:(function(){" +
    "if(!/(^|\\.)nfldraftbuzz\\.com$/i.test(location.hostname)){alert('Open nfldraftbuzz.com first, then click this bookmark.');return;}" +
    `var s=document.createElement('script');s.src='${src}?t='+Date.now();document.head.appendChild(s);` +
    "})();"
  );
}

function Bookmarklet() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // React blocks javascript: URLs in href, so set it directly on the element.
    linkRef.current?.setAttribute("href", bookmarkletCode());
  }, []);

  return (
    <div className={`${card} space-y-3`}>
      <p className="text-sm font-semibold text-white">One-time setup: the collector bookmark</p>
      <p className="text-sm text-gray-400">
        Drag this button onto your Chrome bookmarks bar (press Ctrl+Shift+B if the bar is hidden). Works from any
        computer — the collector runs in whichever browser you click it in.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          ref={linkRef}
          onClick={(e) => { e.preventDefault(); alert("Drag this button to your bookmarks bar, then click it while you're on nfldraftbuzz.com."); }}
          className="cursor-grab rounded-lg bg-orange-500/15 border border-orange-500/40 px-4 py-2 text-sm font-semibold text-orange-300"
        >
          ⤓ DraftBuzz collector
        </a>
        <button
          className={btnGhost}
          onClick={async () => { await navigator.clipboard.writeText(bookmarkletCode()); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        >
          {copied ? "Copied" : "Copy bookmark code instead"}
        </button>
      </div>
    </div>
  );
}

// ─── Report ─────────────────────────────────────────────────────────────────

function FillBar({ filled, of }: { filled: number; of: number }) {
  const p = pct(filled, of);
  const color = p >= 90 ? "bg-green-500" : p >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#0d1320]"><div className={`h-full ${color}`} style={{ width: `${p}%` }} /></div>
      <span className="w-20 text-xs text-gray-400">{filled}/{of} · {p}%</span>
    </div>
  );
}

function Report({ detail }: { detail: RunDetail }) {
  const { report, counts, problems } = detail;
  const unknownLabels = Object.entries(report.unknownGradeLabels);
  const gradeGroups = [...new Set(report.gradeFill.map((g) => g.group))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-white">{report.total} of {report.expected || "?"} profiles collected</span>
        {Object.entries(report.byGroup).map(([g, n]) => <span key={g} className="text-gray-400">{g} {n}</span>)}
      </div>

      {(unknownLabels.length > 0 || report.unrecognized.length > 0) && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm space-y-1">
          {unknownLabels.length > 0 && (
            <p className="text-yellow-300">
              New grade labels DraftBuzz is showing that aren&apos;t mapped yet: {unknownLabels.map(([l, n]) => `${l} (${n})`).join(", ")}.
              These values won&apos;t be imported until the mapping is updated.
            </p>
          )}
          {report.unrecognized.length > 0 && (
            <p className="text-yellow-300">
              {report.unrecognized.length} profile{report.unrecognized.length === 1 ? "" : "s"} with an unrecognized grades layout will be skipped:{" "}
              {report.unrecognized.slice(0, 8).map((u) => `${u.name} (${u.code || "?"})`).join(", ")}{report.unrecognized.length > 8 ? "…" : ""}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[#2a3a4e] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Profile fields</p>
          <table className="w-full text-sm">
            <tbody>
              {report.fillRates.map((f) => (
                <tr key={f.field}><td className="py-0.5 pr-3 text-gray-300">{f.field}</td><td><FillBar filled={f.filled} of={f.of} /></td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500">
            Some fields (Age, ESPN rating, ...) are blank on DraftBuzz for many players. A field dropping sharply
            versus earlier runs is the sign the site changed.
          </p>
        </div>

        <div className="rounded-lg border border-[#2a3a4e] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Grades by position group</p>
          <div className="space-y-2">
            {gradeGroups.map((g) => (
              <div key={g}>
                <p className="text-xs text-gray-400">{g}</p>
                <table className="w-full text-sm">
                  <tbody>
                    {report.gradeFill.filter((x) => x.group === g).map((x) => (
                      <tr key={x.header}><td className="py-0.5 pr-3 text-gray-300">{x.header.replace(/_/g, " ")}</td><td><FillBar filled={x.filled} of={x.of} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Position codes on DraftBuzz&apos;s list: {Object.entries(report.listCodes).map(([c, n]) => `${c} ${n}`).join(" · ")}
      </p>

      {(counts.imported + counts.unmatched + counts.error + counts.skipped) > 0 && (
        <div className="rounded-lg border border-[#2a3a4e] p-4 text-sm space-y-2">
          <div className="flex flex-wrap gap-x-6">
            <span className="text-green-400">{counts.imported} imported</span>
            <span className="text-yellow-400">{counts.unmatched} unmatched</span>
            <span className="text-red-400">{counts.error} errors</span>
            <span className="text-gray-400">{counts.skipped} skipped</span>
            {counts.pending > 0 && <span className="text-gray-400">{counts.pending} not yet imported</span>}
          </div>
          {counts.unmatched > 0 && (
            <p className="text-xs text-gray-400">
              Unmatched names were added to <Link href="/admin/pending-players" className="text-orange-400 hover:underline">Pending players</Link>, just like a spreadsheet upload.
            </p>
          )}
          {problems.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-gray-400 hover:text-white">Show {problems.length} not imported</summary>
              <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs text-gray-400">
                {problems.map((p, i) => <li key={i}>· {p.name} — {p.status}{p.note ? `: ${p.note}` : ""}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Manager ────────────────────────────────────────────────────────────────

export function DraftBuzzManager() {
  const thisYear = new Date().getFullYear();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(() => defaultDraftYear());
  const [newCode, setNewCode] = useState<{ code: string; runId: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [includeCommentary, setIncludeCommentary] = useState(true);
  const [importing, setImporting] = useState<ImportCounts | null>(null);

  const loadRuns = useCallback(async () => {
    try { setRuns(await getRuns()); } catch (e) { setError(errText(e)); }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try { setDetail(await getRunDetail(id)); } catch (e) { setError(errText(e)); }
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  // While a collection is in progress, refresh every 5 s so the count moves.
  const collecting = runs?.some((r) => r.status === "collecting" && !r.expired);
  useEffect(() => {
    if (!collecting || importing) return;
    const t = setInterval(() => { loadRuns(); if (selected) loadDetail(selected); }, 5000);
    return () => clearInterval(t);
  }, [collecting, importing, selected, loadRuns, loadDetail]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const { run, code } = await createRun(year);
      setNewCode({ code, runId: run.id });
      setSelected(run.id);
      setDetail(null);
      await loadRuns();
      await loadDetail(run.id);
    } catch (e) { setError(errText(e)); } finally { setCreating(false); }
  }

  async function runImport(runId: string) {
    setError(null);
    setImporting({ imported: 0, unmatched: 0, error: 0, skipped: 0, pending: 1 });
    try {
      for (;;) {
        const step = await importRunStep(runId, includeCommentary);
        setImporting(step.counts);
        if (step.done || step.processed === 0) break;
      }
    } catch (e) { setError(errText(e)); } finally {
      setImporting(null);
      await loadRuns();
      await loadDetail(runId);
    }
  }

  const run = runs?.find((r) => r.id === selected) ?? null;
  const importTotal = importing ? importing.imported + importing.unmatched + importing.error + importing.skipped + importing.pending : 0;

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

      <Bookmarklet />

      {/* New run */}
      <div className={`${card} space-y-3`}>
        <p className="text-sm font-semibold text-white">Collect</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-400">Draft class</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none">
              {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button className={btnPrimary} onClick={create} disabled={creating}>{creating ? "Creating…" : "Create run code"}</button>
        </div>

        {newCode && (
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <code className="rounded-md bg-[#0d1320] px-3 py-1.5 text-lg font-bold tracking-widest text-white">{newCode.code}</code>
              <button className={btnGhost} onClick={async () => { await navigator.clipboard.writeText(newCode.code); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}>
                {codeCopied ? "Copied" : "Copy code"}
              </button>
            </div>
            <ol className="list-decimal space-y-0.5 pl-5 text-sm text-gray-300">
              <li>Open <a href="https://www.nfldraftbuzz.com/" target="_blank" rel="noreferrer" className="text-orange-400 hover:underline">nfldraftbuzz.com</a> in Chrome (complete the &quot;verify you&apos;re human&quot; check if it asks).</li>
              <li>Click the <b>DraftBuzz collector</b> bookmark, paste this code, and press Start.</li>
              <li>Keep that tab open and in front for about 8 minutes. Progress shows below.</li>
            </ol>
            <p className="text-xs text-gray-500">The code works for 24 hours and is only shown now. If a run stops, click the bookmark again with the same code to resume.</p>
          </div>
        )}
      </div>

      {/* Runs */}
      {runs && runs.length > 0 && (
        <div className={`${card} space-y-3`}>
          <p className="text-sm font-semibold text-white">Runs</p>
          <div className="divide-y divide-[#2a3a4e] rounded-lg border border-[#2a3a4e]">
            {runs.map((r) => (
              <button key={r.id} onClick={() => { setSelected(r.id); setDetail(null); loadDetail(r.id); }}
                className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-left text-sm ${selected === r.id ? "bg-orange-500/5" : "hover:bg-white/[0.03]"}`}>
                <span className="text-white">{r.draftYear} class</span>
                <span className="text-gray-400">{when(r.createdAt)}</span>
                <span className={r.status === "imported" ? "text-green-400" : r.status === "collected" ? "text-orange-400" : r.expired ? "text-gray-500" : "text-blue-400"}>
                  {r.status === "collecting" ? (r.expired ? "expired" : "collecting") : r.status}
                </span>
                <span className="ml-auto text-gray-400">{r.received}/{r.expected || "?"} profiles</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected run */}
      {run && (
        <div className={`${card} space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">{run.draftYear} run · {run.status}</p>
            <div className="flex flex-wrap items-center gap-3">
              {run.status !== "imported" && run.received > 0 && (
                <>
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input type="checkbox" checked={includeCommentary} onChange={(e) => setIncludeCommentary(e.target.checked)} disabled={!!importing} />
                    Also update DraftBuzz scouting text
                  </label>
                  <button className={btnPrimary} disabled={!!importing}
                    onClick={() => {
                      const partial = run.status === "collecting" ? `Collection hasn't finished (${run.received} of ${run.expected || "?"}). ` : "";
                      if (window.confirm(`${partial}Import ${run.received} profiles into player records now?`)) runImport(run.id);
                    }}>
                    {importing ? `Importing… ${importTotal - importing.pending}/${importTotal}` : `Import ${run.received} profiles`}
                  </button>
                </>
              )}
              <button className={btnGhost} disabled={!!importing}
                onClick={async () => {
                  if (!window.confirm("Delete this run and its collected data? Player records that were already imported are not affected.")) return;
                  try { await deleteRun(run.id); setSelected(null); setDetail(null); if (newCode?.runId === run.id) setNewCode(null); await loadRuns(); } catch (e) { setError(errText(e)); }
                }}>
                Delete run
              </button>
            </div>
          </div>

          {detail ? (
            detail.report.total > 0
              ? <Report detail={detail} />
              : <p className="text-sm text-gray-400">{run.expired ? "This run expired before anything was collected." : "Nothing collected yet — waiting for the bookmark to start on nfldraftbuzz.com."}</p>
          ) : <p className="text-sm text-gray-500">Loading…</p>}
        </div>
      )}
    </div>
  );
}
