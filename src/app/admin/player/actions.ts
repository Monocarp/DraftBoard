"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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
  const position = (formData.get("position") as string)?.trim() || null;
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
