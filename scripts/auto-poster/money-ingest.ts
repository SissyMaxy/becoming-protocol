/**
 * Money ingestion — writes `tip`, `sub`, `ppv_purchase`, `cam_tip` events
 * into the contact graph so lifetime_value_cents and tier reflect real spend.
 *
 * Three sources:
 *   - Fansly: scrapes the notifications feed (tips, subs, unlocks)
 *   - OnlyFans: scrapes earnings/notifications (stub — requires persistent Firefox session)
 *   - Chaturbate: parses tip notifications from the broadcaster's /stats/tokens page
 *
 * Run standalone: npx tsx money-ingest.ts [fansly|onlyfans|chaturbate|all]
 * Scheduled: called by scheduler.ts every N ticks
 *
 * Each ingestor is idempotent — uses a (platform, external_id, amount) dedup key
 * stored in event.metadata to avoid double-counting the same tip.
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { supabase, PLATFORMS } from './config';
import { resolveContact, recordEvent, recomputeTier, type ContactPlatform, type EventType } from './contact-graph';
import { queueAttention } from './handler-attention';
import { closeTributePaid } from './tributes';

const USER_ID = process.env.USER_ID || '';

interface MoneyRecord {
  platform: ContactPlatform;
  eventType: EventType;
  fromHandle: string;
  displayName?: string;
  amountCents: number;
  externalId: string;  // stable id from the platform so we dedup
  occurredAt: string;
  note?: string;
}

/**
 * Dedup key: platform + externalId. Skip if we've already logged this payment.
 */
async function alreadyIngested(externalId: string): Promise<boolean> {
  const { count } = await supabase
    .from('contact_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
    .contains('metadata', { external_id: externalId });
  return (count || 0) > 0;
}

// Tribute codes: 6 alphanumeric chars (no 0, 1, I, O). The Handler includes them
// in payment notes so we can match an incoming tip back to an open tribute.
const TRIBUTE_CODE_RE = /\b([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6})\b/;

export async function ingestOne(m: MoneyRecord): Promise<boolean> {
  if (await alreadyIngested(m.externalId)) return false;

  const contact = await resolveContact(supabase, USER_ID, m.platform, m.fromHandle, m.displayName);
  const wasStranger = contact.tier === 'stranger' && (contact.lifetime_value_cents || 0) === 0;

  await recordEvent(
    supabase,
    USER_ID,
    contact.id,
    m.eventType,
    'in',
    m.platform,
    m.note,
    m.amountCents,
    { external_id: m.externalId, occurred_at: m.occurredAt },
  );
  const newTier = await recomputeTier(supabase, contact.id);

  // Look for a tribute code in the payment note — auto-close matching tributes.
  if (m.note) {
    const codeMatch = m.note.match(TRIBUTE_CODE_RE);
    if (codeMatch) {
      const { data: lastEvent } = await supabase
        .from('contact_events')
        .select('id')
        .eq('contact_id', contact.id)
        .eq('user_id', USER_ID)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastEvent) {
        try {
          const closed = await closeTributePaid(supabase as any, USER_ID, codeMatch[1], lastEvent.id);
          if (closed) console.log(`  [tribute] ${codeMatch[1]} closed as paid`);
        } catch (err) {
          console.error(`  [tribute] close failed:`, err instanceof Error ? err.message : err);
        }
      }
    }
  }

  // Attention: first-time payer is a notable event. Larger tips also escalate.
  if (wasStranger || m.amountCents >= 5000) {
    await queueAttention(supabase, USER_ID, {
      kind: wasStranger ? 'new_paying_contact' : 'custom',
      severity: m.amountCents >= 10000 ? 'high' : 'medium',
      contactId: contact.id,
      platform: m.platform,
      summary: `${wasStranger ? 'NEW payer' : 'big payment'}: @${m.fromHandle} ${m.eventType} $${(m.amountCents/100).toFixed(2)} (now ${newTier})`,
      payload: { amount_cents: m.amountCents, event_type: m.eventType, note: m.note },
    });
  }
  return true;
}

// ── Fansly ingestor ──────────────────────────────────────────────────

/**
 * Scrape Fansly notifications for tips, subs, and PPV unlocks.
 * The notifications feed shows items like:
 *   "@fan_handle tipped you $5.00"
 *   "@fan_handle subscribed for $9.99"
 *   "@fan_handle unlocked your post for $3.99"
 */
