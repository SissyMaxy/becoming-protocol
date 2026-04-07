/**
 * Status check — shows what the bot has done recently.
 * Run: npx tsx status.ts
 */

import 'dotenv/config';
import { supabase } from './config';

const USER_ID = process.env.USER_ID || '';

async function main() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  console.log(`=== Bot Status — ${now.toLocaleString()} ===\n`);

  // ── Today's posts ──────────────────────────────────────────────
  const { data: todayPosts } = await supabase
    .from('ai_generated_content')
    .select('platform, content_type, status, content, posted_at, scheduled_at')
    .eq('user_id', USER_ID)
    .gte('created_at', today)
    .order('created_at', { ascending: false });

  const posted = (todayPosts || []).filter(r => r.status === 'posted');
  const scheduled = (todayPosts || []).filter(r => r.status === 'scheduled');
  const failed = (todayPosts || []).filter(r => r.status === 'failed');

  console.log(`TODAY: ${posted.length} posted, ${scheduled.length} queued, ${failed.length} failed\n`);

  if (posted.length > 0) {
    console.log('Posted:');
    for (const p of posted.slice(0, 15)) {
      const time = p.posted_at ? new Date(p.posted_at).toLocaleTimeString() : '?';
      const preview = (p.content || '').substring(0, 70).replace(/\n/g, ' ');
      console.log(`  ${time} [${p.platform}/${p.content_type}] "${preview}..."`);
    }
    console.log('');
  }

  if (scheduled.length > 0) {
    console.log('Queued:');
    for (const s of scheduled) {
      const time = s.scheduled_at ? new Date(s.scheduled_at).toLocaleTimeString() : '?';
      const preview = (s.content || '').substring(0, 70).replace(/\n/g, ' ');
      console.log(`  ${time} [${s.platform}/${s.content_type}] "${preview}..."`);
    }
    console.log('');
  }

  // ── Replies (last 24h) ─────────────────────────────────────────
  const { data: replies } = await supabase
    .from('ai_generated_content')
    .select('platform, content_type, status, content, target_account, posted_at')
    .eq('user_id', USER_ID)
    .eq('content_type', 'reply')
    .eq('status', 'posted')
    .gte('posted_at', last24h)
    .order('posted_at', { ascending: false });

  console.log(`REPLIES (24h): ${(replies || []).length}`);
  for (const r of (replies || []).slice(0, 10)) {
    const time = r.posted_at ? new Date(r.posted_at).toLocaleTimeString() : '?';
    const preview = (r.content || '').substring(0, 60).replace(/\n/g, ' ');
    console.log(`  ${time} → @${r.target_account || '?'}: "${preview}..."`);
  }
  console.log('');

  // ── Quote tweets (last 24h) ────────────────────────────────────
  const { data: qts } = await supabase
    .from('ai_generated_content')
    .select('content, target_account, status, posted_at')
    .eq('user_id', USER_ID)
    .eq('content_type', 'quote_tweet')
    .gte('created_at', last24h)
    .order('created_at', { ascending: false });

  const qtPosted = (qts || []).filter(r => r.status === 'posted');
  const qtFailed = (qts || []).filter(r => r.status === 'failed');
  console.log(`QUOTE TWEETS (24h): ${qtPosted.length} posted, ${qtFailed.length} failed`);
  for (const q of qtPosted.slice(0, 5)) {
    const preview = (q.content || '').substring(0, 60).replace(/\n/g, ' ');
    console.log(`  → @${q.target_account || '?'}: "${preview}..."`);
  }
  console.log('');

  // ── Follows (last 24h) ─────────────────────────────────────────
  const { data: follows } = await supabase
    .from('twitter_follows')
    .select('target_handle, source, status, followed_at')
    .eq('user_id', USER_ID)
    .gte('followed_at', last24h)
    .order('followed_at', { ascending: false });

  console.log(`FOLLOWS (24h): ${(follows || []).length}`);
  for (const f of (follows || []).slice(0, 10)) {
    const time = f.followed_at ? new Date(f.followed_at).toLocaleTimeString() : '?';
    console.log(`  ${time} @${f.target_handle} (${f.source}) — ${f.status}`);
  }
  console.log('');

  // ── Unfollows (last 24h) ───────────────────────────────────────
  const { data: unfollows } = await supabase
    .from('twitter_follows')
    .select('target_handle, unfollowed_at')
    .eq('user_id', USER_ID)
    .eq('status', 'unfollowed_stale')
    .gte('unfollowed_at', last24h)
    .order('unfollowed_at', { ascending: false });

  console.log(`UNFOLLOWS (24h): ${(unfollows || []).length}`);
  for (const u of (unfollows || []).slice(0, 5)) {
    console.log(`  @${u.target_handle}`);
  }
  console.log('');

  // ── Follower growth ─────────────────────────────────────────────
  const { data: latestCount } = await supabase
    .from('twitter_follower_counts')
    .select('follower_count, following_count, recorded_at')
    .eq('user_id', USER_ID)
    .order('recorded_at', { ascending: false })
    .limit(1);

  const currentFollowers = latestCount?.[0]?.follower_count || 0;
  const currentFollowing = latestCount?.[0]?.following_count || 0;
  const lastRecorded = latestCount?.[0]?.recorded_at
    ? new Date(latestCount[0].recorded_at).toLocaleTimeString()
    : 'never';

  console.log(`FOLLOWERS: ${currentFollowers} followers, ${currentFollowing} following (as of ${lastRecorded})`);

  // Net growth across time windows
  const windows = [
    { label: '1h', ms: 1 * 60 * 60 * 1000 },
    { label: '12h', ms: 12 * 60 * 60 * 1000 },
    { label: '24h', ms: 24 * 60 * 60 * 1000 },
    { label: '72h', ms: 72 * 60 * 60 * 1000 },
    { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
    { label: 'today', ms: now.getTime() - new Date(today).getTime() },
  ];

  const growthParts: string[] = [];
  for (const w of windows) {
    const since = new Date(now.getTime() - w.ms).toISOString();
    const { data: oldest } = await supabase
      .from('twitter_follower_counts')
      .select('follower_count')
      .eq('user_id', USER_ID)
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: true })
      .limit(1);

    if (oldest?.[0]) {
      const delta = currentFollowers - oldest[0].follower_count;
      const sign = delta >= 0 ? '+' : '';
      growthParts.push(`${w.label}: ${sign}${delta}`);
    } else {
      growthParts.push(`${w.label}: --`);
    }
  }
  console.log(`  Growth: ${growthParts.join(' | ')}`);

  // Follower snapshot (processing queue)
  const { count: snapshotTotal } = await supabase
    .from('twitter_followers_snapshot')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER_ID);

  const { count: unprocessed } = await supabase
    .from('twitter_followers_snapshot')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
    .eq('processed', false);

  console.log(`  Snapshot queue: ${snapshotTotal || 0} seen, ${unprocessed || 0} unprocessed`);

  // ── Follow totals ──────────────────────────────────────────────
  const { count: activeFollows } = await supabase
    .from('twitter_follows')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
    .in('status', ['followed', 'followed_back']);

  const { count: followedBack } = await supabase
    .from('twitter_follows')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
    .eq('status', 'followed_back');

  const { count: totalUnfollowed } = await supabase
    .from('twitter_follows')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
    .eq('status', 'unfollowed_stale');

  console.log(`FOLLOW TOTALS: ${activeFollows || 0} active (${followedBack || 0} mutual), ${totalUnfollowed || 0} unfollowed`);
  console.log('');

  // ── Budget usage ───────────────────────────────────────────────
  const { data: budget } = await supabase
    .from('platform_engagement_budget')
    .select('platform, engagement_type, count, max_allowed')
    .eq('user_id', USER_ID)
    .eq('date', today);

  console.log('BUDGET (today):');
  if (!budget || budget.length === 0) {
    console.log('  No engagement recorded yet today');
  } else {
    for (const b of budget) {
      const pct = b.max_allowed ? Math.round((b.count / b.max_allowed) * 100) : 0;
      console.log(`  ${b.platform}/${b.engagement_type}: ${b.count}/${b.max_allowed} (${pct}%)`);
    }
  }

  // ── Weekly summary ─────────────────────────────────────────────
  const { data: weekPosts } = await supabase
    .from('ai_generated_content')
    .select('platform, content_type, status')
    .eq('user_id', USER_ID)
    .eq('status', 'posted')
    .gte('posted_at', lastWeek);

  const weekByType: Record<string, number> = {};
  for (const p of weekPosts || []) {
    const key = `${p.platform}/${p.content_type}`;
    weekByType[key] = (weekByType[key] || 0) + 1;
  }

  console.log(`\nWEEKLY TOTALS (7 days):`);
  for (const [key, count] of Object.entries(weekByType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key}: ${count}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
