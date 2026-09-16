"use server";

// Server actions for /admin/draftbuzz: create collector runs, review what a run
// collected, and import it.
//
// Importing reuses importData("draftbuzz_grades", ...) from the upload page —
// the same admin-checked code path every DraftBuzz spreadsheet upload uses —
// by shaping each collected profile into a spreadsheet row
// (src/lib/draftbuzz/mapping.ts). Imports run in short steps so a full class
// (~350 players) never approaches the serverless time limit.

import { createHash, randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";
import { importData, buildCaches, resolvePlayerId } from "../upload/actions";
import { computeReport, formatCode, normalizeCode, type RunReport } from "@/lib/draftbuzz/mapping";
import {
  countStatuses, importRunStep as runImportStep, loadStaged,
  type ImportCounts, type ImportStepResult,
} from "@/lib/draftbuzz/importStep";

export type { ImportCounts, ImportStepResult } from "@/lib/draftbuzz/importStep";

const CODE_LIFETIME_MS = 24 * 60 * 60 * 1000;

function createServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function requireAdmin(): Promise<SupabaseClient> {
  const auth = await createSupabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) throw new Error("Unauthorized");
  return createServiceClient();
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RunSummary {
  id: string;
  draftYear: number;
  status: "collecting" | "collected" | "imported";
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  expected: number;
  received: number;
  collectedAt: string | null;
  importedAt: string | null;
  importResult: Partial<ImportCounts>;
}

interface RunRow {
  id: string; draft_year: number; status: RunSummary["status"]; created_at: string; expires_at: string;
  profiles_expected: number; profiles_received: number; collected_at: string | null; imported_at: string | null;
  import_result: Partial<ImportCounts> | null;
}

const toSummary = (r: RunRow): RunSummary => ({
  id: r.id, draftYear: r.draft_year, status: r.status, createdAt: r.created_at, expiresAt: r.expires_at,
  expired: new Date(r.expires_at).getTime() < Date.now(), expected: r.profiles_expected, received: r.profiles_received,
  collectedAt: r.collected_at, importedAt: r.imported_at, importResult: r.import_result ?? {},
});

const RUN_COLUMNS = "id, draft_year, status, created_at, expires_at, profiles_expected, profiles_received, collected_at, imported_at, import_result";

// ─── Runs ───────────────────────────────────────────────────────────────────

export async function getRuns(): Promise<RunSummary[]> {
  const db = await requireAdmin();
  const { data, error } = await db.from("draftbuzz_runs").select(RUN_COLUMNS).order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error(`Could not load runs (has the migration been run?): ${error.message}`);
  return (data as RunRow[]).map(toSummary);
}

/** Create a run and return its code. The code is shown once; only its hash is stored. */
export async function createRun(draftYear: number): Promise<{ run: RunSummary; code: string }> {
  const db = await requireAdmin();
  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(draftYear) || draftYear < thisYear - 1 || draftYear > thisYear + 2) {
    throw new Error("Pick a draft year close to the current one.");
  }
  const code = formatCode(Array.from({ length: 12 }, () => randomInt(32)));
  const { data, error } = await db.from("draftbuzz_runs").insert({
    code_hash: createHash("sha256").update(normalizeCode(code)).digest("hex"),
    draft_year: draftYear,
    expires_at: new Date(Date.now() + CODE_LIFETIME_MS).toISOString(),
  }).select(RUN_COLUMNS).single();
  if (error || !data) throw new Error(`Could not create run: ${error?.message}`);
  return { run: toSummary(data as RunRow), code };
}

export async function deleteRun(runId: string): Promise<void> {
  const db = await requireAdmin();
  const { error } = await db.from("draftbuzz_runs").delete().eq("id", runId);
  if (error) throw new Error(error.message);
}

// ─── Report ─────────────────────────────────────────────────────────────────

export interface RunDetail {
  run: RunSummary;
  report: RunReport;
  counts: ImportCounts;
  problems: { name: string; status: string; note: string }[];
}

export async function getRunDetail(runId: string): Promise<RunDetail> {
  const db = await requireAdmin();
  const { data: run, error } = await db.from("draftbuzz_runs").select(RUN_COLUMNS).eq("id", runId).single();
  if (error || !run) throw new Error("Run not found.");
  const staged = await loadStaged(db, runId, "id, url, data, import_status, import_note");
  return {
    run: toSummary(run as RunRow),
    report: computeReport(staged.map((s) => s.data), (run as RunRow).profiles_expected),
    counts: countStatuses(staged),
    problems: staged
      .filter((s) => s.import_status && s.import_status !== "imported")
      .map((s) => ({ name: s.data.name, status: s.import_status!, note: s.import_note ?? "" })),
  };
}

// ─── Import ─────────────────────────────────────────────────────────────────

/**
 * Import the next batch of staged profiles; the page calls this until done.
 * Grades/overview/ratings/bio/comps/rounds go through importData — the same
 * admin-checked importer the DraftBuzz spreadsheet upload uses.
 */
export async function importRunStep(runId: string, includeCommentary: boolean): Promise<ImportStepResult> {
  const db = await requireAdmin();
  const authClient = await createSupabaseServer();
  let caches: Awaited<ReturnType<typeof buildCaches>> | null = null;

  return runImportStep(db, runId, includeCommentary, {
    importRows: (rows, group, draftYear) =>
      importData("draftbuzz_grades", rows, { player_name: "player_name" }, `DB ${group}`, undefined, draftYear),
    resolvePlayerId: async (name, draftYear) => {
      caches ??= await buildCaches(authClient, draftYear);
      return resolvePlayerId(authClient, caches, name);
    },
  });
}
