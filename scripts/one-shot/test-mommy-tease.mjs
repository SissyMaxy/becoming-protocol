#!/usr/bin/env node
import 'dotenv/config';
const url = process.env.SUPABASE_URL || 'https://atevwvexapiykchvqvhm.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(2); }

async function call(fn) {
  const r = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: '{}',
  });
  const text = await r.text();
  console.log(`-- ${fn} → ${r.status}`);
  console.log(text.slice(0, 700));
  console.log();
}

await call('mommy-tease');
