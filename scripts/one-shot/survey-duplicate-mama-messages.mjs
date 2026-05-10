// Backfill survey for the 2026-04-30 triple-Mama-message bug (migration 314).
//
// Counts users in the last N days who received 3+ identical handler_outreach_queue
// messages within a 5-minute window. Read-only — does not delete or modify rows.
// Operator decides whether to clean any survivors manually.
//
// Usage:
//   node scripts/one-shot/survey-duplicate-mama-messages.mjs           # last 30d
//   DAYS=7 node scripts/one-shot/survey-duplicate-mama-messages.mjs     # last 7d
//   THRESHOLD=2 node scripts/one-shot/survey-duplicate-mama-messages.mjs # 2+ dupes
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://atevwvexapiykchvqvhm.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DAYS = Math.max(1, Math.min(180, Number(process.env.DAYS) || 30));
const THRESHOLD = Math.max(2, Math.min(20, Number(process.env.THRESHOLD) || 3));
const WINDOW_MINUTES = Math.max(1, Math.min(60, Number(process.env.WINDOW_MINUTES) || 5));

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function fetchRecent() {
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const { data, error } = await supabase
    .from('handler_outreach_queue')
    .select('id, user_id, message, status, created_at, delivered_at, source')
    .gte('created_at', since)
    .order('user_id', { ascending: true })
    .order('message', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(50000);
  if (error) throw new Error(`query: ${error.message}`);
  return data || [];
}

function findClusters(rows) {
  const clusters = [];
  const windowMs = WINDOW_MINUTES * 60_000;
  // Rows are sorted by (user_id, message, created_at). Walk a sliding
  // window: for each contiguous run sharing (user_id, message), find any
  // sub-window of length WINDOW_MINUTES that contains >= THRESHOLD rows.
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (
      j + 1 < rows.length
      && rows[j + 1].user_id === rows[i].user_id
      && rows[j + 1].message === rows[i].message
    ) j++;
    // [i..j] is one (user, message) bucket
    if (j - i + 1 >= THRESHOLD) {
      // Sliding window over the timestamps to find any cluster of size >= THRESHOLD
      let left = i;
      for (let right = i; right <= j; right++) {
        const tR = new Date(rows[right].created_at).getTime();
        while (left <= right && tR - new Date(rows[left].created_at).getTime() > windowMs) {
          left++;
        }
        if (right - left + 1 >= THRESHOLD) {
          clusters.push({
            user_id: rows[i].user_id,
            message: rows[i].message,
            count: right - left + 1,
            first: rows[left].created_at,
            last: rows[right].created_at,
            row_ids: rows.slice(left, right + 1).map(r => r.id),
            statuses: rows.slice(left, right + 1).map(r => r.status),
            sources: [...new Set(rows.slice(left, right + 1).map(r => r.source))],
          });
          break; // one cluster per bucket is enough for the survey
        }
      }
    }
    i = j + 1;
  }
  return clusters;
}

async function main() {
  console.log(
    `[survey] window=${DAYS}d, threshold=${THRESHOLD}+ identical messages within ${WINDOW_MINUTES}min`,
  );
  const rows = await fetchRecent();
  console.log(`[survey] scanned ${rows.length} outreach rows`);
  const clusters = findClusters(rows);

  if (clusters.length === 0) {
    console.log('[survey] no triple-send clusters found');
    return;
  }

  // Group by user for reporting
  const byUser = new Map();
  for (const c of clusters) {
    if (!byUser.has(c.user_id)) byUser.set(c.user_id, []);
    byUser.get(c.user_id).push(c);
  }

  console.log(`[survey] ${byUser.size} affected user(s), ${clusters.length} cluster(s)`);
  console.log('');

  for (const [uid, cs] of byUser.entries()) {
    console.log(`User ${uid}: ${cs.length} cluster(s)`);
    for (const c of cs) {
      const live = c.statuses.filter(s => s === 'pending' || s === 'queued' || s === 'scheduled').length;
      console.log(`  - ${c.count}x in ${WINDOW_MINUTES}min @ ${c.first} (sources=${c.sources.join(',')}, still-pending=${live})`);
      console.log(`    msg: "${c.message.slice(0, 100)}${c.message.length > 100 ? '...' : ''}"`);
    }
    console.log('');
  }

  console.log('[survey] read-only. No rows deleted. Operator decides on cleanup.');
}

main().catch(err => {
  console.error('[survey] failed:', err);
  process.exit(1);
});
