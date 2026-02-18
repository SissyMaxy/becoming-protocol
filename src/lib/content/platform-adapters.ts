// ============================================
// Platform Adapters
// Platform-specific content formatting, constraints, and capabilities
// Actual API calls happen server-side in handler-platform edge function
// ============================================

import type { VaultTier } from '../../types/vault';

// ============================================
// Platform Adapter Interface
// ============================================

export interface PlatformAdapter {
  platform: string;
  displayName: string;
  capabilities: PlatformCapability[];
  captionMaxLength: number;
  mediaFormats: string[];
  maxMediaPerPost: number;
  supportsTiers: boolean;
  supportsLive: boolean;
  supportsPPV: boolean;
  tipMinimumCents: number;

  formatCaption(caption: string): string;
  validatePost(post: PostDraft): PostValidation;
  getOptimalPostTimes(): string[];
  getContentStrategy(): ContentStrategy;
}

export type PlatformCapability =
  | 'post'
  | 'ppv'
  | 'message'
  | 'mass_message'
  | 'story'
  | 'live'
  | 'analytics'
  | 'subscribers'
  | 'dm'
  | 'comment'
  | 'reply';

export interface PostDraft {
  caption: string;
  mediaUrls: string[];
  mediaTypes: string[];
  isPPV: boolean;
  price?: number;
  isConsequence: boolean;
  vaultTier: VaultTier;
}

export interface PostValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedCaption?: string;
}

export interface ContentStrategy {
  postFrequency: number; // Posts per day
  bestTimes: string[];
  contentMix: Record<string, number>; // content type → percentage
  hashtagStrategy: string[];
}

// ============================================
// OnlyFans / Fansly Adapter
// ============================================

const fanslyAdapter: PlatformAdapter = {
  platform: 'fansly',
  displayName: 'Fansly',
  capabilities: ['post', 'ppv', 'message', 'mass_message', 'live', 'analytics', 'subscribers'],
  captionMaxLength: 500,
  mediaFormats: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'audio/mpeg'],
  maxMediaPerPost: 10,
  supportsTiers: true,
  supportsLive: true,
  supportsPPV: true,
  tipMinimumCents: 100,

  formatCaption(caption: string): string {
    // Fansly supports longer captions with emoji
    let formatted = caption;
    if (formatted.length > 500) {
      formatted = formatted.substring(0, 497) + '...';
    }
    return formatted;
  },

  validatePost(post: PostDraft): PostValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (post.caption.length > 500) {
      warnings.push('Caption will be truncated to 500 characters');
    }
    if (post.mediaUrls.length === 0 && !post.caption.trim()) {
      errors.push('Post must have media or text');
    }
    if (post.isPPV && (!post.price || post.price < 300)) {
      errors.push('PPV minimum price is $3.00');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitizedCaption: this.formatCaption(post.caption),
    };
  },

  getOptimalPostTimes(): string[] {
    // Evening/night tends to perform best for adult content
    return ['18:00', '20:00', '22:00', '23:00'];
  },

  getContentStrategy(): ContentStrategy {
    return {
      postFrequency: 2,
      bestTimes: ['18:00', '20:00', '22:00'],
      contentMix: {
        progress_update: 30,
        denial_content: 20,
        ppv_tease: 15,
        cam_recap: 15,
        poll_engagement: 10,
        milestone_update: 10,
      },
      hashtagStrategy: ['transformation', 'feminization', 'progress', 'denial'],
    };
  },
};

const onlyfansAdapter: PlatformAdapter = {
  ...fanslyAdapter,
  platform: 'onlyfans',
  displayName: 'OnlyFans',
  capabilities: ['post', 'ppv', 'message', 'mass_message', 'story', 'analytics', 'subscribers'],
  supportsLive: false, // OF live is limited

  getOptimalPostTimes(): string[] {
    return ['17:00', '19:00', '21:00', '23:00'];
  },
};

// ============================================
// Reddit Adapter
// ============================================

const redditAdapter: PlatformAdapter = {
  platform: 'reddit',
  displayName: 'Reddit',
  capabilities: ['post', 'comment', 'reply', 'analytics'],
  captionMaxLength: 300,
  mediaFormats: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
  maxMediaPerPost: 1, // Reddit: one main media per post
  supportsTiers: false,
  supportsLive: false,
  supportsPPV: false,
  tipMinimumCents: 0,

  formatCaption(caption: string): string {
    let formatted = caption;
    if (formatted.length > 300) {
      formatted = formatted.substring(0, 297) + '...';
    }
    // Remove emojis that don't render well on Reddit
    return formatted;
  },

  validatePost(post: PostDraft): PostValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (post.caption.length > 300) {
      warnings.push('Title will be truncated to 300 characters');
    }
    if (post.isPPV) {
      errors.push('Reddit does not support PPV content');
    }
    if (post.vaultTier === 'restricted') {
      errors.push('Restricted vault content should not be posted to Reddit');
    }
    if (post.mediaUrls.length > 1) {
      warnings.push('Reddit supports one media per post; only first will be used');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitizedCaption: this.formatCaption(post.caption),
    };
  },

  getOptimalPostTimes(): string[] {
    // Reddit engagement peaks morning/lunch US time
    return ['08:00', '12:00', '17:00'];
  },

  getContentStrategy(): ContentStrategy {
    return {
      postFrequency: 1,
      bestTimes: ['08:00', '12:00', '17:00'],
      contentMix: {
        progress_update: 40,
        milestone: 20,
        funnel_content: 30,
        community_engagement: 10,
      },
      hashtagStrategy: [], // Reddit uses subreddits, not hashtags
    };
  },
};

// ============================================
// Chaturbate Adapter (Cam Only)
// ============================================

