-- ============================================================================
-- DraftBuzz collector: runs + staged profiles
-- ----------------------------------------------------------------------------
-- The collector runs in the admin's own browser on nfldraftbuzz.com (a
-- bookmarklet) and posts parsed profiles here. Nothing touches player records
-- until the admin reviews the run's report and imports it from /admin/draftbuzz.
--
-- RLS is enabled with NO policies on both tables: only the service-role key
-- (server routes + admin server actions) can read or write them. The collector
-- itself never talks to Supabase directly; it authenticates to the app's API
-- with a short-lived run code, stored here only as a SHA-256 hash.
-- Safe to run more than once.
-- ============================================================================

create table if not exists draftbuzz_runs (
  id                  uuid primary key default gen_random_uuid(),
  code_hash           text not null unique,
  draft_year          int not null,
  status              text not null default 'collecting'
                      check (status in ('collecting', 'collected', 'imported')),
  expires_at          timestamptz not null,

  -- Every profile URL found on the list pages: [{ "url": "/Player/...", "code": "LB/ED", "name": "..." }]
  manifest            jsonb,
  list_stats          jsonb not null default '{}'::jsonb,
  profiles_expected   int not null default 0,
  profiles_received   int not null default 0,

  import_result       jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  collected_at        timestamptz,
  imported_at         timestamptz
);

create table if not exists draftbuzz_profiles (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references draftbuzz_runs(id) on delete cascade,
  url            text not null,                 -- "/Player/Dante-Moore-QB-UCLA"
  list_code      text,                          -- position code shown on the list page, e.g. "DE/ED"
  data           jsonb not null,                -- raw parse: labels exactly as the page shows them
  received_at    timestamptz not null default now(),
  import_status  text check (import_status in ('imported', 'unmatched', 'error', 'skipped')),
  import_note    text,
  imported_at    timestamptz,
  unique (run_id, url)
);

create index if not exists idx_draftbuzz_profiles_run on draftbuzz_profiles(run_id, import_status);

alter table draftbuzz_runs enable row level security;
alter table draftbuzz_profiles enable row level security;
