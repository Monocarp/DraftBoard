"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { buildCaches, resolvePlayerId } from "../upload/actions";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WFPlayerEntry {
  name: string;
  url: string;
  last_updated: string; // e.g. "March 15, 2026"
  last_updated_date: string; // ISO "2026-03-15" for easy comparison
}

export interface WFImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  unmatched: string[];
  errors: string[];
}

// ─── Step 1: Fetch & parse player list from WF index ──────────────────────

export async function fetchWFPlayerList(cutoffDate: string): Promise<{
  players: WFPlayerEntry[];
  error?: string;
}> {
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
    if (!res.ok) throw new Error(`HTTP ${res.status} from walterfootball.com`);

    const html = await res.text();

    // Parse with regex — look for <b><a href="...">Name</a> – Date</b> pattern
    // The mojibake â€" is a UTF-8 misread of em dash (–), normalised below.
    const STOP = "2026 NFL Draft Scouting Reports";
    const stopIdx = html.indexOf(STOP);
    const searchHtml = stopIdx > -1 ? html.slice(0, stopIdx) : html;

    const boldRegex = /<b>(<a\s[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>)([^<]*)<\/b>/gi;
    const players: WFPlayerEntry[] = [];
    let match: RegExpExecArray | null;

    while ((match = boldRegex.exec(searchHtml)) !== null) {
      const href = match[2];
      const name = match[3].trim();
      // raw date text — strip mojibake artifacts and em/en dashes, normalize whitespace
      const rawDate = match[4]
        .replace(/â€"/g, "")
        .replace(/â€"/g, "")
        .replace(/[–—]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!name || !href) continue;

      const url = href.startsWith("http")
        ? href
        : `https://walterfootball.com${href}`;

      const last_updated_date = parseDateToISO(rawDate);

      // Filter by cutoff
      if (cutoffDate && last_updated_date && last_updated_date < cutoffDate) continue;

      players.push({ name, url, last_updated: rawDate, last_updated_date });
    }

    return { players };
  } catch (err) {
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

  const caches = await buildCaches(supabase);
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
        if (liMatches[0]) parsedName = stripTags(liMatches[0][1]).trim() || player.name;
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
 * Parse "March 15, 2026" style date strings into ISO "2026-03-15".
 * Returns "" on failure.
 */
function parseDateToISO(raw: string): string {
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}
