/**
 * Follow Manager — shared primitives for Twitter follow/unfollow operations.
 *
 * Receives a Playwright Page — does NOT manage browser contexts.
 * All DB operations go through the shared supabase client from config.ts.
 *
 * Exports:
 *   followUser()      — follow a user, record in DB
 *   unfollowUser()    — unfollow a user, update DB
 *   isAlreadyTracked() — check if handle has active follow record
 *   isBotOrSpam()     — heuristic bot/spam detection from profile page
 */

import { type Page } from 'playwright';
import { supabase } from './config';

const USER_ID = process.env.USER_ID || '';

// ── Types ────────────────────────────────────────────────────────────

export interface FollowResult {
  success: boolean;
  alreadyFollowing: boolean;
  error?: string;
}

export interface UnfollowResult {
  success: boolean;
  error?: string;
}

export interface BotCheckResult {
  isBot: boolean;
  reasons: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs));
  return new Promise(r => setTimeout(r, ms));
}

/** Navigate to a Twitter profile and wait for it to load. */
async function goToProfile(page: Page, handle: string): Promise<boolean> {
  try {
    await page.goto(`https://x.com/${handle}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForTimeout(2500 + Math.floor(Math.random() * 1500));

    // Check for "This account doesn't exist" or suspended page
    const bodyText = await page.locator('body').textContent().catch(() => '') || '';
    if (
      bodyText.includes("This account doesn't exist") ||
      bodyText.includes('Account suspended') ||
      bodyText.includes('Something went wrong')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Extract a number from text like "1,234 Following" or "12K Followers" */
function parseCountText(text: string): number {
  if (!text) return 0;
  const cleaned = text.replace(/,/g, '').trim().toLowerCase();
  const match = cleaned.match(/([\d.]+)\s*(k|m)?/);
  if (!match) return 0;
  let num = parseFloat(match[1]);
  if (match[2] === 'k') num *= 1000;
  if (match[2] === 'm') num *= 1000000;
  return Math.round(num);
}

// ── followUser ───────────────────────────────────────────────────────

export async function followUser(
  page: Page,
  handle: string,
  userId: string,
  source: string,
  sourceDetail?: string,
): Promise<FollowResult> {
  const cleanHandle = handle.replace(/^@/, '').trim();

  try {
    // Check DB first — avoid re-following
    const { data: existing } = await supabase
      .from('twitter_follows')
      .select('id, status')
      .eq('user_id', userId)
      .eq('target_handle', cleanHandle.toLowerCase())
      .in('status', ['followed', 'followed_back'])
      .maybeSingle();

    if (existing) {
      return { success: true, alreadyFollowing: true };
    }

    // Navigate to profile
    const loaded = await goToProfile(page, cleanHandle);
    if (!loaded) {
      return { success: false, alreadyFollowing: false, error: `Profile not found: ${cleanHandle}` };
    }

    // Check if already following (button says "Following" instead of "Follow")
    const followingButton = page.locator('[data-testid$="-unfollow"]').first();
    const alreadyFollowing = await followingButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (alreadyFollowing) {
      // Record in DB if not already tracked
      await supabase.from('twitter_follows').upsert(
        {
          user_id: userId,
          target_handle: cleanHandle.toLowerCase(),
          source,
          source_detail: sourceDetail || null,
          status: 'followed',
          followed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,target_handle' },
      );
      return { success: true, alreadyFollowing: true };
    }

    // Scrape follower count and bio before following
    let followerCount: number | null = null;
    let bioSnippet: string | null = null;

    try {
      // Follower count — try textContent first, then aria-label, then inner spans
      const followersLink = page.locator('a[href$="/verified_followers"], a[href$="/followers"]').first();
      const followersText = await followersLink.textContent({ timeout: 3000 }).catch(() => '');
      if (followersText) followerCount = parseCountText(followersText);

      if (!followerCount) {
        const ariaLabel = await followersLink.getAttribute('aria-label', { timeout: 2000 }).catch(() => '');
        if (ariaLabel) followerCount = parseCountText(ariaLabel);
      }

      if (!followerCount) {
        const spanText = await followersLink.locator('span').first()
          .textContent({ timeout: 2000 }).catch(() => '');
        if (spanText) followerCount = parseCountText(spanText);
      }
    } catch { /* non-critical */ }

    try {
      const bioEl = page.locator('[data-testid="UserDescription"]').first();
      bioSnippet = await bioEl.textContent({ timeout: 3000 }).catch(() => null);
      if (bioSnippet && bioSnippet.length > 200) {
        bioSnippet = bioSnippet.substring(0, 200);
      }
    } catch { /* non-critical */ }

    // Click the Follow button
    const followButton = page.locator('[data-testid$="-follow"]').first();
    const followVisible = await followButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (!followVisible) {
      return { success: false, alreadyFollowing: false, error: 'Follow button not found' };
    }

    await followButton.click({ timeout: 5000 });
    await page.waitForTimeout(1500);

    // Verify the follow took — button should now say "Following"
    const nowFollowing = await page.locator('[data-testid$="-unfollow"]').first()
      .isVisible({ timeout: 5000 }).catch(() => false);

    if (!nowFollowing) {
      // Might have hit a rate limit or confirmation dialog
      // Check for rate limit toast
      const toastText = await page.locator('[data-testid="toast"]').textContent({ timeout: 2000 }).catch(() => '');
      if (toastText && toastText.toLowerCase().includes('limit')) {
        return { success: false, alreadyFollowing: false, error: 'Rate limited' };
      }
      return { success: false, alreadyFollowing: false, error: 'Follow click did not register' };
    }

    // Record in DB
    await supabase.from('twitter_follows').upsert(
      {
        user_id: userId,
        target_handle: cleanHandle.toLowerCase(),
        source,
        source_detail: sourceDetail || null,
        status: 'followed',
        followed_at: new Date().toISOString(),
        follower_count: followerCount,
        bio_snippet: bioSnippet,
      },
      { onConflict: 'user_id,target_handle' },
    );

    // Human-paced delay before returning
    await randomDelay(15000, 30000);

    console.log(`[FollowMgr] Followed @${cleanHandle} (source: ${source})`);
    return { success: true, alreadyFollowing: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FollowMgr] followUser @${cleanHandle} failed:`, msg);
    return { success: false, alreadyFollowing: false, error: msg };
  }
}

