// CLI: list pending content briefs from BOTH tables.
//
// The Becoming app uses `content_briefs` (old table, with the full UI flow).
// The auto-poster text pipeline uses `content_production_briefs` (new table).
// This CLI shows both so you always see what's owed.
//
// Usage:
//   npx tsx submit-brief.ts list     # show all pending briefs
//   npx tsx submit-brief.ts          # same

import 'dotenv/config';
import { supabase } from './config';

const USER_ID = process.env.USER_ID || '';

async function listPending() {
  // Old table (UI-connected, photo/video briefs)
  const { data: appBriefs } = await supabase
    .from('content_briefs')
    .select('id, brief_number, content_type, purpose, platforms, instructions, deadline, difficulty, vulnerability_tier, status')
    .eq('user_id', USER_ID)
    .in('status', ['assigned', 'in_progress'])
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(20);

  // New table (text-only forced authorship)
  const { data: textBriefs } = await supabase
    .from('content_production_briefs')
    .select('id, brief_type, caption_angle, target_platforms, handler_draft, draft_deadline, scheduled_upload_by, status')
    .eq('user_id', USER_ID)
    .in('status', ['pending', 'awaiting_upload'])
    .order('scheduled_upload_by', { ascending: true, nullsFirst: false })
    .limit(10);

  const hasApp = appBriefs && appBriefs.length > 0;
  const hasText = textBriefs && textBriefs.length > 0;

  if (!hasApp && !hasText) {
    console.log('No pending briefs.');
    return;
  }

  if (hasApp) {
    console.log('\n=== Content Briefs (submit via app) ===\n');
    for (const b of appBriefs!) {
      const d = (b.instructions || {}) as Record<string, string>;
      const hrs = b.deadline
        ? Math.round((new Date(b.deadline).getTime() - Date.now()) / 3600_000)
        : null;
      const status = hrs !== null ? (hrs < 0 ? `⚠ OVERDUE ${-hrs}h` : `due in ${hrs}h`) : 'no deadline';
      console.log(`  #${b.brief_number}  [${b.content_type}]  ${status}  diff=${b.difficulty}/5  vuln=${b.vulnerability_tier}/5`);
      console.log(`    purpose: ${b.purpose}`);
      console.log(`    platforms: ${JSON.stringify(b.platforms)}`);
      if (d.outfit && d.outfit !== 'n/a') console.log(`    outfit:  ${d.outfit}`);
      if (d.framing && d.framing !== 'n/a') console.log(`    framing: ${d.framing}`);
      if (d.expression && d.expression !== 'n/a') console.log(`    expression: ${d.expression}`);
      if (d.script) console.log(`    script:  ${d.script}`);
      console.log('');
    }
    console.log('  → Open the Becoming app to submit photos/videos against these.\n');
  }

  if (hasText) {
    console.log('=== Text Briefs (forced authorship) ===\n');
    for (const b of textBriefs!) {
      const hrs = b.draft_deadline
        ? Math.round((new Date(b.draft_deadline).getTime() - Date.now()) / 60_000)
        : b.scheduled_upload_by
        ? Math.round((new Date(b.scheduled_upload_by).getTime() - Date.now()) / 3600_000)
        : null;
      const dueStr = hrs !== null
        ? (hrs < 0 ? `⚠ PAST DEADLINE` : `${hrs < 60 ? `${hrs} min left` : `${Math.round(hrs / 60)}h left`}`)
        : 'no deadline';
      console.log(`  ${b.id.slice(0, 8)}  [${b.brief_type}]  ${dueStr}`);
      console.log(`    targets: ${JSON.stringify(b.target_platforms)}`);
      if (b.caption_angle) console.log(`    prompt: ${b.caption_angle}`);
      if (b.handler_draft) {
        console.log(`    HANDLER DRAFT: "${b.handler_draft.slice(0, 150)}..."`);
        console.log(`    → Write your own version in the Handler chat, or this posts at deadline.`);
      }
      console.log('');
    }
  }
}

async function main() {
  if (!USER_ID) { console.error('USER_ID env missing'); process.exit(1); }
  await listPending();
}

main().catch(e => { console.error(e); process.exit(1); });
