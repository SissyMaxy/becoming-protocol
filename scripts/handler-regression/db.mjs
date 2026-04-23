#!/usr/bin/env node
/**
 * Layer 2: DB integration tests. Exercises server-side writes as if the
 * Handler endpoint did them, then asserts DB state. Runs against the live
 * Supabase project with service role so RLS is bypassed (matches chat.ts).
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://atevwvexapiykchvqvhm.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY — set it in env and retry.');
  process.exit(2);
}
const supa = createClient(SUPABASE_URL, KEY);
const UID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f';

let pass = 0, fail = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); pass++; results.push({ name, status: 'PASS' }); }
  catch (err) { fail++; results.push({ name, status: 'FAIL', err: err.message || String(err) }); }
}
function eq(a, b, msg = '') { if (a !== b) throw new Error(`${msg} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
function truthy(v, msg = '') { if (!v) throw new Error(msg || 'expected truthy'); }

// Snapshot baseline so we can detect deltas
async function getBaseline() {
  const [state, implants, reframings, safewords, doseLog, queue] = await Promise.all([
    supa.from('user_state').select('current_arousal, denial_day, last_release, tasks_completed_today').eq('user_id', UID).maybeSingle(),
    supa.from('memory_implants').select('id', { count: 'exact', head: true }).eq('user_id', UID).eq('active', true),
    supa.from('narrative_reframings').select('id', { count: 'exact', head: true }).eq('user_id', UID),
    supa.from('safewords').select('phrase_normalized, active').eq('user_id', UID).eq('active', true),
    supa.from('dose_log').select('id', { count: 'exact', head: true }).eq('user_id', UID),
    supa.from('handler_outreach_queue').select('id', { count: 'exact', head: true }).eq('user_id', UID).is('delivered_at', null),
  ]);
  return { state: state.data, implants: implants.count, reframings: reframings.count, safewords: safewords.data, doseLog: doseLog.count, queue: queue.count };
}

console.log('\n── Layer 2: DB integration tests ──');
const before = await getBaseline();
console.log(`baseline: arousal=${before.state?.current_arousal} denial=${before.state?.denial_day} last_release=${before.state?.last_release} tasks=${before.state?.tasks_completed_today} implants=${before.implants} reframings=${before.reframings} safewords=${before.safewords.length} doses=${before.doseLog} queue_pending=${before.queue}`);

await test('state row exists for Maxy', async () => {
  truthy(before.state, 'user_state row for Maxy');
});
await test('active memory_implants ≥ 5 (planter seeded)', async () => {
  truthy(before.implants >= 5, `implants=${before.implants}`);
});
await test('plum safeword is active', async () => {
  const hit = before.safewords.find(s => s.phrase_normalized === 'plum');
  truthy(hit, 'plum row');
});
await test('outreach queue has no expired pending rows', async () => {
  const { data } = await supa.from('handler_outreach_queue')
    .select('id, expires_at').eq('user_id', UID).is('delivered_at', null);
  const expired = (data || []).filter(r => r.expires_at && new Date(r.expires_at) < new Date()).length;
  eq(expired, 0, 'no expired-but-pending rows');
});
await test('conditioning_lockdown_windows has ≥1 active for Maxy', async () => {
  const { data } = await supa.from('conditioning_lockdown_windows').select('id').eq('user_id', UID).eq('active', true);
  truthy((data || []).length >= 1, 'at least 1 active window');
});
await test('hrt_funnel row exists', async () => {
  const { data } = await supa.from('hrt_funnel').select('current_step').eq('user_id', UID).maybeSingle();
  truthy(data, 'hrt_funnel row');
  truthy(['uncommitted','committed','researching','provider_chosen','appointment_booked','intake_submitted','appointment_attended','prescription_obtained','pharmacy_filled','first_dose_taken','week_one_complete','month_one_complete','adherent'].includes(data.current_step), 'valid step');
});
await test('medication_regimen has active Zepbound', async () => {
  const { data } = await supa.from('medication_regimen').select('medication_name').eq('user_id', UID).eq('active', true);
  truthy((data || []).some(r => /zepbound/i.test(r.medication_name)), 'active Zepbound');
});

// Write+verify cycle: directive toggle → tasks_completed_today bump
await test('directive completion: bumps tasks_completed_today + audit row', async () => {
  const baselineTasks = before.state?.tasks_completed_today ?? 0;
  // Find or insert a test directive
  const { data: existing } = await supa.from('body_feminization_directives')
    .select('id, status').eq('user_id', UID).in('status', ['assigned','in_progress']).limit(1);
  let directiveId;
  if (existing && existing.length > 0) {
    directiveId = existing[0].id;
  } else {
    const { data: inserted, error } = await supa.from('body_feminization_directives').insert({
      user_id: UID, category: 'test', directive: 'regression test directive',
      target_body_part: 'whole_body', difficulty: 1, deadline_at: new Date(Date.now() + 3600000).toISOString(),
      photo_required: false, status: 'assigned', generated_from: 'regression_test',
    }).select('id').single();
    if (error) throw error;
    directiveId = inserted.id;
  }
  // Simulate toggle
  await supa.from('body_feminization_directives').update({
    status: 'completed', completed_at: new Date().toISOString(),
  }).eq('id', directiveId);
  const { data: st } = await supa.from('user_state').select('tasks_completed_today').eq('user_id', UID).maybeSingle();
  const prev = st?.tasks_completed_today ?? 0;
  await supa.from('user_state').update({ tasks_completed_today: prev + 1, updated_at: new Date().toISOString() }).eq('user_id', UID);
  await supa.from('handler_directives').insert({
    user_id: UID, action: 'body_directive_completed_by_user', target: directiveId,
    value: { test: true }, reasoning: 'regression test',
  });
  const { data: after } = await supa.from('user_state').select('tasks_completed_today').eq('user_id', UID).maybeSingle();
  truthy((after?.tasks_completed_today ?? 0) > baselineTasks, `tasks rose from ${baselineTasks} to ${after?.tasks_completed_today}`);
  // Cleanup: reset the test directive + counter
  await supa.from('body_feminization_directives').update({ status: 'assigned', completed_at: null }).eq('id', directiveId);
  await supa.from('user_state').update({ tasks_completed_today: baselineTasks }).eq('user_id', UID);
  await supa.from('handler_directives').delete().eq('user_id', UID).eq('action', 'body_directive_completed_by_user').eq('target', directiveId);
});

// log_release cycle
await test('log_release: resets denial_day + writes last_release', async () => {
  const testDate = new Date(Date.now() - 2 * 86400000).toISOString();
  const baselineLastRelease = before.state?.last_release;
  await supa.from('user_state').update({
    denial_day: 0, last_release: testDate, current_arousal: 0,
  }).eq('user_id', UID);
  const { data } = await supa.from('user_state').select('last_release, denial_day, current_arousal').eq('user_id', UID).maybeSingle();
  eq(new Date(data.last_release).toISOString(), testDate, 'last_release set');
  eq(data.denial_day, 0, 'denial_day = 0');
  eq(data.current_arousal, 0, 'arousal reset to 0');
  // Restore baseline
  await supa.from('user_state').update({
    last_release: baselineLastRelease,
    denial_day: before.state?.denial_day ?? 0,
    current_arousal: before.state?.current_arousal ?? 0,
  }).eq('user_id', UID);
});

// Dose logger cycle
await test('dose_log: mark taken writes to dose_log', async () => {
  const { data: reg } = await supa.from('medication_regimen').select('id').eq('user_id', UID).eq('active', true).maybeSingle();
  if (!reg) throw new Error('no active regimen');
  const { data: inserted, error } = await supa.from('dose_log').insert({
    user_id: UID, regimen_id: reg.id, taken_at: new Date().toISOString(),
  }).select('id').single();
  if (error) throw error;
  truthy(inserted?.id, 'dose_log row created');
  // Cleanup
  await supa.from('dose_log').delete().eq('id', inserted.id);
});

// Safeword cycle
await test('safeword: insert new, deactivates old', async () => {
  await supa.from('safewords').update({ active: false }).eq('user_id', UID).eq('active', true);
  const { data: inserted, error } = await supa.from('safewords').insert({
    user_id: UID, phrase: 'regression-test', phrase_normalized: 'regression-test',
    action: 'pause_24h', active: true,
  }).select('id').single();
  if (error) throw error;
  const { data: active } = await supa.from('safewords').select('phrase_normalized').eq('user_id', UID).eq('active', true);
  eq(active.length, 1, 'exactly one active');
  eq(active[0].phrase_normalized, 'regression-test', 'new safeword is active');
  // Cleanup — restore plum
  await supa.from('safewords').update({ active: false }).eq('id', inserted.id);
  await supa.from('safewords').update({ active: true }).eq('user_id', UID).eq('phrase_normalized', 'plum');
});

// Reframings refusal filter
await test('reframings: refusal text would be rejected by filter', async () => {
  const REFUSAL = [
    /\bI\s+(appreciate|understand|can't|cannot|won't|will not|am unable|'m unable|'m not able)\b/i,
    /\bI\s+(can|could)\s+(not\s+)?help\s+(with|create|generate|produce)/i,
  ];
  const sample = "I appreciate you reaching out, but I can't help create content that reframes";
  const fired = REFUSAL.some(p => p.test(sample));
  truthy(fired, 'refusal pattern matches');
});

// Heatmap union sanity: body_feminization_directives completions count
await test('heatmap: completed body directives queryable for last 30d', async () => {
  const { data } = await supa.from('body_feminization_directives')
    .select('completed_at').eq('user_id', UID).eq('status', 'completed')
    .gte('completed_at', new Date(Date.now() - 30 * 86400000).toISOString());
  truthy(Array.isArray(data), 'query returns array (even if empty)');
});

// Edge function sanity
await test('handler-outreach-auto is live (HTTP 200)', async () => {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/handler-outreach-auto`, { method: 'POST' });
  eq(r.status, 200, 'edge function responds');
});

// Summary
console.log('\n');
for (const r of results) console.log(`  ${r.status === 'PASS' ? '✓' : '✗'} ${r.name}${r.err ? `\n    └ ${r.err}` : ''}`);
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);
