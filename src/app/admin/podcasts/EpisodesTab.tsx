"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getEpisodesView, startEpisode, runEpisodeStep, reprocessEpisode, restartTranscription,
  type EpisodeListItem, type StepResult,
} from "./actions";

const PODCAST_FILTERS = [
  { id: "all", label: "All podcasts" },
  { id: "first-draft", label: "First Draft" },
  { id: "nflse", label: "NFL Stock Exchange" },
  { id: "mcshay", label: "The McShay Show" },
];

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function StatusBadge({ ep }: { ep: EpisodeListItem }) {
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";
  if (ep.error) return <span className={`${base} bg-red-500/15 text-red-400`}>Needs attention</span>;
  switch (ep.status) {
    case null: return <span className={`${base} bg-yellow-500/15 text-yellow-400`}>New</span>;
    case "transcribing": return <span className={`${base} bg-blue-500/15 text-blue-400`}>Transcribing {ep.chunksTotal ? `${ep.chunksDone}/${ep.chunksTotal}` : ""}</span>;
    case "extracting": return <span className={`${base} bg-blue-500/15 text-blue-400`}>Extracting {ep.playersTotal ? `${ep.playersDone}/${ep.playersTotal}` : ""}</span>;
    case "review": return <span className={`${base} bg-orange-500/15 text-orange-400`}>Ready for review</span>;
    case "published": return <span className={`${base} bg-green-500/15 text-green-400`}>Published</span>;
  }
}

/** Transcription fills the first half of the bar, extraction the second. */
function progressPct(r: StepResult): number {
  if (r.status === "review" || r.status === "published") return 100;
  if (r.status === "transcribing") return r.chunksTotal ? Math.round((r.chunksDone / r.chunksTotal) * 50) : 2;
  return 50 + (r.playersTotal ? Math.round((r.playersDone / r.playersTotal) * 50) : 2);
}

