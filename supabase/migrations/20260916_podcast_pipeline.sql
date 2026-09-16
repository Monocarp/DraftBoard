-- ============================================================================
-- Podcast pipeline: move state from local files into Supabase
-- ----------------------------------------------------------------------------
-- Replaces podcast_pipeline/pending_review/, published/ and
-- processed_episodes.json. Safe to run more than once.
--
-- Both tables have RLS enabled with NO policies: only the service-role key
-- (used by the /admin/podcasts server actions) can read or write them. They
-- hold unreviewed transcripts and extracts, which should not be public.
-- ============================================================================

create table if not exists podcast_episodes (
  id                  uuid primary key default gen_random_uuid(),
  podcast_slug        text not null,
  guid                text not null unique,
  -- Stored once and never refreshed from the feed: publishers rename episodes,
  -- and "episode_date — title" is the section title that prevents duplicates.
  title               text not null,
  episode_date        text not null,                 -- YYYY-MM-DD
  audio_url           text not null default '',
  duration            text,

  status              text not null default 'transcribing'
                      check (status in ('transcribing', 'extracting', 'review', 'published')),
  error               text,                          -- last failure; cleared on success

  -- Transcription (audio is split into overlapping byte ranges)
  audio_resolved_url  text,
  audio_bytes         bigint,
  transcript_chunks   jsonb not null default '[]'::jsonb,  -- text|null per piece, cleared once stitched
  chunks_total        int not null default 0,
  chunks_done         int not null default 0,
  transcript          text,

  -- Extraction
  discovered          jsonb not null default '[]'::jsonb,  -- players found + per-player outcome
  discovered_at       timestamptz,
  players_total       int not null default 0,
  players_done        int not null default 0,

  llm_cost_usd        numeric(10,4) not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_podcast_episodes_status on podcast_episodes(status);

create table if not exists podcast_extracts (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null references podcast_episodes(id) on delete cascade,
  player_id   uuid references players(id) on delete set null,
  slug        text not null,
  name        text not null,
  text        text not null,                         -- what gets published (GM-filtered, editable)
  raw_text    text not null,                         -- verbatim extraction, for comparison in review
  via         text,                                  -- ai | ai-fuzzy | name-scan
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (episode_id, slug)
);

create index if not exists idx_podcast_extracts_status on podcast_extracts(status);
create index if not exists idx_podcast_extracts_episode on podcast_extracts(episode_id);

alter table podcast_episodes enable row level security;
alter table podcast_extracts enable row level security;

-- ─── Backfill: episodes already published by the Python pipeline ────────────
-- Titles are taken from the section titles actually stored in `commentary`,
-- not from the local manifests (one manifest has a garbled apostrophe and one
-- episode was later renamed by its publisher). 11 episodes; the Python
-- processed_episodes.json only recorded 5 of them.
insert into podcast_episodes (podcast_slug, guid, title, episode_date, audio_url, status) values
  ('nflse', '08fda0e0-d4d0-4626-a2ef-0eee8d37c411', 'Senior Bowl Intel + Q&A', '2026-01-28', 'https://pscrb.fm/rss/p/mgln.ai/e/1385/injector.simplecastaudio.com/05487026-1849-494a-adda-0790c02f5076/episodes/a779cd67-9371-4cd1-abf9-82677c864a36/audio/128/default.mp3?aid=rss_feed&awCollectionId=05487026-1849-494a-adda-0790c02f5076&awEpisodeId=a779cd67-9371-4cd1-abf9-82677c864a36&feed=DjoMwzRw', 'published'),
  ('first-draft', 'f33ab6e0-b993-11f0-916a-03721d9a6e39', 'Mel Kiper''s top DAY-2 VALUE PICKS of 2026 NFL Draft! w/Field Yates', '2026-01-29', 'https://www.podtrac.com/pts/redirect.mp3/traffic.megaphone.fm/ESP3956719515.mp3?updated=1769630199', 'published'),
  ('first-draft', 'f3a99948-b993-11f0-916a-1f49aa489114', 'THE TOP-10 WIDE RECEIVERS of 2026 NFL Draft w/Mel Kiper & Field Yates', '2026-02-02', 'https://www.podtrac.com/pts/redirect.mp3/traffic.megaphone.fm/ESP6421836366.mp3?updated=1770056080', 'published'),
  ('nflse', 'a8655dc0-e318-4c29-a83d-cc9f81abdc2a', 'Early 2026 NFL Draft LB Rankings', '2026-02-04', 'https://pscrb.fm/rss/p/mgln.ai/e/1385/injector.simplecastaudio.com/05487026-1849-494a-adda-0790c02f5076/episodes/0a7e9362-012b-40a3-9309-c0a68dfd1bd4/audio/128/default.mp3?aid=rss_feed&awCollectionId=05487026-1849-494a-adda-0790c02f5076&awEpisodeId=0a7e9362-012b-40a3-9309-c0a68dfd1bd4&feed=DjoMwzRw', 'published'),
  ('first-draft', 'f3e16d00-b993-11f0-916a-a74df940b3c2', 'Mel Kiper''s TOP-10 EDGE RUSHERS of 2026 NFL Draft! w/Field Yates', '2026-02-05', 'https://www.podtrac.com/pts/redirect.mp3/traffic.megaphone.fm/ESP2643908556.mp3?updated=1770232689', 'published'),
  ('mcshay', 'e8d6d59a-ec14-11f0-b8e1-b70e7cc3a43e', 'Our Favorite 2026 Prospects and a Super Bowl NFL Draft Retrospective. Plus, Mailbag!', '2026-02-05', 'https://pdst.fm/e/traffic.megaphone.fm/GLT5122546648.mp3', 'published'),
  ('first-draft', 'f4115100-b993-11f0-916a-a71e0aec5f94', 'THE BIGGEST SLEEPERS of 2026 NFL Draft w/Mel Kiper & Field Yates', '2026-02-10', 'https://www.podtrac.com/pts/redirect.mp3/traffic.megaphone.fm/ESP2577579891.mp3?updated=1770683814', 'published'),
  ('first-draft', 'f479e4b8-b993-11f0-916a-73acd13d2aab', 'FIELD YATES'' MOCK DRAFT 3.0 Selections 11-32 w/Mel Kiper Jr.!', '2026-02-16', 'https://www.podtrac.com/pts/redirect.mp3/traffic.megaphone.fm/ESP7568895059.mp3?updated=1771264616', 'published'),
  ('mcshay', 'e8b2af12-ec14-11f0-b8e1-c3a2f6a2a076', 'Second-Round Prospects to Know Before the Combine. Plus, Chambliss Fallout and 2027 QB Class Intel.', '2026-02-16', 'https://pdst.fm/e/traffic.megaphone.fm/GLT1894695868.mp3', 'published'),
  ('first-draft', 'f4ae4992-b993-11f0-916a-530f0c7365c1', 'Mel Kiper''s STEALS of 2026 NFL Draft! w/Field Yates', '2026-02-19', 'https://www.podtrac.com/pts/redirect.mp3/traffic.megaphone.fm/ESP6925481340.mp3?updated=1771444097', 'published'),
  ('mcshay', 'e900b4fa-ec14-11f0-b8e1-e31eb077a1ff', 'Todd’s Pre-Combine Top-50 Big Board: A Surprise at 1, Mendoza Red Flags, and Other Takeaways. Plus, the Future of NFL Draft Psychological Testing.', '2026-02-19', 'https://pdst.fm/e/traffic.megaphone.fm/GLT8945622424.mp3', 'published')
on conflict (guid) do nothing;
