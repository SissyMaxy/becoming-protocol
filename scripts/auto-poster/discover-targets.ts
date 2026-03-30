/**
 * Target Discovery Engine — finds real, active Twitter accounts to engage with.
 *
 * Instead of a static list of guessed handles, this searches Twitter for people
 * actively tweeting about relevant topics, validates they exist and are active,
 * then inserts them as engagement targets.
 *
 * Run standalone: npx tsx discover-targets.ts
 * Called by reply-engine before each cycle if target pool is low.
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { supabase, PLATFORMS } from './config';

const USER_ID = process.env.USER_ID || '';
const OWN_HANDLE = process.env.TWITTER_HANDLE || 'softmaxy';

// Search queries with tier tags.
// Tiers 1-4: high-intent — the search context alone proves relevance (bio check skipped).
// Tiers 5-6: broader — bio check required to filter out randoms.
interface SearchQuery {
  query: string;
  tier: number;
  label: string;
  /** Flag targets from this query as DM-worthy (high arousal / seeking interaction) */
  dmCandidate?: boolean;
  /** Flag for NSFW Maxy voice instead of SFW */
  nsfw?: boolean;
}

const SEARCH_QUERIES: SearchQuery[] = [
  // === TIER 0: Sissies/femboys in heat — DM candidates, NSFW Maxy ===
  { tier: 0, label: 'sissy in heat', dmCandidate: true, nsfw: true, query: '"feminize me" OR "make me pretty" OR "make me a girl"' },
  { tier: 0, label: 'forced fem seeker', dmCandidate: true, nsfw: true, query: '"force fem" OR "forced feminization" OR "forcefem"' },
  { tier: 0, label: 'good girl feral', dmCandidate: true, nsfw: true, query: '"good girl" (sissy OR femboy OR bimbo OR cage OR locked)' },
  { tier: 0, label: 'gg trigger sissy', dmCandidate: true, nsfw: true, query: '"gg" (sissy OR femboy OR feminize OR bimbo OR chastity OR denial OR cage)' },
  { tier: 0, label: 'sissy begging', dmCandidate: true, nsfw: true, query: '"please feminize" OR "need to be feminized" OR "want to be a girl"' },
  { tier: 0, label: 'femboy seeking', dmCandidate: true, nsfw: true, query: '"femboy" (training OR help OR need OR please OR want)' },
  { tier: 0, label: 'sissy hypno consumer', dmCandidate: true, nsfw: true, query: '"sissy hypno" OR "hypno made me" OR "cant stop watching"' },
  { tier: 0, label: 'dress up/crossdress', dmCandidate: true, nsfw: true, query: '"first time" (dress OR panties OR stockings OR heels) (sissy OR femboy OR fem)' },
  { tier: 0, label: 'edge/goon sissy', dmCandidate: true, nsfw: true, query: '"gooning" (sissy OR fem OR bimbo) OR "sissy gooner"' },
  { tier: 0, label: 'denied sissy', dmCandidate: true, nsfw: true, query: '"sissy" ("so horny" OR "cant stop" OR "need release" OR "edge")' },

  // === TIER 1: People looking for dommes/mommy types (high-intent potential subs) ===
  { tier: 1, label: 'domme/mommy seeker', dmCandidate: true, nsfw: true, query: '"looking for" (mommy OR domme OR mistress OR goddess)' },
  { tier: 1, label: 'domme/mommy seeker', dmCandidate: true, nsfw: true, query: '"need a" (domme OR mommy OR keyholder OR mistress)' },
  { tier: 1, label: 'service sub', dmCandidate: true, nsfw: true, query: '"serve" (domme OR goddess OR mistress OR queen)' },
  { tier: 1, label: 'sub seeker', dmCandidate: true, nsfw: true, query: '"good boy" (mommy OR domme OR locked OR denied)' },
  { tier: 1, label: 'feminization seeker', dmCandidate: true, nsfw: true, query: '"make me" (sissy OR feminize OR pretty OR obey)' },
  { tier: 1, label: 'training seeker', dmCandidate: true, nsfw: true, query: '"train me" (sissy OR fem OR sub OR obedient)' },

  // === TIER 2: Findom/tribute/generous types (money-adjacent) ===
  { tier: 2, label: 'findom participant', query: '"send tribute" OR "pay to" OR "drain me" OR "wallet" domme' },
  { tier: 2, label: 'spoiler/generous', query: '"spoil" (goddess OR domme OR queen OR mistress OR trans)' },
  { tier: 2, label: 'generous sub', query: '"generous" (sub OR boy OR slave OR simp)' },
  { tier: 2, label: 'findom', query: 'findom OR "financial domination" OR "pay pig" OR paypig' },
  { tier: 2, label: 'findom cashapp', query: '"cashapp" OR "venmo" (domme OR goddess OR trans OR queen)' },

  // === TIER 3: Trans-attracted / supportive (spend money, sympathetic) ===
  { tier: 3, label: 'trans admirer', query: '"trans girl" (beautiful OR gorgeous OR stunning OR goddess)' },
  { tier: 3, label: 'trans supporter', query: '"love trans" OR "trans women are" (beautiful OR amazing OR hot)' },
  { tier: 3, label: 'trans supporter', query: '"support trans" (creator OR girl OR woman OR content)' },
  { tier: 3, label: 'trans content buyer', query: '"trans onlyfans" OR "trans fansly" OR "trans content"' },

  // === TIER 4: Chastity/denial community (engaged + spend on keyholders) ===
  { tier: 4, label: 'chastity community', nsfw: true, dmCandidate: true, query: '"locked up" (chastity OR cage OR keyholder)' },
  { tier: 4, label: 'chastity community', nsfw: true, dmCandidate: true, query: 'locktober OR "denial day" OR "cage check"' },
  { tier: 4, label: 'keyholder seeker', nsfw: true, dmCandidate: true, query: '"keyholder" (locked OR denied OR tease)' },
  { tier: 4, label: 'chastity community', nsfw: true, dmCandidate: true, query: '"days locked" OR "weeks locked" OR "still locked"' },

  // === TIER 5: Trans community peers (engagement + solidarity) — bio required ===
  { tier: 5, label: 'trans peer', query: '"my HRT" OR "started estrogen" OR "months on HRT"' },
  { tier: 5, label: 'trans peer', query: '"voice training" (trans OR mtf OR "voice fem")' },
  { tier: 5, label: 'trans peer', query: '"egg cracked" OR "came out as trans" OR "trans girl"' },
  { tier: 5, label: 'trans peer', query: '"transition timeline" OR "mtf timeline"' },

  // === TIER 6: Sissy/feminization (overlap with content buyers) — bio required ===
  { tier: 6, label: 'sissy/fem consumer', query: '"sissy training" OR "feminization" OR "forced fem"' },
  { tier: 6, label: 'sissy/fem consumer', query: '"sissy" (hypno OR caption OR training OR journey)' },
  { tier: 6, label: 'sissy/fem consumer', query: '"sissy" (pretty OR pink OR dress OR skirt OR heels)' },
];

