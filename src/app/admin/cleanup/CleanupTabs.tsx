"use client";

import { useState } from "react";
import { CleanupManager } from "./CleanupManager";
import { SchoolAuditTab } from "./SchoolAuditTab";
import { DuplicatePlayersTab } from "./DuplicatePlayersTab";

type Tab = "incomplete" | "schools" | "duplicates";

export function CleanupTabs() {
  const [tab, setTab] = useState<Tab>("incomplete");

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-[#2a3a4e]">
        {(
          [
            { id: "incomplete", label: "Incomplete Players" },
            { id: "schools", label: "School Names" },
            { id: "duplicates", label: "Duplicate Players" },
          ] as { id: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-orange-500 text-white"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "incomplete" && <CleanupManager />}
      {tab === "schools" && <SchoolAuditTab />}
      {tab === "duplicates" && <DuplicatePlayersTab />}
    </div>
  );
}