// ── unfollowUser ─────────────────────────────────────────────────────

export async function unfollowUser(
  page: Page,
  handle: string,
  userId: string,
): Promise<UnfollowResult> {
  const cleanHandle = handle.replace(/^@/, '').trim();

  try {
    const loaded = await goToProfile(page, cleanHandle);
    if (!loaded) {
      return { success: false, error: `Profile not found: ${cleanHandle}` };
    }

    // Check if we're actually following
    const followingButton = page.locator('[data-testid$="-unfollow"]').first();
    const isFollowing = await followingButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (!isFollowing) {
      // Not following — update DB anyway to keep state consistent
      await supabase
        .from('twitter_follows')
        .update({ status: 'unfollowed_stale', unfollowed_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('target_handle', cleanHandle.toLowerCase())
        .in('status', ['followed', 'followed_back']);

      return { success: true }; // Already not following, DB updated
    }

    // Click "Following" button — this triggers a confirmation dialog
    await followingButton.click({ timeout: 5000 });
    await page.waitForTimeout(1000);

    // Confirm unfollow in the dialog
    const confirmButton = page.locator('[data-testid="confirmationSheetConfirm"]').first();
    const confirmVisible = await confirmButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (confirmVisible) {
      await confirmButton.click({ timeout: 5000 });
      await page.waitForTimeout(1500);
    } else {
      // Some accounts unfollow without confirmation — check if already unfollowed
      const stillFollowing = await page.locator('[data-testid$="-unfollow"]').first()
        .isVisible({ timeout: 2000 }).catch(() => false);
      if (stillFollowing) {
        return { success: false, error: 'Unfollow confirmation dialog not found' };
      }
    }

    // Verify unfollowed
    const stillFollowingAfter = await page.locator('[data-testid$="-unfollow"]').first()
      .isVisible({ timeout: 3000 }).catch(() => false);

    if (stillFollowingAfter) {
      return { success: false, error: 'Unfollow did not register' };
    }

    // Update DB
    await supabase
      .from('twitter_follows')
      .update({ status: 'unfollowed_stale', unfollowed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('target_handle', cleanHandle.toLowerCase())
      .in('status', ['followed', 'followed_back']);

    // Human-paced delay
    await randomDelay(15000, 30000);

    console.log(`[FollowMgr] Unfollowed @${cleanHandle}`);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FollowMgr] unfollowUser @${cleanHandle} failed:`, msg);
    return { success: false, error: msg };
  }
}

// ── isAlreadyTracked ─────────────────────────────────────────────────

export async function isAlreadyTracked(
  handle: string,
  userId: string,
): Promise<boolean> {
  const cleanHandle = handle.replace(/^@/, '').trim().toLowerCase();

  const { data } = await supabase
    .from('twitter_follows')
    .select('id')
    .eq('user_id', userId)
    .eq('target_handle', cleanHandle)
    .in('status', ['followed', 'followed_back'])
    .maybeSingle();

  return !!data;
}

// ── isBotOrSpam ──────────────────────────────────────────────────────

const SPAM_HANDLE_PATTERN = /\d{6,}/; // 6+ consecutive digits in handle
const SPAM_BIO_KEYWORDS = [
  /\bcrypto\b/i,
  /\bforex\b/i,
  /\bnft\b/i,
  /\bgiveaway\b/i,
  /\bairdrop\b/i,
  /\bweb3\b/i,
  /\btoken\b/i,
  /\bdefi\b/i,
  /\bearn\s*\$/i,
  /\bmake money\b/i,
  /\bpassive income\b/i,
  /\bfollow.{0,10}back\b/i,
  /\bf4f\b/i,
  /\bfollow train\b/i,
  /\b(dm|message)\s*(me|for)\s*(promo|shoutout|collab)\b/i,
];

export async function isBotOrSpam(
  page: Page,
  handle: string,
): Promise<BotCheckResult> {
  const cleanHandle = handle.replace(/^@/, '').trim();
  const reasons: string[] = [];

  try {
    const loaded = await goToProfile(page, cleanHandle);
    if (!loaded) {
      return { isBot: false, reasons: ['profile_not_found'] };
    }

    // 1. Handle pattern check (no navigation needed)
    if (SPAM_HANDLE_PATTERN.test(cleanHandle)) {
      reasons.push(`handle has long digit sequence: @${cleanHandle}`);
    }

    // 2. Default avatar check
    try {
      const avatarImg = page.locator('[data-testid="UserAvatar"] img').first();
      const src = await avatarImg.getAttribute('src', { timeout: 3000 }).catch(() => '');
      if (src && (src.includes('default_profile') || src.includes('abs.twimg.com/sticky/default_profile'))) {
        reasons.push('default avatar');
      }
    } catch { /* non-critical */ }

    // 3. Bio check
    try {
      const bioEl = page.locator('[data-testid="UserDescription"]').first();
      const bioText = await bioEl.textContent({ timeout: 3000 }).catch(() => '') || '';

      for (const pattern of SPAM_BIO_KEYWORDS) {
        if (pattern.test(bioText)) {
          reasons.push(`bio contains spam keyword: ${pattern.source}`);
          break; // One spam keyword is enough
        }
      }
    } catch { /* non-critical */ }

    // 4. Tweet count check (< 5 tweets)
    try {
      // The tweet count is shown in the header area, e.g. "123 posts"
      const headerText = await page.locator('[data-testid="UserName"]')
        .locator('xpath=ancestor::div[contains(@class, "r-")]')
        .first()
        .textContent({ timeout: 3000 }).catch(() => '');

      // Try a more reliable approach — look for the posts count near the top
      const postsText = await page.locator('h2[role="heading"]').first()
        .locator('xpath=following-sibling::*').first()
        .textContent({ timeout: 2000 }).catch(() => headerText || '');

      // Fall back to scanning for "N posts" pattern in the upper section
      const upperSection = await page.locator('[data-testid="primaryColumn"] > div > div').first()
        .textContent({ timeout: 3000 }).catch(() => '');

      const postsMatch = (upperSection || '').match(/([\d,]+)\s*posts?/i);
      if (postsMatch) {
        const postCount = parseInt(postsMatch[1].replace(/,/g, ''), 10);
        if (postCount < 5) {
          reasons.push(`very few tweets: ${postCount}`);
        }
      }
    } catch { /* non-critical — don't fail bot check on selector issues */ }

    // 5. Following/follower ratio check (following > 10x followers)
    try {
      let followingCount = 0;
      let followerCount = 0;

      const followingLink = page.locator('a[href$="/following"]').first();
      const followingText = await followingLink.textContent({ timeout: 3000 }).catch(() => '');
      if (followingText) {
        followingCount = parseCountText(followingText);
      }

      const followersLink = page.locator('a[href$="/verified_followers"], a[href$="/followers"]').first();
      const followersText = await followersLink.textContent({ timeout: 3000 }).catch(() => '');
      if (followersText) {
        followerCount = parseCountText(followersText);
      }

      if (followerCount > 0 && followingCount / followerCount > 10) {
        reasons.push(`suspicious ratio: ${followingCount} following / ${followerCount} followers`);
      } else if (followerCount === 0 && followingCount > 50) {
        reasons.push(`zero followers but following ${followingCount}`);
      }
    } catch { /* non-critical */ }

    return {
      isBot: reasons.length >= 2, // Need at least 2 signals to flag as bot
      reasons,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[FollowMgr] isBotOrSpam @${cleanHandle} failed:`, msg);
    return { isBot: false, reasons: [`check_error: ${msg}`] };
  }
}
