"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/* ─── Common category names (shown as suggestions) ─────────────────────── */
const COMMON_CATEGORIES = [
  "Character Traits",
  "Lower Body",
  "Upper Body",
  "Physical Traits & Abilities",
  "Technical Skills",
  "Physical Ability",
  "Technical Ability",
  "Physical Traits",
  "Coverage Skills",
  "Mental/Discipline Traits",
  "Lower Body Skills",
  "Technique",
  "Receiving Skills",
  "Character/Mentality",
  "Pass Rush Skills",
  "Instincts/Processing/Production",
  "Athletic Ability",
  "Run Defense Skills",
  "Blocking/Other",
  "Tackling",
  "Athleticism/Physical Traits",
  "Pass Rush",
  "Run Defense/Tackling",
  "Blocking",
  "Character/Processing/Instincts",
  "Athleticism",
  "Tackling/Run Game",
  "Character/Mental/Discipline",
  "Pass Coverage",
  "Coverage Ability",
];

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface SkillEntry {
  id: string;
  category: string;
  positives: string;
  negatives: string;
}

type SkillsTraitsData = Record<string, { positives: string | null; negatives: string | null }>;

/* ─── Main component ────────────────────────────────────────────────────── */
export function SkillsTraitsEditor({
  defaultValue,
}: {
  defaultValue: SkillsTraitsData;
}) {
  // Convert the Record to an array for easier manipulation
  const [entries, setEntries] = useState<SkillEntry[]>(() => {
    const obj = defaultValue ?? {};
    const items = Object.entries(obj).map(([category, data]) => ({
      id: crypto.randomUUID(),
      category,
      positives: data?.positives ?? "",
      negatives: data?.negatives ?? "",
    }));
    return items.length > 0 ? items : [];
  });

  // Serialize entries to JSON for form submission
  const serialize = useCallback((): string => {
    const result: SkillsTraitsData = {};
    for (const e of entries) {
      const key = e.category.trim();
      if (!key) continue;
      result[key] = {
        positives: e.positives.trim() || null,
        negatives: e.negatives.trim() || null,
      };
    }
    return JSON.stringify(result);
  }, [entries]);

  const addEntry = () => {
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), category: "", positives: "", negatives: "" },
    ]);
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const updateEntry = (id: string, field: keyof Omit<SkillEntry, "id">, value: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const moveEntry = (index: number, direction: "up" | "down") => {
    setEntries((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // Used categories (for filtering autocomplete)
  const usedCategories = new Set(entries.map((e) => e.category));

  return (
    <div className="space-y-3">
      {/* Hidden input that carries the serialized JSON to the form */}
      <input type="hidden" name="skills_traits" value={serialize()} />

      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-gray-400">
          Skills & Traits
          {entries.length === 0 && <span className="ml-2 text-gray-600">(empty)</span>}
        </label>
        <button
          type="button"
          onClick={addEntry}
          className="flex items-center gap-1 rounded-lg border border-dashed border-[#2a3a4e] px-3 py-1.5 text-xs text-gray-400 hover:border-orange-500/50 hover:text-orange-400 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Add Category
        </button>
      </div>

      {entries.map((entry, index) => (
        <SkillCard
          key={entry.id}
          entry={entry}
          index={index}
          total={entries.length}
          usedCategories={usedCategories}
          onUpdate={(field, value) => updateEntry(entry.id, field, value)}
          onRemove={() => removeEntry(entry.id)}
          onMove={(dir) => moveEntry(index, dir)}
        />
      ))}

      {entries.length > 0 && (
        <button
          type="button"
          onClick={addEntry}
          className="w-full rounded-lg border border-dashed border-[#2a3a4e] py-2.5 text-xs text-gray-500 hover:border-orange-500/50 hover:text-orange-400 transition-colors"
        >
          + Add another category
        </button>
      )}
    </div>
  );
}

/* ─── Individual skill card ─────────────────────────────────────────────── */

function SkillCard({
  entry,
  index,
  total,
  usedCategories,
  onUpdate,
  onRemove,
  onMove,
}: {
  entry: SkillEntry;
  index: number;
  total: number;
  usedCategories: Set<string>;
  onUpdate: (field: keyof Omit<SkillEntry, "id">, value: string) => void;
  onRemove: () => void;
  onMove: (dir: "up" | "down") => void;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions based on input and already-used categories
  const filteredSuggestions = COMMON_CATEGORIES.filter(
    (c) =>
      !usedCategories.has(c) &&
      c.toLowerCase().includes(entry.category.toLowerCase())
  );

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const hasContent = entry.positives.trim() || entry.negatives.trim();

  return (
    <div className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#141e2e] border-b border-[#2a3a4e]">
        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={index === 0}
            className="text-gray-600 hover:text-gray-300 disabled:opacity-30 disabled:cursor-default transition-colors"
            title="Move up"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M8 3.5a.75.75 0 0 1 .553.244l3 3.25a.75.75 0 0 1-1.106 1.012L8 5.362 5.553 8.006a.75.75 0 1 1-1.106-1.012l3-3.25A.75.75 0 0 1 8 3.5Z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={index === total - 1}
            className="text-gray-600 hover:text-gray-300 disabled:opacity-30 disabled:cursor-default transition-colors"
            title="Move down"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M8 12.5a.75.75 0 0 1-.553-.244l-3-3.25a.75.75 0 1 1 1.106-1.012L8 10.638l2.447-2.644a.75.75 0 1 1 1.106 1.012l-3 3.25A.75.75 0 0 1 8 12.5Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Category name input with autocomplete */}
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={entry.category}
            onChange={(e) => {
              onUpdate("category", e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Category name (e.g. Coverage Skills)"
            className="w-full rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-1.5 text-sm font-semibold text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
          />
          {/* Suggestions dropdown */}
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute left-0 right-0 top-full mt-1 z-20 max-h-48 overflow-y-auto rounded-lg border border-[#2a3a4e] bg-[#1a2332] shadow-xl"
            >
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    onUpdate("category", suggestion);
                    setShowSuggestions(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#2a3a4e] hover:text-white transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Delete button */}
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => {
              if (!hasContent) {
                onRemove();
              } else {
                setConfirmDelete(true);
              }
            }}
            className="text-gray-600 hover:text-red-400 transition-colors p-1"
            title="Remove category"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
            </svg>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400">Delete?</span>
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-red-400 font-medium hover:text-red-300 transition-colors"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              No
            </button>
          </div>
        )}
      </div>

      {/* Positives & Negatives fields */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-y lg:divide-y-0 divide-[#2a3a4e]">
        {/* Positives */}
        <div className="p-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-emerald-400/80 mb-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
            </svg>
            Positives
          </label>
          <textarea
            value={entry.positives}
            onChange={(e) => onUpdate("positives", e.target.value)}
            rows={3}
            placeholder="e.g. Great ball skills, explosive off the line (WF)"
            className="w-full rounded-lg border border-[#2a3a4e] bg-[#141e2e] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors resize-y"
          />
        </div>

        {/* Negatives */}
        <div className="p-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-red-400/80 mb-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M3.75 7.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z" />
            </svg>
            Negatives
          </label>
          <textarea
            value={entry.negatives}
            onChange={(e) => onUpdate("negatives", e.target.value)}
            rows={3}
            placeholder="e.g. Lacks strength to re-route receivers (BR)"
            className="w-full rounded-lg border border-[#2a3a4e] bg-[#141e2e] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 transition-colors resize-y"
          />
        </div>
      </div>
    </div>
  );
}