// Handles containing these patterns get auto-rejected
const TOXIC_HANDLE_PATTERNS = [
  /goebbels/i, /hitler/i, /nazi/i, /1488/i, /88\b/,
  /retard/i, /f4g/i, /n[i1]g/i, /tr[a4]nn/i, /spic/i, /kike/i,
  /bot\b/i, /spam/i, /fake/i, /parody/i, /troll/i,
  /maga/i, /trump/i, /liberal/i, /conserv/i, /patriot/i, /resist/i,
  /crypto/i, /nft/i, /web3/i, /token/i, /forex/i,
  /grind/i, /hustle/i, /sigma/i,
];

// Bio must contain at least one of these to be considered a valid target.
// Broad enough to catch potential subscribers, not just community peers.
const BIO_RELEVANCE_PATTERNS = [
  // Trans/transition (peers + solidarity)
  /trans\b/i, /transgender/i, /mtf/i, /hrt\b/i, /hormone/i,
  /transition/i, /non.?binary/i, /enby/i, /queer/i,
  /egg_?irl/i, /she.?her/i, /they.?them/i,
  /voice train/i, /voice fem/i, /femme/i,

  // Kink/chastity/D-s (engaged community, potential subs)
  /kink/i, /bdsm/i, /chastity/i, /cage[d]?\b/i, /lock(ed|tober)/i,
  /sub\b/i, /dom\b/i, /domme/i, /keyholder/i, /denial/i,
  /d.?s\b/i, /power exchange/i, /protocol/i, /fetish/i,
  /collared/i, /owned/i, /leash/i, /obey/i, /obedient/i,

  // Mommy/domme seekers (high-intent potential subscribers)
  /mommy/i, /mistress/i, /goddess/i, /queen/i,
  /good\s?boy/i, /serve/i, /worship/i, /kneel/i,
  /simp/i, /beta/i, /slave/i, /pet\b/i,

  // Findom/tribute/generous (money signals)
  /findom/i, /tribute/i, /pay\s?pig/i, /paypig/i,
  /spoil/i, /generous/i, /wallet/i, /drain/i,
  /cashapp/i, /venmo/i, /\$\w/i,

  // Sissy/feminization (content buyers)
  /sissy/i, /feminiz/i, /forced\s?fem/i, /crossdress/i,
  /bimbo/i, /hypno/i, /caption/i,

  // Adult content signals (creators + consumers)
  /18\+/i, /nsfw/i, /sw\b/i, /sex work/i, /onlyfans/i, /fansly/i,
  /adult/i, /spicy/i, /link\s?in\s?bio/i,
  /minors?\s?(dni|do not)/i, /no minors/i,

  // Trans-attracted / admirers
  /trans.?attract/i, /admirer/i, /t.?girl/i, /tgirl/i,
  /trans.?lover/i, /chaser/i,

  // Self-improvement / accountability
  /handler/i, /accountab/i, /self.?improv/i,
];

