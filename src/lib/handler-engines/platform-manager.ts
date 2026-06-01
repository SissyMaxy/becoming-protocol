/**
 * Platform Manager - Handler Autonomous System
 *
 * Manages all platform integrations, posting, engagement, and analytics
 * for the Handler's content distribution system. Handles scheduling,
 * execution, error recovery, and analytics syncing across platforms.
 *
 * Supported platforms: OnlyFans, Fansly, Reddit, Twitter/X, Patreon
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface PlatformAccount {
  id: string;
  userId: string;
  platform: string;
  accountType: string;
  username: string | null;
  displayName: string | null;
  postingSchedule: {
    optimalTimes?: string[];
    frequencyPerDay?: number;
    bestDays?: string[];
  };
  contentStrategy: {
    contentTypes?: string[];
    vulnerabilityRange?: [number, number];
    themes?: string[];
  };
  analytics: Record<string, unknown>;
  revenueTotal: number;
  subscriberCount: number;
  engagementRate: number;
  enabled: boolean;
  isReleasePlatform: boolean;
  releaseConfig: {
    subreddits?: string[];
    maxVulnerabilityTier?: number;
  };
  lastPostedAt: string | null;
  lastSyncedAt: string | null;
}

export interface ScheduledPost {
  id: string;
  userId: string;
  platformAccountId: string;
  contentId: string;
  postType: string;
  caption: string | null;
  hashtags: string[];
  metadata: Record<string, unknown>;
  scheduledFor: string;
  price: number | null;
  status: string;
  retryCount: number;
  postedAt: string | null;
  postUrl: string | null;
  postExternalId: string | null;
  engagementData: Record<string, unknown>;
  revenueGenerated: number;
  isConsequenceRelease: boolean;
}

export interface PostResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

// ============================================
// PLATFORM CONFIGURATIONS
// ============================================

export const PLATFORM_CONFIGS: Record<string, {
  apiEndpoint: string;
  authMethod: string;
  capabilities: string[];
  rateLimits: {
    postsPerDay?: number;
    messagesPerHour?: number;
    postsPerMinute?: number;
  };
}> = {
  onlyfans: {
    apiEndpoint: 'https://app.onlyfansapi.com',
    authMethod: 'api_key',
    capabilities: ['post', 'ppv', 'message', 'story', 'analytics', 'subscribers'],
    rateLimits: { postsPerDay: 50, messagesPerHour: 100 },
  },
  fansly: {
    apiEndpoint: 'https://apiv3.fansly.com',
    authMethod: 'api_key',
    capabilities: ['post', 'ppv', 'message', 'analytics', 'subscribers'],
    rateLimits: { postsPerDay: 50, messagesPerHour: 100 },
  },
  reddit: {
    apiEndpoint: 'https://oauth.reddit.com',
    authMethod: 'oauth',
    capabilities: ['post', 'comment', 'analytics'],
    rateLimits: { postsPerMinute: 1 },
  },
  twitter: {
    apiEndpoint: 'https://api.twitter.com/2',
    authMethod: 'oauth',
    capabilities: ['post', 'reply', 'dm', 'analytics'],
    rateLimits: { postsPerDay: 100 },
  },
  patreon: {
    apiEndpoint: 'https://www.patreon.com/api/oauth2/v2',
    authMethod: 'oauth',
    capabilities: ['post', 'message', 'analytics', 'subscribers'],
    rateLimits: { postsPerDay: 20 },
  },
};

/** Maximum number of retries before marking a post as permanently failed */
const MAX_RETRY_COUNT = 3;

/** Delay in minutes between retry attempts, indexed by retry count (0-based) */
const RETRY_DELAYS_MINUTES = [5, 15, 60];

// ============================================
// HELPER: DB ROW <-> CAMELCASE MAPPING
// ============================================

