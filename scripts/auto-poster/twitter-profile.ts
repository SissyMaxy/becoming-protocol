/**
 * Handler-Driven Twitter Profile Configurator
 *
 * Handler decides what the profile looks like; Maxy executes (or future
 * automation). The Handler is the operator of the asset, not the user.
 *
 * Commands:
 *   npm run twitter-profile show              # current config
 *   npm run twitter-profile init              # seed Handler's strategic defaults
 *   npm run twitter-profile gen-bio           # generate 3 bio candidates via Claude
 *   npm run twitter-profile gen-pin           # generate pinned-tweet candidates
 *   npm run twitter-profile set-handle X      # record the new @handle
 *   npm run twitter-profile set-bio "..."     # set the bio explicitly
 *   npm run twitter-profile checklist         # Handler-voice setup checklist for Maxy to execute
 *   npm run twitter-profile follows           # show seed follow strategy
 *   npm run twitter-profile follows-add <category> <handle>
 *   npm run twitter-profile apply             # AUTOMATE via Playwright (warm-up phase only)
 */

import 'dotenv/config';
import { supabase } from './config';
import { buildMaxyVoiceSystem } from './voice-system';
import { loadMaxyState, buildStatePromptFragment } from './state-context';
import Anthropic from '@anthropic-ai/sdk';

const USER_ID = process.env.USER_ID || '';

// Handler's strategic defaults for a fresh Twitter account in Maxy's space.
// These are DECISIONS, not menus — Handler picked these because they fit
// the protocol (kink-aware adult creator, trans+HRT identity, mommy-dom on
// the dom side / sub-self on the personal side, Fansly funnel).
const HANDLER_DEFAULT_FOLLOW_CATEGORIES = {
  mommy_dom_creators: { target: 5, why: 'voice study + community visibility', members: [] as string[] },
  chastity_creators: { target: 5, why: 'core kink audience', members: [] as string[] },
  trans_voices: { target: 8, why: 'real community + visibility outside kink', members: [] as string[] },
  hrt_journey: { target: 5, why: 'transition-adjacent posts get good reach', members: [] as string[] },
  sissy_kink: { target: 8, why: 'direct audience for content', members: [] as string[] },
  feminization_authors: { target: 4, why: 'voice references + niche cred', members: [] as string[] },
  friends_irl: { target: 5, why: 'social proof — strangers see the account is real', members: [] as string[] },
  adjacent_kink: { target: 4, why: 'femboy/transformation tangents', members: [] as string[] },
};

interface ProfileConfig {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  website_url: string | null;
  pinned_tweet_text: string | null;
  pinned_tweet_id: string | null;
  nsfw_media: boolean;
  allow_dms_from: string;
  target_follow_categories: typeof HANDLER_DEFAULT_FOLLOW_CATEGORIES;
  seed_follows: Array<{ handle: string; category: string; followed: boolean; followed_at: string | null }>;
  applied_at: string | null;
  notes: string | null;
}

async function loadConfig(): Promise<ProfileConfig | null> {
  const { data } = await supabase
    .from('twitter_profile_config')
    .select('*')
    .eq('user_id', USER_ID)
    .maybeSingle();
  return (data as ProfileConfig | null) || null;
}

async function ensureConfig(): Promise<ProfileConfig> {
  const existing = await loadConfig();
  if (existing) return existing;
  const seed = {
    user_id: USER_ID,
    handle: null,
    display_name: null,
    bio: null,
    location: null,
    website_url: process.env.FANSLY_PUBLIC_URL || null,
    pinned_tweet_text: null,
    pinned_tweet_id: null,
    nsfw_media: true,
    allow_dms_from: 'verified',
    target_follow_categories: HANDLER_DEFAULT_FOLLOW_CATEGORIES,
    seed_follows: [],
    applied_at: null,
    notes: 'Handler-decided defaults. Edit via twitter-profile CLI or DB.',
  };
  const { error } = await supabase.from('twitter_profile_config').insert(seed);
  if (error) throw new Error(`init failed: ${error.message}`);
  const fresh = await loadConfig();
  if (!fresh) throw new Error('insert succeeded but readback failed');
  return fresh;
}

