"use client";

import { useState, useTransition } from "react";
import {
  approveCollegeCorrection,
  dismissPendingCollege,
  dismissAllPendingColleges,
  type PendingCollege,
} from "./actions";

function CollegeRow({
  entry,
  canonicals,
  onResolved,
}: {
  entry: PendingCollege;
  canonicals: string[];
  onResolved: (id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApprove() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await approveCollegeCorrection(entry.id, entry.raw_name, selected);
      if (res.error) setError(res.error);
      else onResolved(entry.id);
    });
  }

  function handleDismiss() {
    setError(null);
    startTransition(async () => {
      const res = await dismissPendingCollege(entry.id);
      if (res.error) setError(res.error);
      else onResolved(entry.id);
    });
  }

  return (
    <div className="rounded-lg border border-[#2a3a4e] bg-[#0d1320] p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Raw name + source */}
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm text-white truncate">{entry.raw_name}</p>
          {entry.source && (
            <p className="mt-0.5 text-xs text-gray-500">source: {entry.source}</p>
          )}
        </div>

        {/* Arrow */}
        <span className="hidden sm:block text-gray-600">→</span>

        {/* Canonical picker */}
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={isPending}
          className="w-full sm:w-56 rounded-lg border border-[#2a3a4e] bg-[#0a0f1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none disabled:opacity-50"
        >
          <option value="">— pick canonical —</option>
          {canonicals.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Actions */}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleApprove}
            disabled={isPending || !selected}
            className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={handleDismiss}
            disabled={isPending}
            className="rounded-lg border border-[#2a3a4e] px-3 py-2 text-sm text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-40 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}

export function CollegeReviewManager({
  initialPending,
  canonicals,
}: {
  initialPending: PendingCollege[];
  canonicals: string[];
}) {
  const [items, setItems] = useState(initialPending);
  const [isPending, startTransition] = useTransition();
  const [globalError, setGlobalError] = useState<string | null>(null);

  function handleResolved(id: string) {
    setItems((prev) => prev.filter((e) => e.id !== id));
  }

  function handleDismissAll() {
    setGlobalError(null);
    startTransition(async () => {
      const res = await dismissAllPendingColleges();
      if (res.error) setGlobalError(res.error);
      else setItems([]);
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-6 py-12 text-center">
        <p className="text-gray-400">No pending colleges — all school names are normalized.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{items.length} unresolved school name{items.length !== 1 ? "s" : ""}</p>
        <button
          onClick={handleDismissAll}
          disabled={isPending}
          className="text-sm text-gray-500 hover:text-red-400 disabled:opacity-40 transition-colors"
        >
          Dismiss all
        </button>
      </div>

      {globalError && (
        <p className="text-sm text-red-400">{globalError}</p>
      )}

      {items.map((entry) => (
        <CollegeRow
          key={entry.id}
          entry={entry}
          canonicals={canonicals}
          onResolved={handleResolved}
        />
      ))}
    </div>
  );
}
