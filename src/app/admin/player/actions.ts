"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { normalizePosition as canonicalPosition } from "@/lib/types";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// ─── Position Template Config ───────────────────────────────────────────────

/** Normalize position string for template lookup.
 *  Maps to PFF template keys: EDGE, DT, SAF, IOL, OT, LB, RB, etc. */
function normalizePosition(pos: string): string {
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

/** The 10 position templates available */
const POSITION_TEMPLATES = [
  "CB", "SAF", "DT", "EDGE", "LB", "OL", "OT", "IOL", "QB", "RB", "WR", "TE",
] as const;

type PositionTemplate = (typeof POSITION_TEMPLATES)[number];

/** Map a normalized position to its template key.
 *  Returns the position itself if it's a known template, otherwise null. */
function resolveTemplate(pos: string): PositionTemplate | null {
  const norm = normalizePosition(pos);
  if ((POSITION_TEMPLATES as readonly string[]).includes(norm)) return norm as PositionTemplate;
  return null;
}

function toSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function savePlayer(formData: FormData) {
  const supabase = await createSupabaseServer();

  // Verify auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const playerId = formData.get("playerId") as string | null;
  const isNew = !playerId;

  const name = (formData.get("name") as string).trim();
  const slug = (formData.get("slug") as string)?.trim() || toSlug(name);
  const position = canonicalPosition((formData.get("position") as string)?.trim() || null) || null;
  const college = (formData.get("college") as string)?.trim() || null;
  const height = (formData.get("height") as string)?.trim() || null;
  const weight = (formData.get("weight") as string)?.trim() || null;
  const age = formData.get("age") ? Number(formData.get("age")) : null;
  const dob = (formData.get("dob") as string)?.trim() || null;
  const year = (formData.get("year") as string)?.trim() || null;
  const projected_round = (formData.get("projected_round") as string)?.trim() || null;
  const projected_role = (formData.get("projected_role") as string)?.trim() || null;
  const ideal_scheme = (formData.get("ideal_scheme") as string)?.trim() || null;
  const games = formData.get("games") ? Number(formData.get("games")) : null;
  const snaps = formData.get("snaps") ? Number(formData.get("snaps")) : null;
  const strengths = (formData.get("strengths") as string)?.trim() || null;
  const weaknesses = (formData.get("weaknesses") as string)?.trim() || null;
  const accolades = (formData.get("accolades") as string)?.trim() || null;
  const player_summary = (formData.get("player_summary") as string)?.trim() || null;

  // Parse JSON fields (with fallbacks)
  const parseJSON = (key: string, fallback: unknown = {}) => {
    const raw = formData.get(key) as string | null;
    if (!raw?.trim()) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  };

  const overview = parseJSON("overview");
  const site_ratings = parseJSON("site_ratings");
  const pff_scores = parseJSON("pff_scores");
  const athletic_scores = parseJSON("athletic_scores");
  const draftbuzz_grades = parseJSON("draftbuzz_grades");
  const alignments = parseJSON("alignments");
  const skills_traits = parseJSON("skills_traits");

  // Parse injuries JSON array
  const injuriesRaw = formData.get("injuries") as string | null;
  let injuries: { detail: string; recovery_time: string | null; year: string | null }[] = [];
  if (injuriesRaw?.trim()) {
    try { injuries = JSON.parse(injuriesRaw); } catch { injuries = []; }
  }
  // Filter out empty entries
  injuries = injuries.filter((inj) => inj.detail?.trim());

  const playerData = {
    name, slug, position, college, height, weight, age, dob, year,
    projected_round, projected_role, ideal_scheme, games, snaps,
    strengths, weaknesses, accolades, player_summary,
    overview, site_ratings, pff_scores, athletic_scores,
    draftbuzz_grades, alignments, skills_traits,
  };

  if (isNew) {
    const { error } = await supabase.from("players").insert(playerData);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("players")
      .update(playerData)
      .eq("id", playerId);
    if (error) return { error: error.message };
  }

  // Sync injury_history (delete old + insert new)
  const resolvedId = playerId || (await supabase.from("players").select("id").eq("slug", slug).single()).data?.id;
  if (resolvedId && injuries.length >= 0) {
    await supabase.from("injury_history").delete().eq("player_id", resolvedId);
    if (injuries.length > 0) {
      await supabase.from("injury_history").insert(
        injuries.map((inj) => ({
          player_id: resolvedId,
          detail: inj.detail.trim(),
          recovery_time: inj.recovery_time?.trim() || null,
          year: inj.year?.trim() || null,
        }))
      );
    }
  }

  revalidatePath("/admin");
  revalidatePath(`/player/${slug}`);
  revalidatePath("/players");
  revalidatePath("/");
  redirect(`/admin/player/${slug}`);
}

export async function deletePlayer(playerId: string, slug: string) {
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Delete related data first (cascading in order)
  await supabase.from("board_entries").delete().eq("player_id", playerId);
  await supabase.from("rankings").delete().eq("slug", slug);
  await supabase.from("positional_rankings").delete().eq("slug", slug);
  await supabase.from("player_rankings").delete().eq("player_id", playerId);
  await supabase.from("adp_entries").delete().eq("player_id", playerId);
  await supabase.from("mock_picks").delete().eq("player_id", playerId);
  await supabase.from("position_board_entries").delete().eq("player_id", playerId);
  await supabase.from("player_comps").delete().eq("player_id", playerId);
  await supabase.from("projected_rounds").delete().eq("player_id", playerId);
  await supabase.from("commentary").delete().eq("player_id", playerId);
  await supabase.from("media_links").delete().eq("player_id", playerId);
  await supabase.from("injury_history").delete().eq("player_id", playerId);
  await supabase.from("ages").delete().eq("player_id", playerId);

  // Delete the player
  const { error } = await supabase.from("players").delete().eq("id", playerId);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/players");
  revalidatePath("/");
  redirect("/admin");
}

// ─── Create Profile ─────────────────────────────────────────────────────────

/**
 * Explicitly create a profile for an existing player.
 * Seeds the overview JSON from top-level player columns so the player
 * appears as "having a profile" in the public Players page.
 * Optionally accepts a position template override.
 */
export async function createProfile(
  playerId: string,
  templateOverride?: string,
): Promise<{ error?: string; slug?: string }> {
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Fetch the player
  const { data: player, error: fetchErr } = await supabase
    .from("players")
    .select("*")
    .eq("id", playerId)
    .single();

  if (fetchErr || !player) return { error: "Player not found" };

  // Already has a profile?
  const existingOverview = player.overview as Record<string, unknown> || {};
  if (Object.keys(existingOverview).length > 0) {
    return { error: "Player already has a profile", slug: player.slug };
  }

  // Determine position template
  const pos = templateOverride || player.position || "";
  const template = resolveTemplate(pos);

  // Seed overview from top-level columns
  const overview: Record<string, string | null> = {};
  if (player.position) overview["POS"] = player.position;
  if (player.college) overview["College"] = player.college;
  if (player.height) overview["Height"] = player.height;
  if (player.weight) overview["Weight"] = String(player.weight);
  if (player.age) overview["Age"] = String(player.age);
  if (player.dob) overview["DOB"] = player.dob;
  if (player.year) overview["Year"] = player.year;
  if (player.games) overview["Games"] = String(player.games);
  if (player.snaps) overview["Snaps"] = String(player.snaps);
  if (player.projected_round) overview["Prj. Rd"] = player.projected_round;

  // Ensure overview is never empty (the gate for "has profile")
  if (Object.keys(overview).length === 0) {
    overview["POS"] = pos || "Unknown";
  }

  // Merge any existing data from import-written overview keys
  // (importers may have written overview fields like "Draft Buzz", "ESPN" etc
  //  without seeding POS/College, so overview stayed as those partial keys
  //  which stringify to something other than "{}" — but that's unlikely)
  const finalOverview = { ...existingOverview, ...overview };

  // Build update — just seed overview (profile data columns like pff_scores
  // may already have data from importers, leave them as-is)
  const { error: updateErr } = await supabase
    .from("players")
    .update({ overview: finalOverview })
    .eq("id", playerId);

  if (updateErr) return { error: updateErr.message };

  revalidatePath("/admin");
  revalidatePath(`/player/${player.slug}`);
  revalidatePath("/players");
  revalidatePath("/");

  return { slug: player.slug };
}

/** Get the list of available position templates */
export async function getPositionTemplates() {
  return [...POSITION_TEMPLATES];
}
