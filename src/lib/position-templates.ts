// Shared position template constants used by admin actions and AI analysis.

function normalizeForTemplate(pos: string): string {
  const p = pos.trim().toUpperCase().replace(/\//g, "");
  if (["DE", "ED", "EDGE", "DEED", "DLED", "LBED"].includes(p)) return "EDGE";
  if (["IDL", "DT", "NT", "DI", "DL"].includes(p)) return "DT";
  if (["S", "FS", "SS", "SAF"].includes(p)) return "SAF";
  if (["OG", "G", "C", "IOL"].includes(p)) return "IOL";
  if (["OT", "T"].includes(p)) return "OT";
  if (["ILB", "MLB"].includes(p)) return "LB";
  if (["HB", "FB"].includes(p)) return "RB";
  return p;
}

export const POSITION_TEMPLATES = [
  "CB", "SAF", "DT", "EDGE", "LB", "OL", "OT", "IOL", "QB", "RB", "WR", "TE",
] as const;

export type PositionTemplate = (typeof POSITION_TEMPLATES)[number];

/** Map a position string to its template key. OT and IOL both resolve to OL. */
export function resolveTemplate(pos: string): PositionTemplate | null {
  const norm = normalizeForTemplate(pos);
  if (norm === "IOL" || norm === "OT") return "OL" as PositionTemplate;
  if ((POSITION_TEMPLATES as readonly string[]).includes(norm)) return norm as PositionTemplate;
  return null;
}

// ─── Per-Position Skills & Traits Categories ─────────────────────────────────

export const SKILLS_TRAITS_TEMPLATE: Record<PositionTemplate, string[]> = {
  EDGE: ["Instincts/Processing/Production", "Physical Traits", "Athletic Ability", "Pass Rush Skills", "Run Defense Skills"],
  DT:   ["Instincts/Processing/Production", "Physical Traits", "Athletic Ability", "Pass Rush Skills", "Run Defense Skills"],
  CB:   ["Character/Mentality", "Tackling", "Coverage Skills", "Athleticism", "Physical Traits"],
  SAF:  ["Character/Mentality", "Tackling", "Coverage Skills", "Athleticism", "Physical Traits"],
  LB:   ["Instincts/Processing/Production", "Physical/Athletic Traits", "Coverage Ability", "Pass Rush Skills", "Run Defense/Tackling"],
  WR:   ["Character/Mentality", "Receiving Skills", "Technique", "Physical Traits", "Blocking"],
  TE:   ["Receiving Skills", "Blocking", "Athletic Traits", "Physical Traits", "Character/Mentality"],
  OL:   ["Character Traits", "Upper Body", "Lower Body", "Technical Ability", "Physical Ability"],
  OT:   ["Character Traits", "Upper Body", "Lower Body", "Technical Ability", "Physical Ability"],
  IOL:  ["Character Traits", "Upper Body", "Lower Body", "Technical Ability", "Physical Ability"],
  QB:   [],
  RB:   [],
};

// ─── Per-Position DraftBuzz Grade Keys ───────────────────────────────────────

export const DRAFTBUZZ_TEMPLATE: Record<PositionTemplate, string[]> = {
  QB:   ["Short Passing", "Medium Passing", "Long Passing", "Rush/Scramble"],
  RB:   ["Rushing", "Break Tackles", "Receiving/Hands", "Pass Blocking", "Run Blocking"],
  WR:   ["QBR When Tgtd", "Hands", "Short Receiving", "Med Routes", "Deep Threat", "Blocking"],
  TE:   ["QBR When Tgtd", "Hands", "Short Receiving", "Med Routes", "Deep Threat", "Blocking"],
  SAF:  ["QBR When Targeted", "Tackling", "Run Defense", "Coverage Grade", "Zone Coverage", "Man/Press"],
  OL:   ["Pass Blocking Grade", "Run Blocking Grade"],
  OT:   ["Pass Blocking Grade", "Run Blocking Grade"],
  IOL:  ["Pass Blocking Grade", "Run Blocking Grade"],
  LB:   ["Tackling", "Pass Rush", "Run Defense", "Coverage"],
  EDGE: ["Tackling", "Pass Rush", "Run Defense"],
  DT:   ["Tackling", "Pass Rush", "Run Defense"],
  CB:   ["QBR Allowed", "Tackling", "Run Defense", "Cov Grade", "Zone Coverage", "Man/Press"],
};
