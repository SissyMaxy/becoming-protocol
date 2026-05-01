import 'dotenv/config';
const url = process.env.SUPABASE_URL || 'https://atevwvexapiykchvqvhm.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const r = await fetch(`${url}/functions/v1/mommy-recall`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
  body: '{}',
});
const text = await r.text();
console.log(`status=${r.status}`);
console.log(text.slice(0, 800));
