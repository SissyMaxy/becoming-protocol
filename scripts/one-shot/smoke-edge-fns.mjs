import 'dotenv/config';
const URL = process.env.SUPABASE_URL || 'https://atevwvexapiykchvqvhm.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('no SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const fns = ['mommy-mantra', 'mommy-aftercare', 'mommy-prescribe', 'wardrobe-prescription-expiry', 'outreach-tts-render', 'calendar-sync', 'calendar-place-rituals'];
for (const fn of fns) {
  try {
    const r = await fetch(`${URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const text = await r.text();
    console.log(`${fn}: status=${r.status} body=${text.slice(0, 200)}`);
  } catch (e) { console.log(`${fn}: ERROR ${e.message}`); }
}