function isToxicHandle(handle: string): boolean {
  return TOXIC_HANDLE_PATTERNS.some(p => p.test(handle));
}

/**
 * Detect if an account IS a domme/provider/findom (the supply side).
 * These are fine as reply targets but should NOT get cold DMs —
 * they're competitors, not prospects.
 */
const PROVIDER_BIO_PATTERNS = [
  // They identify AS a domme/goddess/mistress (supply side)
  /\b(i am|i'm|your)\s*(domme|goddess|mistress|queen|keyholder|findom)/i,
  /domme\b/i, /dominatrix/i, /goddess\b/i, /mistress\b/i,
  /femdom/i, /findomme/i,
  // Service language from the provider side
  /worship me/i, /tribute me/i, /serve me/i, /kneel before/i,
  /send.{0,10}(tribute|tip)/i, /drain.{0,10}(wallet|account|pig)/i,
  /pay.{0,10}(me|up|now)/i,
  /apply.{0,10}(to serve|below|here)/i,
  // Link-in-bio with seller energy
  /(linktree|linktr\.ee|allmylinks|beacons)/i,
  // "DMs open for ___" (provider framing)
  /dms?\s*(open|welcome).{0,20}(tribute|session|custom|booking)/i,
];

function isProviderAccount(bio: string, handle: string): boolean {
  // Check handle for obvious provider signals
  if (/domme|goddess|mistress|queen|findom/i.test(handle)) return true;
  // Check bio
  return PROVIDER_BIO_PATTERNS.some(p => p.test(bio));
}


function isBioRelevant(bio: string): boolean {
  if (!bio || bio.trim().length < 5) return false;
  return BIO_RELEVANCE_PATTERNS.some(p => p.test(bio));
}

interface DiscoveredTarget {
  handle: string;
  displayName: string;
  followerText: string;
  source_query: string;
  tier: number;
  label: string;
  dmCandidate: boolean;
  nsfw: boolean;
}

/**
 * Parse follower count text like "1,234 Followers" → 1234
 */
function parseFollowerCount(text: string): number | null {
  if (!text) return null;
  // Handle "1.2K", "15K", "1.5M" etc.
  const compact = text.match(/([\d.]+)\s*([KMB])/i);
  if (compact) {
    const num = parseFloat(compact[1]);
    const mult = { K: 1000, M: 1_000_000, B: 1_000_000_000 }[compact[2].toUpperCase()] || 1;
    return Math.round(num * mult);
  }
  // Handle "1,234"
  const plain = text.replace(/[,\s]/g, '').match(/(\d+)/);
  return plain ? parseInt(plain[1], 10) : null;
}

/**
 * Search Twitter for a query and extract usernames from results.
 */
async function searchForTargets(
  page: Page,
  searchQuery: SearchQuery,
  maxResults: number = 15,
): Promise<DiscoveredTarget[]> {
  const { query, tier, label } = searchQuery;
  const targets: DiscoveredTarget[] = [];
  const seen = new Set<string>();

  try {
    const encodedQuery = encodeURIComponent(query);
    await page.goto(`https://x.com/search?q=${encodedQuery}&src=typed_query&f=live`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(3000);

    // Scroll a bit to load more results
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(1500);
    }

    // Extract usernames from tweet articles
    const tweets = await page.locator('[data-testid="tweet"]').all();

    for (const tweet of tweets.slice(0, maxResults * 2)) {
      try {
        // Get the username link — looks for the @handle element
        const userLinks = await tweet.locator('a[role="link"][href^="/"]').all();

        for (const link of userLinks) {
          const href = await link.getAttribute('href').catch(() => '');
          if (!href || href.includes('/status/') || href.includes('/search') || href === '/') continue;

          const handle = href.replace(/^\//, '').split('/')[0];
          if (!handle || handle.includes('?') || seen.has(handle.toLowerCase())) continue;
          if (handle.toLowerCase() === OWN_HANDLE.toLowerCase()) continue;
          if (isToxicHandle(handle)) {
            console.log(`  ⊘ Skipping toxic handle: @${handle}`);
            continue;
          }

          // Get display name if available
          const nameEl = link.locator('span').first();
          const displayName = await nameEl.textContent().catch(() => '') || '';

          seen.add(handle.toLowerCase());
          targets.push({
            handle,
            displayName: displayName.trim(),
            followerText: '',
            source_query: query,
            tier,
            label,
            dmCandidate: searchQuery.dmCandidate ?? false,
            nsfw: searchQuery.nsfw ?? false,
          });

          if (targets.length >= maxResults) break;
        }
      } catch {
        continue;
      }

      if (targets.length >= maxResults) break;
    }
  } catch (err) {
    console.error(`[Discover] Search failed for "${query}":`, err instanceof Error ? err.message : err);
  }

  return targets;
}

/**
 * Validate a discovered handle — check it exists, has tweets, get follower count.
 * Returns null if invalid.
 */
async function validateTarget(
  page: Page,
  target: DiscoveredTarget,
): Promise<{
  handle: string;
  followerCount: number | null;
  targetType: string;
  strategy: string;
  dmCandidate: boolean;
  nsfw: boolean;
} | null> {
  try {
    await page.goto(`https://x.com/${target.handle}`, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
    await page.waitForTimeout(2000);

    // Check if account exists
    const notFound = await page.locator(
      'span:has-text("This account doesn"), span:has-text("Account suspended"), span:has-text("doesn\'t exist")'
    ).count();
    if (notFound > 0) return null;

    // Check for tweets
    const tweetCount = await page.locator('[data-testid="tweet"]').count();
    if (tweetCount === 0) return null;

    // Read bio
    const bioEl = page.locator('[data-testid="UserDescription"]').first();
    const bio = await bioEl.textContent().catch(() => '') || '';

    // All tiers: reject accounts whose bios scream "wrong audience"
    // (news, sports, politics, business, crypto, etc.)
    const bioLower = bio.toLowerCase();
    const OFF_TOPIC_BIO = [
      /journalist|reporter|news|media outlet|breaking/i,
      /sports|nba|nfl|cricket|football|basketball|soccer/i,
      /politician|congress|senator|parliament|campaign|\bmp\b|councillor|mayor/i,
      /real estate|mortgage|investment advice|financial advisor/i,
      /recipe|chef|cooking|food blog|restaurant/i,
      /official account/i,
      /parody/i,
    ];
    const isOffTopic = OFF_TOPIC_BIO.some(p => p.test(bio));
    if (isOffTopic) {
      console.log(`  ⊘ @${target.handle} — off-topic bio: "${bio.substring(0, 60)}"`);
      return null;
    }

    // Tiers 0-4: high-intent searches — trust the search context, but still
    // reject empty bios or obviously wrong audiences (caught above).
    // Tiers 5-6: broader searches — require positive bio relevance match.
    if (target.tier >= 5 && !isBioRelevant(bio)) {
      console.log(`  ⊘ @${target.handle} — bio not relevant: "${bio.substring(0, 60)}"`);
      return null;
    }

    // Try to get follower count
    const followerLink = page.locator('a[href$="/verified_followers"], a[href$="/followers"]').first();
    const followerText = await followerLink.textContent().catch(() => '') || '';
    const followerCount = parseFollowerCount(followerText);

    // Skip large accounts (>25K) — replies get buried, these aren't real targets
    if (followerCount && followerCount > 25000) return null;

    // Classify using tier (from search query) + bio signals + follower count
    let targetType = 'similar_creator';
    let strategy = '';

    if (target.tier === 0) {
      // Tier 0: sissies/femboys in heat — DM + NSFW engagement
      targetType = 'potential_subscriber';
      strategy = `${target.label} — HIGH INTENT, DM candidate`;
    } else if (target.tier <= 2) {
      // Tiers 1-2: domme seekers, findom, generous — highest conversion
      targetType = 'potential_subscriber';
      strategy = `${target.label} — tweeting about it (bio may not say it)`;
    } else if (target.tier === 3) {
      // Tier 3: trans admirers/supporters
      targetType = 'potential_subscriber';
      strategy = `${target.label} — sympathetic, may subscribe`;
    } else if (target.tier === 4) {
      // Tier 4: chastity/denial
      targetType = 'potential_subscriber';
      strategy = `${target.label} — engaged community, spends on keyholders`;
    } else if (target.tier === 5) {
      // Tier 5: trans peers — classify by follower count
      if (followerCount && followerCount > 10000) {
        targetType = 'community_leader';
        strategy = 'Trans peer — community leader';
      } else {
        targetType = 'similar_creator';
        strategy = `Trans peer via: "${target.label}"`;
      }
    } else {
      // Tier 6: sissy/fem — content buyers
      targetType = 'potential_subscriber';
      strategy = `${target.label} — likely buys content`;
    }

    // Providers (dommes, findoms, goddesses) are fine for replies but NOT for DMs.
    // We want to DM the seekers/subs, not the supply side.
    const provider = isProviderAccount(bio, target.handle);
    if (provider && target.dmCandidate) {
      console.log(`  ⚡ @${target.handle} is a provider — reply target only, not DM`);
    }

    return {
      handle: target.handle,
      followerCount,
      targetType,
      strategy: provider ? `${strategy} [PROVIDER - reply only]` : strategy,
      dmCandidate: target.dmCandidate && !provider,
      nsfw: target.nsfw,
    };
  } catch {
    return null;
  }
}

/** Minimum minutes between discovery runs (prevents Twitter rate-limit) */
const DISCOVERY_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
let lastDiscoveryRun = 0;

/**
 * Run a discovery cycle — search, validate, insert new targets.
 */
export async function discoverTargets(maxNew: number = 20): Promise<{
  searched: number;
  discovered: number;
  inserted: number;
}> {
  // Rate-limit: don't run discovery more than once per 30 minutes
  const now = Date.now();
  if (now - lastDiscoveryRun < DISCOVERY_COOLDOWN_MS) {
    const minsLeft = Math.ceil((DISCOVERY_COOLDOWN_MS - (now - lastDiscoveryRun)) / 60000);
    console.log(`[Discover] Cooldown — next run in ${minsLeft}min`);
    return { searched: 0, discovered: 0, inserted: 0 };
  }
  lastDiscoveryRun = now;

  if (!USER_ID) {
    console.error('[Discover] Missing USER_ID');
    return { searched: 0, discovered: 0, inserted: 0 };
  }

  const config = PLATFORMS.twitter;
  if (!config.enabled) {
    console.log('[Discover] Twitter disabled');
    return { searched: 0, discovered: 0, inserted: 0 };
  }

  // Get existing handles so we don't re-add them
  const { data: existing } = await supabase
    .from('engagement_targets')
    .select('target_handle')
    .eq('user_id', USER_ID)
    .eq('platform', 'twitter');

  const existingHandles = new Set(
    (existing || []).map(t => t.target_handle.toLowerCase())
  );

  let context: BrowserContext | null = null;
  let searched = 0;
  let discovered = 0;
  let inserted = 0;

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-position=-2400,-2400',
      ],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = context.pages()[0] || await context.newPage();

    // Verify Twitter session is alive before searching
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    const homeUrl = page.url();
    if (homeUrl.includes('/login') || homeUrl.includes('/i/flow')) {
      console.error('[Discover] Twitter session expired — need to re-login');
      return { searched: 0, discovered: 0, inserted: 0 };
    }

    // Check if search is rate-limited by doing a test search
    await page.goto('https://x.com/search?q=test&src=typed_query&f=live', { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(3000);
    const searchResults = await page.locator('[data-testid="tweet"]').count();
    if (searchResults === 0) {
      const rateLimited = await page.locator('text=rate limit, text=try again, text=Something went wrong').count();
      if (rateLimited > 0) {
        console.error('[Discover] Twitter search rate-limited — waiting for cooldown');
        return { searched: 0, discovered: 0, inserted: 0 };
      }
      console.log('[Discover] Test search returned 0 results — may be rate-limited');
    }

    // Pick a random subset of queries each run (don't search all every time)
    const shuffled = [...SEARCH_QUERIES].sort(() => Math.random() - 0.5);
    const queries = shuffled.slice(0, 8);

    const allDiscovered: DiscoveredTarget[] = [];

    for (const sq of queries) {
      console.log(`[Discover] Searching (T${sq.tier} ${sq.label}): "${sq.query}"...`);
      searched++;

      const results = await searchForTargets(page, sq, 10);
      console.log(`  Found ${results.length} handles`);

      // Filter out existing targets
      const newResults = results.filter(
        r => !existingHandles.has(r.handle.toLowerCase())
      );
      allDiscovered.push(...newResults);

      // Rate limit between searches
      await page.waitForTimeout(2000 + Math.random() * 3000);
    }

    // Deduplicate
    const unique = new Map<string, DiscoveredTarget>();
    for (const t of allDiscovered) {
      const key = t.handle.toLowerCase();
      if (!unique.has(key)) unique.set(key, t);
    }

    console.log(`[Discover] ${unique.size} new unique handles to validate`);

    // Validate and insert (up to maxNew)
    let validated = 0;
    for (const [, target] of unique) {
      if (inserted >= maxNew) break;

      const result = await validateTarget(page, target);
      validated++;

      if (!result) {
        console.log(`  ✗ @${target.handle} — invalid/too large/no tweets`);
        await page.waitForTimeout(1000);
        continue;
      }

      discovered++;

      // Insert into DB
      const { error } = await supabase.from('engagement_targets').insert({
        user_id: USER_ID,
        platform: 'twitter',
        target_handle: result.handle,
        target_type: result.targetType,
        strategy: result.strategy,
        follower_count: result.followerCount,
        dm_candidate: result.dmCandidate,
        nsfw_engagement: result.nsfw,
      });

      if (error) {
        console.error(`  ✗ @${result.handle}: ${error.message}`);
      } else {
        console.log(`  ✓ @${result.handle} (${result.targetType}, ${result.followerCount ?? '?'} followers)`);
        existingHandles.add(result.handle.toLowerCase());
        inserted++;
      }

      await page.waitForTimeout(1500);
    }
  } catch (err) {
    console.error('[Discover] Fatal:', err);
  } finally {
    if (context) await context.close();
  }

  return { searched, discovered, inserted };
}

// Direct invocation
if (require.main === module) {
  const max = parseInt(process.argv[2] || '20', 10);
  console.log(`[Target Discovery] Starting (max ${max} new targets)...\n`);

  discoverTargets(max).then(result => {
    console.log(`\n[Target Discovery] Done: searched ${result.searched} queries, found ${result.discovered} valid, inserted ${result.inserted} new targets`);
    process.exit(0);
  }).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}
