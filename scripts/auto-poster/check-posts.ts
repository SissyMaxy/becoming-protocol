import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

async function main() {
  console.log('=== Checking AI content pipeline ===\n');

  // 1. Any scheduled posts waiting?
  const { data: scheduled, error: e1 } = await sb
    .from('ai_generated_content')
    .select('id, platform, content_type, status, content, scheduled_at')
    .eq('status', 'scheduled')
    .order('scheduled_at', { ascending: false })
    .limit(10);

  console.log(`Scheduled posts: ${scheduled?.length || 0}${e1 ? ` (error: ${e1.message})` : ''}`);
  for (const r of scheduled || []) {
    console.log(`  [${r.platform}] ${r.content_type} — "${(r.content || '').substring(0, 60)}..." @ ${r.scheduled_at}`);
  }

  // 2. Recent posted (non-reply)
  const { data: posted } = await sb
    .from('ai_generated_content')
    .select('id, platform, content_type, content, posted_at')
    .eq('status', 'posted')
    .neq('content_type', 'reply')
    .order('posted_at', { ascending: false })
    .limit(10);

  console.log(`\nRecent posted (non-reply): ${posted?.length || 0}`);
  for (const r of posted || []) {
    console.log(`  [${r.platform}] ${r.content_type} — "${(r.content || '').substring(0, 60)}..." @ ${r.posted_at}`);
  }

  // 3. Recent replies
  const { data: replies } = await sb
    .from('ai_generated_content')
    .select('id, platform, content_type, content, posted_at')
    .eq('status', 'posted')
    .eq('content_type', 'reply')
    .order('posted_at', { ascending: false })
    .limit(5);

  console.log(`\nRecent replies: ${replies?.length || 0}`);
  for (const r of replies || []) {
    console.log(`  [${r.platform}] "${(r.content || '').substring(0, 80)}..." @ ${r.posted_at}`);
  }

  // 4. Check content_posts (vault-based)
  const { data: vaultPosts } = await sb
    .from('content_posts')
    .select('id, platform, caption, post_status, scheduled_at')
    .in('post_status', ['scheduled', 'posted'])
    .order('scheduled_at', { ascending: false })
    .limit(5);

  console.log(`\nVault posts (scheduled/posted): ${vaultPosts?.length || 0}`);
  for (const r of vaultPosts || []) {
    console.log(`  [${r.platform}] ${r.post_status} — "${(r.caption || '').substring(0, 60)}..." @ ${r.scheduled_at}`);
  }

  // 5. Check revenue_content_calendar
  const { data: calendar } = await sb
    .from('revenue_content_calendar')
    .select('date, platform, planned_posts')
    .order('date', { ascending: false })
    .limit(5);

  console.log(`\nContent calendar entries: ${calendar?.length || 0}`);
  for (const r of calendar || []) {
    const count = Array.isArray(r.planned_posts) ? r.planned_posts.length : 0;
    console.log(`  ${r.date} [${r.platform}] — ${count} planned posts`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