export async function ingestFansly(): Promise<{ ingested: number; seen: number }> {
  const config = PLATFORMS.fansly;
  if (!config.enabled) return { ingested: 0, seen: 0 };

  let context: BrowserContext | null = null;
  let ingested = 0;
  let seen = 0;

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });
    const page: Page = context.pages()[0] || await context.newPage();

    await page.goto('https://fansly.com/notifications', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(5000);

    const notLoggedIn = await page.locator('button:has-text("Log In"), a:has-text("Log In")').count();
    if (notLoggedIn > 0) {
      console.error('[money/fansly] not logged in');
      return { ingested: 0, seen: 0 };
    }

    // Scrape notification rows. Fansly's DOM uses hashed classes — walk by text.
    const items = await page.evaluate(`(() => {
      const out = [];
      const rows = document.querySelectorAll('[class*="notification"], [class*="activity"], [role="listitem"]');
      for (const el of rows) {
        const text = (el.innerText || '').trim();
        if (!text) continue;
        // Find linked user handle
        const userLink = el.querySelector('a[href*="/"]');
        const handle = userLink ? (userLink.getAttribute('href') || '').replace(/^\\//, '').split(/[/?#]/)[0] : '';
        out.push({ text, handle, html: el.outerHTML.substring(0, 400) });
        if (out.length > 50) break;
      }
      return out;
    })()`) as Array<{ text: string; handle: string; html: string }>;

    seen = items.length;
    console.log(`[money/fansly] scanned ${items.length} notification(s)`);

    // Parse each line for money.
    const TIP_RE = /tipped\s+you\s+\$?([\d.,]+)/i;
    const SUB_RE = /subscribed.*?\$?([\d.,]+)/i;
    const UNLOCK_RE = /(?:unlocked|purchased|bought).*?\$?([\d.,]+)/i;

    for (const item of items) {
      if (!item.handle) continue;
      const handle = item.handle;

      let eventType: EventType | null = null;
      let amountStr: string | undefined;
      if (TIP_RE.test(item.text)) { eventType = 'tip'; amountStr = item.text.match(TIP_RE)?.[1]; }
      else if (SUB_RE.test(item.text)) { eventType = 'sub'; amountStr = item.text.match(SUB_RE)?.[1]; }
      else if (UNLOCK_RE.test(item.text)) { eventType = 'ppv_purchase'; amountStr = item.text.match(UNLOCK_RE)?.[1]; }
      else continue;

      const amount = amountStr ? Math.round(parseFloat(amountStr.replace(/,/g, '')) * 100) : 0;
      if (amount <= 0) continue;

      // External id: hash of (handle + type + amount + first 80 chars). Keeps dedup
      // stable across re-scrapes of the same notification. Not perfect but adequate.
      const externalId = `fansly:${handle}:${eventType}:${amount}:${item.text.substring(0, 80).replace(/\s+/g, ' ')}`;

      const ok = await ingestOne({
        platform: 'fansly',
        eventType,
        fromHandle: handle,
        amountCents: amount,
        externalId,
        occurredAt: new Date().toISOString(),
        note: item.text.substring(0, 300),
      });
      if (ok) {
        ingested++;
        console.log(`  [money/fansly] +$${(amount / 100).toFixed(2)} ${eventType} from @${handle}`);
      }
    }
  } catch (err) {
    console.error('[money/fansly] failed:', err instanceof Error ? err.message : err);
  } finally {
    if (context) await context.close();
  }

  return { ingested, seen };
}

// ── Chaturbate ingestor ──────────────────────────────────────────────

/**
 * Scrape Chaturbate token tips from the broadcaster's My Collection / Token Stats page.
 * URL: https://chaturbate.com/statsapi/tokenstats/ (or /tipping-history/).
 * 1 token = $0.05 (broadcaster gets ~$0.05/token).
 *
 * NOTE: This is a best-effort scraper. The actual Chaturbate page structure varies;
 * you may need to adjust selectors after running once. Screenshot is saved to
 * .debug-cb-tips.png on failure to aid selector tuning.
 */
