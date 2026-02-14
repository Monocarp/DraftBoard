"use client";

import { useState } from "react";
import BoardTable from "@/components/BoardTable";
import ExpandedBoardTable from "@/components/ExpandedBoardTable";
import type { BigBoard } from "@/lib/types";

export default function BigBoardPage({ board, profileCount }: { board: BigBoard; profileCount: number }) {
  const [activeTab, setActiveTab] = useState<"consensus" | "bengals" | "expanded">("consensus");

  return (
    <div className="flex flex-col items-center w-full">
      {/* Header */}
      <div className="mb-6 w-full max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white">2026 NFL Draft Board</h1>
        <p className="mt-1 text-gray-400">
          Comprehensive big board aggregating rankings from 15+ sources.
        </p>
      </div>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-3xl mx-auto">
        {[
          { label: "Consensus Board", value: board.consensus.length },
          { label: "Bengals Board", value: board.bengals.length },
          { label: "Expanded Board", value: board.expanded.length },
          { label: "Player Profiles", value: profileCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-4"
          >
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Board tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-[#111827] border border-[#2a3a4e] p-1 w-fit mx-auto">
        <button
          onClick={() => setActiveTab("consensus")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "consensus"
              ? "bg-orange-500 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Consensus Board
        </button>
        <button
          onClick={() => setActiveTab("bengals")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "bengals"
              ? "bg-orange-500 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Bengals Board
        </button>
        <button
          onClick={() => setActiveTab("expanded")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "expanded"
              ? "bg-orange-500 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Expanded Board
        </button>
      </div>

      <div className="w-full max-w-4xl mx-auto">
        {activeTab === "consensus" ? (
          <BoardTable
            players={board.consensus}
            title="Consensus Big Board"
          />
        ) : activeTab === "bengals" ? (
          <BoardTable
            players={board.bengals}
            title="Bengals Big Board"
          />
        ) : (
          <ExpandedBoardTable
            players={board.expanded}
            title="Expanded Big Board"
          />
        )}
      </div>
    </div>
  );
}
