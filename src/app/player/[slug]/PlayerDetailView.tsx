"use client";

import { useState } from "react";
import Link from "next/link";
import PositionBadge from "@/components/PositionBadge";
import type { PlayerProfile } from "@/lib/types";
import { getPffColorForProfile, getPffColorByValue, getGradeColor, getDraftBuzzGradeColor, parseGradeValue, PLAIN } from "@/lib/colors";

type Tab = "overview" | "scouting";

export default function PlayerDetailView({ profile }: { profile: PlayerProfile }) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const p = profile;

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "scouting", label: "Scouting Reports" },
  ];

  return (
    <div>
      {/* Back link */}
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-orange-400 mb-4 transition-colors">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Board
      </Link>

      {/* Player Header */}
      <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-4 sm:p-6 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{p.name}</h1>
              <PositionBadge position={p.position} />
            </div>
            <p className="text-base sm:text-lg text-gray-400">{p.college}</p>
          </div>
          {p.projected_round && (
            <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 px-5 py-3 text-center">
              <p className="text-xs text-orange-400/70 uppercase tracking-wider">Projected</p>
              <p className="text-xl font-bold text-orange-400">{p.projected_round}</p>
            </div>
          )}
        </div>

        {/* Key stats row */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "Height", value: p.height },
            { label: "Weight", value: p.weight ? `${p.weight} lbs` : null },
            { label: "Age", value: p.age?.toString() },
            { label: "Year", value: p.year },
            { label: "Games", value: p.games?.toString() },
            { label: "Snaps", value: p.snaps?.toLocaleString() },
            { label: "Scheme", value: p.ideal_scheme },
            { label: "Role", value: p.projected_role },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-[#0a0f1a] p-3">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="text-sm font-semibold text-white">{s.value || "TBD"}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Player Comps Row */}
      {Object.keys(p.player_comps).length > 0 && (
        <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] px-5 py-3 mb-2">
          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-6 gap-y-1">
            <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">Comps</span>
            {Object.entries(p.player_comps).map(([source, comp]) => (
              <span key={source} className="text-sm text-gray-300">
                <span className="text-gray-500">{source}:</span> <span className="font-medium text-white">{comp}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Round Projections Row */}
      {Object.keys(p.projected_round_by_source).filter(k => p.projected_round_by_source[k]).length > 0 && (
        <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] px-3 sm:px-5 py-3 mb-4">
          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-6 gap-y-1">
            <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">Round Projections</span>
            {Object.entries(p.projected_round_by_source).filter(([, v]) => v).map(([source, rd]) => (
              <span key={source} className="text-sm text-gray-300">
                <span className="text-gray-500">{source}:</span> <span className="font-medium text-white">{rd}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 rounded-lg bg-[#111827] border border-[#2a3a4e] p-1 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === t.key
                ? "bg-orange-500 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab profile={p} />}
      {activeTab === "scouting" && <ScoutingTab profile={p} />}
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ profile: p }: { profile: PlayerProfile }) {
  return (
    <div className="space-y-6">
      {/* Player Summary */}
      {p.player_summary && (
        <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-5">
          <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">Player Summary</h3>
          <p className="text-sm text-gray-300 leading-relaxed commentary-text">{p.player_summary}</p>
        </div>
      )}

      {/* Strengths / Weaknesses / Accolades */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {p.strengths && (
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-5">
            <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wider mb-3">Strengths</h3>
            <p className="text-sm text-gray-300 commentary-text">{p.strengths}</p>
          </div>
        )}
        {p.weaknesses && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
            <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3">Weaknesses</h3>
            <p className="text-sm text-gray-300 commentary-text">{p.weaknesses}</p>
          </div>
        )}
        {p.accolades && (
          <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-5">
            <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">Accolades</h3>
            <p className="text-sm text-gray-300 commentary-text">{p.accolades}</p>
          </div>
        )}
      </div>

      {/* PFF / Athletic / Overall Rankings / POS Rankings / ADP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-4">
          <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">PFF Scores</h3>
          <div className="space-y-1.5">
            {Object.entries(p.pff_scores).filter(([, v]) => {
              if (!v || v === "TBD") return false;
              if (typeof v === "object" && v !== null && "value" in v) return v.value != null && v.value !== "TBD";
              return true;
            }).sort(([a], [b]) => {
              // Grade keys always come first: 2025 Grade, 2024 Grade, 2023 Grade
              const gradeOrder = ["2025 Grade", "2024 Grade", "2023 Grade", "25 Grade", "24 Grade", "23 Grade", "22 Grade", "21 Grade"];
              const ai = gradeOrder.indexOf(a);
              const bi = gradeOrder.indexOf(b);
              if (ai !== -1 && bi !== -1) return ai - bi;
              if (ai !== -1) return -1;
              if (bi !== -1) return 1;
              return 0;
            }).map(([metric, raw]) => {
              const isObj = typeof raw === "object" && raw !== null && "value" in raw;
              const displayVal = isObj ? (raw as { value: unknown }).value : raw;
              const percentile = isObj ? (raw as { percentile?: number }).percentile : undefined;

              // Color using direction-aware percentile
              // (inverted stats and neutral stats handled automatically)
              let color = PLAIN;
              const num = typeof displayVal === "number" ? displayVal : parseFloat(String(displayVal));
              if (percentile != null && !isNaN(percentile)) {
                color = getPffColorForProfile(metric, percentile);
              } else if (!isNaN(num)) {
                color = getPffColorByValue(metric, num);
              }

              return (
                <div key={metric} className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{metric}</span>
                  <span className={`text-xs font-semibold ${color}`}>
                    {typeof displayVal === "number" ? (Number.isInteger(displayVal) ? displayVal : displayVal.toFixed(1)) : String(displayVal)}
                  </span>
                </div>
              );
            })}
            {Object.keys(p.pff_scores).length === 0 && (
              <p className="text-xs text-gray-600">No PFF scores yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-4">
          <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">Athletic Testing</h3>
          <div className="space-y-1.5">
            {Object.entries(p.athletic_scores)
              .filter(([k]) => !["Result", "Grade"].includes(k))
              .map(([metric, data]) => (
              <div key={metric} className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{metric}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">{data.result || "TBD"}</span>
                  {data.grade && (
                    <span className="text-xs text-gray-500">({data.grade})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Overall Rankings */}
        <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-4">
          <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">Overall Rankings</h3>
          <div className="space-y-1.5">
            {[...p.rankings].sort((a, b) => a.source.localeCompare(b.source)).map((r, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{r.source}</span>
                <span className={`text-xs font-bold ${r.overall_rank && r.overall_rank <= 10 ? "text-green-400" : r.overall_rank && r.overall_rank <= 32 ? "text-yellow-400" : "text-white"}`}>
                  {r.overall_rank != null ? `#${Math.round(r.overall_rank)}` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Positional Rankings */}
        <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-4">
          <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">POS Rankings</h3>
          <div className="space-y-1.5">
            {[...p.rankings].sort((a, b) => a.source.localeCompare(b.source)).map((r, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{r.source}</span>
                <span className="text-xs font-bold text-white">
                  {r.positional_rank && r.positional_rank !== "Unranked" ? `#${r.positional_rank}` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ADP by Source */}
        <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-4">
          <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">ADP</h3>
          <div className="space-y-1.5">
            {Object.entries(p.adp_by_source)
              .filter(([, v]) => v != null)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([source, adp]) => (
              <div key={source} className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{source}</span>
                <span className={`text-xs font-bold ${adp && adp <= 10 ? "text-green-400" : adp && adp <= 32 ? "text-yellow-400" : "text-white"}`}>
                  #{adp}
                </span>
              </div>
            ))}
            {Object.keys(p.adp_by_source).filter(k => p.adp_by_source[k] != null).length === 0 && (
              <p className="text-xs text-gray-600">No ADP data yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Site Ratings / DraftBuzz Grades / Injury History / Snap Alignments */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-4">
          <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">Site Ratings</h3>
          <div className="space-y-1.5">
            {Object.entries(p.site_ratings).filter(([, v]) => v).sort((a, b) => a[0].localeCompare(b[0])).map(([source, grade]) => {
              const num = parseGradeValue(grade);
              const color = num != null ? getGradeColor(source, num) : PLAIN;
              return (
                <div key={source} className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{source}</span>
                  <span className={`text-xs font-semibold ${color}`}>{grade}</span>
                </div>
              );
            })}
            {Object.keys(p.site_ratings).filter(k => p.site_ratings[k]).length === 0 && (
              <p className="text-xs text-gray-600">No ratings yet.</p>
            )}
          </div>
        </div>

        {Object.keys(p.draftbuzz_grades).length > 0 && (
          <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-4">
            <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">DraftBuzz Grades</h3>
            <div className="space-y-1.5">
              {Object.entries(p.draftbuzz_grades).filter(([, v]) => v != null).map(([cat, grade]) => {
                const color = grade != null ? getDraftBuzzGradeColor(grade) : PLAIN;
                return (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{cat}</span>
                    <span className={`text-xs font-semibold ${color}`}>{grade?.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {p.injury_history.length > 0 && (
          <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-4">
            <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">Injury History</h3>
            <div className="space-y-1.5">
              {p.injury_history.map((inj, i) => (
                <div key={i}>
                  <p className="text-xs text-white">{inj.detail}</p>
                  <div className="flex gap-3">
                    {inj.recovery_time && <span className="text-xs text-gray-500">Recovery: {inj.recovery_time}</span>}
                    {inj.year && <span className="text-xs text-gray-500">Year: {inj.year}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {Object.keys(p.alignments).length > 0 && (
          <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-4">
            <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">Snap Alignments</h3>
            <div className="flex items-center justify-between mb-1.5 border-b border-[#2a3a4e] pb-1.5">
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Alignment</span>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider w-10 text-right">2025</span>
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider w-12 text-right">Career</span>
              </div>
            </div>
            <div className="space-y-1.5">
              {Object.entries(p.alignments).sort((a, b) => {
                const olOrder = ["LT", "LG", "C", "RG", "RT"];
                const ai = olOrder.indexOf(a[0]), bi = olOrder.indexOf(b[0]);
                if (ai !== -1 && bi !== -1) return ai - bi;
                if (ai !== -1) return -1;
                if (bi !== -1) return 1;
                return a[0].localeCompare(b[0]);
              }).map(([align, data]) => (
                <div key={align} className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{align}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white w-10 text-right">{data["2025"] ?? "—"}</span>
                    <span className="text-xs text-gray-400 w-12 text-right">{data.career ?? "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Media Links */}
      {p.media_links.length > 0 && (
        <div className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-5">
          <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">Highlights & Media</h3>
          <div className="space-y-2">
            {p.media_links
              .filter((m) => m.url)
              .map((m, i) => (
                <a
                  key={i}
                  href={m.url || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{m.description}</span>
                  {m.source && <span className="text-xs text-gray-500">({m.source})</span>}
                  <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Scouting Tab ────────────────────────────────────────────────────────────

function ScoutingTab({ profile: p }: { profile: PlayerProfile }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const sourcesWithContent = p.commentary.filter(
    (c) => c.sections.length > 0 && c.sections.some((s) => s.text && s.text.trim().length > 0)
  );

  return (
    <div className="space-y-6">

      {/* Skills & Traits */}
      {Object.keys(p.skills_traits).length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-white mb-4">Skills & Traits Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(p.skills_traits).map(([category, data]) => (
              <div key={category} className="rounded-xl border border-[#2a3a4e] bg-[#111827] p-5">
                <h4 className="text-sm font-semibold text-orange-400 mb-3">{category}</h4>
                {data.positives && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-green-400 mb-1">Positives</p>
                    <p className="text-xs text-gray-300 commentary-text">{data.positives}</p>
                  </div>
                )}
                {data.negatives && (
                  <div>
                    <p className="text-xs font-medium text-red-400 mb-1">Negatives</p>
                    <p className="text-xs text-gray-300 commentary-text">{data.negatives}</p>
                  </div>
                )}
                {!data.positives && !data.negatives && (
                  <p className="text-xs text-gray-600">No data yet.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commentary */}
      {sourcesWithContent.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-white mb-4">Commentary</h3>
          <div className="space-y-3">
            {sourcesWithContent.map((source) => {
              const isOpen = expanded === source.source;
              return (
                <div key={source.source} className="rounded-xl border border-[#2a3a4e] bg-[#111827] overflow-hidden">
                  <button
                    onClick={() => setExpanded(isOpen ? null : source.source)}
                    className="w-full flex items-center justify-between p-5 text-left hover:bg-[#1a2332] transition-colors"
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-white">{source.source}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {source.sections.length} section{source.sections.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <svg
                      className={`h-5 w-5 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isOpen && (
                    <div className="border-t border-[#2a3a4e] p-5 space-y-4">
                      {source.sections.map((section, i) => (
                        <div key={i}>
                          {section.title && (
                            <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2">
                              {section.title}
                            </h4>
                          )}
                          <p className="text-sm text-gray-300 commentary-text leading-relaxed">
                            {section.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
