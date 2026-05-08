// Backfill audio_url for the most recent N outreach rows that don't have
// one. Idempotent — the edge function's atomic claim on tts_status='pending'
// makes re-runs safe, and rows already at 'ready' / 'rendering' / 'skipped'
// are skipped.
//
// Usage:
//   node scripts/one-shot/backfill-outreach-tts.mjs                # last 50
//   LIMIT=200 node scripts/one-shot/backfill-outreach-tts.mjs       # last 200
//   USER_ID=<uuid> node scripts/one-shot/backfill-outreach-tts.mjs  # one user
//   DRY_RUN=1 node scripts/one-shot/backfill-outreach-tts.mjs       # just list
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://atevwvexapiykchvqvhm.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIMIT = Math.max(1, Math.min(500, Number(process.env.LIMIT) || 50));
const USER_ID = process.env.USER_ID || null;
const DRY_RUN = process.env.DRY_RUN === '1';

if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not set in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function findCandidates() {
  let q = supabase.from('handler_outreach_queue')
    .select('id, user_id, message, source, created_at, tts_status, audio_url')
    .is('audio_url', null)
    .in('tts_status', ['pending', 'failed'])
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (USER_ID) q = q.eq('user_id', USER_ID);
  const { data, error } = await q;
  if (error) throw new Error(`query: ${error.message}`);
  return data || [];
}

async function userOptedIn(userId) {
  const { data, error } = await supabase.from('user_state')
    .select('handler_persona, prefers_mommy_voice')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return false;
  if (!data) return false;
  return data.handler_persona === 'dommy_mommy' && data.prefers_mommy_voice === true;
}

async function invokeRender(outreachId) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/outreach-tts-render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ outreach_id: outreachId }),
  });
  const text = await r.text();
  return { status: r.status, body: text.slice(0, 200) };
}

async function main() {
  const rows = await findCandidates();
  console.log(`[backfill] found ${rows.length} candidate row(s) (limit=${LIMIT}${USER_ID ? `, user=${USER_ID}` : ''})`);

  // Per-user opt-in cache so we don't recheck for every row.
  const optInCache = new Map();
  let renderedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    let optedIn = optInCache.get(row.user_id);
    if (optedIn === undefined) {
      optedIn = await userOptedIn(row.user_id);
      optInCache.set(row.user_id, optedIn);
    }
    if (!optedIn) {
      skippedCount++;
      continue;
    }

    const preview = (row.message || '').slice(0, 60).replace(/\s+/g, ' ');
    if (DRY_RUN) {
      console.log(`[dry] would render ${row.id} (${row.source}) — "${preview}…"`);
      renderedCount++;
      continue;
    }

    // Reset failed rows back to pending so the edge fn's atomic claim works.
    if (row.tts_status === 'failed') {
      await supabase.from('handler_outreach_queue')
        .update({ tts_status: 'pending', tts_error: null })
        .eq('id', row.id);
    }

    const result = await invokeRender(row.id);
    if (result.status >= 200 && result.status < 300) {
      renderedCount++;
      console.log(`[ok ] ${row.id} (${row.source}) — "${preview}…"`);
    } else {
      failedCount++;
      console.log(`[err] ${row.id} status=${result.status} ${result.body}`);
    }

    // Light pacing so we don't hammer ElevenLabs in a backfill burst.
    await new Promise(r => setTimeout(r, 250));
  }

  console.log(`[backfill] done. rendered=${renderedCount} skipped=${skippedCount} failed=${failedCount}`);
}

main().catch(err => { console.error(err); process.exit(1); });
