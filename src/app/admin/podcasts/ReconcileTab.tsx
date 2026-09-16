"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getReconcileData, reconcileRows, dismissRows, type UnmatchedRow, type BoardPlayer } from "./actions";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

interface Group { slug: string; name: string; rows: UnmatchedRow[] }

function ManualGroup({ group, players, onDone, setError }: {
  group: Group;
  players: BoardPlayer[];
  onDone: (msg: string) => void;
  setError: (e: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<BoardPlayer | null>(null);
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return players.filter((p) => p.name.toLowerCase().includes(q) || p.slug.includes(q)).slice(0, 8);
  }, [search, players]);

  async function act(fn: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try { onDone(await fn()); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }

  const ids = group.rows.map((r) => r.id);

  return (
    <div className="rounded-xl border border-[#2a3a4e] bg-[#1a2332] p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-white">{group.name}</p>
        <p className="text-xs text-gray-500">
          Heard as <code>{group.slug}</code> · {group.rows.length} episode{group.rows.length === 1 ? "" : "s"} · ~{group.rows.reduce((n, r) => n + words(r.text), 0)} words
        </p>
      </div>

      {group.rows.map((r) => (
        <details key={r.id}>
          <summary className="cursor-pointer text-xs text-gray-400 hover:text-white">{r.episodeDate} — {r.episodeTitle} ({r.source})</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-400">{r.text}</p>
        </details>
      ))}

      <div className="flex flex-wrap items-start gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <input
            value={picked ? `${picked.name} (${picked.position ?? "?"})` : search}
            onChange={(e) => { setPicked(null); setSearch(e.target.value); }}
            placeholder="Search the board for the right player…"
            className="w-full rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
          />
          {!picked && matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-[#2a3a4e] bg-[#0d1320] shadow-lg">
              {matches.map((p) => (
                <li key={p.id}>
                  <button onClick={() => setPicked(p)} className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/5">
                    {p.name} <span className="text-gray-500">· {p.position ?? "?"} · {p.slug}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button disabled={busy || !picked}
          onClick={() => picked && act(async () => {
            const r = await reconcileRows(ids, picked.id);
            return `Matched ${group.name} → ${picked.name}: ${r.written} published${r.existed ? `, ${r.existed} already there` : ""}`;
          })}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40">
          {busy ? "Working…" : "Match & publish"}
        </button>
        <button disabled={busy}
          onClick={() => { if (window.confirm(`Dismiss ${group.name}? The commentary is deleted, not published.`)) act(async () => { await dismissRows(ids); return `Dismissed ${group.name}`; }); }}
          className="rounded-lg border border-[#2a3a4e] px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-40">
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function ReconcileTab() {
  const [rows, setRows] = useState<UnmatchedRow[] | null>(null);
  const [players, setPlayers] = useState<BoardPlayer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [autoProgress, setAutoProgress] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getReconcileData();
      setRows(d.rows);
      setPlayers(d.players);
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const bySlug = useMemo(() => new Map(players.map((p) => [p.slug, p])), [players]);
  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const r of rows ?? []) {
      const g = m.get(r.slug) ?? { slug: r.slug, name: r.name, rows: [] };
      g.rows.push(r);
      m.set(r.slug, g);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  if (error && !rows) return <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>;
  if (!rows) return <p className="text-sm text-gray-500">Loading…</p>;

  // Slugs that now exist on the board (player added after the episode was processed).
  const auto = groups.filter((g) => bySlug.has(g.slug));
  const manual = groups.filter((g) => !bySlug.has(g.slug));

  async function reconcileAllAuto() {
    setError(null);
    let written = 0;
    try {
      for (let i = 0; i < auto.length; i++) {
        setAutoProgress(`Filtering and publishing ${auto[i].name} (${i + 1}/${auto.length})…`);
        const r = await reconcileRows(auto[i].rows.map((x) => x.id), bySlug.get(auto[i].slug)!.id);
        written += r.written;
      }
      setNotice(`Reconciled ${auto.length} player${auto.length === 1 ? "" : "s"}, ${written} section${written === 1 ? "" : "s"} published`);
    } catch (e) {
      setError(errText(e));
    } finally {
      setAutoProgress(null);
      load();
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        Players discussed on a podcast who didn&apos;t match anyone on the board. Match them to the right player
        (the text is GM-filtered and published), or dismiss them.
      </p>

      {notice && <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">{notice}</div>}
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

      {groups.length === 0 && <p className="text-sm text-gray-500">Nothing unmatched — everything is accounted for.</p>}

      {auto.length > 0 && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5 space-y-3">
          <p className="text-sm font-semibold text-white">{auto.length} now on the board</p>
          <p className="text-xs text-gray-400">{auto.map((g) => g.name).join(", ")}</p>
          <button disabled={!!autoProgress} onClick={reconcileAllAuto}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40">
            {autoProgress ?? "Reconcile all"}
          </button>
        </div>
      )}

      {manual.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-white">{manual.length} need a manual match</p>
          {manual.map((g) => (
            <ManualGroup key={g.slug} group={g} players={players} setError={setError}
              onDone={(msg) => { setNotice(msg); load(); }} />
          ))}
        </div>
      )}
    </div>
  );
}
