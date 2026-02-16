"use client";

import { useState } from "react";
import { savePlayer, deletePlayer, createProfile } from "./actions";
import { SkillsTraitsEditor } from "./SkillsTraitsEditor";

const POSITION_TEMPLATES = [
  "CB", "SAF", "DT", "EDGE", "LB", "OL", "OT", "IOL", "QB", "RB", "WR", "TE",
] as const;

/** Normalize position for template auto-detection.
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

function resolveTemplate(pos: string): string | null {
  const norm = normalizePosition(pos);
  if ((POSITION_TEMPLATES as readonly string[]).includes(norm)) return norm;
  return null;
}

interface PlayerData {
  id: string | null;
  name: string;
  slug: string;
  position: string | null;
  college: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  dob: string | null;
  year: string | null;
  projected_round: string | null;
  projected_role: string | null;
  ideal_scheme: string | null;
  games: number | null;
  snaps: number | null;
  strengths: string | null;
  weaknesses: string | null;
  accolades: string | null;
  player_summary: string | null;
  overview: Record<string, string | null>;
  site_ratings: Record<string, string | null>;
  pff_scores: Record<string, unknown>;
  athletic_scores: Record<string, unknown>;
  draftbuzz_grades: Record<string, number | null>;
  alignments: Record<string, unknown>;
  skills_traits: Record<string, unknown>;
}

export function PlayerEditorForm({ player }: { player: PlayerData }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>(
    player.position ? (resolveTemplate(player.position) || player.position.toUpperCase()) : "",
  );

  const isNew = !player.id;
  const hasProfile = Object.keys(player.overview).length > 0;
  const autoTemplate = player.position ? resolveTemplate(player.position) : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Validate all JSON fields before submitting
    const jsonFieldNames = ["overview", "site_ratings", "pff_scores", "athletic_scores", "draftbuzz_grades", "alignments"];
    const form = e.currentTarget;
    for (const fieldName of jsonFieldNames) {
      const textarea = form.querySelector<HTMLTextAreaElement>(`textarea[name="${fieldName}"]`);
      const val = textarea?.value?.trim();
      if (val && val !== "") {
        try {
          JSON.parse(val);
        } catch {
          setError(`Invalid JSON in "${fieldName}" field. Please fix the syntax before saving.`);
          return;
        }
      }
    }

    setSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await savePlayer(formData);
    if (result?.error) {
      setError(result.error);
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!player.id) return;
    setSaving(true);
    try {
      const result = await deletePlayer(player.id, player.slug);
      if (result?.error) {
        setError(result.error);
        setSaving(false);
      } else {
        // Server action calls redirect(), but in case it doesn't:
        window.location.href = "/admin";
      }
    } catch {
      // redirect() throws NEXT_REDIRECT which propagates here—that's expected.
      // If we get here and it's not a redirect, show a fallback.
      window.location.href = "/admin";
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {player.id && <input type="hidden" name="playerId" value={player.id} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">
          {isNew ? "Create New Player" : `Edit: ${player.name}`}
        </h1>
        <div className="flex gap-2">
          {!isNew && (
            <a
              href={`/player/${player.slug}`}
              target="_blank"
              className="rounded-lg border border-[#2a3a4e] px-4 py-2 text-sm text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              View Profile ↗
            </a>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving…" : isNew ? "Create Player" : "Save Changes"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Create Profile Banner — shown for existing players without a profile */}
      {!isNew && !hasProfile && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <svg className="h-5 w-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                No Profile Yet
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                Create a profile to make this player visible on the public Players page.
                {autoTemplate && (
                  <span className="text-orange-400"> Auto-detected template: <strong>{autoTemplate}</strong></span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
              >
                <option value="">— Template —</option>
                {POSITION_TEMPLATES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={creatingProfile}
                onClick={async () => {
                  setCreatingProfile(true);
                  setError(null);
                  const result = await createProfile(player.id!, selectedTemplate || undefined);
                  if (result?.error) {
                    setError(result.error);
                    setCreatingProfile(false);
                  } else {
                    // Redirect to refresh the page with new profile data
                    window.location.reload();
                  }
                }}
                className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {creatingProfile ? "Creating…" : "Create Profile"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Basic Info */}
      <Section title="Basic Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Name" name="name" defaultValue={player.name} required />
          <Field label="Slug" name="slug" defaultValue={player.slug} placeholder="auto-generated from name" />
          <Field label="Position" name="position" defaultValue={player.position ?? ""} placeholder="e.g. QB, WR, ED" />
          <Field label="College" name="college" defaultValue={player.college ?? ""} />
          <Field label="Height" name="height" defaultValue={player.height ?? ""} placeholder={'e.g. 6\'2"'} />
          <Field label="Weight" name="weight" defaultValue={player.weight ?? ""} placeholder="e.g. 215 lbs" />
          <Field label="Age" name="age" type="number" defaultValue={player.age ?? ""} />
          <Field label="Date of Birth" name="dob" defaultValue={player.dob ?? ""} placeholder="e.g. 1/15/2004" />
          <Field label="Year" name="year" defaultValue={player.year ?? ""} placeholder="e.g. Jr, Sr, rSr" />
          <Field label="Projected Round" name="projected_round" defaultValue={player.projected_round ?? ""} placeholder="e.g. 1, 2, 3-4" />
          <Field label="Projected Role" name="projected_role" defaultValue={player.projected_role ?? ""} />
          <Field label="Ideal Scheme" name="ideal_scheme" defaultValue={player.ideal_scheme ?? ""} />
          <Field label="Games" name="games" type="number" defaultValue={player.games ?? ""} />
          <Field label="Snaps" name="snaps" type="number" defaultValue={player.snaps ?? ""} />
        </div>
      </Section>

      {/* Scouting Notes */}
      <Section title="Scouting Notes">
        <TextArea label="Player Summary" name="player_summary" defaultValue={player.player_summary ?? ""} rows={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <TextArea label="Strengths" name="strengths" defaultValue={player.strengths ?? ""} rows={6} />
          <TextArea label="Weaknesses" name="weaknesses" defaultValue={player.weaknesses ?? ""} rows={6} />
        </div>
        <TextArea label="Accolades" name="accolades" defaultValue={player.accolades ?? ""} rows={3} className="mt-4" />
      </Section>

      {/* Skills & Traits */}
      <Section title="Skills & Traits">
        <SkillsTraitsEditor defaultValue={player.skills_traits as Record<string, { positives: string | null; negatives: string | null }>} />
      </Section>

      {/* JSON Fields */}
      <Section title="Advanced Data (JSON)">
        <p className="text-xs text-gray-500 mb-4">
          These fields store structured data as JSON. Edit carefully — invalid JSON will be replaced with empty objects.
        </p>
        <div className="space-y-4">
          <JsonField label="Overview" name="overview" defaultValue={player.overview} />
          <JsonField label="Site Ratings" name="site_ratings" defaultValue={player.site_ratings} />
          <JsonField label="PFF Scores" name="pff_scores" defaultValue={player.pff_scores} />
          <JsonField label="Athletic Scores" name="athletic_scores" defaultValue={player.athletic_scores} />
          <JsonField label="DraftBuzz Grades" name="draftbuzz_grades" defaultValue={player.draftbuzz_grades} />
          <JsonField label="Alignments" name="alignments" defaultValue={player.alignments} />
        </div>
      </Section>

      {/* Save / Delete */}
      <div className="flex items-center justify-between pt-4 border-t border-[#2a3a4e]">
        <div>
          {!isNew && (
            <>
              {!showDelete ? (
                <button
                  type="button"
                  onClick={() => setShowDelete(true)}
                  className="text-sm text-red-400/60 hover:text-red-400 transition-colors"
                >
                  Delete player…
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-red-400">Delete this player and all related data?</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    Yes, Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDelete(false)}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-orange-500 px-6 py-2.5 font-medium text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving…" : isNew ? "Create Player" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#2a3a4e] bg-[#1a2332] p-6">
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label, name, defaultValue, placeholder, type = "text", required,
}: {
  label: string; name: string; defaultValue?: string | number; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-gray-400 mb-1">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors"
      />
    </div>
  );
}

function TextArea({
  label, name, defaultValue, rows = 4, className = "",
}: {
  label: string; name: string; defaultValue?: string; rows?: number; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="block text-xs font-medium text-gray-400 mb-1">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        className="w-full rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors font-mono"
      />
    </div>
  );
}

function JsonField({
  label, name, defaultValue,
}: {
  label: string; name: string; defaultValue: unknown;
}) {
  const isEmpty = !defaultValue || JSON.stringify(defaultValue) === "{}";

  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-gray-400 mb-1">
        {label}
        {isEmpty && <span className="ml-2 text-gray-600">(empty)</span>}
      </label>
      <textarea
        id={name}
        name={name}
        defaultValue={isEmpty ? "" : JSON.stringify(defaultValue, null, 2)}
        rows={isEmpty ? 2 : Math.min(12, JSON.stringify(defaultValue, null, 2).split("\n").length + 1)}
        className="w-full rounded-lg border border-[#2a3a4e] bg-[#0d1320] px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors font-mono"
        placeholder="{}"
      />
    </div>
  );
}
