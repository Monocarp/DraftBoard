"use client";

import { useState, useCallback, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { importData, deleteSourceData, getExistingSources } from "./actions";
import type { DataType, ColumnMapping, UploadResult } from "./actions";

// ─── Data Type Config ───────────────────────────────────────────────────────

interface DataTypeConfig {
  label: string;
  description: string;
  requiredColumns: { key: string; label: string; required: boolean }[];
  needsSource: boolean;
}

const DATA_TYPES_UNSORTED: Record<DataType, DataTypeConfig> = {
  rankings: {
    label: "Overall Rankings",
    description: "Per-source overall player rankings (e.g. NFL.com #1, PFF #3). Optionally include position rank to import both at once. Can also import bio data (height, weight, age, year) with a priority weight.",
    requiredColumns: [
      { key: "player_name", label: "Player Name", required: true },
      { key: "rank", label: "Rank", required: true },
      { key: "position_rank", label: "Position Rank", required: false },
      { key: "position", label: "Position", required: false },
      { key: "college", label: "College", required: false },
      { key: "height", label: "Height", required: false },
      { key: "weight", label: "Weight", required: false },
      { key: "age", label: "Age", required: false },
      { key: "year", label: "Year / Eligibility", required: false },
    ],
    needsSource: true,
  },
  positional_rankings: {
    label: "Positional Rankings",
    description: "Per-source positional rankings (e.g. PFF WR #1, CBS WR #2)",
    requiredColumns: [
      { key: "player_name", label: "Player Name", required: true },
      { key: "rank", label: "Rank", required: true },
      { key: "position", label: "Position", required: false },
      { key: "college", label: "College", required: false },
    ],
    needsSource: true,
  },
  adp: {
    label: "Average Draft Position (ADP)",
    description: "ADP values by source",
    requiredColumns: [
      { key: "player_name", label: "Player Name", required: true },
      { key: "adp_value", label: "ADP Value", required: true },
      { key: "position", label: "Position", required: false },
      { key: "college", label: "College", required: false },
    ],
    needsSource: true,
  },
  mocks: {
    label: "Mock Drafts",
    description: "Full mock draft (replaces existing mock for this source)",
    requiredColumns: [
      { key: "pick_number", label: "Pick Number", required: true },
      { key: "team", label: "Team", required: true },
      { key: "player_name", label: "Player Name", required: true },
      { key: "position", label: "Position", required: false },
      { key: "college", label: "College", required: false },
    ],
    needsSource: true,
  },
  source_dates: {
    label: "Source Dates",
    description: "When ranking/mock sources were last updated",
    requiredColumns: [
      { key: "source", label: "Source Name", required: true },
      { key: "source_type", label: "Type (ranking/mock)", required: true },
      { key: "date", label: "Date", required: true },
    ],
    needsSource: false,
  },
  pff_scores: {
    label: "PFF Scores + Alignments",
    description: "PFF_Stats sheet — auto-detects position, computes percentiles, imports alignments & overview. Column B must be position.",
    requiredColumns: [
      { key: "player_name", label: "Player Name", required: true },
      { key: "position", label: "Position (Column B)", required: true },
    ],
    needsSource: false,
  },
  draftbuzz_grades: {
    label: "DraftBuzz Grades",
    description: "DraftBuzz position sheet (DB CB, DB DL, etc.). Set Source to the position group (e.g. CB, DL, LB, OL, QB, RB, SAF, TE, WR).",
    requiredColumns: [
      { key: "player_name", label: "Player Name", required: true },
    ],
    needsSource: true,
  },
  athletic_scores: {
    label: "Athletic Scores (RAS Data)",
    description: "RAS / Combine data — height, weight, speed, agility, explosiveness scores",
    requiredColumns: [
      { key: "player_name", label: "Player Name", required: true },
      { key: "position", label: "Position", required: false },
    ],
    needsSource: false,
  },
  site_ratings: {
    label: "Site Ratings (Grades)",
    description: "Grades sheet — NFL.com, ESPN, Gridiron, Bleacher ratings per player",
    requiredColumns: [
      { key: "player_name", label: "Player Name", required: true },
      { key: "position", label: "Position", required: false },
      { key: "college", label: "College/School", required: false },
    ],
    needsSource: false,
  },
  nfl_profiles: {
    label: "NFL.com Profiles",
    description: "NFL.com prospect profiles — imports rankings, grades, scouting reports, comps, and eligibility in one shot",
    requiredColumns: [
      { key: "player_name", label: "Player Name", required: true },
      { key: "position", label: "Position", required: false },
      { key: "school", label: "School", required: false },
      { key: "rank", label: "Rank", required: false },
      { key: "pos_rank", label: "Pos Rank", required: false },
      { key: "prospect_grade", label: "Prospect Grade", required: false },
      { key: "prospect_grade_indicator", label: "Grade Indicator", required: false },
      { key: "overview", label: "Overview", required: false },
      { key: "strengths", label: "Strengths", required: false },
      { key: "weaknesses", label: "Weaknesses", required: false },
      { key: "sources_tell_us", label: "Sources Tell Us", required: false },
      { key: "nfl_comparison", label: "NFL Comparison", required: false },
      { key: "eligibility", label: "Eligibility", required: false },
    ],
    needsSource: false,
  },
  bleacher_profiles: {
    label: "Bleacher Report Profiles",
    description: "Bleacher Report prospect profiles — rankings, grades, round projections, pro comps, and scouting commentary",
    requiredColumns: [
      { key: "player_name", label: "Player Name", required: true },
      { key: "overall_rank", label: "Overall Rank", required: false },
      { key: "grade", label: "Grade", required: false },
      { key: "pro_comparison", label: "Pro Comparison", required: false },
      { key: "projected_round", label: "Projected Round", required: false },
      { key: "overall", label: "Overall (Overview text)", required: false },
      { key: "positives", label: "Positives", required: false },
      { key: "negatives", label: "Negatives", required: false },
    ],
    needsSource: false,
  },
  espn_profiles: {
    label: "ESPN Profiles",
    description: "ESPN prospect profiles — overall rank, position rank, grade, and scouting analysis in one shot",
    requiredColumns: [
      { key: "player_name", label: "Player Name", required: true },
      { key: "rank", label: "Rank", required: false },
      { key: "pos_rank", label: "Pos Rank", required: false },
      { key: "grade", label: "Grade", required: false },
      { key: "position", label: "Position", required: false },
      { key: "school", label: "School", required: false },
      { key: "analysis", label: "Analysis", required: false },
    ],
    needsSource: false,
  },
  tdn_profiles: {
    label: "The Draft Network Profiles",
    description: "TDN prospect profiles — rankings, pos ranks, projected round, summary, strengths, and concerns",
    requiredColumns: [
      { key: "player_name", label: "Player Name", required: true },
      { key: "rank", label: "Rank", required: false },
      { key: "pos_rank", label: "Pos Rank", required: false },
      { key: "projected_round", label: "Projected Round", required: false },
      { key: "position", label: "Position", required: false },
      { key: "school", label: "School", required: false },
      { key: "summary", label: "Summary", required: false },
      { key: "strengths", label: "Strengths", required: false },
      { key: "concerns", label: "Concerns", required: false },
    ],
    needsSource: false,
  },
};

// Sort upload options alphabetically by label
const DATA_TYPES = DATA_TYPES_UNSORTED;
const DATA_TYPE_ENTRIES = (Object.entries(DATA_TYPES) as [DataType, DataTypeConfig][])
  .sort((a, b) => a[1].label.localeCompare(b[1].label));

// ─── Step Enum ──────────────────────────────────────────────────────────────

type Step = "select-type" | "upload-file" | "map-columns" | "preview" | "importing" | "done";

// ─── Component ──────────────────────────────────────────────────────────────

export function UploadManager() {
  const [step, setStep] = useState<Step>("select-type");
  const [dataType, setDataType] = useState<DataType>("rankings");
  const [sourceName, setSourceName] = useState("");
  const [existingSources, setExistingSources] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  const [bioPriority, setBioPriority] = useState<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = DATA_TYPES[dataType];

  // Load existing sources when data type changes
  const loadSources = useCallback(async (dt: DataType) => {
    try {
      const sources = await getExistingSources(dt);
      setExistingSources(sources);
    } catch { setExistingSources([]); }
  }, []);

  // ─── Step 1: Select data type ───────────────────────────────────────────

  const handleTypeSelect = async (dt: DataType) => {
    setDataType(dt);
    setStep("upload-file");
    setSourceName("");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setResult(null);
    setError("");
    setBioPriority(undefined);
    await loadSources(dt);
  };

  // ─── Step 2: Parse file ─────────────────────────────────────────────────

  const parseFile = useCallback((file: File) => {
    setFileName(file.name);
    setError("");

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv" || ext === "tsv" || ext === "txt") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            setError(`Parse errors: ${results.errors.map((e) => e.message).join(", ")}`);
            return;
          }
          const headers = results.meta.fields || [];
          const rows = results.data as Record<string, string>[];
          setCsvHeaders(headers);
          setCsvRows(rows);
          autoMap(headers);
          setStep("map-columns");
        },
        error: (err) => setError(`Parse error: ${err.message}`),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
          if (jsonData.length === 0) {
            setError("No data found in the Excel file.");
            return;
          }
          const headers = Object.keys(jsonData[0]);
          // Convert all values to strings
          const rows = jsonData.map((row) => {
            const cleaned: Record<string, string> = {};
            for (const key of headers) {
              cleaned[key] = String(row[key] ?? "");
            }
            return cleaned;
          });
          setCsvHeaders(headers);
          setCsvRows(rows);
          autoMap(headers);
          setStep("map-columns");
        } catch (err) {
          setError(`Excel parse error: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setError("Unsupported file format. Please upload a .csv, .tsv, .xlsx, or .xls file.");
    }
  }, []);

  // Auto-map columns by fuzzy name matching
  const autoMap = (headers: string[]) => {
    const newMapping: ColumnMapping = {};
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

    for (const col of config.requiredColumns) {
      const colNorm = normalize(col.key);
      const labelNorm = normalize(col.label);

      // Try exact match first, then fuzzy
      const match = headers.find((h) => {
        const hNorm = normalize(h);
        return hNorm === colNorm
          || hNorm === labelNorm
          || hNorm.includes(colNorm)
          || colNorm.includes(hNorm)
          || hNorm.includes(labelNorm);
      });

      if (match) {
        newMapping[col.key] = match;
      }
    }

    setMapping(newMapping);
  };

  // ─── Step 3: Column Mapping ─────────────────────────────────────────────

  const handleMappingChange = (dbCol: string, csvCol: string) => {
    setMapping((prev) => ({ ...prev, [dbCol]: csvCol }));
  };

  const canProceed = () => {
    const requiredKeys = config.requiredColumns.filter((c) => c.required).map((c) => c.key);
    return requiredKeys.every((key) => mapping[key] && mapping[key] !== "");
  };

  // ─── Step 4: Preview + Import ───────────────────────────────────────────

  const handleImport = async () => {
    if (config.needsSource && !sourceName.trim()) {
      setError("Please enter a source name.");
      return;
    }

    setImporting(true);
    setError("");

    try {
      const res = await importData(dataType, csvRows, mapping, sourceName.trim(), bioPriority);
      setResult(res);
      setStep("done");
    } catch (err) {
      setError(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  };

  // ─── Delete source ─────────────────────────────────────────────────────

  const handleDeleteSource = async (src: string) => {
    try {
      const res = await deleteSourceData(dataType, src);
      if (res.success) {
        setDeleteResult(`Deleted ${res.deleted} entries for "${src}".`);
        setDeleteConfirm(null);
        await loadSources(dataType);
      } else {
        setDeleteResult(`Error: ${res.error}`);
      }
    } catch (err) {
      setDeleteResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ─── Reset ──────────────────────────────────────────────────────────────

  const reset = () => {
    setStep("select-type");
    setSourceName("");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setResult(null);
    setError("");
    setFileName("");
    setDeleteConfirm(null);
    setDeleteResult(null);
    setBioPriority(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {(["select-type", "upload-file", "map-columns", "preview", "done"] as Step[]).map((s, i) => {
          const labels = ["Select Type", "Upload File", "Map Columns", "Preview & Import", "Done"];
          const stepOrder = ["select-type", "upload-file", "map-columns", "preview", "done"];
          const currentIdx = stepOrder.indexOf(step === "importing" ? "preview" : step);
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-[#2a3a4e]" />}
              <span
                className={`px-2.5 py-1 rounded-full ${
                  isActive
                    ? "bg-orange-500/20 text-orange-400 font-medium"
                    : isDone
                      ? "bg-green-500/20 text-green-400"
                      : "bg-[#1a2535] text-gray-600"
                }`}
              >
                {isDone ? "✓" : i + 1}. {labels[i]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ──────── STEP 1: Select Data Type ──────── */}
      {step === "select-type" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {DATA_TYPE_ENTRIES.map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => handleTypeSelect(key)}
              className="text-left rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-5 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all group"
            >
              <div className="font-medium text-white group-hover:text-orange-400 transition-colors">
                {cfg.label}
              </div>
              <div className="mt-1 text-xs text-gray-500">{cfg.description}</div>
              <div className="mt-3 flex flex-wrap gap-1">
                {cfg.requiredColumns.filter((c) => c.required).map((c) => (
                  <span key={c.key} className="px-2 py-0.5 rounded bg-[#1a2535] text-xs text-gray-400">
                    {c.label}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ──────── STEP 2: Upload File ──────── */}
      {step === "upload-file" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-6">
            <h2 className="text-lg font-semibold text-white mb-1">{config.label}</h2>
            <p className="text-sm text-gray-400 mb-4">{config.description}</p>

            {/* Source name input */}
            {config.needsSource && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Source Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="e.g. PFF, NFL.com, CBS, ESPN"
                  className="w-full sm:w-80 rounded-lg border border-[#2a3a4e] bg-[#1a2535] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-600">
                  This identifies where the data came from. Use the same name for updates.
                </p>
              </div>
            )}

            {/* Bio Data Priority (rankings only) */}
            {dataType === "rankings" && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Bio Data Priority <span className="text-gray-600">(optional)</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  If this source includes height, weight, age, or year, set its priority for resolving conflicts.
                  Higher = more trusted. Existing defaults: DraftBuzz (1), NFL.com (2), Site Ratings (3), PFF (4).
                </p>
                <select
                  value={bioPriority ?? ""}
                  onChange={(e) => setBioPriority(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                  className="w-full sm:w-48 rounded-lg border border-[#2a3a4e] bg-[#1a2535] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                >
                  <option value="">— No bio data —</option>
                  <option value="1">1 – Low</option>
                  <option value="2">2</option>
                  <option value="3">3 – Medium</option>
                  <option value="4">4</option>
                  <option value="5">5 – High</option>
                  <option value="6">6</option>
                  <option value="7">7 – Very High</option>
                  <option value="8">8</option>
                  <option value="9">9</option>
                  <option value="10">10 – Highest</option>
                </select>
              </div>
            )}

            {/* File upload */}
            <div
              className="relative rounded-xl border-2 border-dashed border-[#2a3a4e] bg-[#0a0f1a] p-8 text-center hover:border-orange-500/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file) parseFile(file);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) parseFile(file);
                }}
              />
              <div className="text-4xl mb-2">📁</div>
              <div className="text-sm text-gray-400">
                <span className="text-orange-400 font-medium">Click to browse</span> or drag & drop
              </div>
              <div className="mt-1 text-xs text-gray-600">
                Supports .csv, .tsv, .xlsx, .xls
              </div>
            </div>

            {/* Required columns hint */}
            <div className="mt-4">
              <p className="text-xs text-gray-500 mb-2">Expected columns:</p>
              <div className="flex flex-wrap gap-1.5">
                {config.requiredColumns.map((c) => (
                  <span
                    key={c.key}
                    className={`px-2 py-0.5 rounded text-xs ${
                      c.required
                        ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                        : "bg-[#1a2535] text-gray-500"
                    }`}
                  >
                    {c.label} {c.required && "*"}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Existing sources for this data type */}
          {existingSources.length > 0 && (
            <div className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-6">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Existing Sources</h3>
              {deleteResult && (
                <div className="mb-3 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400">
                  {deleteResult}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {existingSources.map((src) => (
                  <div key={src} className="flex items-center gap-1.5 rounded-lg bg-[#1a2535] px-3 py-1.5">
                    <span className="text-sm text-gray-300">{src}</span>
                    {deleteConfirm === src ? (
                      <div className="flex items-center gap-1 ml-1">
                        <button
                          onClick={() => handleDeleteSource(src)}
                          className="text-xs text-red-400 hover:text-red-300 font-medium"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="text-xs text-gray-500 hover:text-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setDeleteConfirm(src); setDeleteResult(null); }}
                        className="text-gray-600 hover:text-red-400 transition-colors ml-1"
                        title={`Delete all ${config.label} from ${src}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={reset}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Back to type selection
          </button>
        </div>
      )}

      {/* ──────── STEP 3: Map Columns ──────── */}
      {step === "map-columns" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Map Columns</h2>
            <p className="text-sm text-gray-400 mb-4">
              File: <span className="text-white font-medium">{fileName}</span> — {csvRows.length} rows, {csvHeaders.length} columns
            </p>

            <div className="space-y-3">
              {config.requiredColumns.map((col) => (
                <div key={col.key} className="flex items-center gap-4">
                  <label className="w-40 text-sm text-gray-300 shrink-0">
                    {col.label}
                    {col.required && <span className="text-red-400 ml-1">*</span>}
                  </label>
                  <select
                    value={mapping[col.key] || ""}
                    onChange={(e) => handleMappingChange(col.key, e.target.value)}
                    className="flex-1 max-w-xs rounded-lg border border-[#2a3a4e] bg-[#1a2535] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                  >
                    <option value="">— Select column —</option>
                    {csvHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  {mapping[col.key] && (
                    <span className="text-xs text-green-400">✓</span>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => setStep("preview")}
                disabled={!canProceed()}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Preview Import →
              </button>
              <button
                onClick={() => { setStep("upload-file"); setCsvHeaders([]); setCsvRows([]); setMapping({}); }}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                ← Change file
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────── STEP 4: Preview ──────── */}
      {(step === "preview" || step === "importing") && (() => {
        // For PFF/DraftBuzz, show extra sample metric columns in preview
        const PFF_SAMPLE_COLS = ["25 Grade", "24 Grade", "23 Grade", "Coverage Grade", "Pass Rush Grade", "Passing Grade", "Receiving Grade", "Rushing Grade", "Run Block Grade", "Pass Block Grade", "Age", "Round Projection"];
        const extraPreviewCols = (dataType === "pff_scores")
          ? PFF_SAMPLE_COLS.filter((c) => csvHeaders.includes(c))
          : [];

        // Count how many known PFF metric columns are present
        const ALL_PFF_METRIC_COLS = [
          "25 Grade", "24 Grade", "23 Grade", "Coverage Grade", "Run Def Grade",
          "Completion % Allowed", "Forced Incom.", "Forced Incom. Rate", "Dropped Picks",
          "Coverage Stops", "Missed Tackles", "Missed Tackle Rate", "Passer Rating Against",
          "Interceptions", "Man Coverage", "Zone Coverage", "Tackling Grade", "Man %", "Zone %",
          "Pass Rush Grade", "True Pass Rush", "PR Win Rate", "Run Stop %", "Sacks", "Hits",
          "Hurries", "Batted Balls", "Forced Fumbles", "Tackling Grade2", "Missed Tackle Rate2",
          "Total Pressures", "Passing Grade", "Intermediate Passing Grade", "Deep Passing Grade",
          "No Pressure Grade", "Pressure Grade", "Adjusted Comp %", "Passing Average Depth of Target",
          "Big Time Throw", "TO Worthy Plays", "Receiving Grade", "Yards/ Routes Run", "Drop %",
          "CCR", "Grade vs Man", "YAC/Reception", "Rushing Grade", "Run Block Grade", "Pass Block Grade",
          "Age", "Summary", "Pros", "Cons", "Player Comp", "Bottom Line", "Round Projection",
        ];
        const ALL_PFF_ALIGN_COLS = [
          "Coverage D-Line Allignment", "Coverage Slot Allignment", "Coverage Corner Allignment",
          "Coverage Box Allignment", "Coverage Deep Allignment",
          "Dline A Gap Allignment", "Dline B Gap Allignment", "Dline Over Tackle Allignment",
          "Dline Outside Tackle Allignment", "Dline Off Ball Allignment",
          "LT Snaps", "LG Snaps", "C Snaps", "RG Snaps", "RT Snaps",
          "Slot Snaps", "Wide Snaps", "Inline Snaps",
        ];
        const matchedMetrics = (dataType === "pff_scores") ? ALL_PFF_METRIC_COLS.filter((c) => csvHeaders.includes(c)).length : 0;
        const matchedAligns = (dataType === "pff_scores") ? ALL_PFF_ALIGN_COLS.filter((c) => csvHeaders.includes(c)).length : 0;

        return (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#2a3a4e] bg-[#0d1320] p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Preview Import</h2>
            <p className="text-sm text-gray-400 mb-4">
              {config.label} — Source: <span className="text-white font-medium">{sourceName || "(none)"}</span> — {csvRows.length} rows
            </p>

            {/* PFF: Show detected column stats */}
            {dataType === "pff_scores" && (
              <div className="mb-4 rounded-lg border border-[#2a3a4e] bg-[#1a2535] p-4">
                <h3 className="text-sm font-semibold text-white mb-2">Detected PFF Columns</h3>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-gray-400">Total columns: </span>
                    <span className="text-white font-medium">{csvHeaders.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Metric columns matched: </span>
                    <span className={`font-medium ${matchedMetrics > 0 ? "text-green-400" : "text-red-400"}`}>{matchedMetrics} / {ALL_PFF_METRIC_COLS.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Alignment columns matched: </span>
                    <span className={`font-medium ${matchedAligns > 0 ? "text-green-400" : "text-red-400"}`}>{matchedAligns} / {ALL_PFF_ALIGN_COLS.length}</span>
                  </div>
                </div>
                {matchedMetrics === 0 && (
                  <p className="mt-2 text-xs text-red-400">Warning: No PFF metric columns were detected. Check that your column headers match the expected PFF format.</p>
                )}
              </div>
            )}

            {/* Preview table */}
            <div className="overflow-x-auto rounded-lg border border-[#2a3a4e]">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-[#1a2535] border-b border-[#2a3a4e]">
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">#</th>
                    {config.requiredColumns.map((col) => (
                      mapping[col.key] && (
                        <th key={col.key} className="px-3 py-2 text-left text-xs font-medium text-gray-400">
                          {col.label}
                        </th>
                      )
                    ))}
                    {extraPreviewCols.map((col) => (
                      <th key={col} className="px-3 py-2 text-left text-xs font-medium text-blue-400">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-[#2a3a4e]/50 hover:bg-[#1a2535]/50">
                      <td className="px-3 py-1.5 text-gray-600">{i + 1}</td>
                      {config.requiredColumns.map((col) => (
                        mapping[col.key] && (
                          <td key={col.key} className="px-3 py-1.5 text-gray-300">
                            {row[mapping[col.key]] || <span className="text-gray-600">—</span>}
                          </td>
                        )
                      ))}
                      {extraPreviewCols.map((col) => (
                        <td key={col} className="px-3 py-1.5 text-blue-300">
                          {row[col] || <span className="text-gray-600">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {csvRows.length > 20 && (
              <p className="mt-2 text-xs text-gray-600">
                Showing 20 of {csvRows.length} rows
              </p>
            )}

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={handleImport}
                disabled={importing}
                className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {importing ? (
                  <>
                    <span className="animate-spin">⏳</span> Importing...
                  </>
                ) : (
                  <>🚀 Import {csvRows.length} Rows</>
                )}
              </button>
              <button
                onClick={() => setStep("map-columns")}
                disabled={importing}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
              >
                ← Edit Mapping
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ──────── STEP 5: Done ──────── */}
      {step === "done" && result && (
        <div className="space-y-4">
          <div className={`rounded-xl border p-6 ${
            result.errors.length === 0
              ? "border-green-500/30 bg-green-500/5"
              : "border-yellow-500/30 bg-yellow-500/5"
          }`}>
            <h2 className="text-lg font-semibold text-white mb-4">
              {result.errors.length === 0 ? "✅ Import Complete" : "⚠️ Import Complete with Warnings"}
            </h2>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="rounded-lg bg-[#0d1320] p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{result.inserted}</div>
                <div className="text-xs text-gray-500 mt-1">Inserted</div>
              </div>
              <div className="rounded-lg bg-[#0d1320] p-4 text-center">
                <div className="text-2xl font-bold text-blue-400">{result.updated}</div>
                <div className="text-xs text-gray-500 mt-1">Updated</div>
              </div>
              <div className="rounded-lg bg-[#0d1320] p-4 text-center">
                <div className="text-2xl font-bold text-gray-400">{result.skipped}</div>
                <div className="text-xs text-gray-500 mt-1">Skipped</div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-yellow-400 mb-2">
                  Errors ({result.errors.length})
                </h3>
                <div className="max-h-40 overflow-y-auto rounded-lg bg-[#0a0f1a] p-3 text-xs text-gray-400 space-y-1">
                  {result.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={reset}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 transition-colors"
            >
              ↩ Upload More Data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
