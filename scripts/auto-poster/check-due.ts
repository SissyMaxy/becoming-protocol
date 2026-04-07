import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

async function main() {
  const now = new Date().toISOString();
  console.log('Current time:', now);
  console.log('');

  // Posts due now
  const { data: due } = await sb.from('ai_generated_content')
    .select('id, platform, content_type, status, content, scheduled_at')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  console.log(`Posts due NOW: ${due?.length || 0}`);
  for (const r of due || []) {
    console.log(`  [${r.platform}] ${r.content_type} @ ${r.scheduled_at} — "${(r.content || '').substring(0, 60)}..."`);
  }

  // Posts coming up
  const { data: upcoming } = await sb.from('ai_generated_content')
    .select('id, platform, content_type, status, content, scheduled_at')
    .eq('status', 'scheduled')
    .gt('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  console.log(`\nPosts upcoming: ${upcoming?.length || 0}`);
  for (const r of upcoming || []) {
    console.log(`  [${r.platform}] ${r.content_type} @ ${r.scheduled_at} — "${(r.content || '').substring(0, 60)}..."`);
  }

  // Any stuck in 'posting' state
  const { data: stuck } = await sb.from('ai_generated_content')
    .select('id, platform, content_type, status, content, scheduled_at')
    .eq('status', 'posting')
    .limit(10);

  console.log(`\nStuck in 'posting': ${stuck?.length || 0}`);
  for (const r of stuck || []) {
    console.log(`  [${r.platform}] ${r.content_type} @ ${r.scheduled_at} — "${(r.content || '').substring(0, 60)}..."`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
