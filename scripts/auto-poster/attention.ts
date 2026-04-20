/**
 * Handler attention inbox — CLI.
 *
 *   npm run attention              # list unreviewed, newest first
 *   npm run attention list high    # filter by severity
 *   npm run attention show <id>    # full payload for one item
 *   npm run attention mark <id> <action>   # mark reviewed
 *   npm run attention clear <id>   # alias for "mark handled"
 *   npm run attention stats        # counts by kind + severity
 */

import 'dotenv/config';
import { supabase } from './config';

const USER_ID = process.env.USER_ID || '';
if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }

async function list(severityFilter?: string, kindFilter?: string) {
  let q = supabase
    .from('handler_attention')
    .select('id, contact_id, kind, severity, platform, summary, created_at, payload')
    .eq('user_id', USER_ID)
    .is('reviewed_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (severityFilter) q = q.eq('severity', severityFilter);
  if (kindFilter) q = q.eq('kind', kindFilter);

  const { data } = await q;
  if (!data || data.length === 0) { console.log('(inbox clean)'); return; }

  for (const row of data) {
    const when = new Date(row.created_at).toLocaleString();
    const sev = row.severity === 'high' ? '⚠ HIGH'
      : row.severity === 'medium' ? '· med'
      : '  low';
    const plat = row.platform ? ` [${row.platform}]` : '';
    console.log(`${row.id.substring(0, 8)}  ${sev}  ${row.kind.padEnd(24)}${plat}  ${when}`);
    console.log(`          ${row.summary}`);
  }
  console.log(`\n${data.length} item(s).  Review: npm run attention mark <id> <action>`);
}

async function show(idPrefix: string) {
  const { data } = await supabase
    .from('handler_attention')
    .select('*, contacts(display_name, tier, lifetime_value_cents)')
    .eq('user_id', USER_ID)
    .ilike('id', `${idPrefix}%`)
    .maybeSingle();
  if (!data) { console.log('No match'); return; }
  console.log(`ID: ${data.id}`);
  console.log(`Kind: ${data.kind} / severity: ${data.severity}`);
  console.log(`Platform: ${data.platform || '(none)'}`);
  console.log(`When: ${new Date(data.created_at).toLocaleString()}`);
  if (data.contacts) {
    console.log(`Contact: ${data.contacts.display_name} (${data.contacts.tier}, $${(data.contacts.lifetime_value_cents/100).toFixed(2)})`);
  }
  console.log(`Summary: ${data.summary}`);
  if (data.payload && Object.keys(data.payload).length > 0) {
    console.log(`Payload:`);
    console.log(JSON.stringify(data.payload, null, 2).split('\n').map(l => '  ' + l).join('\n'));
  }
  if (data.reviewed_at) {
    console.log(`\n✓ Reviewed at ${new Date(data.reviewed_at).toLocaleString()} — action: ${data.reviewed_action}`);
  }
}

async function mark(idPrefix: string, action: string) {
  const { data: row } = await supabase
    .from('handler_attention')
    .select('id')
    .eq('user_id', USER_ID)
    .ilike('id', `${idPrefix}%`)
    .maybeSingle();
  if (!row) { console.log('No match'); return; }
  await supabase
    .from('handler_attention')
    .update({ reviewed_at: new Date().toISOString(), reviewed_action: action })
    .eq('id', row.id);
  console.log(`Marked ${row.id.substring(0, 8)} → ${action}`);
}

async function stats() {
  const { data } = await supabase
    .from('handler_attention')
    .select('kind, severity, reviewed_at')
    .eq('user_id', USER_ID);
  if (!data) return;
  const unread: Record<string, Record<string, number>> = {};
  let totalUnread = 0;
  let totalReviewed = 0;
  for (const r of data) {
    if (r.reviewed_at) { totalReviewed++; continue; }
    totalUnread++;
    (unread[r.kind] = unread[r.kind] || {});
    unread[r.kind][r.severity] = (unread[r.kind][r.severity] || 0) + 1;
  }
  console.log(`Unreviewed: ${totalUnread}   Reviewed (all-time): ${totalReviewed}\n`);
  for (const kind of Object.keys(unread).sort()) {
    const counts = unread[kind];
    const parts = ['high', 'medium', 'low']
      .filter(s => counts[s])
      .map(s => `${counts[s]} ${s}`);
    console.log(`  ${kind.padEnd(24)} ${parts.join(' · ')}`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
(async () => {
  switch (cmd) {
    case undefined:
    case 'list':
      await list(args[0], args[1]); break;
    case 'show':
      if (!args[0]) { console.log('Usage: attention show <id>'); break; }
      await show(args[0]); break;
    case 'mark':
      if (args.length < 2) { console.log('Usage: attention mark <id> <action>'); break; }
      await mark(args[0], args[1]); break;
    case 'clear':
      if (!args[0]) { console.log('Usage: attention clear <id>'); break; }
      await mark(args[0], 'handled'); break;
    case 'stats':
      await stats(); break;
    default:
      console.log('Usage:');
      console.log('  attention                        # list unreviewed');
      console.log('  attention list [severity] [kind] # filtered list');
      console.log('  attention show <id>              # full payload');
      console.log('  attention mark <id> <action>     # mark reviewed');
      console.log('  attention clear <id>             # mark handled');
      console.log('  attention stats                  # counts by kind');
  }
  process.exit(0);
})();