function mapAccountFromDb(row: Record<string, unknown>): PlatformAccount {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    platform: row.platform as string,
    accountType: row.account_type as string,
    username: (row.username as string) ?? null,
    displayName: (row.display_name as string) ?? null,
    postingSchedule: (row.posting_schedule as PlatformAccount['postingSchedule']) ?? {},
    contentStrategy: (row.content_strategy as PlatformAccount['contentStrategy']) ?? {},
    analytics: (row.analytics as Record<string, unknown>) ?? {},
    revenueTotal: (row.revenue_total as number) ?? 0,
    subscriberCount: (row.subscriber_count as number) ?? 0,
    engagementRate: (row.engagement_rate as number) ?? 0,
    enabled: (row.enabled as boolean) ?? false,
    isReleasePlatform: (row.is_release_platform as boolean) ?? false,
    releaseConfig: (row.release_config as PlatformAccount['releaseConfig']) ?? {},
    lastPostedAt: (row.last_posted_at as string) ?? null,
    lastSyncedAt: (row.last_synced_at as string) ?? null,
  };
}

function mapPostFromDb(row: Record<string, unknown>): ScheduledPost {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    platformAccountId: row.platform_account_id as string,
    contentId: row.content_id as string,
    postType: row.post_type as string,
    caption: (row.caption as string) ?? null,
    hashtags: (row.hashtags as string[]) ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    scheduledFor: row.scheduled_for as string,
    price: (row.price as number) ?? null,
    status: row.status as string,
    retryCount: (row.retry_count as number) ?? 0,
    postedAt: (row.posted_at as string) ?? null,
    postUrl: (row.post_url as string) ?? null,
    postExternalId: (row.post_external_id as string) ?? null,
    engagementData: (row.engagement_data as Record<string, unknown>) ?? {},
    revenueGenerated: (row.revenue_generated as number) ?? 0,
    isConsequenceRelease: (row.is_consequence_release as boolean) ?? false,
  };
}

// ============================================
// ACCOUNT RETRIEVAL
// ============================================

/**
 * Get all platform accounts for a user.
 */
export async function getAccounts(userId: string): Promise<PlatformAccount[]> {
  const { data, error } = await supabase
    .from('platform_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('platform', { ascending: true });

  if (error) {
    console.error('[PlatformManager] Error fetching accounts:', error);
    return [];
  }

  return (data ?? []).map(mapAccountFromDb);
}

/**
 * Get a single platform account by ID.
 */
export async function getAccount(accountId: string): Promise<PlatformAccount | null> {
  const { data, error } = await supabase
    .from('platform_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[PlatformManager] Error fetching account:', error);
    }
    return null;
  }

  return data ? mapAccountFromDb(data) : null;
}

/**
 * Get platforms configured as release (consequence) destinations.
 * These are accounts flagged with is_release_platform = true.
 */
export async function getReleasePlatforms(userId: string): Promise<PlatformAccount[]> {
  const { data, error } = await supabase
    .from('platform_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_release_platform', true)
    .eq('enabled', true);

  if (error) {
    console.error('[PlatformManager] Error fetching release platforms:', error);
    return [];
  }

  return (data ?? []).map(mapAccountFromDb);
}

// ============================================
// SCHEDULED POST MANAGEMENT
// ============================================

/**
 * Create a new scheduled post and return its generated ID.
 */
export async function createScheduledPost(
  post: Omit<
    ScheduledPost,
    'id' | 'status' | 'retryCount' | 'postedAt' | 'postUrl' | 'postExternalId' | 'engagementData' | 'revenueGenerated'
  >
): Promise<string> {
  const id = crypto.randomUUID();

  const { error } = await supabase
    .from('scheduled_posts')
    .insert({
      id,
      user_id: post.userId,
      platform_account_id: post.platformAccountId,
      content_id: post.contentId,
      post_type: post.postType,
      caption: post.caption,
      hashtags: post.hashtags,
      metadata: post.metadata,
      scheduled_for: post.scheduledFor,
      price: post.price,
      status: 'scheduled',
      retry_count: 0,
      posted_at: null,
      post_url: null,
      post_external_id: null,
      engagement_data: {},
      revenue_generated: 0,
      is_consequence_release: post.isConsequenceRelease,
    });

  if (error) {
    console.error('[PlatformManager] Error creating scheduled post:', error);
    throw new Error(`Failed to create scheduled post: ${error.message}`);
  }

  return id;
}

