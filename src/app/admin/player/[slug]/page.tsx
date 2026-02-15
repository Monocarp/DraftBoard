import { createSupabaseServer } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import { PlayerEditorForm } from "../PlayerEditorForm";

export default async function EditPlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createSupabaseServer();

  const { data: player } = await supabase
    .from("players")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!player) notFound();

  return (
    <PlayerEditorForm
      player={{
        id: player.id,
        name: player.name,
        slug: player.slug,
        position: player.position,
        college: player.college,
        height: player.height,
        weight: player.weight,
        age: player.age,
        dob: player.dob,
        year: player.year,
        projected_round: player.projected_round,
        projected_role: player.projected_role,
        ideal_scheme: player.ideal_scheme,
        games: player.games,
        snaps: player.snaps,
        strengths: player.strengths,
        weaknesses: player.weaknesses,
        accolades: player.accolades,
        player_summary: player.player_summary,
        overview: player.overview ?? {},
        site_ratings: player.site_ratings ?? {},
        pff_scores: player.pff_scores ?? {},
        athletic_scores: player.athletic_scores ?? {},
        draftbuzz_grades: player.draftbuzz_grades ?? {},
        alignments: player.alignments ?? {},
        skills_traits: player.skills_traits ?? {},
      }}
    />
  );
}
