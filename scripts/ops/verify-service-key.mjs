// Service-role key rotation verifier.
//
// Run this BEFORE rotating to capture a baseline, and AFTER rotating to
// confirm the new key is live, valid, project-matched, and — critically —
// NOT the key that leaked into public git history (commit 955951c).
//
//   node scripts/ops/verify-service-key.mjs
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env (local) or the
// ambient env (CI). Exits non-zero on any hard failure so it can gate a
// rotation runbook step.
//
// Audit context: the OLD service_role key is in public history. Rotation is
// only "done" when this script reports the current key's fingerprint differs
// from LEAKED_KEY_SHA256 below. The leaked value itself is never stored here —
// only its SHA-256, so this file is safe to commit.

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// SHA-256 of the service_role JWT that leaked in .claude/settings.local.json
// (scrubbed in 3129512, still reachable at ancestor 955951c). If the current
// key hashes to this, rotation has NOT happened.
const LEAKED_KEY_SHA256 =
  '5693f095c6e28ec1f76d4d5fd7b958f809ad2516cc3f1cca87789a3b1721de45';

const URL = process.env.SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const results = [];
const pass = (name, detail = '') => results.push({ ok: true, name, detail });
const fail = (name, detail = '') => results.push({ ok: false, name, detail });

function decodeJwtPayload(jwt) {
  const part = jwt.split('.')[1];
  if (!part) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function refFromUrl(u) {
  // https://<ref>.supabase.co
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.(co|in)/i.exec(u);
  return m ? m[1] : null;
}

async function main() {
  console.log('— Supabase service-role key rotation verifier —\n');

  // 1. Presence
  if (!URL) fail('SUPABASE_URL present', 'unset');
  else pass('SUPABASE_URL present', URL);
  if (!KEY) {
    fail('SUPABASE_SERVICE_ROLE_KEY present', 'unset');
    return report();
  }
  pass('SUPABASE_SERVICE_ROLE_KEY present', `${KEY.length} chars`);

  // 2. Not the leaked key (the whole point of rotating)
  const keyHash = createHash('sha256').update(KEY).digest('hex');
  if (keyHash === LEAKED_KEY_SHA256) {
    fail(
      'key is NOT the leaked key',
      'current key matches the leaked fingerprint — ROTATION NOT DONE',
    );
  } else {
    pass('key is NOT the leaked key', `sha256 ${keyHash.slice(0, 12)}…`);
  }

  // 3. Structure: must be a SERVICE-level key. Two valid shapes:
  //      - new-format secret key:  sb_secret_…   (service-equivalent)
  //      - legacy JWT with role:   …role:service_role…
  //    A publishable/anon key (sb_publishable_… or role:anon) is a HARD FAIL —
  //    it cannot do service work and reads RLS tables as an unauthenticated user.
  if (KEY.startsWith('sb_publishable_')) {
    fail(
      'key is a SERVICE key (not publishable/anon)',
      'this is a sb_publishable_ PUBLIC key — wrong key in SUPABASE_SERVICE_ROLE_KEY',
    );
  } else if (KEY.startsWith('sb_secret_')) {
    pass('key is a SERVICE key', 'new-format sb_secret_ key');
  } else {
    const payload = decodeJwtPayload(KEY);
    if (!payload) {
      fail('key is a SERVICE key', 'not sb_secret_ and not a decodable JWT');
    } else if (payload.role === 'service_role') {
      pass('key is a SERVICE key', 'legacy service_role JWT');
      const urlRef = refFromUrl(URL);
      if (urlRef && payload.ref) {
        if (urlRef === payload.ref) pass('key project ref matches URL', payload.ref);
        else fail('key project ref matches URL', `key.ref=${payload.ref} vs url=${urlRef}`);
      }
      if (payload.iat) {
        pass('key issued-at', new Date(payload.iat * 1000).toISOString().slice(0, 10));
      }
    } else {
      fail('key is a SERVICE key', `legacy JWT role="${payload.role}" — not service_role`);
    }
  }

  // 4. Live privileged op — listUsers() requires a real service-level key and
  //    works for BOTH key shapes. This is the AUTHORITATIVE discriminator: an
  //    anon/publishable key is rejected outright.
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  let serviceProven = false;
  try {
    const { error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) {
      fail('admin.listUsers (service-only op)', error.message);
    } else {
      pass('admin.listUsers (service-only op)', 'accepted as service-level');
      serviceProven = true;
    }
  } catch (e) {
    fail('admin.listUsers (service-only op)', String(e?.message || e));
  }

  // 5. RLS bypass — a row returned PROVES bypass. But an empty result with no
  //    error does NOT prove anon (the table could be empty); it only disproves
  //    service if admin.listUsers already failed. So only assert here when we
  //    actually get a row; otherwise defer to the admin check above.
  try {
    const { data, error } = await sb.from('user_state').select('user_id').limit(1);
    if (error) {
      fail('RLS-bypass read (user_state)', error.message);
    } else if (data && data.length > 0) {
      pass('RLS-bypass read (user_state)', 'row returned → RLS bypassed');
    } else if (serviceProven) {
      pass('RLS-bypass read (user_state)', 'no row, but service proven via admin API');
    } else {
      fail(
        'RLS-bypass read (user_state)',
        'empty result AND admin API rejected → key reads as anon (RLS-filtered)',
      );
    }
  } catch (e) {
    fail('RLS-bypass read (user_state)', String(e?.message || e));
  }

  return report();
}

function report() {
  console.log('');
  let hardFail = false;
  for (const r of results) {
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
    if (!r.ok) hardFail = true;
  }

  console.log('\n— Surfaces that hold this key (update ALL on rotation) —');
  console.log('  [tested here] local .env  SUPABASE_SERVICE_ROLE_KEY');
  console.log('  [manual]      Vercel → Project → Settings → Environment Variables');
  console.log('  [manual]      GitHub → repo Settings → Secrets → Actions');
  console.log('                (preflight.yml, scheduled-functions.yml, mommy-deploy.yml)');
  console.log('  [auto]        Supabase Edge Functions — platform-injected, no action');
  console.log('  [note]        api/conditioning compares Bearer == SERVICE_ROLE_KEY;');
  console.log('                callers using the old key 401 until updated');

  console.log('');
  if (hardFail) {
    console.log('RESULT: FAIL — rotation incomplete or key invalid. See above.');
    process.exit(1);
  }
  console.log('RESULT: PASS — current key is valid, project-matched, and not the leaked one.');
}

main().catch((e) => {
  console.error('verifier crashed:', e);
  process.exit(1);
});