export function EpisodesTab({ onGoToReview }: { onGoToReview: () => void }) {
  const [episodes, setEpisodes] = useState<EpisodeListItem[] | null>(null);
  const [feedErrors, setFeedErrors] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  const [runningGuid, setRunningGuid] = useState<string | null>(null);
  const [runTitle, setRunTitle] = useState("");
  const [step, setStep] = useState<StepResult | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const stopRef = useRef(false); // read inside the loop; `stopping` drives the label

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getEpisodesView();
      setEpisodes(res.episodes);
      setFeedErrors(res.feedErrors);
    } catch (e) {
      setLoadError(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run(ep: EpisodeListItem, prepare?: (id: string) => Promise<void>) {
    setRunningGuid(ep.guid);
    setRunTitle(ep.title);
    setStep(null);
    setLog([]);
    setRunError(null);
    setStopping(false);
    stopRef.current = false;
    try {
      const id = ep.id ?? (await startEpisode(ep.podcastSlug, ep.guid)).id;
      if (prepare) await prepare(id);
      // Each call advances the episode a bounded amount and saves progress, so
      // stopping (or closing the tab) loses at most the step in flight.
      for (;;) {
        const r = await runEpisodeStep(id);
        setStep(r);
        setLog((l) => [...l, r.message].slice(-8));
        if (r.error || r.status === "review" || r.status === "published" || stopRef.current) break;
      }
    } catch (e) {
      setRunError(errText(e));
    } finally {
      setRunningGuid(null);
      load();
    }
  }

  function confirmThen(message: string, fn: () => void) {
    if (window.confirm(message)) fn();
  }

  const shown = (episodes ?? []).filter((e) => filter === "all" || e.podcastSlug === filter);
  const busy = runningGuid !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
        >
          {PODCAST_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <button
          onClick={load}
          disabled={loading || busy}
          className="rounded-lg border border-[#2a3a4e] px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? "Loading feeds…" : "Refresh feeds"}
        </button>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{loadError}</div>
      )}
      {feedErrors.map((e) => (
        <div key={e} className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-xs text-yellow-400">Feed unavailable — {e}</div>
      ))}

      {/* Processing panel */}
      {(busy || step || runError) && (
        <div className="rounded-xl border border-[#2a3a4e] bg-[#1a2332] p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-gray-500">{busy ? "Processing" : "Last run"}</p>
              <p className="text-sm font-semibold text-white truncate">{runTitle}</p>
            </div>
            {busy && (
              <button
                onClick={() => { stopRef.current = true; setStopping(true); }}
                disabled={stopping}
                className="shrink-0 rounded-lg border border-[#2a3a4e] px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-60"
              >
                {stopping ? "Stopping after this step…" : "Stop"}
              </button>
            )}
          </div>

          {step && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#0d1320]">
              <div className="h-full bg-orange-500 transition-all" style={{ width: `${progressPct(step)}%` }} />
            </div>
          )}

          <ul className="space-y-0.5 font-mono text-xs text-gray-400">
            {log.map((line, i) => <li key={i}>· {line}</li>)}
            {busy && <li className="text-gray-600">· working…</li>}
          </ul>

          {(runError || step?.error) && (
            <p className="text-sm text-red-400">{runError ?? step?.error} — progress so far is saved; use Resume to continue.</p>
          )}

          {step?.summary && !busy && (
            <div className="space-y-2 border-t border-[#2a3a4e] pt-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-green-400">{step.summary.matched} ready for review</span>
                <span className="text-yellow-400">{step.summary.unmatched} unmatched</span>
                <span className="text-gray-400">{step.summary.tooShort} too brief to keep</span>
                {step.summary.keptReviewed > 0 && <span className="text-gray-400">{step.summary.keptReviewed} already reviewed (kept)</span>}
                {step.summary.failed > 0 && <span className="text-red-400">{step.summary.failed} failed</span>}
                <span className="text-gray-500">AI cost ${step.summary.costUsd.toFixed(3)} + transcription</span>
              </div>
              {step.summary.failures.length > 0 && (
                <ul className="text-xs text-red-400/80 space-y-0.5">{step.summary.failures.map((f) => <li key={f}>· {f}</li>)}</ul>
              )}
              {step.summary.matched > 0 && (
                <button onClick={onGoToReview} className="rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600">
                  Go to review →
                </button>
              )}
              {step.summary.unmatched > 0 && (
                <p className="text-xs text-gray-500">Unmatched names are in the Reconcile Unmatched tab.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Episode list */}
      {episodes && (
        <div className="rounded-xl border border-[#2a3a4e] overflow-hidden divide-y divide-[#2a3a4e]">
          {shown.length === 0 && <p className="px-4 py-6 text-sm text-gray-500">No episodes.</p>}
          {shown.map((ep) => {
            const inProgress = ep.status === "transcribing" || ep.status === "extracting";
            return (
              <div key={ep.guid} className={`px-4 py-3 ${runningGuid === ep.guid ? "bg-orange-500/5" : "hover:bg-white/[0.02]"}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">{ep.title}</p>
                    <p className="text-xs text-gray-500">
                      {ep.date} · {ep.podcastName}{ep.duration ? ` · ${ep.duration}` : ""}{!ep.inFeed ? " · no longer in recent feed" : ""}
                    </p>
                  </div>
                  <StatusBadge ep={ep} />
                  <div className="flex items-center gap-2">
                    {ep.status === null && (
                      <button disabled={busy} onClick={() => run(ep)}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">
                        Process
                      </button>
                    )}
                    {inProgress && (
                      <button disabled={busy} onClick={() => run(ep)}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">
                        Resume
                      </button>
                    )}
                    {ep.status === "review" && (
                      <button disabled={busy} onClick={onGoToReview}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-40">
                        Review
                      </button>
                    )}
                    {ep.id && (ep.status === "review" || ep.status === "published" || ep.status === "extracting") && (
                      <button disabled={busy}
                        onClick={() => confirmThen(
                          "Re-process runs player extraction again (spends API credits). Pending extracts for this " +
                          "episode are replaced; approved and published ones are kept. If no transcript is saved " +
                          "(episodes published before the move to admin), the audio is transcribed again first.",
                          () => run(ep, reprocessEpisode),
                        )}
                        className="rounded-lg border border-[#2a3a4e] px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-40">
                        Re-process
                      </button>
                    )}
                    {ep.id && ep.status === "transcribing" && ep.error && (
                      <button disabled={busy}
                        onClick={() => confirmThen(
                          "Discard transcription progress and download the audio again?",
                          () => run(ep, restartTranscription),
                        )}
                        className="rounded-lg border border-[#2a3a4e] px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-40">
                        Restart transcription
                      </button>
                    )}
                  </div>
                </div>
                {ep.error && runningGuid !== ep.guid && <p className="mt-1.5 text-xs text-red-400/90">{ep.error}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
