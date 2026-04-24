/**
 * Reddit Engagement Backfill
 *
 * For each of our posted Reddit comments/posts with a captured permalink,
 * fetch current score + reply count from Reddit's public JSON API and update
 * engagement_likes / engagement_comments on ai_generated_content.
 *
 * Reddit JSON endpoint: append `.json` to any permalink. No auth required.
 * Rate limit: ~60 req/min unauth'd. We stagger with 1.2s between calls.
 *
 * Backfill cadence: posts get visited at 2h, 24h, 7d after publish (engagement
 * curve is front-loaded but long-tail continues for days on popular threads).
 *
 * Run: npm run backfill
 * Scheduled: hourly in scheduler.ts (tickCount % 4 === 3).
 */

import 'dotenv/config';
import { supabase } from './config';

const USER_AGENT = 'Mozilla/5.0 (engagement-backfill; +https://github.com/)';
const REQUEST_INTERVAL_MS = 1200;
const BATCH_SIZE = 30;  // per run, to respect rate limits

interface BackfillRow {
  id: string;
  content_type: string;
  platform_url: string;
  posted_at: string | null;
  engagement_last_updated: string | null;
  engagement_likes: number | null;
  engagement_comments: number | null;
  target_subreddit: string | null;
}

/**
 * Decide whether a row is due for a refresh. Engagement ages quickly then
 * stabilizes; no point refreshing the same 14-day-old comment every hour.
 */
function isDueForRefresh(row: BackfillRow): boolean {
  if (!row.posted_at) return false;
  const postedMs = new Date(row.posted_at).getTime();
  const ageMs = Date.now() - postedMs;
  const ageHours = ageMs / 3600_000;

  // Skip dead rows (>14 days). Reddit comments rarely gain engagement that late.
  if (ageHours > 14 * 24) return false;

  if (!row.engagement_last_updated) return true;
  const lastMs = new Date(row.engagement_last_updated).getTime();
  const sinceLastHours = (Date.now() - lastMs) / 3600_000;

  // Refresh cadence scaled by post age:
  //   0–6h: refresh every 30 min   — engagement curve is steepest
  //   6–24h: every 2h
  //   1–3d: every 6h
  //   3–14d: every 24h
  const minGapHours =
    ageHours < 6 ? 0.5
    : ageHours < 24 ? 2
    : ageHours < 72 ? 6
    : 24;

  return sinceLastHours >= minGapHours;
}

interface RedditInfo {
  score: number | null;
  num_comments: number | null;
  ups: number | null;
  downs: number | null;
  kind: 't1' | 't3' | null;
}

async function fetchRedditJson(permalink: string): Promise<RedditInfo | null> {
  // Strip query string, strip trailing slash, append .json
  const cleaned = permalink.split('?')[0].replace(/\/$/, '');
  const jsonUrl = cleaned + '.json';

  try {
    const res = await fetch(jsonUrl, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json() as unknown;
    return extractEngagement(data);
  } catch {
    return null;
  }
}

function extractEngagement(raw: unknown): RedditInfo | null {
  if (!Array.isArray(raw)) return null;
  // Reddit JSON for a comment-permalink is an array:
  //   [0] = post listing (the parent submission)
  //   [1] = comment listing (the comments, including ours nested)
  // For a post permalink, [0] is the post and [1] is top-level comments.
  // We want the FIRST thing matched by the final path segment.
  for (const listing of raw as Array<{ data?: { children?: Array<{ kind?: string; data?: Record<string, unknown> }> } }>) {
    const children = listing?.data?.children || [];
    for (const child of children) {
      const d = child.data as Record<string, unknown> | undefined;
      if (!d) continue;
      // Walk replies tree if this is a comment thread with nested replies.
      const info = findDeepest(d);
      if (info) {
        return {
          score: typeof info.score === 'number' ? info.score : null,
          num_comments: typeof info.num_comments === 'number' ? info.num_comments : null,
          ups: typeof info.ups === 'number' ? info.ups : null,
          downs: typeof info.downs === 'number' ? info.downs : null,
          kind: (child.kind as 't1' | 't3') || null,
        };
      }
    }
  }
  return null;
}

function findDeepest(data: Record<string, unknown>): Record<string, unknown> | null {
  // If this node has a score, it's a real comment/post. Use it.
  if (typeof data.score === 'number' || typeof data.ups === 'number') return data;
  // Otherwise walk into replies if present.
  const replies = data.replies as { data?: { children?: Array<{ data?: Record<string, unknown> }> } } | string | undefined;
  if (replies && typeof replies === 'object' && replies.data?.children) {
    for (const child of replies.data.children) {
      if (child.data) {
        const found = findDeepest(child.data);
        if (found) return found;
      }
    }
  }
  return null;
}

export async function runRedditBackfill(): Promise<{ scanned: number; updated: number; skipped: number }> {
  const { data: rows, error } = await supabase
    .from('ai_generated_content')
    .select('id, content_type, platform_url, posted_at, engagement_last_updated, engagement_likes, engagement_comments, target_subreddit')
    .eq('platform', 'reddit')
    .eq('status', 'posted')
    .not('platform_url', 'is', null)
    .gte('posted_at', new Date(Date.now() - 14 * 86400_000).toISOString())
    .order('posted_at', { ascending: false })
    .limit(BATCH_SIZE * 3);  // Over-fetch, filter locally

  if (error) {
    console.error('[reddit-backfill] query failed:', error.message);
    return { scanned: 0, updated: 0, skipped: 0 };
  }
  if (!rows || rows.length === 0) {
    console.log('[reddit-backfill] no posted Reddit rows with permalinks in last 14d');
    return { scanned: 0, updated: 0, skipped: 0 };
  }

  const due = (rows as BackfillRow[]).filter(isDueForRefresh).slice(0, BATCH_SIZE);
  console.log(`[reddit-backfill] ${rows.length} candidates, ${due.length} due for refresh`);

  let updated = 0;
  let skipped = 0;

  for (const row of due) {
    const info = await fetchRedditJson(row.platform_url);
    await new Promise(r => setTimeout(r, REQUEST_INTERVAL_MS));

    if (!info) {
      skipped++;
      // Still mark we attempted — prevents tight re-querying a dead permalink
      await supabase.from('ai_generated_content')
        .update({ engagement_last_updated: new Date().toISOString() })
        .eq('id', row.id);
      continue;
    }

    const newLikes = info.score ?? info.ups ?? 0;
    const newComments = info.num_comments ?? 0;

    await supabase.from('ai_generated_content').update({
      engagement_likes: newLikes,
      engagement_comments: newComments,
      engagement_last_updated: new Date().toISOString(),
    }).eq('id', row.id);
    updated++;

    const delta =
      (row.engagement_likes ?? 0) !== newLikes || (row.engagement_comments ?? 0) !== newComments
        ? ` (↑${newLikes - (row.engagement_likes ?? 0)} score, ↑${newComments - (row.engagement_comments ?? 0)} replies)`
        : '';
    console.log(`  ${row.id.slice(0, 8)} r/${row.target_subreddit || '?'} → score=${newLikes} replies=${newComments}${delta}`);
  }

  console.log(`[reddit-backfill] done — updated ${updated}, skipped ${skipped}`);
  return { scanned: due.length, updated, skipped };
}

if (require.main === module) {
  runRedditBackfill()
    .then(r => { console.log(`[reddit-backfill] ${JSON.stringify(r)}`); process.exit(0); })
    .catch(err => { console.error('[reddit-backfill] fatal:', err); process.exit(1); });
}