/**
 * Get all posts that are due for posting (scheduled_for <= now AND status = 'scheduled').
 */
export async function getDuePosts(): Promise<ScheduledPost[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true });

  if (error) {
    console.error('[PlatformManager] Error fetching due posts:', error);
    return [];
  }

  return (data ?? []).map(mapPostFromDb);
}

// ============================================
// POST EXECUTION
// ============================================

/**
 * Execute all due scheduled posts for a given user.
 * Returns counts of successfully posted and failed posts.
 */
export async function executeScheduledPosts(
  userId: string
): Promise<{ posted: number; failed: number }> {
  const allDue = await getDuePosts();
  const userDue = allDue.filter(p => p.userId === userId);

  let posted = 0;
  let failed = 0;

  for (const post of userDue) {
    const result = await postToPlatform(post);

    if (result.success) {
      // Update the post record with success data
      await supabase
        .from('scheduled_posts')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          post_url: result.postUrl ?? null,
          post_external_id: result.postId ?? null,
        })
        .eq('id', post.id);

      // Update the platform account's last posted timestamp
      await supabase
        .from('platform_accounts')
        .update({ last_posted_at: new Date().toISOString() })
        .eq('id', post.platformAccountId);

      posted++;
    } else {
      await handlePostingError(post.id, result.error ?? 'Unknown error');
      failed++;
    }
  }

  return { posted, failed };
}

/**
 * Post content to a specific platform.
 *
 * Since actual API calls require credentials we do not have access to here,
 * this function operates as a framework:
 *
 * 1. Retrieves the associated platform account.
 * 2. Checks for stored credentials on the account.
 * 3. If credentials are absent, logs the action as a handler_decision
 *    (decision_type = 'posting') and marks the post as simulated/posted.
 * 4. If credentials exist, logs that the platform API would be called
 *    (placeholder for future real integration).
 * 5. Always captures the result back onto the scheduled_posts record.
 */
