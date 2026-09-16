// DraftBuzz collector: turn raw parsed profiles into rows for the existing
// DraftBuzz importer, and report on data quality.
//
// Design: the browser collector (public/draftbuzz-collector.js) sends labels
// exactly as the page shows them ("RELEASE SPEED" -> "95%"). All knowledge of
// what those labels mean lives here, server-side, in one place — so a renamed
// label is a one-line change that needs no new bookmarklet, and unknown labels
// are reported instead of silently dropped.
//
// Rows are shaped like a DraftBuzz spreadsheet so they go through
// importData("draftbuzz_grades", ...) in admin/upload/actions.ts unchanged —
// the same code path, grade keys and quirks as every past DraftBuzz upload.
//
// No Next.js or "@/" imports, so this can be tested outside the app.

export interface CollectedProfile {
  url: string;                                  // "/Player/Dante-Moore-QB-UCLA"
  listCode: string;                             // position code from the list page, e.g. "DE/ED"
  name: string;                                 // "Dante Moore" (list page first + last name)
  heading: string;                              // profile <h1>, for reference
  fields: Record<string, string>;               // "Label:" <value> span pairs, e.g. { "Last Updated": "09/13/2026" }
  ratings: Record<string, string>;              // single-span ratings, e.g. { "ESPN RATING": "93/100" }
  overallRating: string;                        // "92.9 / 100"
  grades: Record<string, string>;               // grades table rows, e.g. { "RELEASE SPEED": "95%" }
  qbrWhenTargeted: string;                      // CB/S/WR/TE only
  comps: { name: string; school: string; similarity: string }[];
  sections: { title: string; text: string }[];  // "Draft Profile: Bio", "Scouting Report: Strengths", ...
}

// ─── Label normalisation ────────────────────────────────────────────────────

export const normLabel = (s: string) => s.replace(/\s+/g, " ").replace(/:\s*$/, "").trim().toUpperCase();

const BLANK = new Set(["", "TBD", "N/A", "NA", "-", "--", "#N/A", "0"]);
const present = (v: string | undefined | null): v is string => v != null && !BLANK.has(v.trim().toUpperCase());

function field(p: CollectedProfile, ...labels: string[]): string | undefined {
  const wanted = labels.map(normLabel);
  for (const [k, v] of Object.entries(p.fields)) if (wanted.includes(normLabel(k)) && present(v)) return v.trim();
  return undefined;
}

function rating(p: CollectedProfile, prefix: string): string | undefined {
  for (const [k, v] of Object.entries(p.ratings)) {
    if (normLabel(k).startsWith(prefix) && present(v)) {
      // "93/100" -> "93", "6.1 (100%)" -> "6.1" (matches how existing values are stored)
      const m = v.match(/-?\d+(\.\d+)?/);
      return m ? m[0] : undefined;
    }
  }
  return undefined;
}

// ─── Grades ─────────────────────────────────────────────────────────────────

/** Grades-table label -> column header the importer's DRAFTBUZZ_GRADE_COLUMNS expects. */
export const GRADE_HEADERS: Record<string, string> = {
  "SHORT PASSING": "short_passing",
  "MEDIUM PASSING": "med_passing",
  "LONG PASSING": "long_passing",
  "RUSH/SCRAMBLE": "rush_scramble",
  "RUSHING": "Rushing",
  "BREAK TACKLES": "Break_Tackles",
  "RECEIVING/HANDS": "Receiving_Hands",
  "PASS BLOCKING": "Pass_Blocking",
  "RUN BLOCKING": "Run_Blocking",
  "HANDS": "Hands",
  "SHORT RECEIVING": "Short_Receiving",
  "INTERMEDIATE ROUTES": "Intermediate_Routes",
  "DEEP THREAT": "Deep_Threat",
  "BLOCKING": "Blocking",
  "TACKLING": "Tackling",
  "RUN DEFENSE": "Run_Defense",
  "COVERAGE": "Coverage",
  "ZONE": "Zone",
  "MAN/PRESS": "Man_Press",
  "PASS RUSH": "Pass_Rush",
};

/** Present on the page but not part of the existing import (kept in the raw data). */
export const KNOWN_UNIMPORTED_GRADES = new Set(["RELEASE SPEED", "OFFENSE RATING", "DEFENSE RATING"]);