export async function ingestChaturbate(): Promise<{ ingested: number; seen: number }> {
  const config = PLATFORMS.chaturbate;
  if (!config.enabled) return { ingested: 0, seen: 0 };

  let context: BrowserContext | null = null;
  let ingested = 0;
  let seen = 0;
  const TOKEN_USD_CENTS = 5; // 1 token ≈ $0.05 payout

  try {
    context = await chromium.launchPersistentContext(config.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });
    const page: Page = context.pages()[0] || await context.newPage();

    // Token stats / tipping history endpoint — actual URL varies. Try a couple.
    const urls = [
      'https://chaturbate.com/statsapi/tokenstats/',
      'https://chaturbate.com/stats/tipping/',
      'https://chaturbate.com/affiliates/statistics/',
    ];

    let loaded = false;
    for (const url of urls) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(3000);
        if (!/log[\s-]?in|sign[\s-]?in/i.test(await page.title())) {
          loaded = true;
          break;
        }
      } catch { /* try next */ }
    }
    if (!loaded) {
      console.error('[money/chaturbate] could not load tip stats page');
      await page.screenshot({ path: '.debug-cb-tips.png' }).catch(() => {});
      return { ingested: 0, seen: 0 };
    }

    // Generic table scrape: look for rows with (username, tokens, timestamp).
    const rows = await page.evaluate(`(() => {
      const out = [];
      const trs = document.querySelectorAll('table tr, [class*="tip-row"], [class*="history-row"]');
      for (const tr of trs) {
        const text = (tr.innerText || '').trim();
        if (!text) continue;
        // Expect a token count somewhere
        const tokenMatch = text.match(/(\\d+)\\s*(?:tokens?|tks?)/i);
        if (!tokenMatch) continue;
        // Grab first username-like word
        const userMatch = text.match(/\\b([a-zA-Z0-9_]{3,30})\\b/);
        out.push({ text, tokens: parseInt(tokenMatch[1], 10), handle: userMatch ? userMatch[1] : '' });
        if (out.length > 100) break;
      }
      return out;
    })()`) as Array<{ text: string; tokens: number; handle: string }>;

    seen = rows.length;
    console.log(`[money/chaturbate] scanned ${rows.length} tip row(s)`);

    for (const r of rows) {
      if (!r.handle || r.tokens <= 0) continue;
      const cents = r.tokens * TOKEN_USD_CENTS;
      const externalId = `chaturbate:${r.handle}:${r.tokens}:${r.text.substring(0, 80).replace(/\s+/g, ' ')}`;
      const ok = await ingestOne({
        platform: 'chaturbate',
        eventType: 'cam_tip',
        fromHandle: r.handle,
        amountCents: cents,
        externalId,
        occurredAt: new Date().toISOString(),
        note: `${r.tokens} tokens`,
      });
      if (ok) {
        ingested++;
        console.log(`  [money/chaturbate] +${r.tokens} tk ($${(cents / 100).toFixed(2)}) from ${r.handle}`);
      }
    }
  } catch (err) {
    console.error('[money/chaturbate] failed:', err instanceof Error ? err.message : err);
  } finally {
    if (context) await context.close();
  }

  return { ingested, seen };
}

// ── OnlyFans ingestor ────────────────────────────────────────────────

/**
 * OnlyFans uses a persistent Firefox session (see onlyfans-session.ts).
 * Scraping earnings requires navigating there and parsing the statements page.
 * Stub — wire this to getOnlyFansPage() once ready.
 */
export async function ingestOnlyFans(): Promise<{ ingested: number; seen: number }> {
  // TODO: use getOnlyFansPage() from onlyfans-session.ts to navigate
  //       https://onlyfans.com/my/statements/earnings/all
  //       parse tips / subs / ppv rows and call ingestOne() for each.
  return { ingested: 0, seen: 0 };
}

// ── Runner ───────────────────────────────────────────────────────────

export async function runAllMoneyIngest(): Promise<{ ingested: number; seen: number }> {
  const f = await ingestFansly();
  const c = await ingestChaturbate();
  const o = await ingestOnlyFans();
  return {
    ingested: f.ingested + c.ingested + o.ingested,
    seen: f.seen + c.seen + o.seen,
  };
}

// Direct invocation
if (require.main === module) {
  if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }
  const target = process.argv[2] || 'all';
  (async () => {
    let result: { ingested: number; seen: number };
    if (target === 'fansly') result = await ingestFansly();
    else if (target === 'chaturbate') result = await ingestChaturbate();
    else if (target === 'onlyfans') result = await ingestOnlyFans();
    else result = await runAllMoneyIngest();
    console.log(`\n[money-ingest] Done: ${result.ingested} new event(s) from ${result.seen} row(s) scanned`);
    process.exit(0);
  })();
}