export async function postToPlatform(post: ScheduledPost): Promise<PostResult> {
  // Step 1: Retrieve the associated platform account
  const account = await getAccount(post.platformAccountId);

  if (!account) {
    return {
      success: false,
      error: `Platform account ${post.platformAccountId} not found`,
    };
  }

  // Verify the platform is configured
  const platformConfig = PLATFORM_CONFIGS[account.platform];
  if (!platformConfig) {
    return {
      success: false,
      error: `Unsupported platform: ${account.platform}`,
    };
  }

  // Verify the account is enabled
  if (!account.enabled) {
    return {
      success: false,
      error: `Platform account ${account.platform}/${account.username} is disabled`,
    };
  }

  // Step 2: Check for stored credentials
  const hasCredentials = account.analytics && 'credentials' in account.analytics;

  // Step 3 & 4: Execute or simulate
  const now = new Date().toISOString();
  const simulatedPostId = `sim_${crypto.randomUUID().slice(0, 8)}`;

  if (!hasCredentials) {
    // No credentials available -- simulate the post and log as handler decision
    console.log(
      `[PlatformManager] Simulated post to ${account.platform} (${account.username ?? 'unknown'}):`,
      `type=${post.postType}, content=${post.contentId}, consequence=${post.isConsequenceRelease}`
    );

    // Log the simulated posting action as a handler_decision
    await supabase.from('handler_decisions').insert({
      id: crypto.randomUUID(),
      user_id: post.userId,
      decision_type: 'posting',
      decision_data: {
        platform: account.platform,
        username: account.username,
        postType: post.postType,
        contentId: post.contentId,
        caption: post.caption,
        hashtags: post.hashtags,
        price: post.price,
        isConsequenceRelease: post.isConsequenceRelease,
        simulatedPostId,
        scheduledFor: post.scheduledFor,
      },
      outcome: 'simulated',
      created_at: now,
    });

    // Step 5: Update the scheduled post record
    await supabase
      .from('scheduled_posts')
      .update({
        status: 'posted',
        posted_at: now,
        post_external_id: simulatedPostId,
        post_url: null,
      })
      .eq('id', post.id);

    return {
      success: true,
      postId: simulatedPostId,
      postUrl: undefined,
    };
  }

  // Credentials exist -- log that we would call the platform API
  console.log(
    `[PlatformManager] Would call ${platformConfig.apiEndpoint} for ${account.platform}`,
    `(auth: ${platformConfig.authMethod}):`,
    `type=${post.postType}, content=${post.contentId}`
  );

  // Placeholder: In a real implementation, this is where the platform-specific
  // API call would be made. The call would:
  //   - Fetch content from content_library using post.contentId
  //   - Upload media to the platform
  //   - Create the post with caption, hashtags, and pricing
  //   - Return the external post ID and URL
  //
  // For now, we simulate success and mark as posted.

  await supabase.from('handler_decisions').insert({
    id: crypto.randomUUID(),
    user_id: post.userId,
    decision_type: 'posting',
    decision_data: {
      platform: account.platform,
      username: account.username,
      postType: post.postType,
      contentId: post.contentId,
      caption: post.caption,
      hashtags: post.hashtags,
      price: post.price,
      isConsequenceRelease: post.isConsequenceRelease,
      apiEndpoint: platformConfig.apiEndpoint,
      authMethod: platformConfig.authMethod,
      credentialsPresent: true,
    },
    outcome: 'simulated_with_credentials',
    created_at: now,
  });

  // Step 5: Update the scheduled post record
  await supabase
    .from('scheduled_posts')
    .update({
      status: 'posted',
      posted_at: now,
      post_external_id: simulatedPostId,
      post_url: null,
    })
    .eq('id', post.id);

  return {
    success: true,
    postId: simulatedPostId,
    postUrl: undefined,
  };
}

// ============================================
// ERROR HANDLING & RETRY
// ============================================

/**
 * Handle a failed posting attempt.
 * Increments the retry counter and either reschedules the post for a later
 * attempt or marks it as permanently failed if retries are exhausted.
 */
export async function handlePostingError(postId: string, error: string): Promise<void> {
  // Fetch current post state
  const { data: postRow, error: fetchError } = await supabase
    .from('scheduled_posts')
    .select('retry_count, scheduled_for, user_id, platform_account_id')
    .eq('id', postId)
    .single();

  if (fetchError || !postRow) {
    console.error('[PlatformManager] Could not fetch post for error handling:', fetchError);
    return;
  }

  const currentRetry = (postRow.retry_count as number) ?? 0;
  const nextRetry = currentRetry + 1;

  if (nextRetry >= MAX_RETRY_COUNT) {
    // Exhausted retries -- mark as permanently failed
    await supabase
      .from('scheduled_posts')
      .update({
        status: 'failed',
        retry_count: nextRetry,
        metadata: {
          lastError: error,
          failedAt: new Date().toISOString(),
          totalAttempts: nextRetry,
        },
      })
      .eq('id', postId);

    console.error(
      `[PlatformManager] Post ${postId} permanently failed after ${nextRetry} attempts: ${error}`
    );
  } else {
    // Schedule a retry with exponential-ish backoff
    const delayMinutes = RETRY_DELAYS_MINUTES[currentRetry] ?? 60;
    const retryAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();

    await supabase
      .from('scheduled_posts')
      .update({
        status: 'scheduled',
        retry_count: nextRetry,
        scheduled_for: retryAt,
        metadata: {
          lastError: error,
          lastAttemptAt: new Date().toISOString(),
          nextRetryAt: retryAt,
        },
      })
      .eq('id', postId);

    console.warn(
      `[PlatformManager] Post ${postId} retry ${nextRetry}/${MAX_RETRY_COUNT} scheduled for ${retryAt}: ${error}`
    );
  }
}

