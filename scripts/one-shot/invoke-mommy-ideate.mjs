#!/usr/bin/env node
import 'dotenv/config';

const url = (process.env.SUPABASE_URL || 'https://atevwvexapiykchvqvhm.supabase.co') + '/functions/v1/mommy-ideate';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(2); }

const r = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
  body: JSON.stringify({}),
});
const text = await r.text();
console.log(`status=${r.status}`);
console.log(text.slice(0, 500));
