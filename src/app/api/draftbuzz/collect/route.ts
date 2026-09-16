// Endpoint for the DraftBuzz collector (public/draftbuzz-collector.js), which
// runs in the admin's browser on nfldraftbuzz.com and posts parsed profiles here.
//
// Auth is the run code created on /admin/draftbuzz (sent as a Bearer token and
// matched by SHA-256 hash), not a login cookie: the request comes from the
// DraftBuzz page, where the admin site's cookies aren't available. Codes expire
// after 24 hours and a run stops accepting data once it has been imported.
//
// CORS only allows the DraftBuzz origins. Nothing here writes player records;
// profiles are staged until the admin imports them from the admin page.

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeCode, sanitizeProfile } from "@/lib/draftbuzz/mapping";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = new Set(["https://www.nfldraftbuzz.com", "https://nfldraftbuzz.com"]);
const MAX_BATCH = 25;
const MAX_MANIFEST = 3000;

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

function db(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function receivedUrls(client: SupabaseClient, runId: string): Promise<string[]> {
  const urls: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from("draftbuzz_profiles").select("url").eq("run_id", runId).range(from, from + 999);
    if (error) throw new Error(error.message);
    urls.push(...(data ?? []).map((r) => r.url));
    if (!data || data.length < 1000) break;
  }
  return urls;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(origin, 403, { error: "Origin not allowed." });

  const auth = request.headers.get("authorization") ?? "";
  const code = normalizeCode(auth.replace(/^Bearer\s+/i, ""));
  if (code.length !== 12) return json(origin, 401, { error: "Missing or malformed run code." });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(origin, 400, { error: "Invalid JSON." });
  }

  const client = db();
  const { data: run, error: runErr } = await client
    .from("draftbuzz_runs")
    .select("id, draft_year, status, expires_at, manifest")
    .eq("code_hash", createHash("sha256").update(code).digest("hex"))
    .maybeSingle();
  if (runErr) return json(origin, 500, { error: "Could not look up run." });
  if (!run) return json(origin, 401, { error: "That run code isn't valid. Create a new run on your admin page." });
  if (new Date(run.expires_at).getTime() < Date.now()) return json(origin, 401, { error: "That run code has expired. Create a new run on your admin page." });
  if (run.status === "imported") return json(origin, 409, { error: "This run was already imported. Create a new run to collect again." });

  const now = new Date().toISOString();

  try {
    switch (body.action) {
      case "start": {
        return json(origin, 200, {
          runId: run.id,
          draftYear: run.draft_year,
          manifest: Array.isArray(run.manifest) ? run.manifest : null,
          received: await receivedUrls(client, run.id),
        });
      }

      case "manifest": {
        if (Array.isArray(run.manifest)) return json(origin, 200, { ok: true, alreadySet: true });
        const entries = (Array.isArray(body.entries) ? body.entries : []).slice(0, MAX_MANIFEST)
          .map((e) => {
            const r = (e ?? {}) as Record<string, unknown>;
            return {
              url: typeof r.url === "string" ? r.url.slice(0, 200) : "",
              code: typeof r.code === "string" ? r.code.slice(0, 20) : "",
              name: typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, 120) : "",
            };
          })
          .filter((e) => /^\/Player\/[A-Za-z0-9._'-]+$/.test(e.url) && e.name);
        if (entries.length === 0) return json(origin, 400, { error: "Manifest contained no valid players." });
        const stats = body.listStats && typeof body.listStats === "object" ? body.listStats : {};
        const { error } = await client.from("draftbuzz_runs")
          .update({ manifest: entries, list_stats: stats, profiles_expected: entries.length, updated_at: now })
          .eq("id", run.id);
        if (error) throw new Error(error.message);
        return json(origin, 200, { ok: true, expected: entries.length });
      }

      case "batch": {
        const raw = Array.isArray(body.profiles) ? body.profiles : [];
        if (raw.length > MAX_BATCH) return json(origin, 413, { error: `At most ${MAX_BATCH} profiles per batch.` });
        const profiles = raw.map(sanitizeProfile).filter((p): p is NonNullable<typeof p> => p !== null);
        if (profiles.length) {
          const { error } = await client.from("draftbuzz_profiles").upsert(
            profiles.map((p) => ({ run_id: run.id, url: p.url, list_code: p.listCode, data: p, received_at: now, import_status: null, import_note: null })),
            { onConflict: "run_id,url" },
          );
          if (error) throw new Error(error.message);
        }
        const { count } = await client.from("draftbuzz_profiles").select("id", { count: "exact", head: true }).eq("run_id", run.id);
        await client.from("draftbuzz_runs").update({ profiles_received: count ?? 0, updated_at: now }).eq("id", run.id);
        return json(origin, 200, { accepted: profiles.length, rejected: raw.length - profiles.length, received: count ?? 0 });
      }

      case "finish": {
        const { count } = await client.from("draftbuzz_profiles").select("id", { count: "exact", head: true }).eq("run_id", run.id);
        const { error } = await client.from("draftbuzz_runs")
          .update({ status: "collected", collected_at: now, profiles_received: count ?? 0, updated_at: now })
          .eq("id", run.id);
        if (error) throw new Error(error.message);
        return json(origin, 200, { ok: true, received: count ?? 0 });
      }

      default:
        return json(origin, 400, { error: "Unknown action." });
    }
  } catch (e) {
    return json(origin, 500, { error: e instanceof Error ? e.message : "Server error." });
  }
}
