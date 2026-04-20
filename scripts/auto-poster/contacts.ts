/**
 * CLI inspector for the contact graph.
 *
 *   npm run contacts list                      # 50 most recent contacts
 *   npm run contacts show <handle>             # full context for a handle
 *   npm run contacts top                       # top 20 by lifetime value
 *   npm run contacts flag <handle> <flag>      # add a flag
 *   npm run contacts kink <handle> <kink>      # add a known kink
 */

import 'dotenv/config';
import { supabase } from './config';
import { getContactContext, flagContact, addKink, findFuzzyCandidates, linkHandle, mergeContacts, type ContactPlatform } from './contact-graph';

const USER_ID = process.env.USER_ID || '';

if (!USER_ID) {
  console.error('Missing USER_ID');
  process.exit(1);
}

async function list() {
  const { data } = await supabase
    .from('contacts')
    .select('id, display_name, tier, lifetime_value_cents, last_interaction_at, flags')
    .eq('user_id', USER_ID)
    .order('last_interaction_at', { ascending: false })
    .limit(50);

  if (!data || data.length === 0) {
    console.log('(no contacts yet)');
    return;
  }
  console.log(`${'tier'.padEnd(10)} ${'$ltv'.padStart(10)}  ${'last'.padEnd(20)}  name`);
  for (const c of data) {
    const ltv = `$${(c.lifetime_value_cents / 100).toFixed(2)}`;
    const last = new Date(c.last_interaction_at).toLocaleString();
    const flag = c.flags?.length ? ` [${c.flags.join(',')}]` : '';
    console.log(`${c.tier.padEnd(10)} ${ltv.padStart(10)}  ${last.padEnd(20)}  ${c.display_name}${flag}`);
  }
}

async function top() {
  const { data } = await supabase
    .from('contacts')
    .select('display_name, tier, lifetime_value_cents')
    .eq('user_id', USER_ID)
    .gt('lifetime_value_cents', 0)
    .order('lifetime_value_cents', { ascending: false })
    .limit(20);

  if (!data || data.length === 0) {
    console.log('(no paying contacts yet)');
    return;
  }
  for (const c of data) {
    console.log(`$${(c.lifetime_value_cents / 100).toFixed(2).padStart(10)}  ${c.tier.padEnd(10)}  ${c.display_name}`);
  }
}

async function resolveHandle(handle: string): Promise<string | null> {
  const needle = handle.replace(/^@/, '').toLowerCase();
  const { data } = await supabase
    .from('contact_handles')
    .select('contact_id, platform, handle')
    .eq('user_id', USER_ID)
    .ilike('handle', needle);
  if (!data || data.length === 0) return null;
  if (data.length > 1) {
    console.log(`Multiple matches:`);
    for (const row of data) console.log(`  ${row.platform}:${row.handle}`);
  }
  return data[0].contact_id;
}

async function show(handle: string) {
  const contactId = await resolveHandle(handle);
  if (!contactId) { console.log('No match'); return; }
  const ctx = await getContactContext(supabase as any, contactId, 20);
  console.log(ctx);
}

async function flag(handle: string, flagName: string) {
  const contactId = await resolveHandle(handle);
  if (!contactId) { console.log('No match'); return; }
  await flagContact(supabase as any, contactId, flagName);
  console.log(`Flagged ${handle} with "${flagName}"`);
}

async function kink(handle: string, kinkName: string) {
  const contactId = await resolveHandle(handle);
  if (!contactId) { console.log('No match'); return; }
  await addKink(supabase as any, contactId, kinkName);
  console.log(`Added kink "${kinkName}" to ${handle}`);
}

async function candidates() {
  // Find potential merges: pairs of contacts where handles on different platforms
  // share normalized form (e.g., softmaxy / soft_maxy).
  const { data: handles } = await supabase
    .from('contact_handles')
    .select('contact_id, platform, handle')
    .eq('user_id', USER_ID);
  if (!handles || handles.length === 0) { console.log('(no handles)'); return; }

  // Group by stripped-normalized form.
  const byKey: Record<string, Array<{ contactId: string; platform: string; handle: string }>> = {};
  for (const h of handles) {
    const key = (h.handle as string).replace(/[._-]+/g, '').replace(/\d+$/, '');
    if (key.length < 3) continue;
    (byKey[key] = byKey[key] || []).push({ contactId: h.contact_id, platform: h.platform, handle: h.handle });
  }

  const groups = Object.entries(byKey).filter(([, rows]) => {
    const distinct = new Set(rows.map(r => r.contactId));
    return distinct.size >= 2;
  });
  if (groups.length === 0) { console.log('(no merge candidates found)'); return; }

  for (const [key, rows] of groups) {
    console.log(`\n━━ candidate: "${key}" ━━`);
    for (const r of rows) {
      console.log(`  contact=${r.contactId.substring(0, 8)}  ${r.platform}/${r.handle}`);
    }
    const unique = [...new Set(rows.map(r => r.contactId))];
    if (unique.length >= 2) {
      console.log(`  → try: npm run contacts merge ${rows[0].platform}/${rows[0].handle} ${rows[1].platform}/${rows[1].handle}`);
    }
  }
}

