#!/usr/bin/env node
// test-mommy-recap-weekly — integration runner.
//
// Calls the deployed mommy-recap-weekly edge fn in single-user mode and
// verifies the side effects:
//   1. A weekly_recaps row was inserted for this user/week.
//   2. A handler_outreach_queue row with kind='weekly_recap' exists.
//   3. The recap row's outreach_id points at it.
//   4. A sealed_letters row tagged 'weekly_recap_archive' was created.
//
// Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… USER_ID=<uuid> \
//        node scripts/one-shot/test-mommy-recap-weekly.mjs
//
// Failures print the bad row and exit 1. Pass = exit 0. Stdout has a
// preview of the recap so you can eyeball the prose.
import 'dotenv/config';

const url = process.env.SUPABASE_URL || 'https://atevwvexapiykchvqvhm.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.USER_ID || '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f';
if (!key) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(2); }

async function call() {
  const r = await fetch(`${url}/functions/v1/mommy-recap-weekly`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ user_id: userId }),
  });
  const text = await r.text();
  console.log(`-- mommy-recap-weekly → ${r.status}`);
  console.log(text.slice(0, 1200));
  console.log();
  if (!r.ok) process.exit(1);
  return JSON.parse(text);
}

async function pgRest(path) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return r.ok ? r.json() : null;
}

const result = await call();
const fired = (result.results || []).find(r => r.ok);
if (!fired) {
  console.error('No successful recap fired. Likely reasons:');
  for (const r of result.results || []) console.error(' -', r.user_id, r.reason);
  process.exit(1);
}

console.log('Verifying side effects…');

// 1. weekly_recaps row exists.
const recaps = await pgRest(`weekly_recaps?id=eq.${fired.recap_id}&select=id,week_start,week_end,outreach_id,narrative_text,metrics`);
if (!recaps || recaps.length !== 1) { console.error('FAIL: weekly_recaps row missing'); process.exit(1); }
const recap = recaps[0];
console.log(`  ✓ weekly_recaps row ${recap.id}, week ${recap.week_start} → ${recap.week_end}`);
console.log(`    metrics: ${JSON.stringify(recap.metrics)}`);
console.log(`    narrative excerpt: ${recap.narrative_text.slice(0, 200)}…`);

// 2. handler_outreach_queue row with kind='weekly_recap' exists.
const outreach = await pgRest(`handler_outreach_queue?id=eq.${fired.outreach_id}&select=id,kind,source,message,urgency`);
if (!outreach || outreach.length !== 1 || outreach[0].kind !== 'weekly_recap') {
  console.error('FAIL: outreach row with kind=weekly_recap missing'); process.exit(1);
}
console.log(`  ✓ handler_outreach_queue row ${outreach[0].id} kind=${outreach[0].kind} source=${outreach[0].source}`);

// 3. recap.outreach_id matches.
if (recap.outreach_id !== outreach[0].id) {
  console.error(`FAIL: recap.outreach_id=${recap.outreach_id} != outreach.id=${outreach[0].id}`);
  process.exit(1);
}
console.log('  ✓ recap.outreach_id back-reference is consistent');

// 4. Letters archive: sealed_letters row tagged 'weekly_recap_archive'.
const letters = await pgRest(
  `sealed_letters?user_id=eq.${userId}&letter_type=eq.weekly_recap_archive&order=written_at.desc&limit=1`
);
if (!letters || letters.length === 0) {
  console.error('FAIL: sealed_letters archive row missing'); process.exit(1);
}
console.log(`  ✓ sealed_letters archive row ${letters[0].id}`);

console.log();
console.log('PASS — all four side effects verified.');