/** Headers the importer reads for each position group (mirrors DRAFTBUZZ_GRADE_COLUMNS). */
export const GROUP_HEADERS: Record<string, string[]> = {
  QB: ["short_passing", "med_passing", "long_passing", "rush_scramble"],
  RB: ["Rushing", "Break_Tackles", "Receiving_Hands", "Pass_Blocking", "Run_Blocking"],
  WR: ["qbr", "Hands", "Short_Receiving", "Intermediate_Routes", "Deep_Threat", "Blocking"],
  TE: ["qbr", "Hands", "Short_Receiving", "Intermediate_Routes", "Deep_Threat", "Blocking"],
  CB: ["qbr", "Tackling", "Run_Defense", "Coverage", "Zone", "Man_Press"],
  SAF: ["qbr", "Tackling", "Run_Defense", "Coverage", "Zone", "Man_Press"],
  LB: ["Tackling", "Pass_Rush", "Run_Defense", "Coverage"],
  EDGE: ["Tackling", "Pass_Rush", "Run_Defense"],
  DT: ["Tackling", "Pass_Rush", "Run_Defense"],
  OL: ["Pass_Blocking", "Run_Blocking"],
};

/**
 * Importer position group, decided by which grades the page actually shows
 * (with the list code only breaking ties). This is what replaced the old
 * script's exact-code filter that dropped "LB/ED", "DE/ED" and "DL/ED" players.
 * Verified 2026-09-16: LB/ED pages carry LB grades (incl. Coverage); DE/ED pages
 * carry DT-style grades — matching how existing edge players' grades are stored.
 */
export function importGroup(p: CollectedProfile): string | null {
  const g = new Set(Object.keys(p.grades).map(normLabel));
  const code = normLabel(p.listCode);
  if (g.has("SHORT PASSING")) return "QB";
  if (g.has("RUSHING")) return "RB";
  if (g.has("HANDS") || g.has("SHORT RECEIVING")) return code.startsWith("TE") ? "TE" : "WR";
  if (g.has("ZONE") || g.has("MAN/PRESS")) return /^(S|SAF|FS|SS)\b/.test(code) ? "SAF" : "CB";
  if (g.has("PASS RUSH") && g.has("COVERAGE")) return "LB";
  if (g.has("PASS RUSH")) return /ED|DE|EDGE/.test(code) ? "EDGE" : "DT";
  if (g.has("PASS BLOCKING")) return "OL";
  return null;
}

// ─── Rows for the existing importer ─────────────────────────────────────────

export function toImportRow(p: CollectedProfile): { group: string | null; row: Record<string, string> } {
  const group = importGroup(p);
  const row: Record<string, string> = { player_name: p.name };
  if (!group) return { group, row };

  for (const [label, value] of Object.entries(p.grades)) {
    const header = GRADE_HEADERS[normLabel(label)];
    if (header && GROUP_HEADERS[group].includes(header) && present(value)) row[header] = value.trim();
  }
  if (GROUP_HEADERS[group].includes("qbr") && present(p.qbrWhenTargeted)) row.qbr = p.qbrWhenTargeted.trim();

  const put = (key: string, v: string | undefined) => { if (present(v)) row[key] = v; };
  put("overall_rating", p.overallRating);
  put("age", field(p, "Age"));
  put("DOB", field(p, "DOB", "Date of Birth", "Birthdate", "Born"));
  put("college_games", field(p, "College Games"));
  put("college_snaps", field(p, "College Snaps"));
  put("espn_rating", rating(p, "ESPN"));
  put("rating_247", rating(p, "247"));
  put("rivals_rating", rating(p, "RIVALS"));
  // Stored uppercase historically ("1ST - TOP 5").
  put("Draft Projection", field(p, "Draft Projection")?.toUpperCase());
  put("Player Comparison", p.comps[0]?.name?.trim());
  return { group, row };
}

/** Scouting text as one "Overview" section, the format of existing "NFL Draft Buzz Comments". */
export function toCommentaryText(p: CollectedProfile): string | null {
  const parts = p.sections
    .filter((s) => present(s.text))
    .map((s) => `${s.title.trim().toUpperCase()}\n${s.text.trim()}`);
  return parts.length ? parts.join("\n\n") : null;
}

export const COMMENTARY_SOURCE = "NFL Draft Buzz Comments";

// ─── Validation of what the browser sends ───────────────────────────────────

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
function strMap(v: unknown, maxKeys: number, maxVal: number): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, maxKeys)) {
    if (typeof val === "string") out[k.slice(0, 80)] = val.slice(0, maxVal);
  }
  return out;
}

