"use client";

import { useState } from "react";
import { updateSourceDate, addSourceDate, deleteSourceDate } from "./actions";
import type { SourceDate } from "./actions";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toInputDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toISOString().split("T")[0];
}

function DateRow({ item, onRemove }: { item: SourceDate; onRemove: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [dateVal, setDateVal] = useState(toInputDate(item.date));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [displayDate, setDisplayDate] = useState(item.date);

  const handleSave = async () => {
    setSaving(true);
    const isoDate = dateVal ? new Date(dateVal + "T12:00:00Z").toISOString() : null;
    const res = await updateSourceDate(item.id, isoDate);
    if (res.success) {
      setDisplayDate(isoDate);
      setEditing(false);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    const res = await deleteSourceDate(item.id);
    if (res.success) onRemove(item.id);
  };

  return (
    <tr className="border-b border-[#2a3a4e]/50 hover:bg-[#0d1320]/50">
      <td className="px-4 py-2.5 text-white font-medium">{item.source}</td>
      <td className="px-4 py-2.5">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateVal}
              onChange={(e) => setDateVal(e.target.value)}
              className="rounded-lg border border-[#2a3a4e] bg-[#1a2535] px-2 py-1 text-sm text-white focus:border-orange-500 focus:outline-none"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs text-green-400 hover:text-green-300 font-medium"
            >
              {saving ? "..." : "Save"}
            </button>
            <button
              onClick={() => { setEditing(false); setDateVal(toInputDate(displayDate)); }}
              className="text-xs text-gray-500 hover:text-gray-400"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-gray-300 hover:text-orange-400 transition-colors"
            title="Click to edit"
          >
            {formatDate(displayDate)}
          </button>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        {confirmDelete ? (
          <div className="flex items-center justify-end gap-2">
            <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-300 font-medium">
              Delete
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-400">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-gray-600 hover:text-red-400 transition-colors"
          >
            ×
          </button>
        )}
      </td>
    </tr>
  );
}

export function SourceDatesManager({
  rankings: initialRankings,
  mocks: initialMocks,
}: {
  rankings: SourceDate[];
  mocks: SourceDate[];
}) {
  const [rankings, setRankings] = useState(initialRankings);
  const [mocks, setMocks] = useState(initialMocks);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newSource, setNewSource] = useState("");
  const [newType, setNewType] = useState<"ranking" | "mock">("ranking");
  const [newDate, setNewDate] = useState(new Date().toISOString().split("T")[0]);
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newSource.trim()) { setAddError("Enter a source name."); return; }

    setAdding(true);
    setAddError("");

    const isoDate = newDate ? new Date(newDate + "T12:00:00Z").toISOString() : null;
    const res = await addSourceDate(newSource.trim(), newType, isoDate);

    if (res.success) {
      const entry: SourceDate = {
        id: crypto.randomUUID(),
        source: newSource.trim(),
        source_type: newType,
        date: isoDate,
      };
      if (newType === "ranking") {
        setRankings((prev) => [...prev, entry].sort((a, b) => a.source.localeCompare(b.source)));
      } else {
        setMocks((prev) => [...prev, entry].sort((a, b) => a.source.localeCompare(b.source)));
      }
      setNewSource("");
      setShowAdd(false);
    } else {
      setAddError(res.error ?? "Failed to add.");
    }
    setAdding(false);
  };

  const handleRemove = (id: string) => {
    setRankings((prev) => prev.filter((d) => d.id !== id));
    setMocks((prev) => prev.filter((d) => d.id !== id));
  };

  const renderTable = (items: SourceDate[], label: string) => (
    <div className="rounded-xl border border-[#2a3a4e] overflow-hidden">
      <div className="bg-[#0d1320] px-4 py-3 border-b border-[#2a3a4e]">
        <h3 className="text-sm font-medium text-white">
          {label} <span className="text-gray-500 font-normal">({items.length})</span>
        </h3>
      </div>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-[#0a0f1a] border-b border-[#2a3a4e]">
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Source</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Last Updated</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 w-20"></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-gray-600">
                No {label.toLowerCase()} dates yet.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <DateRow key={item.id} item={item} onRemove={handleRemove} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Add button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 transition-colors"
        >
          + Add Source Date
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-5">
          <h3 className="text-sm font-medium text-white mb-3">Add Source Date</h3>

          {addError && (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {addError}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Source</label>
              <input
                type="text"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                placeholder="e.g. PFF, CBS, ESPN"
                className="w-48 rounded-lg border border-[#2a3a4e] bg-[#1a2535] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as "ranking" | "mock")}
                className="rounded-lg border border-[#2a3a4e] bg-[#1a2535] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
              >
                <option value="ranking">Ranking</option>
                <option value="mock">Mock Draft</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Date</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="rounded-lg border border-[#2a3a4e] bg-[#1a2535] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={adding}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Info note */}
      <div className="rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-4 py-3 text-xs text-gray-500">
        💡 Dates are <strong className="text-gray-400">automatically updated</strong> when you upload new rankings or mocks via the Upload page.
        Click any date to edit it manually.
      </div>

      {/* Tables */}
      {renderTable(rankings, "Rankings")}
      {renderTable(mocks, "Mock Drafts")}
    </div>
  );
}