// ============================================
// ANALYTICS
// ============================================

/**
 * Sync analytics from all enabled platforms for a user.
 *
 * This is a stub implementation. In production, each platform adapter
 * would call its respective analytics API and update:
 *   - platform_accounts.analytics (engagement, impressions, etc.)
 *   - platform_accounts.subscriber_count
 *   - platform_accounts.engagement_rate
 *   - platform_accounts.revenue_total
 *   - revenue_events table for individual transactions
 */
export async function syncAnalytics(userId: string): Promise<void> {
  const accounts = await getAccounts(userId);
  const enabledAccounts = accounts.filter(a => a.enabled);

  if (enabledAccounts.length === 0) {
    console.log('[PlatformManager] No enabled accounts to sync analytics for');
    return;
  }

  const now = new Date().toISOString();

  for (const account of enabledAccounts) {
    const platformConfig = PLATFORM_CONFIGS[account.platform];

    if (!platformConfig) {
      console.warn(`[PlatformManager] Skipping analytics sync for unknown platform: ${account.platform}`);
      continue;
    }

    const supportsAnalytics = platformConfig.capabilities.includes('analytics');
    if (!supportsAnalytics) {
      continue;
    }

    // Stub: In production, call platform-specific analytics endpoints here.
    // For each platform, the adapter would:
    //   1. Fetch recent post performance (likes, comments, shares, views)
    //   2. Fetch subscriber/follower counts
    //   3. Fetch revenue data (tips, subscriptions, PPV sales)
    //   4. Calculate engagement rate
    //   5. Store granular revenue events in the revenue_events table

    console.log(
      `[PlatformManager] Would sync analytics from ${account.platform} (${account.username ?? 'unknown'})`,
      `via ${platformConfig.apiEndpoint}`
    );

    // Update the last_synced_at timestamp to record that sync was attempted
    await supabase
      .from('platform_accounts')
      .update({ last_synced_at: now })
      .eq('id', account.id);
  }

  console.log(
    `[PlatformManager] Analytics sync complete for ${enabledAccounts.length} account(s)`
  );
}

// ============================================
// POSTING SUMMARY & STATISTICS
// ============================================

/**
 * Get a summary of posting activity for a user over the specified number of days.
 */
export async function getPostingSummary(
  userId: string,
  days: number = 30
): Promise<{
  totalPosts: number;
  byPlatform: Record<string, number>;
  successRate: number;
}> {
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all posts (any terminal status) within the time window
  const { data: posts, error } = await supabase
    .from('scheduled_posts')
    .select('id, platform_account_id, status')
    .eq('user_id', userId)
    .gte('scheduled_for', sinceDate)
    .in('status', ['posted', 'failed']);

  if (error) {
    console.error('[PlatformManager] Error fetching posting summary:', error);
    return { totalPosts: 0, byPlatform: {}, successRate: 0 };
  }

  if (!posts || posts.length === 0) {
    return { totalPosts: 0, byPlatform: {}, successRate: 0 };
  }

  // We need platform names, so fetch the user's accounts to build a lookup
  const accounts = await getAccounts(userId);
  const accountMap = new Map(accounts.map(a => [a.id, a.platform]));

  const byPlatform: Record<string, number> = {};
  let successCount = 0;

  for (const post of posts) {
    const platform = accountMap.get(post.platform_account_id as string) ?? 'unknown';

    if (post.status === 'posted') {
      byPlatform[platform] = (byPlatform[platform] ?? 0) + 1;
      successCount++;
    }
  }

  const totalPosts = posts.length;
  const successRate = totalPosts > 0 ? successCount / totalPosts : 0;

  return {
    totalPosts,
    byPlatform,
    successRate,
  };
}

// ============================================
// OPTIMAL POST TIME CALCULATION
// ============================================

