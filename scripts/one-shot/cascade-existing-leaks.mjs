#!/usr/bin/env node
/**
 * Backfill the existing mommy_voice_leaks rows that haven't been turned
 * into penalty tasks yet. Calls mommy-leak-cascade once per leak with
 * { leak_id }, so the per-leak idempotency check inside the edge function
 * does the right thing if the script is re-run.
 *
 * Modes:
 *   - default: actually fire one penalty per unresolved leak
 *   - DRY_RUN=1: print what would be inserted, no writes (uses the edge
 *     fn's dry_run flag so previewing also exercises the same gates)
 *
 * Pacing: 250ms between calls. Idempotent on re-run.
 */

import 'dotenv/config';

const url = process.env.SUPABASE_URL || 'https://atevwvexapiykchvqvhm.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(2); }

const DRY_RUN = process.env.DRY_RUN === '1';
const PACE_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rest(path) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${path}: ${await r.text()}`);
  return r.json();
}

async function callFn(fn, payload) {
  const r = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });
  return { status: r.status, body: await r.text() };
}

const leaks = await rest(
  'mommy_voice_leaks?resolved=eq.false&resolved_via_touch_task_id=is.null&select=id,user_id,leaked_text,penalty_severity&order=detected_at.asc',
);

console.log(`mode=${DRY_RUN ? 'DRY_RUN' : 'LIVE'}  unresolved-leaks-without-task=${leaks.length}`);

if (leaks.length === 0) {
  console.log('Nothing to cascade.');
  process.exit(0);
}

let fired = 0;
let already = 0;
let failed = 0;

for (const leak of leaks) {
  try {
    const { status, body } = await callFn('mommy-leak-cascade', {
      user_id: leak.user_id,
      leak_id: leak.id,
      max: 1,
      dry_run: DRY_RUN,
    });

    if (status !== 200) {
      failed += 1;
      console.warn(`leak=${leak.id} → http=${status} body=${body.slice(0, 200)}`);
      await sleep(PACE_MS);
      continue;
    }

    const j = JSON.parse(body);
    if (DRY_RUN) {
      const preview = j.dry_run_preview?.[0];
      if (preview) {
        console.log(`leak=${leak.id} → severity=${preview.severity} category=${preview.category} expires_in_hours=${preview.expires_in_hours}`);
      } else {
        console.log(`leak=${leak.id} → ${j.skipped?.[0]?.reason ?? 'skipped'}`);
      }
    } else if (j.fired > 0) {
      fired += 1;
      const f = j.fired_detail?.[0];
      console.log(`leak=${leak.id} → fired task=${f?.task_id} severity=${f?.severity} category=${f?.category}`);
    } else {
      already += 1;
      console.log(`leak=${leak.id} → ${j.skipped?.[0]?.reason ?? 'no-op'}`);
    }
  } catch (err) {
    failed += 1;
    console.error(`leak=${leak.id} → error: ${err.message}`);
  }
  await sleep(PACE_MS);
}

console.log(
  `\nDone. mode=${DRY_RUN ? 'DRY_RUN' : 'LIVE'} fired=${fired} already-had-task=${already} failed=${failed} total=${leaks.length}`,
);
