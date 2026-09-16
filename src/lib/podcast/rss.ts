// RSS feed parsing. Ported from podcast_pipeline/fetch_episodes.py.
//
// guid, title and date must come out exactly as feedparser produced them in
// Python: guid is how an episode is recognised as already processed, and
// date + title form the published section title.

import { PODCASTS, RECENT_EPISODES_PER_PODCAST, getPodcast } from "./config";

export interface FeedEpisode {
  podcastSlug: string;
  guid: string;
  title: string;
  date: string;        // YYYY-MM-DD (UTC, matching feedparser's published_parsed)
  audioUrl: string;
  duration: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Text content of the first <tag>, CDATA-aware and entity-decoded. */
function tagText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (cdata ? cdata[1] : decodeEntities(m[1])).trim();
}

function formatDuration(raw: string): string {
  if (!raw) return "";
  if (raw.includes(":")) return raw;
  const secs = parseInt(raw, 10);
  if (isNaN(secs)) return raw;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}` : `${m}:${String(secs % 60).padStart(2, "0")}`;
}

export async function fetchFeed(
  podcastSlug: string,
  limit = RECENT_EPISODES_PER_PODCAST,
): Promise<FeedEpisode[]> {
  const cfg = getPodcast(podcastSlug);
  const res = await fetch(cfg.rssUrl, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${cfg.displayName} feed returned HTTP ${res.status}`);
  const xml = await res.text();

  const episodes: FeedEpisode[] = [];
  for (const item of xml.split(/<item[\s>]/i).slice(1)) {
    if (episodes.length >= limit) break;

    const enclosure = [...item.matchAll(/<enclosure\b[^>]*>/gi)]
      .map((m) => m[0])
      .find((e) => /type="audio/i.test(e));
    const audioUrl = enclosure?.match(/url="([^"]+)"/i)?.[1];
    if (!audioUrl) continue;

    const pub = tagText(item, "pubDate");
    const parsed = pub ? new Date(pub) : null;
    const date = parsed && !isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : "unknown";

    episodes.push({
      podcastSlug,
      guid: tagText(item, "guid") || tagText(item, "link"),
      title: tagText(item, "title") || "Unknown Episode",
      date,
      audioUrl: decodeEntities(audioUrl),
      duration: formatDuration(tagText(item, "itunes:duration")),
    });
  }
  return episodes;
}

/** Recent episodes from every podcast, newest first. A failing feed is reported, not fatal. */
export async function fetchAllFeeds(): Promise<{ episodes: FeedEpisode[]; errors: string[] }> {
  const results = await Promise.allSettled(PODCASTS.map((p) => fetchFeed(p.slug)));
  const episodes: FeedEpisode[] = [];
  const errors: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") episodes.push(...r.value);
    else errors.push(`${PODCASTS[i].displayName}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });
  episodes.sort((a, b) => b.date.localeCompare(a.date));
  return { episodes, errors };
}
