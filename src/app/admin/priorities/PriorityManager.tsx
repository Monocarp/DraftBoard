"use client";

import { useState } from "react";
import type { SourcePriorityEntry } from "./actions";
import { updateSourcePriority } from "./actions";

interface Props {
  entries: SourcePriorityEntry[];
}

export function PriorityManager({ entries: initialEntries }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [edited, setEdited] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ source: string; message: string; ok: boolean } | null>(null);

  const hasChanges = Object.keys(edited).length > 0;

  const handlePriorityChange = (source: string, value: number) => {
    const original = entries.find((e) => e.source === source);
    if (original && original.priority === value) {
      // Reset to original — no change
      setEdited((prev) => {
        const next = { ...prev };
        delete next[source];
        return next;
      });
    } else {
      setEdited((prev) => ({ ...prev, [source]: value }));
    }
  };

  const handleSave = async (source: string) => {
    const newPriority = edited[source];
    if (newPriority === undefined) return;

    setSaving(source);
    setFeedback(null);

    try {
      const res = await updateSourcePriority(source, newPriority);
      if (res.success) {
        setFeedback({
          source,
          message: `Updated "${source}" to priority ${newPriority}. Re-resolved ${res.updated} player${res.updated !== 1 ? "s" : ""}.`,
          ok: true,
        });
        // Update local state
        setEntries((prev) =>
          prev.map((e) => (e.source === source ? { ...e, priority: newPriority } : e))
        );
        setEdited((prev) => {
          const next = { ...prev };
          delete next[source];
          return next;
        });
      } else {
        setFeedback({ source, message: res.error || "Unknown error", ok: false });
      }
    } catch (err) {
      setFeedback({ source, message: err instanceof Error ? err.message : String(err), ok: false });
    } finally {
      setSaving(null);
    }
  };

  const handleSaveAll = async () => {
    for (const source of Object.keys(edited)) {
      await handleSave(source);
    }
  };

  const priorityLabel = (p: number): string => {
    if (p === 0) return "Manual fallback";
    if (p <= 2) return "Low";
    if (p <= 4) return "Medium";
    if (p <= 6) return "High";
    if (p <= 8) return "Very High";
    return "Highest";
  };

  return (
    <div className="space-y-4">
      {/* Feedback banner */}
      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.ok
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Save All button */}
      {hasChanges && (
        <div className="flex justify-end">
          <button
            onClick={handleSaveAll}
            disabled={saving !== null}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : `Save All Changes (${Object.keys(edited).length})`}
          </button>
        </div>
      )}

      {/* Priority table */}
      <div className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a3a4e] bg-[#1a2535]">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Source
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Priority
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Level
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Bio Fields
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                Players
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const currentPriority = edited[entry.source] ?? entry.priority;
              const isEdited = edited[entry.source] !== undefined;
              const isSaving = saving === entry.source;

              return (
                <tr
                  key={entry.source}
                  className={`border-b border-[#2a3a4e]/50 transition-colors ${
                    isEdited ? "bg-orange-500/5" : "hover:bg-[#1a2535]/50"
                  }`}
                >
                  {/* Source name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{entry.source}</span>
                      {entry.isDefault && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          default
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Priority picker */}
                  <td className="px-4 py-3">
                    <select
                      value={currentPriority}
                      onChange={(e) => handlePriorityChange(entry.source, parseInt(e.target.value, 10))}
                      disabled={isSaving}
                      className={`w-20 rounded-lg border bg-[#1a2535] px-2 py-1.5 text-sm text-white focus:border-orange-500 focus:outline-none ${
                        isEdited ? "border-orange-500/50" : "border-[#2a3a4e]"
                      }`}
                    >
                      {Array.from({ length: 11 }, (_, i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Level label */}
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium ${
                        currentPriority >= 7
                          ? "text-green-400"
                          : currentPriority >= 4
                            ? "text-yellow-400"
                            : currentPriority >= 1
                              ? "text-gray-400"
                              : "text-gray-600"
                      }`}
                    >
                      {priorityLabel(currentPriority)}
                    </span>
                  </td>

                  {/* Bio fields */}
                  <td className="px-4 py-3">
                    {entry.fields.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {entry.fields.map((f) => (
                          <span
                            key={f}
                            className="px-1.5 py-0.5 rounded bg-[#1a2535] text-[11px] text-gray-400 border border-[#2a3a4e]"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>

                  {/* Player count */}
                  <td className="px-4 py-3 text-right">
                    <span className="text-gray-400 tabular-nums">{entry.playerCount}</span>
                  </td>

                  {/* Save button */}
                  <td className="px-4 py-3 text-center">
                    {isEdited && (
                      <button
                        onClick={() => handleSave(entry.source)}
                        disabled={isSaving}
                        className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {isSaving ? "…" : "Save"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-2">How Priority Works</h3>
        <div className="text-xs text-gray-500 space-y-1">
          <p>
            When multiple sources provide the same bio field (e.g. height), the source with the <span className="text-white">highest priority</span> wins.
            The winning value is saved to the player&apos;s top-level profile fields.
          </p>
          <p>
            Changing a priority will re-resolve <span className="text-white">all affected players</span> immediately — no re-upload needed.
          </p>
          <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-[#2a3a4e]">
            <span><span className="text-gray-600">0</span> = Manual fallback</span>
            <span><span className="text-gray-400">1–2</span> = Low</span>
            <span><span className="text-yellow-400">3–4</span> = Medium</span>
            <span><span className="text-yellow-400">5–6</span> = High</span>
            <span><span className="text-green-400">7–8</span> = Very High</span>
            <span><span className="text-green-400">9–10</span> = Highest</span>
          </div>
        </div>
      </div>
    </div>
  );
}