/** Accept only well-formed profile objects; everything is size-capped. */
export function sanitizeProfile(input: unknown): CollectedProfile | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const url = str(o.url, 200);
  if (!/^\/Player\/[A-Za-z0-9._'-]+$/.test(url)) return null;
  const name = str(o.name, 120).replace(/\s+/g, " ").trim();
  if (!name) return null;
  return {
    url,
    listCode: str(o.listCode, 20),
    name,
    heading: str(o.heading, 300),
    fields: strMap(o.fields, 60, 300),
    ratings: strMap(o.ratings, 20, 100),
    overallRating: str(o.overallRating, 40),
    grades: strMap(o.grades, 40, 40),
    qbrWhenTargeted: str(o.qbrWhenTargeted, 20),
    comps: (Array.isArray(o.comps) ? o.comps : []).slice(0, 10).map((c) => {
      const r = (c ?? {}) as Record<string, unknown>;
      return { name: str(r.name, 120), school: str(r.school, 120), similarity: str(r.similarity, 20) };
    }).filter((c) => c.name),
    sections: (Array.isArray(o.sections) ? o.sections : []).slice(0, 20).map((s) => {
      const r = (s ?? {}) as Record<string, unknown>;
      return { title: str(r.title, 120), text: str(r.text, 20000) };
    }).filter((s) => s.title),
  };
}

// ─── Draft year + run codes ─────────────────────────────────────────────────

/** Upcoming draft class: after the late-April draft, profiles are for next year's class. */
export function defaultDraftYear(now = new Date()): number {
  return now.getMonth() >= 4 ? now.getFullYear() + 1 : now.getFullYear();
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** 12 characters from a 32-symbol alphabet (60 bits), shown as XXXX-XXXX-XXXX. */
export function formatCode(randomIndexes: number[]): string {
  const raw = randomIndexes.slice(0, 12).map((i) => CODE_ALPHABET[i % CODE_ALPHABET.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

// ─── Report ─────────────────────────────────────────────────────────────────

export interface RunReport {
  total: number;
  expected: number;
  byGroup: Record<string, number>;
  unrecognized: { name: string; url: string; code: string; gradeLabels: string[] }[];
  listCodes: Record<string, number>;
  fillRates: { field: string; filled: number; of: number }[];
  gradeFill: { group: string; header: string; filled: number; of: number }[];
  unknownGradeLabels: Record<string, number>;
}

export function computeReport(profiles: CollectedProfile[], expected: number): RunReport {
  const byGroup: Record<string, number> = {};
  const listCodes: Record<string, number> = {};
  const unknownGradeLabels: Record<string, number> = {};
  const unrecognized: RunReport["unrecognized"] = [];
  const rows = profiles.map((p) => ({ p, ...toImportRow(p) }));

  for (const { p, group } of rows) {
    listCodes[p.listCode || "(none)"] = (listCodes[p.listCode || "(none)"] ?? 0) + 1;
    if (group) byGroup[group] = (byGroup[group] ?? 0) + 1;
    else unrecognized.push({ name: p.name, url: p.url, code: p.listCode, gradeLabels: Object.keys(p.grades) });
    for (const label of Object.keys(p.grades)) {
      const n = normLabel(label);
      if (!GRADE_HEADERS[n] && !KNOWN_UNIMPORTED_GRADES.has(n)) unknownGradeLabels[n] = (unknownGradeLabels[n] ?? 0) + 1;
    }
  }

  const n = profiles.length;
  const count = (fn: (r: (typeof rows)[number]) => boolean) => rows.filter(fn).length;
  const fillRates = [
    { field: "Name", filled: count((r) => !!r.p.name) },
    { field: "Overall rating", filled: count((r) => !!r.row.overall_rating) },
    { field: "Draft projection", filled: count((r) => !!r.row["Draft Projection"]) },
    { field: "Player comparison", filled: count((r) => !!r.row["Player Comparison"]) },
    { field: "Last updated", filled: count((r) => !!field(r.p, "Last Updated")) },
    { field: "Age", filled: count((r) => !!r.row.age) },
    { field: "DOB", filled: count((r) => !!r.row.DOB) },
    { field: "College games", filled: count((r) => !!r.row.college_games) },
    { field: "College snaps", filled: count((r) => !!r.row.college_snaps) },
    { field: "ESPN rating", filled: count((r) => !!r.row.espn_rating) },
    { field: "247 rating", filled: count((r) => !!r.row.rating_247) },
    { field: "Rivals rating", filled: count((r) => !!r.row.rivals_rating) },
    { field: "Scouting text", filled: count((r) => !!toCommentaryText(r.p)) },
  ].map((f) => ({ ...f, of: n }));

  const gradeFill: RunReport["gradeFill"] = [];
  for (const [group, headers] of Object.entries(GROUP_HEADERS)) {
    const inGroup = rows.filter((r) => r.group === group);
    if (!inGroup.length) continue;
    for (const header of headers) {
      gradeFill.push({ group, header, filled: inGroup.filter((r) => !!r.row[header]).length, of: inGroup.length });
    }
  }

  return { total: n, expected, byGroup, unrecognized, listCodes, fillRates, gradeFill, unknownGradeLabels };
}