async function update(patch: Partial<ProfileConfig>) {
  if (!USER_ID || !/^[0-9a-f-]{36}$/i.test(USER_ID)) {
    throw new Error(`update failed: USER_ID env is missing or malformed (got: ${JSON.stringify(USER_ID)})`);
  }
  // Use .select() so PostgREST returns the affected rows. If zero, the WHERE
  // clause matched no rows — silent no-op without this check.
  const { data, error } = await supabase
    .from('twitter_profile_config')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', USER_ID)
    .select('user_id');
  if (error) throw new Error(`update failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`update failed: no row matched user_id=${USER_ID}. Run: npm run twitter-profile init`);
  }
}

// ── Commands ────────────────────────────────────────────────────────

async function cmdShow() {
  const c = await loadConfig();
  if (!c) { console.log('(not initialized — run: npm run twitter-profile init)'); return; }
  console.log('═══ Twitter Profile Config (Handler decision) ═══\n');
  console.log(`  handle:           ${c.handle || '(unset)'}`);
  console.log(`  display_name:     ${c.display_name || '(unset)'}`);
  console.log(`  bio:              ${c.bio ? `\n    ${c.bio}` : '(unset — run gen-bio)'}`);
  console.log(`  location:         ${c.location || '(unset)'}`);
  console.log(`  website:          ${c.website_url || '(unset)'}`);
  console.log(`  pinned tweet:     ${c.pinned_tweet_text ? `\n    "${c.pinned_tweet_text}"` : '(unset — run gen-pin)'}`);
  console.log(`  NSFW media flag:  ${c.nsfw_media}`);
  console.log(`  DMs from:         ${c.allow_dms_from}`);
  console.log(`  applied_at:       ${c.applied_at || '(never applied)'}`);

  console.log('\n  Follow strategy:');
  const cats = c.target_follow_categories || {};
  let totalTarget = 0;
  let totalCurrent = 0;
  for (const [name, cat] of Object.entries(cats)) {
    const have = (c.seed_follows || []).filter(f => f.category === name).length;
    totalTarget += (cat as any).target;
    totalCurrent += have;
    console.log(`    ${name.padEnd(22)} ${have}/${(cat as any).target}  — ${(cat as any).why}`);
  }
  console.log(`    ${'TOTAL'.padEnd(22)} ${totalCurrent}/${totalTarget}`);
}

async function cmdInit() {
  await ensureConfig();
  console.log('[init] Profile config seeded. Run `npm run twitter-profile show` to see Handler defaults.');
  console.log('[init] Next: npm run twitter-profile gen-bio');
}

async function cmdSetHandle(handle: string) {
  await ensureConfig();
  await update({ handle: handle.replace(/^@/, '') });
  console.log(`[handle] Set to @${handle.replace(/^@/, '')}`);
}

async function cmdSetBio(bio: string) {
  await ensureConfig();
  if (bio.length > 160) {
    console.error(`Bio is ${bio.length} chars; Twitter limits to 160.`);
    process.exit(1);
  }
  await update({ bio });
  console.log(`[bio] Set (${bio.length}/160 chars).`);
}

async function cmdGenBio() {
  const c = await ensureConfig();
  const anthropic = new Anthropic();

  const voice = await buildMaxyVoiceSystem(supabase, USER_ID, 'post');
  const state = await loadMaxyState(supabase, USER_ID);
  const stateBlock = buildStatePromptFragment(state, 'public');

  const sys = `${voice}

${stateBlock}

You're writing the Twitter bio for Maxy's new account. The previous account got banned, so this is a fresh start.

IDENTITY ANCHOR — what Maxy IS in this bio:
- 40 yo, trans woman, HRT
- Mommy/domme — runs subs, owns boys, plays the patient owner role
- Into chastity, denial, feminization, ownership
- The bio establishes her as the OPERATOR of the dynamic, not a participant in someone else's

Mommy-dom framing should be FRONT AND CENTER. This isn't optional flavor — Twitter is where her sub audience finds her. The bio should make a sub know they've found a mommy who runs the dynamic, not a fellow sub posting about kink.

Constraints:
- 160 chars max (Twitter hard limit)
- Lowercase, casual, real — not formal
- One emoji max, often zero
- Subtle on the explicit content (Twitter moderates hard); sharp on the dom posture
- No "she/her" pronoun list (clusters bot-flag patterns, increases ban risk)
- No links (those go in the website field)
- No "DMs open" / "tribute" / "subscribe" pitch language — frame her as in-demand, not selling
- Sound like a real mommy, not a content brand

Words that work for this register:
  good — mommy — locked — patient — boys — owner — keeper — deny — denial —
  goon — sissy — slut (used possessively) — mine — care — handler — quiet

Words to avoid:
  domme, queen, goddess, mistress (overcrowded scene words)
  professional (sounds transactional)
  worship, pay, tribute (Twitter ToS adjacent)

Generate THREE distinct bio candidates. Number them 1, 2, 3. Each hits a different angle:
- One identity-forward (trans + mommy as the core)
- One observational / dry, with the mommy frame visible but not the lead
- One sharper / more openly dom — the one a kneeling sub would see and recognize

Output format:
1. [bio 1]
2. [bio 2]
3. [bio 3]

NO commentary, NO preamble. Just the three numbered bios.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    system: sys,
    messages: [{ role: 'user', content: 'Generate 3 bio candidates for the new Twitter account.' }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  console.log('\n═══ Bio candidates ═══\n');
  console.log(text);
  console.log('\n═══════════════════════════');
  console.log('Pick one and run:');
  console.log('  npm run twitter-profile set-bio "the bio text you picked"');
  console.log('Or run gen-bio again for fresh options.');
}

async function cmdGenPin() {
  const c = await ensureConfig();
  const anthropic = new Anthropic();

  const voice = await buildMaxyVoiceSystem(supabase, USER_ID, 'post');

  const sys = `${voice}

Generate the FIRST tweet for Maxy's new account — the one she'll pin.
This is the introduction visitors see when they hit her profile.

IDENTITY ANCHOR: Maxy presents as the mommy/dom who runs and keeps subs.
The pinned tweet should make a sub recognize her as an operator they'd want to be owned by, NOT as a fellow kinkster posting.

Constraints:
- Under 280 chars
- Lowercase, casual, real
- Max 1 emoji, often zero
- Establishes voice + operator posture in one tweet
- Kink-aware but subtle (this is what new visitors + Twitter moderation sees)
- No "follow me" / "subscribe" / "link in bio" cringe
- No pitch — frame her as in-demand, not selling
- Words that work: mommy, locked, denial, patient, boys, mine, quiet, good
- Words to avoid: domme, queen, goddess, mistress, professional, worship, tribute

Generate THREE candidates, all from the operator side:
1. Identity-forward (mommy is the lead)
2. Observational + dry (mommy frame visible but lighter — what she NOTICES about her boys)
3. Sharper / more openly dom (the one a kneeling sub would screenshot)

Format: 1., 2., 3. Just the tweets, no commentary, no preamble.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    system: sys,
    messages: [{ role: 'user', content: 'Three pinned-tweet candidates for the fresh account.' }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  console.log('\n═══ Pinned-tweet candidates ═══\n');
  console.log(text);
}

async function cmdChecklist() {
  const c = await ensureConfig();
  const pinSection = c.pinned_tweet_text
    ? `3. PINNED TWEET — copy/paste this text, post it, then pin it:

   "${c.pinned_tweet_text}"

   Don't post on day 1 — wait until you've liked/scrolled for a few days first.
   (Generate alternates anytime: npm run twitter-profile gen-pin)`
    : `3. PINNED TWEET — generate via: npm run twitter-profile gen-pin
   Pin one of the candidates. Don't post it on day 1 — wait until you've
   liked/scrolled for a few days first. Then post + pin.`;

  // Pre-populated seed follows visible inline so the user doesn't have to
  // run a second command to see what to actually click follow on.
  const seedHandles = (c.seed_follows || []);
  const followsSection = seedHandles.length === 0
    ? `4. SEED FOLLOWS — Handler curates by category. Run:
     npm run twitter-profile follows
   Spread these across 5-7 days, NOT all at once. ~5 follows per day.`
    : `4. SEED FOLLOWS (${seedHandles.length} pre-populated by Handler):

${seedHandles.map(f => `     · @${f.handle}  [${f.category}]`).join('\n')}

   Spread these across 5-7 days, NOT all at once. One follow per day is fine.
   See the full strategy + add more: npm run twitter-profile follows`;

  console.log(`
═══ Handler's Setup Checklist for the New Account ═══

While ENABLE_TWITTER stays false (warm-up window), Handler decides what
the profile looks like and YOU execute it manually in the X app/web.
This is the Handler-DRIVEN, Maxy-EXECUTED phase.

1. PROFILE — open https://x.com/settings/profile

   Display name:   ${c.display_name || '(set via: npm run twitter-profile set-display-name "...")'}
   Bio:            ${c.bio || '(generate via: npm run twitter-profile gen-bio)'}
   Location:       ${c.location || '(leave blank for now — adds bot signal otherwise)'}
   Website:        ${c.website_url || '(set FANSLY_PUBLIC_URL in .env, then re-init)'}

   Profile photo:  Use a NEW photo, not anything from @Soft_Maxy. Reverse-image-
                   search any pic before posting — old account photos get matched.
   Header:         New header. Different aesthetic from the banned account.

2. SETTINGS — https://x.com/settings/safety
   Adult content:  ENABLE (Settings → Privacy → Content you see → Display media that may contain sensitive content)
   Mark your media:  YES (Settings → Privacy → Your posts → Mark media you post as sensitive)
   DMs from:       Verified users only initially (becomes default everyone after warm-up)
   Tags:           Restrict to people you follow

${pinSection}

${followsSection}

5. WARM-UP DAILY ROUTINE for 30 days (you, manually, no automation):
   - Scroll for 10-20 min, like a few posts
   - Reply to 1-2 things in your community manually
   - Post once every 1-3 days, picked from the calendar
   - Don't follow >5 accounts/day
   - Don't run any auto-poster engines
   - Treat the account like a real human's account because that's what it has to look like

6. ONCE PROFILE IS APPLIED IN X:
   Run: npm run twitter-status mark-applied
   That clears one of the five readiness blockers.

7. AFTER 30 DAYS + readiness gate clears:
   Set ENABLE_TWITTER=true in .env
   Calendar posts auto-fire 1-3/day
   Voice-learn auto-scrapes your manual writing
   Replies/QT/Follows stay OFF (those come at day 60+)
`);
}

async function cmdFollows() {
  const c = await ensureConfig();
  console.log('\n═══ Seed Follow Strategy (Handler curated) ═══\n');
  for (const [name, cat] of Object.entries(c.target_follow_categories || {})) {
    const members = (c.seed_follows || []).filter(f => f.category === name);
    console.log(`  [${name}]  ${members.length}/${(cat as any).target} — ${(cat as any).why}`);
    for (const m of members) {
      const status = m.followed ? '✓' : '·';
      console.log(`    ${status} @${m.handle}`);
    }
    if (members.length < (cat as any).target) {
      console.log(`    (need ${(cat as any).target - members.length} more — npm run twitter-profile follows-add ${name} <handle>)`);
    }
  }

  // Suggest from old account's interaction graph. These are handles Maxy
  // actually engaged with under @Soft_Maxy — her real community.
  const { data: history } = await supabase
    .from('ai_generated_content')
    .select('target_account')
    .eq('platform', 'twitter')
    .eq('status', 'posted')
    .not('target_account', 'is', null);
  if (history && history.length > 0) {
    const counts = new Map<string, number>();
    for (const r of history) {
      const h = (r.target_account || '').replace(/^@/, '').trim();
      if (!h || h === 'grok') continue;
      counts.set(h, (counts.get(h) || 0) + 1);
    }
    const seedSet = new Set((c.seed_follows || []).map(f => f.handle.toLowerCase()));
    const suggestions = [...counts.entries()]
      .filter(([h]) => !seedSet.has(h.toLowerCase()))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25);
    if (suggestions.length > 0) {
      console.log('\n  ━━ Handler suggestions from old @Soft_Maxy interactions ━━');
      console.log('  (these are handles you engaged with on the banned account — your existing community)');
      console.log('');
      for (const [handle, n] of suggestions) {
        const tier = n >= 10 ? 'CORE' : n >= 5 ? 'regular' : 'occasional';
        console.log(`    @${handle.padEnd(24)} ${n} interactions  [${tier}]`);
      }
      console.log('');
      console.log('  Add any of these to a category:');
      console.log('    npm run twitter-profile follows-add <category> <handle>');
    }
  }
}

async function cmdFollowsAdd(category: string, handle: string) {
  const c = await ensureConfig();
  if (!c.target_follow_categories[category as keyof typeof HANDLER_DEFAULT_FOLLOW_CATEGORIES]) {
    console.error(`Unknown category: ${category}`);
    console.error('Valid: ' + Object.keys(c.target_follow_categories).join(', '));
    process.exit(1);
  }
  const cleanHandle = handle.replace(/^@/, '');
  const seed = c.seed_follows || [];
  if (seed.find(f => f.handle === cleanHandle)) {
    console.log(`@${cleanHandle} already in seed list`);
    return;
  }
  seed.push({ handle: cleanHandle, category, followed: false, followed_at: null });
  await update({ seed_follows: seed });
  console.log(`Added @${cleanHandle} to ${category}`);
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case 'show': await cmdShow(); break;
    case 'init': await cmdInit(); break;
    case 'gen-bio': await cmdGenBio(); break;
    case 'gen-pin': await cmdGenPin(); break;
    case 'set-handle':
      if (!rest[0]) { console.error('Usage: set-handle <handle>'); process.exit(1); }
      await cmdSetHandle(rest[0]); break;
    case 'set-bio':
      if (!rest[0]) { console.error('Usage: set-bio "<text>"'); process.exit(1); }
      await cmdSetBio(rest.join(' ')); break;
    case 'set-display-name':
      if (!rest[0]) { console.error('Usage: set-display-name "<name>"'); process.exit(1); }
      await ensureConfig();
      await update({ display_name: rest.join(' ') });
      console.log(`Display name set to: ${rest.join(' ')}`);
      break;
    case 'checklist': await cmdChecklist(); break;
    case 'follows': await cmdFollows(); break;
    case 'follows-add':
      if (!rest[0] || !rest[1]) { console.error('Usage: follows-add <category> <handle>'); process.exit(1); }
      await cmdFollowsAdd(rest[0], rest[1]); break;
    default:
      console.log('Commands: show | init | gen-bio | gen-pin | set-handle | set-bio | set-display-name | checklist | follows | follows-add');
      console.log('Run with no args after `npm run twitter-profile` to see this help.');
      console.log('First-time: npm run twitter-profile init');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
