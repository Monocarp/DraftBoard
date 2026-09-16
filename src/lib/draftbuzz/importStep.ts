// DraftBuzz import orchestration: move staged profiles into player records.
//
// The actual database writes for grades, overview, site ratings, bio sources,
// comps and projected rounds are done by the existing DraftBuzz importer, which
// is passed in as `deps.importRows` (the admin page supplies importData from
// admin/upload/actions.ts). Keeping that as an injected dependency — and having
// no Next.js imports — lets this logic be tested outside the app.

import type { SupabaseClient } from "@supabase/supabase-js";
import { COMMENTARY_SOURCE, toCommentaryText, toImportRow, type CollectedProfile } from "./mapping";

export interface ImportCounts { imported: number; unmatched: number; error: number; skipped: number; pending: number }
export interface ImportStepResult { done: boolean; processed: number; counts: ImportCounts }

export interface ImportDeps {
  /** Import rows for one position group, e.g. importData("draftbuzz_grades", rows, ..., `DB ${group}`, ...). */
  importRows(rows: Record<string, string>[], group: string, draftYear: number): Promise<{ success: boolean; errors: string[] }>;
  /** Board player id for a name (already matched by importRows, so no pending-queue side effects). */
  resolvePlayerId(name: string, draftYear: number): Promise<string | null>;
}

export interface StagedRow { id: string; url: string; data: CollectedProfile; import_status: string | null; import_note: string | null }

export const PROFILES_PER_STEP = 40;

export async function loadStaged(db: SupabaseClient, runId: string, columns: string): Promise<StagedRow[]> {
  const rows: StagedRow[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from("draftbuzz_profiles").select(columns).eq("run_id", runId)
      .order("list_code").order("url").range(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as StagedRow[]));
    if (!data || data.length < 500) break;
  }
  return rows;
}

export function countStatuses(rows: { import_status: string | null }[]): ImportCounts {
  const c: ImportCounts = { imported: 0, unmatched: 0, error: 0, skipped: 0, pending: 0 };
  for (const r of rows) {
    if (r.import_status === "imported") c.imported++;
    else if (r.import_status === "unmatched") c.unmatched++;
    else if (r.import_status === "error") c.error++;
    else if (r.import_status === "skipped") c.skipped++;
    else c.pending++;
  }
  return c;
}

/**
 * Import the next batch of staged profiles; call repeatedly until done.
 * Profiles are grouped by position group because the DraftBuzz importer is
 * group-specific ("DB CB", "DB LB", ...), like one spreadsheet tab each.
 */
export async function importRunStep(
  db: SupabaseClient,
  runId: string,
  includeCommentary: boolean,
  deps: ImportDeps,
  perStep = PROFILES_PER_STEP,
): Promise<ImportStepResult> {
  const { data: run, error: runErr } = await db.from("draftbuzz_runs").select("id, draft_year, status").eq("id", runId).single();
  if (runErr || !run) throw new Error("Run not found.");
  if (run.status === "imported") throw new Error("This run has already been imported.");

  const { data: batchData, error: batchErr } = await db.from("draftbuzz_profiles")
    .select("id, url, data, import_status, import_note")
    .eq("run_id", runId).is("import_status", null)
    .order("list_code").order("url")
    .limit(perStep);
  if (batchErr) throw new Error(batchErr.message);
  const batch = (batchData ?? []) as unknown as StagedRow[];

  const now = new Date().toISOString();
  const updates: { id: string; import_status: string; import_note: string | null }[] = [];

  const groups = new Map<string, { staged: StagedRow; row: Record<string, string> }[]>();
  for (const staged of batch) {
    const { group, row } = toImportRow(staged.data);
    if (!group) {
      updates.push({ id: staged.id, import_status: "skipped", import_note: `Unrecognized grades layout (${Object.keys(staged.data.grades).join(", ") || "no grades"})` });
      continue;
    }
    const list = groups.get(group) ?? [];
    list.push({ staged, row });
    groups.set(group, list);
  }

  for (const [group, items] of groups) {
    let result: { success: boolean; errors: string[] };
    try {
      result = await deps.importRows(items.map((i) => i.row), group, run.draft_year);
    } catch (e) {
      result = { success: false, errors: [e instanceof Error ? e.message : String(e)] };
    }

    // The DraftBuzz importer reports per-row problems as "Row N: ..." (1-based).
    const rowErrors = new Map<number, string>();
    const generalErrors: string[] = [];
    for (const msg of result.errors) {
      const m = msg.match(/^Row (\d+): (.*)$/);
      if (m) rowErrors.set(Number(m[1]) - 1, m[2]);
      else generalErrors.push(msg);
    }

    for (let i = 0; i < items.length; i++) {
      const { staged } = items[i];
      const rowError = rowErrors.get(i);
      if (!result.success && generalErrors.length) {
        updates.push({ id: staged.id, import_status: "error", import_note: generalErrors.join("; ").slice(0, 500) });
      } else if (rowError?.startsWith("Could not resolve player")) {
        updates.push({ id: staged.id, import_status: "unmatched", import_note: "Not matched to a board player — see Pending players" });
      } else if (rowError) {
        updates.push({ id: staged.id, import_status: "error", import_note: rowError.slice(0, 500) });
      } else {
        let note: string | null = null;
        const text = includeCommentary ? toCommentaryText(staged.data) : null;
        if (text) {
          try {
            const playerId = await deps.resolvePlayerId(staged.data.name, run.draft_year);
            if (playerId) await replaceCommentary(db, playerId, text);
            else note = "Grades imported; scouting text skipped (player not found for commentary).";
          } catch (e) {
            note = `Grades imported; scouting text failed: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
        updates.push({ id: staged.id, import_status: "imported", import_note: note });
      }
    }
  }

  for (const u of updates) {
    const { error } = await db.from("draftbuzz_profiles")
      .update({ import_status: u.import_status, import_note: u.import_note, imported_at: now }).eq("id", u.id);
    if (error) throw new Error(error.message);
  }

  const counts = countStatuses(await loadStaged(db, runId, "id, import_status"));
  const done = counts.pending === 0;
  if (done) {
    const { error } = await db.from("draftbuzz_runs")
      .update({ status: "imported", imported_at: now, import_result: counts, updated_at: now }).eq("id", runId);
    if (error) throw new Error(error.message);
  }
  return { done, processed: batch.length, counts };
}

/** One "Overview" section per player, the format of existing "NFL Draft Buzz Comments" rows. */
export async function replaceCommentary(db: SupabaseClient, playerId: string, text: string): Promise<void> {
  const sections = [{ title: "Overview", text }];
  const { data: existing, error } = await db.from("commentary")
    .select("id").eq("player_id", playerId).eq("source", COMMENTARY_SOURCE).maybeSingle();
  if (error) throw new Error(error.message);
  const { error: writeErr } = existing
    ? await db.from("commentary").update({ sections }).eq("id", existing.id)
    : await db.from("commentary").insert({ player_id: playerId, source: COMMENTARY_SOURCE, sections });
  if (writeErr) throw new Error(writeErr.message);
}
