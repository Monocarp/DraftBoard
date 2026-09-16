"use client";

import { useState } from "react";
import { EpisodesTab } from "./EpisodesTab";
import { ReviewTab } from "./ReviewTab";
import { ReconcileTab } from "./ReconcileTab";

type Tab = "episodes" | "review" | "reconcile";

export function PodcastsManager() {
  const [tab, setTab] = useState<Tab>("episodes");

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-[#2a3a4e]">
        {(
          [
            { id: "episodes", label: "Episodes" },
            { id: "review", label: "Review & Publish" },
            { id: "reconcile", label: "Reconcile Unmatched" },
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

      {tab === "episodes" && <EpisodesTab onGoToReview={() => setTab("review")} />}
      {tab === "review" && <ReviewTab />}
      {tab === "reconcile" && <ReconcileTab />}
    </div>
  );
}
