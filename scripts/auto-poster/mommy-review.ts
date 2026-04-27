/**
 * Mommy Review — interactive thumbs UI for mommy-dom / subscriber DM outputs.
 *
 * Walks recent bot-generated mommy voice outputs. For each, Maxy hits:
 *   u (up)     — reaction 'up', kept as reference
 *   d (down)   — reaction 'down', marked wrong for tuning
 *   s (skip)   — no reaction
 *   n (note)   — add a freeform comment
 *   q (quit)   — exit
 *
 * Reactions write to ai_generated_content.maxy_reaction. Feeds future
 * correlation with content_grades and engagement data.
 *
 * Run: npm run mommy-review
 *   --limit N       how many to review (default 20)
 *   --platform X    filter by platform (fansly|onlyfans|sniffies|fetlife)
 *   --since Xh      only review rows from last X hours
 */

import 'dotenv/config';
import readline from 'node:readline';
import { supabase } from './config';

const USER_ID = process.env.USER_ID || '';

interface ReviewRow {
  id: string;
  platform: string;
  content_type: string;
  content: string;
  target_account: string | null;
  created_at: string;
  status: string;
}

function parseArgs(): { limit: number; platform?: string; sinceHours?: number } {
  const args = process.argv.slice(2);
  let limit = 20;
  let platform: string | undefined;
  let sinceHours: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--limit') limit = parseInt(args[++i], 10);
    else if (a === '--platform') platform = args[++i];
    else if (a === '--since') {
      const v = args[++i];
      const m = v.match(/^(\d+)([hd])$/);
      if (m) sinceHours = parseInt(m[1], 10) * (m[2] === 'd' ? 24 : 1);
    }
  }
  return { limit, platform, sinceHours };
}

function prompt(rl: readline.Interface, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, answer => resolve(answer)));
}

async function main() {
  if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }

  const { limit, platform, sinceHours } = parseArgs();

  let query = supabase
    .from('ai_generated_content')
    .select('id, platform, content_type, content, target_account, created_at, status')
    .eq('user_id', USER_ID)
    .eq('status', 'posted')
    .is('maxy_reaction', null)
    // mommy-dom surfaces — subscriber DMs and platform chats where she's mommy
    .in('platform', ['fansly', 'onlyfans', 'sniffies', 'fetlife'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (platform) query = query.eq('platform', platform);
  if (sinceHours) {
    const cutoff = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
    query = query.gte('created_at', cutoff);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    console.log('(no unreviewed mommy-dom outputs found)');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n${data.length} output(s) to review. Commands: [u]p [d]own [s]kip [n]ote [q]uit\n`);

  let ups = 0, downs = 0, skips = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i] as ReviewRow;
    const when = new Date(row.created_at).toLocaleString();
    const target = row.target_account || '(unknown)';

    console.log('═'.repeat(70));
    console.log(`[${i + 1}/${data.length}] ${row.platform} · ${row.content_type} · ${when}`);
    console.log(`→ ${target}`);
    console.log('─'.repeat(70));
    console.log(row.content);
    console.log('─'.repeat(70));

    const input = (await prompt(rl, 'reaction [u/d/s/n/q]: ')).trim().toLowerCase();

    if (input === 'q') { console.log('(quit)'); break; }
    if (input === 's' || input === '') { skips++; continue; }

    let reaction: 'up' | 'down' | 'skip' = 'skip';
    let note: string | null = null;

    if (input === 'u' || input.startsWith('u')) {
      reaction = 'up'; ups++;
    } else if (input === 'd' || input.startsWith('d')) {
      reaction = 'down'; downs++;
      note = (await prompt(rl, '  why? (optional): ')).trim() || null;
    } else if (input === 'n' || input.startsWith('n')) {
      note = (await prompt(rl, '  note: ')).trim() || null;
      const followup = (await prompt(rl, '  reaction [u/d/s]: ')).trim().toLowerCase();
      if (followup === 'u') { reaction = 'up'; ups++; }
      else if (followup === 'd') { reaction = 'down'; downs++; }
      else { skips++; }
    } else {
      console.log('  (unrecognized — skipping)');
      skips++;
      continue;
    }

    const { error: updErr } = await supabase.from('ai_generated_content').update({
      maxy_reaction: reaction,
      maxy_reacted_at: new Date().toISOString(),
      maxy_reaction_note: note,
    }).eq('id', row.id);
    if (updErr) {
      console.error(`  ⚠ save failed: ${updErr.message}`);
    }
  }

  rl.close();

  console.log('\n═'.repeat(35));
  console.log(`Session done: ${ups} 👍   ${downs} 👎   ${skips} skip`);

  // Quick totals across all-time
  const { data: lifetime } = await supabase
    .from('ai_generated_content')
    .select('maxy_reaction')
    .eq('user_id', USER_ID)
    .not('maxy_reaction', 'is', null);
  if (lifetime) {
    const lifeUps = lifetime.filter(r => r.maxy_reaction === 'up').length;
    const lifeDowns = lifetime.filter(r => r.maxy_reaction === 'down').length;
    console.log(`All-time:     ${lifeUps} 👍   ${lifeDowns} 👎`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