const chaturbateAdapter: PlatformAdapter = {
  platform: 'chaturbate',
  displayName: 'Chaturbate',
  capabilities: ['live', 'analytics'],
  captionMaxLength: 200,
  mediaFormats: [],
  maxMediaPerPost: 0,
  supportsTiers: false,
  supportsLive: true,
  supportsPPV: false,
  tipMinimumCents: 100, // 1 token

  formatCaption(caption: string): string {
    return caption.substring(0, 200);
  },

  validatePost(_post: PostDraft): PostValidation {
    return {
      valid: false,
      errors: ['Chaturbate is a live-only platform, not a posting platform'],
      warnings: [],
    };
  },

  getOptimalPostTimes(): string[] {
    // Live session times
    return ['20:00', '21:00', '22:00'];
  },

  getContentStrategy(): ContentStrategy {
    return {
      postFrequency: 0, // No posting, only live
      bestTimes: ['20:00', '21:00', '22:00'],
      contentMix: {
        live_session: 100,
      },
      hashtagStrategy: [],
    };
  },
};

// ============================================
// Patreon Adapter
// ============================================

const patreonAdapter: PlatformAdapter = {
  platform: 'patreon',
  displayName: 'Patreon',
  capabilities: ['post', 'message', 'analytics', 'subscribers'],
  captionMaxLength: 5000,
  mediaFormats: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'audio/mpeg'],
  maxMediaPerPost: 10,
  supportsTiers: true,
  supportsLive: false,
  supportsPPV: false,
  tipMinimumCents: 100,

  formatCaption(caption: string): string {
    // Patreon supports long-form
    return caption;
  },

  validatePost(post: PostDraft): PostValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (post.isPPV) {
      warnings.push('Patreon uses tier-gating, not PPV. Post will be tier-gated instead.');
    }
    if (post.vaultTier === 'restricted') {
      warnings.push('Restricted content on Patreon should be limited to highest tier');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  },

  getOptimalPostTimes(): string[] {
    return ['10:00', '14:00', '19:00'];
  },

  getContentStrategy(): ContentStrategy {
    return {
      postFrequency: 0.5, // Every other day
      bestTimes: ['10:00', '14:00', '19:00'],
      contentMix: {
        behind_scenes: 30,
        progress_update: 25,
        long_form_reflection: 20,
        milestone_update: 15,
        exclusive_preview: 10,
      },
      hashtagStrategy: [],
    };
  },
};

// ============================================
// Adapter Registry
// ============================================

const ADAPTERS: Record<string, PlatformAdapter> = {
  fansly: fanslyAdapter,
  onlyfans: onlyfansAdapter,
  reddit: redditAdapter,
  chaturbate: chaturbateAdapter,
  patreon: patreonAdapter,
};

export function getAdapter(platform: string): PlatformAdapter | null {
  return ADAPTERS[platform] || null;
}

export function getAllAdapters(): PlatformAdapter[] {
  return Object.values(ADAPTERS);
}

export function getLiveCapablePlatforms(): PlatformAdapter[] {
  return Object.values(ADAPTERS).filter(a => a.supportsLive);
}

export function getPostingPlatforms(): PlatformAdapter[] {
  return Object.values(ADAPTERS).filter(a => a.capabilities.includes('post'));
}

// ============================================
// Cross-Platform Content Distribution
// ============================================

/**
 * Determine which platforms a piece of content should be posted to,
 * based on vault tier and vulnerability.
 */
export function getDistributionPlan(
  vaultTier: VaultTier,
  vulnerabilityScore: number,
  enabledPlatforms: string[]
): Array<{ platform: string; visibility: string; isPPV: boolean }> {
  const plan: Array<{ platform: string; visibility: string; isPPV: boolean }> = [];

  for (const platformName of enabledPlatforms) {
    const adapter = ADAPTERS[platformName];
    if (!adapter || !adapter.capabilities.includes('post')) continue;

    if (vaultTier === 'public_ready') {
      // Public content goes everywhere
      plan.push({ platform: platformName, visibility: 'public', isPPV: false });
    } else if (vaultTier === 'private') {
      if (adapter.supportsTiers) {
        // Private content goes to tier-gated platforms only
        plan.push({
          platform: platformName,
          visibility: vulnerabilityScore <= 5 ? 'tier2' : 'tier3',
          isPPV: false,
        });
      }
    } else if (vaultTier === 'restricted') {
      if (adapter.supportsPPV) {
        // Restricted content as PPV on premium platforms
        plan.push({
          platform: platformName,
          visibility: 'tier4',
          isPPV: vulnerabilityScore >= 7,
        });
      }
    }
    // cam_recording and cam_highlight follow the same rules as their vulnerability
  }

  return plan;
}

/**
 * Get aggregated cross-platform stats summary.
 */
export function aggregatePlatformStats(
  accounts: Array<{
    platform: string;
    subscriberCount: number;
    revenueTotal: number;
    engagementRate: number;
  }>
): {
  totalSubscribers: number;
  totalRevenue: number;
  avgEngagement: number;
  platformBreakdown: Record<string, { subscribers: number; revenue: number }>;
} {
  const totalSubscribers = accounts.reduce((s, a) => s + a.subscriberCount, 0);
  const totalRevenue = accounts.reduce((s, a) => s + a.revenueTotal, 0);
  const avgEngagement = accounts.length > 0
    ? accounts.reduce((s, a) => s + a.engagementRate, 0) / accounts.length
    : 0;

  const breakdown: Record<string, { subscribers: number; revenue: number }> = {};
  for (const a of accounts) {
    breakdown[a.platform] = {
      subscribers: a.subscriberCount,
      revenue: a.revenueTotal,
    };
  }

  return { totalSubscribers, totalRevenue, avgEngagement, platformBreakdown: breakdown };
}
