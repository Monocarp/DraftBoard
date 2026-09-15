"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";
import { buildCaches, resolvePlayerId, type ImportCaches } from "../upload/actions";

// ─── Types ─────────────────────────────────────────────────────────────────
// NOTE: this module is "use server" — it may only export async functions and
// types. Runtime constants (e.g. the draft-year list) live in the client component.

export interface WFPlayerEntry {
  name: string;
  position: string;
  school: string;
  url: string;
  last_updated: string;
  last_updated_date: string; // ISO "2026-03-15" for easy comparison
  draft_year: number;        // parsed from the report URL — drives cache scoping
}

export interface WFFetchResult {
  players: WFPlayerEntry[];
  debug?: string;
  error?: string;
}

export interface WFImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  unmatched: string[];
  errors: string[];
}

// ─── Step 1: Fetch & parse player list from WF index ──────────────────────

export async function fetchWFPlayerList(
  cutoffDate: string,
  draftYear: number,
): Promise<WFFetchResult> {
  // Auth check
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  try {
    const res = await fetch("https://walterfootball.com/scoutingreports.php", {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });
    console.log("[WF] HTTP status:", res.status);
    if (!res.ok) throw new Error(`HTTP ${res.status} from walterfootball.com`);

    const html = await res.text();
    console.log("[WF] Page length:", html.length);

    // Search the full page; we no longer use a STOP marker since it was matching the page title too early
    const searchHtml = html;

    // HTML structure (verified against the live page):
    //   <b><a href="/scoutingreports2027ccarr.php"> C.J. Carr, QB, Notre Dame</a></b>
    //    - 8/31/2026        <br>
    // NOTE: a NEWLINE sits between </b> and the date. The previous pattern captured
    // the tail with [^<\n]* which cannot cross that newline, so every date parsed as
    // "" and the cutoff filter silently never fired. \s* below is what fixes it.
    const boldRegex =
      /<b>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/b>\s*((?:&#8211;|&ndash;|&mdash;|[-–—])\s*\d{1,2}\/\d{1,2}\/\d{4})?/gi;
    const players: WFPlayerEntry[] = [];
    let match: RegExpExecArray | null;
    let totalMatches = 0;
    let filteredOut = 0;
    let wrongYear = 0;
    const yearTally: Record<string, number> = {};

    while ((match = boldRegex.exec(searchHtml)) !== null) {
      totalMatches++;
      const href = match[1];
      const fullText = match[2].trim();
      // Index page format: "Drew Allar, QB, Penn State" — position here is already
      // an abbreviation, unlike the profile page which spells it out ("Quarterback").
      const parts = fullText.split(",").map((s) => s.trim());
      const name = parts[0] ?? "";
      const position = parts[1] ?? "";
      const school = parts.slice(2).join(",").trim();
      const rawDate = (match[3] ?? "")
        .replace(/&#8211;|&ndash;|&mdash;/g, "")
        .replace(/â€"/g, "")
        .replace(/[–—\-]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      // Only keep real scouting-report URLs, and capture the draft year from the
      // filename. Anchoring to a path segment avoids matching redirect query strings.
      const yearMatch = href.match(/(?:^|\/)scoutingreports(\d{4})[a-z0-9._-]*\.php/i);
      if (!name || !yearMatch) continue;

      const entryYear = parseInt(yearMatch[1], 10);
      yearTally[entryYear] = (yearTally[entryYear] ?? 0) + 1;

      // The index mixes multiple draft classes (2025/2026/2027 all appear together).
      // Only keep the class we're importing — the player cache is scoped to one year.
      if (entryYear !== draftYear) {
        wrongYear++;
        continue;
      }

      const url = href.startsWith("http")
        ? href
        : `https://walterfootball.com${href}`;

      const last_updated_date = parseDateToISO(rawDate);

      // Filter by cutoff
      if (cutoffDate && last_updated_date && last_updated_date < cutoffDate) {
        filteredOut++;
        continue;
      }

      players.push({
        name, position, school, url,
        last_updated: rawDate, last_updated_date,
        draft_year: entryYear,
      });
    }

    const tally = Object.entries(yearTally).sort().map(([y, n]) => `${y}:${n}`).join(" ");
    console.log(`[WF] matches=${totalMatches} byYear=[${tally}] wrongYear=${wrongYear} beforeCutoff=${filteredOut} kept=${players.length}`);

    const debug = `HTTP OK · ${totalMatches} reports on index · by year [${tally}] · ${wrongYear} other classes skipped · ${filteredOut} before cutoff · ${players.length} kept for ${draftYear}`;
    return { players, debug };
  } catch (err) {
    console.error("[WF] fetchWFPlayerList error:", err);
    return { players: [], error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ─── Step 2: Scrape profiles + upsert into Supabase ───────────────────────

export async function importWFProfiles(
  players: WFPlayerEntry[],
): Promise<WFImportResult> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  const SOURCE = "Walter Football";

  // The player cache is scoped to a single draft_year. The WF index mixes classes,
  // so build one cache per year present in the batch and match each report against
  // its own class — a 2027 report can never resolve against a 2026-only cache.
  const cachesByYear = new Map<number, ImportCaches>();
  async function cacheFor(year: number): Promise<ImportCaches> {
    let c = cachesByYear.get(year);
    if (!c) {
      c = await buildCaches(supabase, year);
      cachesByYear.set(year, c);
    }
    return c;
  }

  const result: WFImportResult = {
    success: true,
    imported: 0,
    skipped: 0,
    unmatched: [],
    errors: [],
  };

  for (const player of players) {
    try {
      // Fetch individual profile page
      const res = await fetch(player.url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 0 },
      });
      if (!res.ok) {
        result.errors.push(`${player.name}: HTTP ${res.status}`);
        result.skipped++;
        continue;
      }

      const html = await res.text();

      // Parse name/position/school from card-bio-data <ul>
      const bioMatch = html.match(/<ul[^>]*class="card-bio-data"[^>]*>([\s\S]*?)<\/ul>/i);
      let parsedName = player.name;
      let position = "";
      let school = "";

      if (bioMatch) {
        const liMatches = [...bioMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
        if (liMatches[0]) parsedName = stripTags(liMatches[0][1]).replace(/,\s*\d+[-']\d+\/\d+.*$/, "").trim() || player.name;
        if (liMatches[1]) position = stripTags(liMatches[1][1]).trim();
        if (liMatches[2]) school = stripTags(liMatches[2][1]).trim();
      }

      // Resolve player in DB, scoped to this report's own draft class.
      // Position: the index gives an abbreviation ("QB") but the profile page spells
      // it out ("Quarterback"). normalizePosition() only knows abbreviation aliases,
      // so a full word scores 0 in extrasScore() and silently disables the position
      // signal that fuzzy matching requires. Prefer the index value, map the word as
      // a fallback.
      const resolvedPos =
        player.position?.trim() || normalizeWFPositionWord(position) || undefined;

      const caches = await cacheFor(player.draft_year);
      const playerId = await resolvePlayerId(supabase, caches, parsedName, {
        position: resolvedPos,
        college: school || player.school || undefined,
        source: SOURCE,
      });

      if (!playerId) {
        result.unmatched.push(player.name);
        result.skipped++;
        continue;
      }

      // Parse scouting sections
      const strengths = parseDivSection(html, "SR-Strengths replace-break", "li");
      const weaknesses = parseDivSection(html, "SR-Weaknesses replace-break", "li");
      const summary = parseDivSection(html, "SR-Prospect-Sum replace-break", "p");
      const playerComp = parseDivSection(html, "SR-Prospect-Comp replace-break", "p");

      // ── Upsert player_comps ────────────────────────────────────────────
      // The comp paragraph reads "Joe Flacco. In terms of skill set, Allar reminds
      // me of Flacco." — the whole sentence was previously stored as the comp, so
      // every comp rendered as a paragraph. Reports with no real comparison instead
      // carry promo filler ("Check out my latest Mock Draft"), which must be dropped
      // rather than stored. extractCompName() returns null for those.
      const compName = extractCompName(playerComp);

      if (compName) {
        await supabase
          .from("players")
          .update({ walter_profile: { player_comp: compName, player_comp_text: playerComp } })
          .eq("id", playerId);

        const { data: existing } = await supabase
          .from("player_comps")
          .select("id")
          .eq("player_id", playerId)
          .eq("source", SOURCE)
          .maybeSingle();

        if (existing) {
          await supabase.from("player_comps").update({ comp: compName }).eq("id", existing.id);
        } else {
          await supabase.from("player_comps").insert({ player_id: playerId, source: SOURCE, comp: compName });
        }
      } else {
        // No real comparison in this report. Earlier runs stored the raw paragraph
        // (often promo filler) as the comp, so clear that stale row rather than
        // leaving it behind — skipping the write alone would preserve the garbage.
        await supabase.from("player_comps").delete().eq("player_id", playerId).eq("source", SOURCE);
        await supabase.from("players").update({ walter_profile: {} }).eq("id", playerId);
      }

      // ── Upsert commentary ─────────────────────────────────────────────
      const sections: { title: string; text: string }[] = [];
      if (summary)     sections.push({ title: "Overview",     text: summary });
      if (strengths)   sections.push({ title: "Strengths",    text: strengths });
      if (weaknesses)  sections.push({ title: "Weaknesses",   text: weaknesses });
      // Keep the full comp sentence as prose, but only when it was a real comparison.
      if (compName)    sections.push({ title: "Player Comp",  text: playerComp });

      if (sections.length > 0) {
        await supabase.from("commentary").delete().eq("player_id", playerId).eq("source", SOURCE);
        await supabase.from("commentary").insert({ player_id: playerId, source: SOURCE, sections });
      }

      result.imported++;
    } catch (err) {
      result.errors.push(`${player.name}: ${err instanceof Error ? err.message : "Unknown error"}`);
      result.skipped++;
    }
  }

  // Every other importer revalidates after mutating; this one never did.
  if (result.imported > 0) {
    for (const path of ["/", "/players", "/player", "/boards", "/rankings", "/admin"]) {
      revalidatePath(path);
    }
  }

  return result;
}

// ─── Step 1b: Preview a single scouting report ────────────────────────────

export interface WFProfilePreview {
  name: string;
  position: string;
  school: string;
  summary: string;
  strengths: string;
  weaknesses: string;
  playerComp: string;
  error?: string;
}

export async function previewWFProfile(url: string): Promise<WFProfilePreview> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return { name: "", position: "", school: "", summary: "", strengths: "", weaknesses: "", playerComp: "", error: `HTTP ${res.status}` };

    const html = await res.text();

    const bioMatch = html.match(/<ul[^>]*class="card-bio-data"[^>]*>([\s\S]*?)<\/ul>/i);
    let name = "", position = "", school = "";
    if (bioMatch) {
      const liMatches = [...bioMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
      if (liMatches[0]) name = stripTags(liMatches[0][1]).replace(/,\s*\d+[-']\d+\/\d+.*$/, "").trim();
      if (liMatches[1]) position = stripTags(liMatches[1][1]).trim();
      if (liMatches[2]) school = stripTags(liMatches[2][1]).trim();
    }

    return {
      name,
      position,
      school,
      strengths:  parseDivSection(html, "SR-Strengths replace-break", "li"),
      weaknesses: parseDivSection(html, "SR-Weaknesses replace-break", "li"),
      summary:    parseDivSection(html, "SR-Prospect-Sum replace-break", "p"),
      playerComp: parseDivSection(html, "SR-Prospect-Comp replace-break", "p"),
    };
  } catch (err) {
    return { name: "", position: "", school: "", summary: "", strengths: "", weaknesses: "", playerComp: "", error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Convert "BERNHARD RAIMANN" → "Bernhard Raimann" (title-case ALL-CAPS, preserve Roman numerals) */
function normalizeCompName(name: string): string {
  const preserve = new Set(["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "JR", "SR"]);
  return name.split(/\s+/).map(word => {
    if (preserve.has(word.toUpperCase())) return word.toUpperCase();
    if (word === word.toUpperCase() && word.length > 1) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    return word;
  }).join(" ");
}

/** Strip HTML tags from a string */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Return the full inner HTML of the first <div> carrying `className`, counting
 * nesting depth so the correct closing tag is found.
 *
 * The previous implementation used a non-greedy `([\s\S]*?)</div>` which stopped
 * at the FIRST closing tag. SR-Prospect-Sum contains ~17 nested ad divs, so that
 * truncated the scouting summary to its first paragraph — measured at 783 of
 * 2,993 characters (74% of the report silently discarded).
 */
function extractDivInner(html: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const open = new RegExp(`<div[^>]*class="[^"]*${escaped}[^"]*"[^>]*>`, "i").exec(html);
  if (!open) return "";

  const start = open.index + open[0].length;
  const tagRe = /<(\/?)div\b[^>]*>/gi;
  tagRe.lastIndex = start;

  let depth = 1;
  let t: RegExpExecArray | null;
  while ((t = tagRe.exec(html)) !== null) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, t.index);
  }
  return html.slice(start); // unbalanced markup — take the remainder
}

/** Remove complete nested <div> blocks (ad slots) innermost-first. */
function stripNestedDivs(html: string): string {
  let prev: string;
  let out = html;
  do {
    prev = out;
    out = out.replace(/<div\b[^>]*>(?:(?!<div\b)[\s\S])*?<\/div>/gi, " ");
  } while (out !== prev);
  return out;
}

/** Self-promotional trailers WF appends to summaries — not scouting content. */
const WF_PROMO = /(check\s+(out\s+)?my\s+latest|mock\s+draft\s+to\s+see|click\s+here|follow\s+me\s+on|@walterfootball)/i;

/**
 * Parse all <li> or <p> text inside a div with a given class, joined by newline.
 * Nested ad divs are removed first so their markup can't leak into the output.
 */
function parseDivSection(
  html: string,
  className: string,
  childTag: "li" | "p",
): string {
  const inner = stripNestedDivs(extractDivInner(html, className));
  if (!inner) return "";

  const tagRe = new RegExp(`<${childTag}[^>]*>([\\s\\S]*?)<\\/${childTag}>`, "gi");
  const texts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(inner)) !== null) {
    const text = stripTags(m[1]).trim();
    if (text && !WF_PROMO.test(text)) texts.push(text);
  }
  return texts.join("\n");
}

/**
 * Pull the NFL comparison name off the front of a comp paragraph.
 *
 *   "Joe Flacco. In terms of skill set…"  → "Joe Flacco"
 *   "T.J. Hockenson. Both are athletic…"  → "T.J. Hockenson"
 *   "Entering the 2026 season, Johnson…"  → null  (promo filler, no real comp)
 *
 * Returning null is meaningful: the caller skips writing player_comps entirely
 * rather than storing a paragraph where a name belongs.
 */
function extractCompName(raw: string): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  const m = text.match(
    /^((?:[A-Z]\.){1,3}\s*[A-Z][a-zA-Z'’-]+|[A-Z][a-zA-Z'’-]+(?:\s+[A-Z][a-zA-Z'’-]+){1,2})(?:\s+(?:Jr|Sr|II|III|IV)\.?)?\s*\./,
  );
  if (!m) return null;

  const name = m[1].replace(/\s+/g, " ").trim();
  if (name.length < 4 || name.length > 40) return null;
  return normalizeCompName(name);
}

/**
 * Profile pages spell positions out in full ("Quarterback"); normalizePosition()
 * in lib/types.ts only knows abbreviation→abbreviation aliases, so a full word
 * falls through unchanged and can never equal the stored "QB". Used only as a
 * fallback — the index page already supplies the abbreviation.
 */
const WF_POSITION_WORDS: Record<string, string> = {
  quarterback: "QB",
  "running back": "RB", halfback: "RB", fullback: "RB", "tail back": "RB",
  "wide receiver": "WR", receiver: "WR",
  "tight end": "TE",
  "offensive tackle": "OT", tackle: "OT", "offensive lineman": "OT",
  "offensive guard": "OG", guard: "OG",
  center: "C",
  "defensive end": "ED", "edge rusher": "ED", edge: "ED", "outside linebacker": "ED",
  "defensive tackle": "DT", "defensive lineman": "DT", "nose tackle": "DT",
  linebacker: "LB", "inside linebacker": "LB", "middle linebacker": "LB",
  cornerback: "CB", "defensive back": "CB",
  safety: "SAF", "free safety": "SAF", "strong safety": "SAF",
  kicker: "K", "place kicker": "K", punter: "P",
};

function normalizeWFPositionWord(word: string): string | undefined {
  const key = (word ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return WF_POSITION_WORDS[key];
}

/**
 * Parse date strings into ISO "YYYY-MM-DD".
 * Handles "M/D/YYYY" (e.g. "2/18/2026") and "Month D, YYYY" (e.g. "March 15, 2026").
 * Returns "" on failure.
 */
function parseDateToISO(raw: string): string {
  if (!raw) return "";
  // M/D/YYYY or MM/DD/YYYY
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Try generic Date parse as fallback
  try {
    const dt = new Date(raw);
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  } catch { /* ignore */ }
  return "";
}
