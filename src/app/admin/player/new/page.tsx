import { PlayerEditorForm } from "../PlayerEditorForm";

export default function NewPlayerPage() {
  return (
    <PlayerEditorForm
      player={{
        id: null,
        name: "",
        slug: "",
        position: null,
        college: null,
        height: null,
        weight: null,
        age: null,
        dob: null,
        year: null,
        projected_round: null,
        projected_role: null,
        ideal_scheme: null,
        games: null,
        snaps: null,
        strengths: null,
        weaknesses: null,
        accolades: null,
        player_summary: null,
        overview: {},
        site_ratings: {},
        pff_scores: {},
        athletic_scores: {},
        draftbuzz_grades: {},
        alignments: {},
        skills_traits: {},
        injuries: [],
        media_links: [],
      }}
    />
  );
}
