"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { buildCaches, resolvePlayerId } from "../upload/actions";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WFPlayerEntry {
  name: string;
  position: string;
  school: string;
  url: string;
  last_updated: string;
  last_updated_date: string; // ISO "2026-03-15" for easy comparison
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

export async function fetchWFPlayerList(cutoffDate: string): Promise<WFFetchResult> {
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
    const stopIdx = -1;
    const searchHtml = html;
    console.log("[WF] searchHtml length:", searchHtml.length);

    // Log a raw sample so we can see the actual structure
    const firstBIdx = searchHtml.indexOf("<b>");
    console.log("[WF] First <b> context:", JSON.stringify(searchHtml.slice(firstBIdx, firstBIdx + 300)));

    // HTML structure: <b> <a href="/scoutXYZ.php"> Name, Pos, School</a></b>  &#8211; M/D/YYYY
    // There is optional whitespace between <b> and <a>; date uses HTML entity &#8211;
    const boldRegex = /<b>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a><\/b>([^<\n]*)/gi;
    const players: WFPlayerEntry[] = [];
    let match: RegExpExecArray | null;
    let totalMatches = 0;
    let filteredOut = 0;

    while ((match = boldRegex.exec(searchHtml)) !== null) {
      totalMatches++;
      const href = match[1];
      const fullText = match[2].trim();
      // Index page format: "Drew Allar, QB, Penn State" (no height/weight here)
      const parts = fullText.split(",").map((s) => s.trim());
      const name = parts[0] ?? "";
      const position = parts[1] ?? "";
      const school = parts.slice(2).join(",").trim();
      const rawDate = match[3]
        .replace(/&#8211;/g, "")
        .replace(/â€"/g, "")
        .replace(/[–—\-]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      // Only keep actual scouting report URLs (e.g. /scoutingreports2026dallar.php)
      if (!name || !href || !/scoutingreports\d{4}/i.test(href)) continue;

      const url = href.startsWith("http")
        ? href
        : `https://walterfootball.com${href}`;

      const last_updated_date = parseDateToISO(rawDate);

      if (totalMatches <= 3) {
        console.log(`[WF] Sample match #${totalMatches}: name="${name}" rawDate="${rawDate}" iso="${last_updated_date}" cutoff="${cutoffDate}"`);
      }

      // Filter by cutoff
      if (cutoffDate && last_updated_date && last_updated_date < cutoffDate) {
        filteredOut++;
        continue;
      }

      players.push({ name, position, school, url, last_updated: rawDate, last_updated_date });
    }

    console.log(`[WF] Total regex matches: ${totalMatches}, filtered out: ${filteredOut}, kept: ${players.length}`);

    const debug = `HTTP OK · page ${html.length} bytes · STOP at ${stopIdx} · search ${searchHtml.length} bytes · ${totalMatches} regex matches · ${filteredOut} before cutoff · ${players.length} kept`;
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

  const caches = await buildCaches(supabase, 2026);
  const SOURCE = "Walter Football";

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

      // Resolve player in DB
      const playerId = await resolvePlayerId(supabase, caches, parsedName, {
        position: position || undefined,
        college: school || undefined,
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
      if (playerComp) {
        const normalizedComp = normalizeCompName(playerComp);
        await supabase
          .from("players")
          .update({ walter_profile: { player_comp: playerComp } })
          .eq("id", playerId);

        const { data: existing } = await supabase
          .from("player_comps")
          .select("id")
          .eq("player_id", playerId)
          .eq("source", SOURCE)
          .maybeSingle();

        if (existing) {
          await supabase.from("player_comps").update({ comp: normalizedComp }).eq("id", existing.id);
        } else {
          await supabase.from("player_comps").insert({ player_id: playerId, source: SOURCE, comp: normalizedComp });
        }
      }

      // ── Upsert commentary ─────────────────────────────────────────────
      const sections: { title: string; text: string }[] = [];
      if (summary)     sections.push({ title: "Overview",     text: summary });
      if (strengths)   sections.push({ title: "Strengths",    text: strengths });
      if (weaknesses)  sections.push({ title: "Weaknesses",   text: weaknesses });
      if (playerComp)  sections.push({ title: "Player Comp",  text: playerComp });

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
 * Parse all <li> or <p> text inside a div with a given class,
 * joined by newline.
 */
function parseDivSection(
  html: string,
  className: string,
  childTag: "li" | "p",
): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const divMatch = html.match(
    new RegExp(`<div[^>]*class="[^"]*${escaped}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`, "i"),
  );
  if (!divMatch) return "";

  const tagRe = new RegExp(`<${childTag}[^>]*>([\\s\\S]*?)<\\/${childTag}>`, "gi");
  const texts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(divMatch[1])) !== null) {
    const text = stripTags(m[1]).trim();
    if (text) texts.push(text);
  }
  return texts.join("\n");
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
