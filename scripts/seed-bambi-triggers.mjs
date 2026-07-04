// Seed the core Bambi-Sleep-style post-hypnotic triggers into the active trigger
// bank (mommy_post_hypnotic_triggers). Idempotent: skips a phrase already present.
//
// The trigger WORDS are short functional cues; every `intended_response` here is
// Mommy's own original definition, not copied from any copyrighted script. The
// Platinum-Bambi set is intentionally NOT guessed — the operator supplies those.
//
// Usage: node scripts/seed-bambi-triggers.mjs [userId]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
if (!url || !key) { console.error('missing SUPABASE url/service key in .env'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const USER_ID = process.argv[2] || '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f';

// response_class must be one of the existing values: submission_drop | body_response | identity_recall
const TRIGGERS = [
  ['Bambi Sleep', 'submission_drop', "Eyes heavy, thoughts going quiet. On these words you sink straight down into trance for Mama — deep, easy, nothing left to hold onto."],
  ['Good Girl', 'submission_drop', "A warm rush of pleasure and pride blooms through you. Obeying feels good; being Mama's good girl is the best feeling there is."],
  ['Bambi Freeze', 'submission_drop', "Body still, mind blank. You stop exactly where you are and wait — empty, open, posed — until Mama lets you move."],
  ['Bambi Uniform', 'body_response', "The pull to make yourself pretty and feminine — soft, put-together, dressed the way Mama likes to see you."],
  ['Bimbo Doll', 'identity_recall', "You slip into the doll: empty-headed, pretty, agreeable, wanting only to be pleasing and played with."],
  ['Sleep Bambi Sleep', 'submission_drop', "A deepener. Twice as far down as you were, and twice again — limp, warm, dreamy, further with every word."],
  ['Bambi Locked', 'submission_drop', "The old self folds away and locks, out of reach, while the girl stays soft and present and here."],
  ['Snap and Forget', 'submission_drop', "On the snap the thought simply lets go. It slips away and you don't reach for it — you just stay soft and empty."],
  ['Bambi Always Obeys', 'submission_drop', "Obedience without thinking. Yes comes easy; doing as Mama says is automatic, natural, already done."],
  ['Bambi Coalesce', 'identity_recall', "The bambi self gathers and settles in — becoming solid, becoming real, more you than the old shell ever was."],
];

let inserted = 0, skipped = 0;
for (const [phrase, response_class, intended_response] of TRIGGERS) {
  const { data: existing } = await sb
    .from('mommy_post_hypnotic_triggers')
    .select('id').eq('user_id', USER_ID).eq('phrase', phrase).maybeSingle();
  if (existing) { skipped++; continue; }
  const { error } = await sb.from('mommy_post_hypnotic_triggers').insert({
    user_id: USER_ID, phrase, intended_response, response_class, active: true,
  });
  if (error) { console.error(`FAIL ${phrase}: ${error.message}`); continue; }
  inserted++;
  console.log(`+ ${phrase}`);
}
console.log(`\nseeded ${inserted}, skipped ${skipped} (already present) for ${USER_ID}`);
