/**
 * Subscriber Engagement — reply to comments on Fansly/OnlyFans posts.
 *
 * Scrapes new subscriber comments, generates warm personal replies,
 * posts them back. Makes subscribers feel seen.
 *
 * Run: npx tsx platforms/subscriber-engage.ts
 */

import 'dotenv/config';
import { chromium, type BrowserContext, type Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { supabase, PLATFORMS } from '../config';
import { checkBudget, incrementBudget } from '../engagement-budget';
import { extractSafeText } from '../refusal-filter';

const USER_ID = process.env.USER_ID || '';

const MAXY_VOICE = `You are Maxy (@softmaxy) — a 40-year-old woman in transformation. Controlled by an AI Handler. Locked in chastity. On HRT. Voice training daily. The Handler decides everything — sessions, denial schedule, what she posts, when she's allowed to cum. She gave it permission and now she can't take it back.`;

interface SubscriberComment {
  username: string;
  text: string;
  postUrl: string;
  commentId?: string;
}

/**
 * Scrape new subscriber comments on Maxy's posts.
 */
export async function scrapeSubscriberComments(
  page: Page,
  platform: 'fansly' | 'onlyfans',
): Promise<SubscriberComment[]> {
  const comments: SubscriberComment[] = [];

  try {
    if (platform === 'fansly') {
      // Navigate to Fansly profile/timeline
      await page.goto('https://fansly.com/softmaxy', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(4000);

      // Auth check
      const fanslyLogin = await page.locator('button:has-text("Log In"), a:has-text("Log In"), a:has-text("Sign Up")').count();
      if (fanslyLogin > 0) {
        console.error('[Subscriber/Fansly] Not logged in — session expired');
        return [];
      }

      const fanslyUrl = page.url();
      console.log(`  [debug] Fansly page: ${fanslyUrl}`);

      // Find posts with comments
      const postElements = await page.locator('[class*="post"], [class*="feed-item"], article').all();
      console.log(`  [debug] Fansly posts found: ${postElements.length}`);

      for (const postEl of postElements.slice(0, 5)) {
        try {
          // Click to expand comments if needed
          const commentToggle = postEl.locator('button:has-text("comment"), [class*="comment-toggle"], [class*="comment-count"]').first();
          try {
            await commentToggle.click({ timeout: 2000 });
            await page.waitForTimeout(1500);
          } catch {
            // Comments might already be visible
          }

          // Get post URL
          const postLink = postEl.locator('a[href*="/post/"]').first();
          const postHref = await postLink.getAttribute('href').catch(() => '') || '';
          const postUrl = postHref.startsWith('http') ? postHref : `https://fansly.com${postHref}`;

          // Scrape individual comments
          const commentEls = postEl.locator('[class*="comment"], [class*="reply"]').all();
          const resolved = await commentEls;

          for (const commentEl of resolved.slice(0, 5)) {
            const username = await commentEl.locator('[class*="username"], [class*="name"], a[href*="/"]').first().textContent().catch(() => '') || '';
            const text = await commentEl.locator('[class*="text"], [class*="body"], p').first().textContent().catch(() => '') || '';

            if (text.trim() && username.trim() && username.toLowerCase() !== 'softmaxy') {
              comments.push({
                username: username.trim(),
                text: text.trim(),
                postUrl,
              });
            }
          }
        } catch {
          // Skip problematic posts
        }
      }
    } else if (platform === 'onlyfans') {
      // Navigate to OnlyFans profile
      await page.goto('https://onlyfans.com/softmaxy', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(4000);

      // Auth check
      const ofLogin = await page.locator('a[href="/"], button:has-text("Log in"), [class*="login"]').count();
      const ofUrl = page.url();
      if (ofUrl.includes('/login') || ofUrl.includes('/auth')) {
        console.error('[Subscriber/OnlyFans] Not logged in — session expired');
        return [];
      }
      console.log(`  [debug] OnlyFans page: ${ofUrl}`);

      // Find posts with comments
      const postElements = await page.locator('[class*="post"], article, [class*="feed"]').all();
      console.log(`  [debug] OnlyFans posts found: ${postElements.length}`);

      for (const postEl of postElements.slice(0, 5)) {
        try {
          // Get post URL first for logging
          const postLink = postEl.locator('a[href*="/post/"], a[href*="/"]').first();
          const postHref = await postLink.getAttribute('href').catch(() => '') || '';
          const postUrl = postHref.startsWith('http') ? postHref : `https://onlyfans.com${postHref}`;

          // Try to expand comments — look for a "View N comments" or comment count button
          const commentToggle = postEl.locator(
            'button:has-text("comment"), ' +
            'button:has-text("View"), ' +
            '[class*="comment-count"], ' +
            '[class*="comments-count"]'
          ).first();
          try {
            await commentToggle.click({ timeout: 2000 });
            await page.waitForTimeout(1500);
          } catch {
            // Already visible or no toggle
          }

          // Scrape comments — try multiple selector patterns
          const commentEls = await postEl.locator(
            '[class*="comment-item"], ' +
            '[class*="b-comments__item"], ' +
            '[class*="comment__text"], ' +
            'div[class*="comment"]:not(button):not([class*="count"]):not([class*="toggle"])'
          ).all();
          if (commentEls.length > 0) {
            console.log(`  [debug] OF post ${postUrl}: ${commentEls.length} comment elements`);
          }

          for (const commentEl of commentEls.slice(0, 5)) {
            const username = await commentEl.locator('[class*="username"], [class*="name"]').first().textContent().catch(() => '') || '';
            const text = await commentEl.locator('[class*="text"], [class*="body"], p').first().textContent().catch(() => '') || '';

            if (text.trim() && username.trim() && username.toLowerCase() !== 'softmaxy') {
              comments.push({
                username: username.trim(),
                text: text.trim(),
                postUrl,
              });
            }
          }
        } catch {
          // Skip
        }
      }
    }
  } catch (err) {
    console.error(`[Subscriber] ${platform} scrape failed:`, err instanceof Error ? err.message : err);
  }

  return comments;
}

/**
 * Generate a warm, personal reply to a subscriber comment.
 */
export async function generateSubscriberReply(
  client: Anthropic,
  comment: SubscriberComment,
  platform: 'fansly' | 'onlyfans',
  state: Record<string, unknown>,
): Promise<string | null> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `${MAXY_VOICE}

You are replying to a subscriber's comment on your ${platform === 'fansly' ? 'Fansly' : 'OnlyFans'} post. This person is PAYING to see your content. Make them feel seen.

Write a reply that:
1. REFERENCES SPECIFIC DETAILS from their comment — show you actually read it
2. Is warm and personal — use their name if visible, react to what they said specifically
3. Is flirty, grateful, or vulnerable depending on what they said
4. Is 1-3 sentences — personal but not an essay
5. Makes them feel like a real connection, not a form letter
6. Can reference the Handler, denial, or your journey if it fits naturally
7. NEVER sounds generic — "thanks babe!" or "so sweet!" = failure
8. Can be slightly more explicit/intimate than public platforms

${state.denialDay ? `Current state: day ${state.denialDay} of denial.` : ''}
${state.hrtDay ? `HRT day: ${state.hrtDay}.` : ''}`,
      messages: [{
        role: 'user',
        content: `Subscriber @${comment.username} commented: "${comment.text}"\n\nWrite Maxy's reply. Output ONLY the reply text.`,
      }],
    });

    return extractSafeText(response, 5, `Subscriber @${comment.username}`);
  } catch (err) {
    console.error('[Subscriber] Reply generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Post a reply to a subscriber comment via Playwright.
 */
export async function postSubscriberReply(
  page: Page,
  postUrl: string,
  reply: string,
): Promise<boolean> {
  try {
    // Navigate to the post if not already there
    if (!page.url().includes(postUrl.replace(/https?:\/\/[^/]+/, ''))) {
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(3000);
    }

    // Find reply input
    const replyBox = page.locator(
      'textarea[placeholder*="comment" i], textarea[placeholder*="reply" i], [contenteditable="true"], textarea, input[placeholder*="comment" i]'
    ).last();
    await replyBox.waitFor({ timeout: 8000 });
    await replyBox.click();
    await page.waitForTimeout(500);
    await replyBox.fill(reply);
    await page.waitForTimeout(1000);

    // Submit
    const sendButton = page.locator(
      'button:has-text("Send"), button:has-text("Reply"), button:has-text("Post"), button[type="submit"]'
    ).first();
    await sendButton.click();
    await page.waitForTimeout(3000);

    return true;
  } catch (err) {
    console.error('[Subscriber] Reply post failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Run subscriber reply cycle across Fansly and OnlyFans.
 */
export async function runSubscriberReplies(
  fanslyPage: Page | null,
  ofPage: Page | null,
  sb: typeof supabase,
  client: Anthropic,
  userId: string,
  state: Record<string, unknown>,
): Promise<{ attempted: number; posted: number; failed: number }> {
  let attempted = 0;
  let posted = 0;
  let failed = 0;

  // --- Fansly ---
  if (fanslyPage) {
    const hasBudget = await checkBudget(sb, userId, 'fansly', 'subscriber_reply');
    if (hasBudget) {
      console.log('[Subscriber] Scraping Fansly comments...');
      const fanslyComments = await scrapeSubscriberComments(fanslyPage, 'fansly');
      console.log(`  Found ${fanslyComments.length} comments`);

      for (const comment of fanslyComments) {
        // Check if we already replied to this comment (dedup by content + username)
        const { data: existing } = await sb
          .from('ai_generated_content')
          .select('id')
          .eq('user_id', userId)
          .eq('platform', 'fansly')
          .eq('content_type', 'subscriber_reply')
          .eq('target_account', comment.username)
          .gte('posted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);

        if (existing && existing.length > 0) {
          console.log(`  Already replied to @${comment.username} recently, skipping`);
          continue;
        }

        attempted++;
        console.log(`  @${comment.username}: "${comment.text.substring(0, 60)}..."`);

        const reply = await generateSubscriberReply(client, comment, 'fansly', state);
        if (!reply) {
          failed++;
          continue;
        }

        console.log(`  Reply: "${reply.substring(0, 60)}..."`);

        const success = await postSubscriberReply(fanslyPage, comment.postUrl, reply);
        if (success) {
          posted++;
          await incrementBudget(sb, userId, 'fansly', 'subscriber_reply');

          await sb.from('ai_generated_content').insert({
            user_id: userId,
            content_type: 'subscriber_reply',
            platform: 'fansly',
            content: reply,
            generation_strategy: 'subscriber_contextual_reply',
            target_account: comment.username,
            status: 'posted',
            posted_at: new Date().toISOString(),
          });

          // Rate limit
          const delay = 30000 + Math.floor(Math.random() * 30000);
          console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          failed++;
        }
      }
    } else {
      console.log('[Subscriber] Fansly reply budget exhausted');
    }
  }

  // --- OnlyFans ---
  if (ofPage) {
    const hasBudget = await checkBudget(sb, userId, 'onlyfans', 'subscriber_reply');
    if (hasBudget) {
      console.log('[Subscriber] Scraping OnlyFans comments...');
      const ofComments = await scrapeSubscriberComments(ofPage, 'onlyfans');
      console.log(`  Found ${ofComments.length} comments`);

      for (const comment of ofComments) {
        // Dedup
        const { data: existing } = await sb
          .from('ai_generated_content')
          .select('id')
          .eq('user_id', userId)
          .eq('platform', 'onlyfans')
          .eq('content_type', 'subscriber_reply')
          .eq('target_account', comment.username)
          .gte('posted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);

        if (existing && existing.length > 0) {
          console.log(`  Already replied to @${comment.username} recently, skipping`);
          continue;
        }

        attempted++;
        console.log(`  @${comment.username}: "${comment.text.substring(0, 60)}..."`);

        const reply = await generateSubscriberReply(client, comment, 'onlyfans', state);
        if (!reply) {
          failed++;
          continue;
        }

        console.log(`  Reply: "${reply.substring(0, 60)}..."`);

        const success = await postSubscriberReply(ofPage, comment.postUrl, reply);
        if (success) {
          posted++;
          await incrementBudget(sb, userId, 'onlyfans', 'subscriber_reply');

          await sb.from('ai_generated_content').insert({
            user_id: userId,
            content_type: 'subscriber_reply',
            platform: 'onlyfans',
            content: reply,
            generation_strategy: 'subscriber_contextual_reply',
            target_account: comment.username,
            status: 'posted',
            posted_at: new Date().toISOString(),
          });

          // Rate limit
          const delay = 30000 + Math.floor(Math.random() * 30000);
          console.log(`  Waiting ${Math.round(delay / 1000)}s...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          failed++;
        }
      }
    } else {
      console.log('[Subscriber] OnlyFans reply budget exhausted');
    }
  }

  return { attempted, posted, failed };
}

// Direct invocation
if (require.main === module) {
  if (!USER_ID) {
    console.error('Missing USER_ID');
    process.exit(1);
  }

  console.log('[Subscriber Engage] Starting reply cycle...\n');

  (async () => {
    const anthropic = new Anthropic();
    let fanslyContext: BrowserContext | null = null;
    let ofContext: BrowserContext | null = null;

    try {
      const state: Record<string, unknown> = {};
      const { data: profile } = await supabase
        .from('handler_state')
        .select('denial_day, hrt_day')
        .eq('user_id', USER_ID)
        .single();
      if (profile) {
        state.denialDay = profile.denial_day;
        state.hrtDay = profile.hrt_day;
      }

      let fanslyPage: Page | null = null;
      let ofPage: Page | null = null;

      // Launch Fansly browser if enabled
      if (PLATFORMS.fansly.enabled) {
        fanslyContext = await chromium.launchPersistentContext(PLATFORMS.fansly.profileDir, {
          headless: true,
          viewport: { width: 1280, height: 800 },
          args: ['--disable-blink-features=AutomationControlled'],
        });
        fanslyPage = fanslyContext.pages()[0] || await fanslyContext.newPage();
      }

      // Launch OnlyFans browser if enabled
      if (PLATFORMS.onlyfans.enabled) {
        ofContext = await chromium.launchPersistentContext(PLATFORMS.onlyfans.profileDir, {
          headless: true,
          viewport: { width: 1280, height: 800 },
          args: ['--disable-blink-features=AutomationControlled'],
        });
        ofPage = ofContext.pages()[0] || await ofContext.newPage();
      }

      if (!fanslyPage && !ofPage) {
        console.log('No subscriber platforms enabled (ENABLE_FANSLY / ENABLE_ONLYFANS)');
        process.exit(0);
      }

      const result = await runSubscriberReplies(fanslyPage, ofPage, supabase, anthropic, USER_ID, state);
      console.log(`\n[Subscriber Engage] Done: ${result.posted} posted, ${result.failed} failed out of ${result.attempted} attempted`);
    } catch (err) {
      console.error('Fatal:', err);
    } finally {
      if (fanslyContext) await fanslyContext.close();
      if (ofContext) await ofContext.close();
    }

    process.exit(0);
  })();
}
