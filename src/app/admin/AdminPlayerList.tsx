"use client";

import Link from "next/link";
import { useState } from "react";
import { createProfile } from "./player/actions";

interface AdminPlayer {
  id: string;
  name: string;
  slug: string;
  position: string | null;
  college: string | null;
  year: string | null;
  projected_round: string | null;
  hasProfile: boolean;
}

export function AdminPlayerList({ players }: { players: AdminPlayer[] }) {
  const [search, setSearch] = useState("");
  const [filterProfile, setFilterProfile] = useState<"all" | "with" | "without">("all");
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const filtered = players.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.college && p.college.toLowerCase().includes(search.toLowerCase())) ||
      (p.position && p.position.toLowerCase().includes(search.toLowerCase()));

    const matchesFilter =
      filterProfile === "all" ||
      (filterProfile === "with" && p.hasProfile) ||
      (filterProfile === "without" && !p.hasProfile);

    return matchesSearch && matchesFilter;
  });

  return (
    <div>
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search players by name, school, or position…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#2a3a4e] bg-[#0d1320] pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
          />
        </div>

        <div className="flex gap-1 rounded-lg border border-[#2a3a4e] bg-[#0d1320] p-1">
          {(["all", "with", "without"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterProfile(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterProfile === f
                  ? "bg-orange-500/20 text-orange-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {f === "all" ? "All" : f === "with" ? "Has Profile" : "No Profile"}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-500 mb-3">
        {filtered.length} player{filtered.length !== 1 ? "s" : ""} shown
      </p>

      {/* Player Table */}
      <div className="rounded-xl border border-[#2a3a4e] bg-[#1a2332] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a3a4e] text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3">Pos</th>
                <th className="px-4 py-3 hidden sm:table-cell">School</th>
                <th className="px-4 py-3 hidden md:table-cell">Year</th>
                <th className="px-4 py-3 hidden md:table-cell">Proj Rd</th>
                <th className="px-4 py-3">Profile</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3a4e]">
              {filtered.map((p) => (
                <tr key={p.id} className="board-row">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/player/${p.slug}`}
                      className="font-medium text-white hover:text-orange-400 transition-colors"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{p.position ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">
                    {p.college ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 hidden md:table-cell">
                    {p.year ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 hidden md:table-cell">
                    {p.projected_round ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {p.hasProfile ? (
                      <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400 border border-green-500/30">
                        ✓
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-500/10 px-2 py-0.5 text-xs text-gray-500 border border-gray-500/30">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!p.hasProfile && (
                        <button
                          onClick={async () => {
                            setCreatingId(p.id);
                            const result = await createProfile(p.id);
                            if (result?.error) {
                              alert(result.error);
                            } else {
                              window.location.reload();
                            }
                            setCreatingId(null);
                          }}
                          disabled={creatingId === p.id}
                          className="rounded-md bg-orange-500/10 border border-orange-500/30 px-3 py-1 text-xs text-orange-400 hover:bg-orange-500/20 hover:border-orange-500/50 disabled:opacity-50 transition-colors"
                        >
                          {creatingId === p.id ? "…" : "+ Profile"}
                        </button>
                      )}
                      <Link
                        href={`/admin/player/${p.slug}`}
                        className="rounded-md border border-[#2a3a4e] px-3 py-1 text-xs text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                      >
                        Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-gray-500">
            No players found matching your search.
          </div>
        )}
      </div>
    </div>
  );
}