async function link(targetHandle: string, platform: string, newHandle: string) {
  const contactId = await resolveHandle(targetHandle);
  if (!contactId) { console.log(`No contact found for ${targetHandle}`); return; }
  await linkHandle(supabase as any, USER_ID, contactId, platform as ContactPlatform, newHandle);
  console.log(`Linked ${platform}/${newHandle} → contact of ${targetHandle}`);
}

async function parseHandleRef(ref: string): Promise<string | null> {
  // Accept "platform/handle" or plain handle (resolves to first match).
  const parts = ref.split('/');
  if (parts.length === 2) {
    const [platform, handle] = parts;
    const { data } = await supabase
      .from('contact_handles')
      .select('contact_id')
      .eq('user_id', USER_ID)
      .eq('platform', platform)
      .eq('handle', handle.replace(/^@/, '').toLowerCase())
      .maybeSingle();
    return data?.contact_id || null;
  }
  return await resolveHandle(ref);
}

async function merge(targetRef: string, sourceRef: string) {
  const targetId = await parseHandleRef(targetRef);
  const sourceId = await parseHandleRef(sourceRef);
  if (!targetId) { console.log(`target not found: ${targetRef}`); return; }
  if (!sourceId) { console.log(`source not found: ${sourceRef}`); return; }
  if (targetId === sourceId) { console.log('already same contact'); return; }
  await mergeContacts(supabase as any, USER_ID, targetId, sourceId);
  console.log(`Merged ${sourceRef} → ${targetRef} (kept target, deleted source)`);
}

async function suggest(handle: string) {
  // platform defaults to twitter if ref isn't platform/handle
  let platform: ContactPlatform = 'twitter';
  let raw = handle;
  if (handle.includes('/')) {
    const [p, h] = handle.split('/');
    platform = p as ContactPlatform;
    raw = h;
  }
  const cands = await findFuzzyCandidates(supabase as any, USER_ID, platform, raw);
  if (cands.length === 0) { console.log('(no fuzzy matches)'); return; }
  for (const c of cands) {
    console.log(`  score=${c.score.toFixed(2)}  ${c.matchedPlatform}/${c.matchedHandle}  contact=${c.contactId.substring(0, 8)}`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
(async () => {
  switch (cmd) {
    case 'list': await list(); break;
    case 'top': await top(); break;
    case 'show': if (!args[0]) { console.log('Usage: contacts show <handle>'); break; } await show(args[0]); break;
    case 'flag': if (args.length < 2) { console.log('Usage: contacts flag <handle> <flag>'); break; } await flag(args[0], args[1]); break;
    case 'kink': if (args.length < 2) { console.log('Usage: contacts kink <handle> <kink>'); break; } await kink(args[0], args[1]); break;
    case 'candidates': await candidates(); break;
    case 'link':
      if (args.length < 3) { console.log('Usage: contacts link <target-handle> <platform> <new-handle>'); break; }
      await link(args[0], args[1], args[2]); break;
    case 'merge':
      if (args.length < 2) { console.log('Usage: contacts merge <target-ref> <source-ref>  (e.g., twitter/softmaxy fansly/softmaxy)'); break; }
      await merge(args[0], args[1]); break;
    case 'suggest':
      if (!args[0]) { console.log('Usage: contacts suggest <platform/handle>'); break; }
      await suggest(args[0]); break;
    default:
      console.log('Usage:');
      console.log('  contacts list                          # 50 recent');
      console.log('  contacts top                           # top 20 by $');
      console.log('  contacts show <handle>                 # full context');
      console.log('  contacts flag <handle> <flag>          # add flag');
      console.log('  contacts kink <handle> <kink>          # add kink');
      console.log('  contacts candidates                    # suggest same-person merges');
      console.log('  contacts suggest <platform/handle>     # fuzzy-match for a specific handle');
      console.log('  contacts link <target-handle> <platform> <new-handle>');
      console.log('  contacts merge <target-ref> <source-ref>   # merges source into target');
  }
  process.exit(0);
})();
