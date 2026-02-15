"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SourcePriorityEntry {
  source: string;
  priority: number;
  fields: string[];       // bio fields this source provides (e.g. ["age","height","weight"])
  playerCount: number;    // how many players have bio data from this source
  isDefault: boolean;     // true if this is a hardcoded-default source
}

// Must stay in sync with DEFAULT_SOURCE_PRIORITY in upload/actions.ts
const DEFAULT_SOURCE_PRIORITY: Record<string, number> = {
  manual: 0,
  draftbuzz: 1,
  cbs: 2,
  nfl_com: 2,
  site_ratings: 3,
  pff: 4,
};

const BIO_FIELDS = [
  "age", "dob", "games", "snaps", "height", "weight",
  "year", "position", "college", "projected_round",
] as const;

// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * Scan every player's bio_sources JSONB to discover all sources,
 * their priorities, which bio fields they provide, and player count.
 */
export async function getSourcePriorities(): Promise<SourcePriorityEntry[]> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch bio_sources for all players that have it
  const PAGE = 1000;
  const allBioSources: Record<string, Record<string, string | number>>[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("players")
      .select("bio_sources")
      .not("bio_sources", "is", null)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const p of data) {
      if (p.bio_sources && typeof p.bio_sources === "object") {
        allBioSources.push(p.bio_sources as Record<string, Record<string, string | number>>);
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Aggregate per source
  const sourceMap = new Map<string, {
    priority: number | null;
    fields: Set<string>;
    count: number;
  }>();

  for (const bs of allBioSources) {
    for (const [source, vals] of Object.entries(bs)) {
      if (!sourceMap.has(source)) {
        sourceMap.set(source, { priority: null, fields: new Set(), count: 0 });
      }
      const entry = sourceMap.get(source)!;
      entry.count++;

      // Extract __priority if present
      if (typeof vals.__priority === "number" && entry.priority === null) {
        entry.priority = vals.__priority;
      }

      // Collect bio fields this source provides
      for (const field of BIO_FIELDS) {
        if (vals[field] !== undefined && vals[field] !== null && vals[field] !== "") {
          entry.fields.add(field);
        }
      }
    }
  }

  // Build result — include default sources even if no players have them yet
  const allSources = new Set([...sourceMap.keys(), ...Object.keys(DEFAULT_SOURCE_PRIORITY)]);

  const results: SourcePriorityEntry[] = [];
  for (const source of allSources) {
    const entry = sourceMap.get(source);
    const storedPriority = entry?.priority;
    const defaultPriority = DEFAULT_SOURCE_PRIORITY[source];

    results.push({
      source,
      priority: storedPriority ?? defaultPriority ?? 0,
      fields: entry ? [...entry.fields].sort() : [],
      playerCount: entry?.count ?? 0,
      isDefault: source in DEFAULT_SOURCE_PRIORITY,
    });
  }

  // Sort by priority descending, then name
  results.sort((a, b) => b.priority - a.priority || a.source.localeCompare(b.source));

  return results;
}

// ─── Update ─────────────────────────────────────────────────────────────────

/**
 * Update the priority for a source across ALL players that have bio_sources
 * data from that source.  Also re-resolves all top-level bio fields for
 * every affected player so the change takes effect immediately.
 */
export async function updateSourcePriority(
  source: string,
  newPriority: number,
): Promise<{ success: boolean; updated: number; error?: string }> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch all players that have this source in bio_sources
  const PAGE = 1000;
  const affectedPlayers: { id: string; bio_sources: Record<string, Record<string, string | number>> }[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("players")
      .select("id, bio_sources")
      .not("bio_sources", "is", null)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const p of data) {
      const bs = p.bio_sources as Record<string, Record<string, string | number>> | null;
      if (bs && bs[source]) {
        affectedPlayers.push({ id: p.id as string, bio_sources: bs });
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Batch update each affected player
  let updated = 0;
  for (const player of affectedPlayers) {
    const bioSources = player.bio_sources;

    // Set the new priority
    bioSources[source].__priority = newPriority;

    // Helper: get priority for any source in this player's bio_sources
    const getPriority = (src: string): number => {
      const stored = bioSources[src]?.__priority;
      if (typeof stored === "number") return stored;
      return DEFAULT_SOURCE_PRIORITY[src] ?? 0;
    };

    // Re-resolve best value per field
    const resolved: Record<string, string | number | null> = {};
    for (const field of BIO_FIELDS) {
      let bestValue: string | number | null = null;
      let bestPriority = -1;
      for (const [src, vals] of Object.entries(bioSources)) {
        if (vals[field] !== undefined && vals[field] !== null) {
          const p = getPriority(src);
          if (p > bestPriority) {
            bestPriority = p;
            bestValue = vals[field];
          }
        }
      }
      if (bestValue !== null) {
        resolved[field] = bestValue;
      }
    }

    // Build update payload
    const updateData: Record<string, unknown> = { bio_sources: bioSources };

    if (resolved.age !== undefined) {
      const n = typeof resolved.age === "number" ? resolved.age : parseFloat(String(resolved.age));
      if (!isNaN(n)) updateData.age = n;
    }
    if (resolved.dob !== undefined) updateData.dob = String(resolved.dob);
    if (resolved.games !== undefined) {
      const n = typeof resolved.games === "number" ? resolved.games : parseInt(String(resolved.games), 10);
      if (!isNaN(n)) updateData.games = n;
    }
    if (resolved.snaps !== undefined) {
      const n = typeof resolved.snaps === "number" ? resolved.snaps : parseInt(String(resolved.snaps), 10);
      if (!isNaN(n)) updateData.snaps = n;
    }
    if (resolved.height !== undefined) updateData.height = String(resolved.height);
    if (resolved.weight !== undefined) updateData.weight = String(resolved.weight);
    if (resolved.year !== undefined) updateData.year = String(resolved.year);
    if (resolved.position !== undefined) updateData.position = String(resolved.position);
    if (resolved.college !== undefined) updateData.college = String(resolved.college);
    if (resolved.projected_round !== undefined) updateData.projected_round = String(resolved.projected_round);

    const { error } = await supabase
      .from("players")
      .update(updateData)
      .eq("id", player.id);

    if (!error) updated++;
  }

  // Also update DEFAULT_SOURCE_PRIORITY at runtime won't persist,
  // but the __priority stored in bio_sources will be used on next resolution.

  revalidatePath("/admin/priorities");
  revalidatePath("/");
  revalidatePath("/players");
  revalidatePath("/player", "layout");

  return { success: true, updated };
}
