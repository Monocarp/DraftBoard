"use client";

import { useState } from "react";
import Link from "next/link";
import BoardTable from "@/components/BoardTable";
import ExpandedBoardTable from "@/components/ExpandedBoardTable";
import UserBoardEditor from "@/components/UserBoardEditor";
import type { BigBoard, BoardPlayer } from "@/lib/types";

type TabKey = "consensus" | "bengals" | "expanded" | "myboard";

export default function BigBoardPage({
  board,
  profileCount,
  userBoard,
  isLoggedIn,
}: {
  board: BigBoard;
  profileCount: number;
  userBoard?: BoardPlayer[] | null;
  isLoggedIn?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("bengals");

  const showMyBoard = isLoggedIn && userBoard != null;

  return (
    <div className="flex flex-col items-center w-full">
      {/* Header */}
      <div className="mb-4 sm:mb-6 w-full max-w-3xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">2026 NFL Draft Board</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-400">
          Comprehensive big board aggregating rankings from 15+ sources.
        </p>
      </div>

      {/* Stats row */}
      <div className="mb-4 sm:mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 w-full max-w-3xl mx-auto">
        {[
          { label: "Consensus Board", value: board.consensus.length },
          { label: "Bengals Board", value: board.bengals.length },
          { label: "Expanded Board", value: board.expanded.length },
          { label: "Player Profiles", value: profileCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-3 sm:p-4"
          >
            <p className="text-xl sm:text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Board tabs */}
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-[#111827] border border-[#2a3a4e] p-1 w-fit mx-auto">
        {(["consensus", "bengals", "expanded"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`rounded-md px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === key
                ? "bg-orange-500 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}
            <span className="hidden sm:inline"> Board</span>
          </button>
        ))}

        {/* My Board tab (logged in) */}
        {showMyBoard && (
          <button
            onClick={() => setActiveTab("myboard")}
            className={`rounded-md px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === "myboard"
                ? "bg-blue-500 text-white"
                : "text-blue-400/60 hover:text-blue-400"
            }`}
          >
            My Board
            <span className="ml-1.5 text-xs opacity-70">({userBoard?.length ?? 0})</span>
          </button>
        )}

        {/* Sign in prompt (not logged in) */}
        {!isLoggedIn && (
          <Link
            href="/login"
            className="rounded-md px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-gray-500 hover:text-blue-400 transition-colors flex items-center gap-1"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            My Board
          </Link>
        )}
      </div>

      <div className="w-full max-w-4xl mx-auto">
        {activeTab === "consensus" ? (
          <BoardTable players={board.consensus} title="Consensus Big Board" />
        ) : activeTab === "bengals" ? (
          <BoardTable players={board.bengals} title="Bengals Big Board" />
        ) : activeTab === "expanded" ? (
          <ExpandedBoardTable players={board.expanded} title="Expanded Big Board" />
        ) : activeTab === "myboard" && userBoard ? (
          <UserBoardEditor initialPlayers={userBoard} />
        ) : null}
      </div>
    </div>
  );
}
