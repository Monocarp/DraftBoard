"use client";

import { useState } from "react";
import { SortableBoardEditor, type BoardEntry } from "../SortableBoardEditor";
import {
  reorderPositionBoard,
  addPlayerToPositionBoard,
  removePlayerFromPositionBoard,
} from "../actions";

export function PositionBoardEditor({
  groups,
  groupOrder,
}: {
  groups: Record<string, BoardEntry[]>;
  groupOrder: string[];
}) {
  const [activeGroup, setActiveGroup] = useState(groupOrder[0] ?? "QB");

  return (
    <div>
      {/* Group tabs */}
      <div className="flex flex-wrap gap-1 mb-6 rounded-lg border border-[#2a3a4e] bg-[#0d1320] p-1 w-fit">
        {groupOrder.map((group) => (
          <button
            key={group}
            onClick={() => setActiveGroup(group)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeGroup === group
                ? "bg-orange-500/20 text-orange-400"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {group}
            <span className="ml-1 text-xs text-gray-600">{groups[group]?.length ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Board editor per group */}
      {groupOrder.map((group) => (
        <div key={group} className={activeGroup === group ? "" : "hidden"}>
          <SortableBoardEditor
            initialEntries={groups[group] ?? []}
            boardLabel={group}
            onReorder={(ids) => reorderPositionBoard(group, ids)}
            onAdd={(slug) => addPlayerToPositionBoard(group, slug)}
            onRemove={(id) => removePlayerFromPositionBoard(id)}
          />
        </div>
      ))}
    </div>
  );
}