/**
 * Calculate the best time to post for a given user and platform.
 *
 * Strategy:
 *   1. Check the platform account's posting_schedule.optimalTimes.
 *   2. If available, pick the next future optimal time slot.
 *   3. If not configured, default to evening hours (6-9 PM EST / 18:00-21:00 UTC-5).
 *   4. Returns an ISO timestamp for today or tomorrow.
 */
export async function calculateOptimalPostTime(
  userId: string,
  platform: string
): Promise<string> {
  // Find the account for this platform
  const accounts = await getAccounts(userId);
  const account = accounts.find(a => a.platform === platform && a.enabled);

  const now = new Date();

  // Try to use configured optimal times
  if (account?.postingSchedule?.optimalTimes && account.postingSchedule.optimalTimes.length > 0) {
    const optimalTimes = account.postingSchedule.optimalTimes;

    // Also consider best days if configured
    const bestDays = account.postingSchedule.bestDays;
    const todayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
    const isBestDay = !bestDays || bestDays.length === 0 || bestDays.includes(todayName);

    // Try to find the next slot today
    if (isBestDay) {
      for (const timeStr of optimalTimes) {
        const candidate = parseTodayTime(timeStr, now);
        if (candidate && candidate > now) {
          return candidate.toISOString();
        }
      }
    }

    // No remaining slots today -- find the first slot tomorrow (or next best day)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (bestDays && bestDays.length > 0) {
      // Find the next best day
      for (let offset = 1; offset <= 7; offset++) {
        const candidate = new Date(now);
        candidate.setDate(candidate.getDate() + offset);
        const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][candidate.getDay()];
        if (bestDays.includes(dayName)) {
          const firstTime = optimalTimes[0];
          const result = parseTodayTime(firstTime, candidate);
          if (result) return result.toISOString();
        }
      }
    }

    // Fallback: use first optimal time tomorrow
    const firstTime = optimalTimes[0];
    const result = parseTodayTime(firstTime, tomorrow);
    if (result) return result.toISOString();
  }

  // Default: evening hours (6-9 PM EST = UTC-5)
  // Pick a random slot within the window for natural-looking distribution
  const estOffsetMs = -5 * 60 * 60 * 1000;
  const defaultHours = [18, 19, 20, 21];
  const selectedHour = defaultHours[Math.floor(Math.random() * defaultHours.length)];
  const selectedMinute = Math.floor(Math.random() * 60);

  // Build a date in EST then convert to UTC
  const todayEST = new Date(now.getTime() + estOffsetMs);
  todayEST.setHours(selectedHour, selectedMinute, 0, 0);
  const candidateUTC = new Date(todayEST.getTime() - estOffsetMs);

  if (candidateUTC > now) {
    return candidateUTC.toISOString();
  }

  // Already past tonight's window -- schedule for tomorrow
  const tomorrowEST = new Date(todayEST);
  tomorrowEST.setDate(tomorrowEST.getDate() + 1);
  const tomorrowUTC = new Date(tomorrowEST.getTime() - estOffsetMs);
  return tomorrowUTC.toISOString();
}

// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Parse a time string (e.g., "18:30", "9:00 PM", "21:00") and produce a Date
 * for the given reference day with that time set.
 * Returns null if the time string cannot be parsed.
 */
function parseTodayTime(timeStr: string, referenceDay: Date): Date | null {
  const trimmed = timeStr.trim().toLowerCase();
  let hours: number;
  let minutes: number;

  // Try 24-hour format: "HH:MM"
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    hours = parseInt(match24[1], 10);
    minutes = parseInt(match24[2], 10);
  } else {
    // Try 12-hour format: "H:MM AM/PM" or "H AM/PM"
    const match12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (match12) {
      hours = parseInt(match12[1], 10);
      minutes = match12[2] ? parseInt(match12[2], 10) : 0;
      if (match12[3] === 'pm' && hours !== 12) hours += 12;
      if (match12[3] === 'am' && hours === 12) hours = 0;
    } else {
      return null;
    }
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  const result = new Date(referenceDay);
  result.setHours(hours, minutes, 0, 0);
  return result;
}
