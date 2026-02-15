"use client";

import { useState } from "react";
import { SortableBoardEditor, type BoardEntry } from "./SortableBoardEditor";
import { reorderBoard, addPlayerToBoard, removePlayerFromBoard } from "./actions";

const TABS = [
  { key: "consensus", label: "Consensus" },
  { key: "bengals", label: "Bengals" },
  { key: "expanded", label: "Expanded" },
] as const;

type BoardType = (typeof TABS)[number]["key"];

export function BigBoardEditor({
  boards,
}: {
  boards: Record<BoardType, BoardEntry[]>;
}) {
  const [activeTab, setActiveTab] = useState<BoardType>("consensus");

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 rounded-lg border border-[#2a3a4e] bg-[#0d1320] p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-orange-500/20 text-orange-400"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-gray-600">{boards[tab.key].length}</span>
          </button>
        ))}
      </div>

      {/* Board editor per tab */}
      {TABS.map((tab) => (
        <div key={tab.key} className={activeTab === tab.key ? "" : "hidden"}>
          <SortableBoardEditor
            initialEntries={boards[tab.key]}
            boardLabel={`${tab.label} Board`}
            onReorder={(ids) => reorderBoard(tab.key, ids)}
            onAdd={(slug) => addPlayerToBoard(tab.key, slug)}
            onRemove={(id) => removePlayerFromBoard(id)}
          />
        </div>
      ))}
    </div>
  );
}
