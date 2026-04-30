/**
 * Twitter Follow Discovery
 *
 * Scrapes X search results for kink/trans/gooner accounts and queues them
 * into twitter_profile_config.seed_follows for human-paced following.
 *
 * Doesn't auto-follow. Rate-limit on follows lives in the engine; this just
 * builds the candidate list. Maxy (or the engine post-warmup) follows the
 * queue at human cadence — 2-4/day max.
 */

import 'dotenv/config';
import { chromium, type BrowserContext } from 'playwright';
import { supabase, PLATFORMS } from './config';

const USER_ID = process.env.USER_ID || '';

// Search seed terms grouped by category. Categories map to existing
// twitter_profile_config.target_follow_categories so discovered handles slot
// into the right bucket.
const SEARCH_TERMS: Array<{ category: string; terms: string[] }> = [
  { category: 'mommy_dom_creators', terms: ['"mommy dom" trans', '"mommy domme"', '"mommy" sissy', '"good girl" mommy locked'] },
  { category: 'chastity_creators', terms: ['#chastity locked', 'denial chastity trans', 'caged sissy', '#locktober'] },
  { category: 'sissy_kink', terms: ['sissy training', 'sissification', 'goon sissy', 'feminization sissy', 'sissy slut'] },
  { category: 'feminization_authors', terms: ['feminization caption', 'forced fem', 'sissy hypno', 'feminization story'] },
  { category: 'trans_voices', terms: ['trans woman hrt', 'transitioning at 40', 'late transition', 'trans femme'] },
  { category: 'hrt_journey', terms: ['hrt month', 'estrogen month', 'transition timeline', 'hrt update'] },
  { category: 'adjacent_kink', terms: ['femboy', 'tgirl', 'transformation kink', 'goon brain'] },
];

const MAX_PER_TERM = 8;
const PER_TERM_DELAY_MS = 6000;

interface Candidate { handle: string; category: string; source_term: string }

async function isLoggedIn(page: import('playwright').Page): Promise<boolean> {
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2500);
  const sideNav = await page.locator('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Profile_Link"]').count().catch(() => 0);
  return sideNav > 0;
}

function looksLikeBot(handle: string, displayName: string, bioText: string): boolean {
  // Cheap heuristics for spam/promo accounts. We don't want the bot to populate
  // the seed list with link-farms.
  if (/^[a-z]+\d{6,}$/i.test(handle)) return true;          // bob123456 pattern
  if (/(linktr|onlyfans|fansly|cash[\s.]?app|venmo|paypal\.me)/i.test(bioText)) return true;
  if (/(promo|free trial|click here|telegram\s*:)/i.test(bioText)) return true;
  if (handle.length > 24) return true;                       // suspiciously long
  return false;
}

async function searchOne(
  page: import('playwright').Page,
  term: string,
): Promise<Array<{ handle: string; displayName: string; bio: string }>> {
  const url = `https://x.com/search?q=${encodeURIComponent(term)}&src=typed_query&f=user`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4000);
  } catch { return []; }

  const results = await page.evaluate(() => {
    const out: Array<{ handle: string; displayName: string; bio: string }> = [];
    const cells = Array.from(document.querySelectorAll('[data-testid="UserCell"]'));
    for (const c of cells) {
      const handleAnchor = c.querySelector('a[href^="/"][role="link"]') as HTMLAnchorElement | null;
      const handle = handleAnchor?.href ? new URL(handleAnchor.href).pathname.replace(/^\//, '').split('/')[0] : '';
      if (!handle || handle.includes('/')) continue;
      const text = (c as HTMLElement).innerText || '';
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const displayName = lines[0] || handle;
      const bio = lines.slice(2).join(' ').slice(0, 200);
      out.push({ handle, displayName, bio });
    }
    return out;
  }).catch(() => []);
  return results;
}

async function main() {
  if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }

  // Pull existing seeds so we don't duplicate
  const { data: cfg } = await supabase
    .from('twitter_profile_config')
    .select('seed_follows, target_follow_categories')
    .eq('user_id', USER_ID).maybeSingle();
  const existingHandles = new Set<string>(((cfg?.seed_follows as any[]) || []).map(f => (f.handle || '').toLowerCase()));
  const existingCategories = (cfg?.target_follow_categories as Record<string, unknown>) || {};

  let context: BrowserContext | null = null;
  const candidates: Candidate[] = [];

  try {
    context = await chromium.launchPersistentContext(PLATFORMS.twitter.profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled', '--window-position=-2400,-2400'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = context.pages()[0] || await context.newPage();

    if (!(await isLoggedIn(page))) {
      console.error('[discover] not logged in to x.com — run: npx tsx login.ts twitter');
      process.exit(1);
    }

    for (const group of SEARCH_TERMS) {
      // Skip categories that aren't part of the configured strategy
      if (!Object.keys(existingCategories).includes(group.category)) continue;
      for (const term of group.terms) {
        const results = await searchOne(page, term);
        let added = 0;
        for (const r of results.slice(0, MAX_PER_TERM)) {
          const handleLower = r.handle.toLowerCase();
          if (existingHandles.has(handleLower)) continue;
          if (looksLikeBot(r.handle, r.displayName, r.bio)) continue;
          candidates.push({ handle: r.handle, category: group.category, source_term: term });
          existingHandles.add(handleLower);
          added++;
        }
        console.log(`[discover] "${term}" → ${added} new`);
        await page.waitForTimeout(PER_TERM_DELAY_MS);
      }
    }
  } finally {
    if (context) await context.close();
  }

  if (candidates.length === 0) { console.log('[discover] no new candidates'); return; }

  // Append to seed_follows (read-modify-write)
  const { data: latest } = await supabase
    .from('twitter_profile_config').select('seed_follows').eq('user_id', USER_ID).maybeSingle();
  const current = ((latest?.seed_follows as any[]) || []);
  const additions = candidates.map(c => ({
    handle: c.handle,
    category: c.category,
    followed: false,
    followed_at: null,
    discovered_at: new Date().toISOString(),
    source_term: c.source_term,
  }));
  const merged = [...current, ...additions];

  await supabase.from('twitter_profile_config').update({
    seed_follows: merged,
    updated_at: new Date().toISOString(),
  }).eq('user_id', USER_ID);

  console.log(`[discover] queued ${candidates.length} new handles. Total seed list now: ${merged.length}`);

  // Per-category breakdown
  const byCat: Record<string, number> = {};
  for (const c of candidates) byCat[c.category] = (byCat[c.category] || 0) + 1;
  for (const [cat, n] of Object.entries(byCat)) console.log(`  +${n} ${cat}`);
}

main().catch(err => { console.error(err); process.exit(1); });
