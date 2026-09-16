"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getReviewData, setExtractStatus, setEpisodeExtractsStatus, saveExtractText, deleteExtract,
  markEpisodeDone, publishApproved,
  type ReviewEpisode, type ReviewExtract, type PublishResult,
} from "./actions";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

const VIA_NOTE: Record<string, string> = {
  "ai-fuzzy": "Name matched from a transcript misspelling — confirm it's the right player",
  "name-scan": "Found by full-name scan, not the AI pass — confirm the discussion is substantive",
};

function ExtractCard({ x, onChanged, setError }: {
  x: ReviewExtract;
  onChanged: () => void;
  setError: (e: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(x.text);
  const [busy, setBusy] = useState(false);
  const approved = x.status === "approved";

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); onChanged(); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${approved ? "border-green-500/30 bg-green-500/5" : "border-[#2a3a4e] bg-[#1a2332]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            <span className={approved ? "text-green-400" : "text-gray-500"}>{approved ? "✓" : "○"}</span> {x.name}
          </p>
          <p className="text-xs text-gray-500">{x.slug} · ~{words(x.text)} words</p>
          {x.via && VIA_NOTE[x.via] && <p className="mt-1 text-xs text-yellow-400/90">{VIA_NOTE[x.via]}</p>}
          {!x.hasPlayer && <p className="mt-1 text-xs text-red-400">Player is no longer on the board — this extract can&apos;t be published.</p>}
        </div>
        {!editing && (
          <div className="flex gap-2">
            {approved ? (
              <button disabled={busy} onClick={() => act(() => setExtractStatus(x.id, false))}
                className="rounded-lg border border-[#2a3a4e] px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-40">Un-approve</button>
            ) : (
              <button disabled={busy} onClick={() => act(() => setExtractStatus(x.id, true))}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40">Approve</button>
            )}
            <button disabled={busy} onClick={() => { setDraft(x.text); setEditing(true); }}
              className="rounded-lg border border-[#2a3a4e] px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-40">Edit</button>
            <button disabled={busy}
              onClick={() => { if (window.confirm(`Delete the extract for ${x.name}?`)) act(() => deleteExtract(x.id)); }}
              className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40">Delete</button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={12}
            className="w-full rounded-lg border border-[#2a3a4e] bg-[#0d1320] p-3 text-sm text-gray-200 focus:border-orange-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button disabled={busy || !draft.trim()} onClick={() => act(async () => { await saveExtractText(x.id, draft); setEditing(false); })}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-40">Save &amp; approve</button>
            <button disabled={busy} onClick={() => setEditing(false)}
              className="rounded-lg border border-[#2a3a4e] px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-white/5">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <details open={!approved}>
            <summary className="cursor-pointer text-xs text-gray-400 hover:text-white">Extract (what gets published)</summary>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">{x.text}</p>
          </details>
          {x.rawText && x.rawText !== x.text && (
            <details>
              <summary className="cursor-pointer text-xs text-gray-400 hover:text-white">Original before the GM filter (~{words(x.rawText)} words)</summary>
              <p className="mt-1 text-xs text-gray-500">If something important was cut, use Edit to add it back.</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-400">{x.rawText}</p>
            </details>
          )}
        </>
      )}
    </div>
  );
}

export function ReviewTab() {
  const [data, setData] = useState<ReviewEpisode[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getReviewData();
      setData(d);
      setSelected((cur) => (cur && d.some((e) => e.id === cur) ? cur : d[0]?.id ?? null));
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error && !data) return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>;
  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;

  const approvedTotal = data.reduce((n, e) => n + e.extracts.filter((x) => x.status === "approved").length, 0);
  const ep = data.find((e) => e.id === selected) ?? null;
  const pending = ep?.extracts.filter((x) => x.status === "pending") ?? [];
  const approved = ep?.extracts.filter((x) => x.status === "approved") ?? [];

  async function bulk(fn: () => Promise<void>) {
    setBulkBusy(true);
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(errText(e)); } finally { setBulkBusy(false); }
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    setPublishResult(null);
    try { setPublishResult(await publishApproved()); await load(); } catch (e) { setError(errText(e)); } finally { setPublishing(false); }
  }

  return (
    <div className="space-y-6">
      {/* Publish */}
      <div className="rounded-xl border border-[#2a3a4e] bg-[#1a2332] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">{approvedTotal} approved extract{approvedTotal === 1 ? "" : "s"} ready to publish</p>
          <p className="text-xs text-gray-500">Appends each one to the player&apos;s commentary for that podcast. Safe to run twice — an episode already on a profile is skipped.</p>
        </div>
        <button onClick={publish} disabled={publishing || approvedTotal === 0}
          className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-40">
          {publishing ? "Publishing…" : "Publish all approved"}
        </button>
      </div>

      {publishResult && (
        <div className={`rounded-lg border px-4 py-3 text-sm space-y-1 ${publishResult.errors.length ? "border-yellow-500/30 bg-yellow-500/10" : "border-green-500/30 bg-green-500/10"}`}>
          <p className="text-white">
            Published {publishResult.written} new
            {publishResult.existed > 0 && `, ${publishResult.existed} were already on profiles`}
            {publishResult.episodesCompleted > 0 && ` · ${publishResult.episodesCompleted} episode${publishResult.episodesCompleted === 1 ? "" : "s"} finished`}
          </p>
          {publishResult.skipped.map((s) => <p key={s} className="text-xs text-yellow-400">Skipped: {s}</p>)}
          {publishResult.errors.map((s) => <p key={s} className="text-xs text-red-400">Failed: {s}</p>)}
        </div>
      )}

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

      {data.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing to review. Process an episode on the Episodes tab.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <select value={selected ?? ""} onChange={(e) => setSelected(e.target.value)}
              className="min-w-0 max-w-full rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none">
              {data.map((e) => (
                <option key={e.id} value={e.id}>
                  [{e.date}] {e.podcastName} — {e.title.slice(0, 60)} ({e.extracts.filter((x) => x.status === "pending").length} pending)
                </option>
              ))}
            </select>
          </div>

          {ep && (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="text-gray-400">{ep.extracts.length} extracts</span>
                <span className="text-yellow-400">{pending.length} pending</span>
                <span className="text-green-400">{approved.length} approved</span>
                <div className="flex gap-2 ml-auto">
                  {pending.length > 0 && (
                    <button disabled={bulkBusy} onClick={() => bulk(() => setEpisodeExtractsStatus(ep.id, true))}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40">Approve all pending</button>
                  )}
                  {approved.length > 0 && (
                    <button disabled={bulkBusy} onClick={() => bulk(() => setEpisodeExtractsStatus(ep.id, false))}
                      className="rounded-lg border border-[#2a3a4e] px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-40">Un-approve all</button>
                  )}
                </div>
              </div>

              {ep.extracts.length === 0 ? (
                <div className="rounded-xl border border-[#2a3a4e] bg-[#1a2332] p-5 space-y-3">
                  <p className="text-sm text-gray-400">No player extracts in this episode — either nothing substantive was discussed, or everything went to the unmatched queue.</p>
                  <button disabled={bulkBusy} onClick={() => bulk(() => markEpisodeDone(ep.id))}
                    className="rounded-lg border border-[#2a3a4e] px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-40">Mark episode done</button>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...pending, ...approved].map((x) => (
                    <ExtractCard key={`${x.id}:${x.status}:${x.text.length}`} x={x} onChanged={load} setError={setError} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
