/**
 * Strategy Engine - Handler Autonomous System
 *
 * Makes high-level decisions about content direction, platform focus,
 * and monetization approach. Evaluates performance data, determines
 * the current phase, generates content calendars, and persists
 * strategy state to the handler_strategy table.
 *
 * Called weekly by evaluateAndUpdate, or on-demand for calendar queries.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type Phase = 'foundation' | 'growth' | 'monetization' | 'scale' | 'sex_work';

export interface StrategyState {
  currentPhase: Phase;
  contentFocus: {
    primaryTypes: string[];
    secondaryTypes: string[];
    avoidTypes: string[];
    vulnerabilityTarget: number;
    frequencyDaily: number;
  };
  platformPriority: string[];
  monetizationStrategy: {
    ppvPricing: Record<number, number>; // vulnerability_tier -> price
    subscriptionPricing: Record<string, number>; // platform -> price
    tipGoals: { daily: number; weekly: number };
  };
  audienceInsights: {
    totalSubscribers: number;
    activeSubscribers: number;
    topPlatform: string;
    peakEngagementTimes: string[];
  };
  performanceTrends: {
    engagementTrend: 'up' | 'down' | 'stable';
    revenueTrend: 'up' | 'down' | 'stable';
    subscriberTrend: 'up' | 'down' | 'stable';
  };
}

export interface ContentCalendarSlot {
  date: string;
  contentType: string;
  platforms: string[];
  vulnerabilityTier: number;
  difficulty: number;
  deadline: string;
}

export interface StrategyDecision {
  strategy: StrategyState;
  actionItems: string[];
  briefsToCreate: ContentCalendarSlot[];
}

// ============================================
// DB ROW SHAPES (snake_case)
// ============================================

interface StrategyRow {
  id: string;
  user_id: string;
  current_phase: Phase;
  content_focus: {
    primary_types: string[];
    secondary_types: string[];
    avoid_types: string[];
    vulnerability_target: number;
    frequency_daily: number;
  };
  platform_priority: string[];
  monetization_strategy: {
    ppv_pricing: Record<number, number>;
    subscription_pricing: Record<string, number>;
    tip_goals: { daily: number; weekly: number };
  };
  audience_insights: {
    total_subscribers: number;
    active_subscribers: number;
    top_platform: string;
    peak_engagement_times: string[];
  };
  performance_trends: {
    engagement_trend: 'up' | 'down' | 'stable';
    revenue_trend: 'up' | 'down' | 'stable';
    subscriber_trend: 'up' | 'down' | 'stable';
  };
  content_calendar: ContentCalendarSlotRow[] | null;
  updated_at: string;
  created_at: string;
}

interface ContentCalendarSlotRow {
  date: string;
  content_type: string;
  platforms: string[];
  vulnerability_tier: number;
  difficulty: number;
  deadline: string;
}

interface RevenueEventRow {
  id: string;
  user_id: string;
  amount_cents: number;
  source: string;
  platform: string;
  content_id: string | null;
  created_at: string;
}

interface PlatformAccountRow {
  id: string;
  user_id: string;
  platform: string;
  subscriber_count: number;
  active_subscriber_count: number;
  engagement_rate: number;
  peak_times: string[] | null;
  updated_at: string;
}

interface ContentLibraryRow {
  id: string;
  user_id: string;
  content_type: string;
  vulnerability_tier: number;
  engagement_score: number;
  revenue_generated_cents: number;
  platform: string;
  created_at: string;
}

// ============================================
// MAPPING HELPERS
// ============================================

function rowToStrategy(row: StrategyRow): StrategyState {
  return {
    currentPhase: row.current_phase,
    contentFocus: {
      primaryTypes: row.content_focus?.primary_types ?? [],
      secondaryTypes: row.content_focus?.secondary_types ?? [],
      avoidTypes: row.content_focus?.avoid_types ?? [],
      vulnerabilityTarget: row.content_focus?.vulnerability_target ?? 1,
      frequencyDaily: row.content_focus?.frequency_daily ?? 1,
    },
    platformPriority: row.platform_priority ?? [],
    monetizationStrategy: {
      ppvPricing: row.monetization_strategy?.ppv_pricing ?? {},
      subscriptionPricing: row.monetization_strategy?.subscription_pricing ?? {},
      tipGoals: row.monetization_strategy?.tip_goals ?? { daily: 0, weekly: 0 },
    },
    audienceInsights: {
      totalSubscribers: row.audience_insights?.total_subscribers ?? 0,
      activeSubscribers: row.audience_insights?.active_subscribers ?? 0,
      topPlatform: row.audience_insights?.top_platform ?? '',
      peakEngagementTimes: row.audience_insights?.peak_engagement_times ?? [],
    },
    performanceTrends: {
      engagementTrend: row.performance_trends?.engagement_trend ?? 'stable',
      revenueTrend: row.performance_trends?.revenue_trend ?? 'stable',
      subscriberTrend: row.performance_trends?.subscriber_trend ?? 'stable',
    },
  };
}

function strategyToRow(
  userId: string,
  strategy: StrategyState,
  calendar: ContentCalendarSlot[]
): Omit<StrategyRow, 'id' | 'created_at'> {
  return {
    user_id: userId,
    current_phase: strategy.currentPhase,
    content_focus: {
      primary_types: strategy.contentFocus.primaryTypes,
      secondary_types: strategy.contentFocus.secondaryTypes,
      avoid_types: strategy.contentFocus.avoidTypes,
      vulnerability_target: strategy.contentFocus.vulnerabilityTarget,
      frequency_daily: strategy.contentFocus.frequencyDaily,
    },
    platform_priority: strategy.platformPriority,
    monetization_strategy: {
      ppv_pricing: strategy.monetizationStrategy.ppvPricing,
      subscription_pricing: strategy.monetizationStrategy.subscriptionPricing,
      tip_goals: strategy.monetizationStrategy.tipGoals,
    },
    audience_insights: {
      total_subscribers: strategy.audienceInsights.totalSubscribers,
      active_subscribers: strategy.audienceInsights.activeSubscribers,
      top_platform: strategy.audienceInsights.topPlatform,
      peak_engagement_times: strategy.audienceInsights.peakEngagementTimes,
    },
    performance_trends: {
      engagement_trend: strategy.performanceTrends.engagementTrend,
      revenue_trend: strategy.performanceTrends.revenueTrend,
      subscriber_trend: strategy.performanceTrends.subscriberTrend,
    },
    content_calendar: calendar.map(slotToCamelRow),
    updated_at: new Date().toISOString(),
  };
}

function slotToCamelRow(slot: ContentCalendarSlot): ContentCalendarSlotRow {
  return {
    date: slot.date,
    content_type: slot.contentType,
    platforms: slot.platforms,
    vulnerability_tier: slot.vulnerabilityTier,
    difficulty: slot.difficulty,
    deadline: slot.deadline,
  };
}

function rowToSlot(row: ContentCalendarSlotRow): ContentCalendarSlot {
  return {
    date: row.date,
    contentType: row.content_type,
    platforms: row.platforms,
    vulnerabilityTier: row.vulnerability_tier,
    difficulty: row.difficulty,
    deadline: row.deadline,
  };
}

// ============================================
// PHASE DESCRIPTIONS
// ============================================

const PHASE_DESCRIPTIONS: Record<Phase, string> = {
  foundation:
    'Building your content library and establishing a presence. Focus on consistency, low-vulnerability content, and finding your voice on one primary platform.',
  growth:
    'Expanding your audience and engagement. Increasing posting frequency, experimenting with content types, and beginning to push vulnerability boundaries.',
  monetization:
    'Converting audience attention into revenue. Introducing PPV content, optimizing subscription pricing, and creating tiered vulnerability content.',
  scale:
    'Scaling revenue across multiple platforms. Diversifying income streams, increasing content frequency, and leveraging top-performing content types.',
  sex_work:
    'Full autonomous operation. Maximum content output, multi-platform presence, advanced monetization strategies, and high-vulnerability content production.',
};

/**
 * Human-readable description for a given phase.
 */
export function getPhaseDescription(phase: Phase): string {
  return PHASE_DESCRIPTIONS[phase];
}

// ============================================
// PHASE THRESHOLDS
// ============================================

const PHASE_REVENUE_THRESHOLDS: Record<Phase, number> = {
  foundation: 10000,   // < $100/mo in cents
  growth: 50000,       // < $500/mo
  monetization: 200000, // < $2,000/mo
  scale: 500000,       // < $5,000/mo
  sex_work: Infinity,  // >= $5,000/mo
};

const PHASE_SUBSCRIBER_THRESHOLDS: Record<Phase, number> = {
  foundation: 50,
  growth: 500,
  monetization: Infinity, // subscriber count alone doesn't gate monetization+
  scale: Infinity,
  sex_work: Infinity,
};

// ============================================
// DATA FETCHING HELPERS
// ============================================

/**
 * Sum revenue for a user over the last 30 days, returned in cents.
 */
async function getMonthlyRevenueCents(userId: string): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await supabase
    .from('revenue_events')
    .select('amount_cents')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo.toISOString());

  if (error) {
    console.error('Error fetching revenue events:', error);
    return 0;
  }

  return (data as Pick<RevenueEventRow, 'amount_cents'>[] | null)?.reduce(
    (sum, row) => sum + (row.amount_cents ?? 0),
    0,
  ) ?? 0;
}

/**
 * Get total subscriber count across all platforms.
 */
async function getTotalSubscribers(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('platform_accounts')
    .select('subscriber_count')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching platform accounts:', error);
    return 0;
  }

  return (data as Pick<PlatformAccountRow, 'subscriber_count'>[] | null)?.reduce(
    (sum, row) => sum + (row.subscriber_count ?? 0),
    0,
  ) ?? 0;
}

/**
 * Load platform account rows for a user.
 */
async function getPlatformAccounts(userId: string): Promise<PlatformAccountRow[]> {
  const { data, error } = await supabase
    .from('platform_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('subscriber_count', { ascending: false });

  if (error) {
    console.error('Error fetching platform accounts:', error);
    return [];
  }

  return (data as PlatformAccountRow[] | null) ?? [];
}

/**
 * Load revenue events for the last N days.
 */
async function getRevenueEvents(userId: string, days: number): Promise<RevenueEventRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('revenue_events')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching revenue events:', error);
    return [];
  }

  return (data as RevenueEventRow[] | null) ?? [];
}

/**
 * Load content library entries with performance data.
 */
async function getContentPerformance(userId: string, days: number): Promise<ContentLibraryRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('content_library')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('engagement_score', { ascending: false });

  if (error) {
    console.error('Error fetching content library:', error);
    return [];
  }

  return (data as ContentLibraryRow[] | null) ?? [];
}

/**
 * Check whether the user has authorized the sex_work phase.
 */
async function isSexWorkAuthorized(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('compliance_state')
    .select('sex_work_authorized')
    .eq('user_id', userId)
    .single();

  if (error || !data) return false;
  return !!(data as { sex_work_authorized?: boolean }).sex_work_authorized;
}

// ============================================
// TREND CALCULATION
// ============================================

type Trend = 'up' | 'down' | 'stable';

/**
 * Compare two numeric values to determine a trend.
 * Requires a >10% change to count as up/down; otherwise stable.
 */
function computeTrend(current: number, previous: number): Trend {
  if (previous === 0) {
    return current > 0 ? 'up' : 'stable';
  }
  const pctChange = (current - previous) / previous;
  if (pctChange > 0.1) return 'up';
  if (pctChange < -0.1) return 'down';
  return 'stable';
}

/**
 * Split an array of revenue events into two halves and compare totals
 * to determine a revenue trend over the period.
 */
function computeRevenueTrend(events: RevenueEventRow[]): Trend {
  if (events.length === 0) return 'stable';

  const midpoint = Math.floor(events.length / 2);
  const recentHalf = events.slice(0, midpoint);
  const olderHalf = events.slice(midpoint);

  const recentTotal = recentHalf.reduce((s, e) => s + (e.amount_cents ?? 0), 0);
  const olderTotal = olderHalf.reduce((s, e) => s + (e.amount_cents ?? 0), 0);

  return computeTrend(recentTotal, olderTotal);
}

/**
 * Determine engagement trend from content library performance.
 */
function computeEngagementTrend(content: ContentLibraryRow[]): Trend {
  if (content.length < 4) return 'stable';

  const midpoint = Math.floor(content.length / 2);
  const recentAvg =
    content.slice(0, midpoint).reduce((s, c) => s + c.engagement_score, 0) / midpoint;
  const olderAvg =
    content.slice(midpoint).reduce((s, c) => s + c.engagement_score, 0) /
    (content.length - midpoint);

  return computeTrend(recentAvg, olderAvg);
}

// ============================================
// CONTENT TYPE ANALYSIS
// ============================================

interface ContentTypePerformance {
  contentType: string;
  count: number;
  avgEngagement: number;
  totalRevenueCents: number;
}

/**
 * Rank content types by combined engagement and revenue performance.
 */
function analyzeContentTypes(content: ContentLibraryRow[]): ContentTypePerformance[] {
  const map = new Map<string, { count: number; engagementSum: number; revenueSum: number }>();

  for (const item of content) {
    const existing = map.get(item.content_type) ?? { count: 0, engagementSum: 0, revenueSum: 0 };
    existing.count += 1;
    existing.engagementSum += item.engagement_score;
    existing.revenueSum += item.revenue_generated_cents;
    map.set(item.content_type, existing);
  }

  const results: ContentTypePerformance[] = [];
  for (const [contentType, stats] of map.entries()) {
    results.push({
      contentType,
      count: stats.count,
      avgEngagement: stats.count > 0 ? stats.engagementSum / stats.count : 0,
      totalRevenueCents: stats.revenueSum,
    });
  }

  // Sort by a composite score: 60% engagement weight, 40% revenue weight
  results.sort((a, b) => {
    const scoreA = a.avgEngagement * 0.6 + (a.totalRevenueCents / 100) * 0.4;
    const scoreB = b.avgEngagement * 0.6 + (b.totalRevenueCents / 100) * 0.4;
    return scoreB - scoreA;
  });

  return results;
}

/**
 * Identify top revenue sources (by platform + source combination).
 */
function identifyTopRevenueDrivers(
  events: RevenueEventRow[]
): { source: string; platform: string; totalCents: number }[] {
  const map = new Map<string, { source: string; platform: string; totalCents: number }>();

  for (const event of events) {
    const key = `${event.platform}::${event.source}`;
    const existing = map.get(key) ?? { source: event.source, platform: event.platform, totalCents: 0 };
    existing.totalCents += event.amount_cents;
    map.set(key, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.totalCents - a.totalCents);
}

// ============================================
// PHASE DETERMINATION
// ============================================

/**
 * Determine the current phase based on monthly revenue and subscriber count.
 *
 * Thresholds (all monthly):
 *  - foundation:     revenue < $100  AND subscribers < 50
 *  - growth:         revenue < $500  AND subscribers < 500
 *  - monetization:   revenue < $2,000
 *  - scale:          revenue < $5,000
 *  - sex_work:       revenue >= $5,000  (requires authorization)
 */
export async function determinePhase(userId: string): Promise<Phase> {
  const [revenueCents, subscribers, authorized] = await Promise.all([
    getMonthlyRevenueCents(userId),
    getTotalSubscribers(userId),
    isSexWorkAuthorized(userId),
  ]);

  // Check from highest phase downward
  if (revenueCents >= PHASE_REVENUE_THRESHOLDS.scale && authorized) {
    return 'sex_work';
  }
  if (revenueCents >= PHASE_REVENUE_THRESHOLDS.monetization) {
    return 'scale';
  }
  if (revenueCents >= PHASE_REVENUE_THRESHOLDS.growth) {
    return 'monetization';
  }
  if (
    revenueCents >= PHASE_REVENUE_THRESHOLDS.foundation ||
    subscribers >= PHASE_SUBSCRIBER_THRESHOLDS.foundation
  ) {
    return 'growth';
  }

  return 'foundation';
}

// ============================================
// CONTENT FOCUS GENERATION
// ============================================

/**
 * Build the contentFocus section of StrategyState based on phase
 * and recent content performance.
 */
function buildContentFocus(
  phase: Phase,
  contentPerformance: ContentTypePerformance[]
): StrategyState['contentFocus'] {
  // Defaults per phase
  const phaseDefaults: Record<
    Phase,
    { primary: string[]; secondary: string[]; avoid: string[]; vulnTarget: number; freq: number }
  > = {
    foundation: {
      primary: ['selfie', 'lifestyle', 'behind_the_scenes'],
      secondary: ['teaser', 'poll'],
      avoid: ['explicit', 'fetish', 'custom'],
      vulnTarget: 1,
      freq: 1,
    },
    growth: {
      primary: ['selfie', 'teaser', 'lifestyle'],
      secondary: ['lingerie', 'behind_the_scenes', 'poll'],
      avoid: ['explicit', 'fetish'],
      vulnTarget: 2,
      freq: 2,
    },
    monetization: {
      primary: ['teaser', 'lingerie', 'ppv_preview'],
      secondary: ['selfie', 'lifestyle', 'behind_the_scenes'],
      avoid: [],
      vulnTarget: 3,
      freq: 2,
    },
    scale: {
      primary: ['ppv_preview', 'lingerie', 'teaser', 'explicit'],
      secondary: ['custom', 'collab', 'behind_the_scenes'],
      avoid: [],
      vulnTarget: 4,
      freq: 3,
    },
    sex_work: {
      primary: ['explicit', 'ppv_preview', 'custom', 'fetish'],
      secondary: ['lingerie', 'teaser', 'collab'],
      avoid: [],
      vulnTarget: 5,
      freq: 3,
    },
  };

  const defaults = phaseDefaults[phase];

  // If we have performance data, promote top-performing types
  if (contentPerformance.length > 0) {
    const topTypes = contentPerformance.slice(0, 3).map((c) => c.contentType);
    // Merge top performers into primary, de-duplicated
    const mergedPrimary = Array.from(new Set([...topTypes, ...defaults.primary])).slice(0, 4);
    return {
      primaryTypes: mergedPrimary,
      secondaryTypes: defaults.secondary.filter((t) => !mergedPrimary.includes(t)),
      avoidTypes: defaults.avoid,
      vulnerabilityTarget: defaults.vulnTarget,
      frequencyDaily: defaults.freq,
    };
  }

  return {
    primaryTypes: defaults.primary,
    secondaryTypes: defaults.secondary,
    avoidTypes: defaults.avoid,
    vulnerabilityTarget: defaults.vulnTarget,
    frequencyDaily: defaults.freq,
  };
}

// ============================================
// PLATFORM PRIORITY
// ============================================

/**
 * Rank platforms by a composite of subscriber count and engagement rate.
 */
function buildPlatformPriority(accounts: PlatformAccountRow[]): string[] {
  if (accounts.length === 0) return ['onlyfans'];

  const scored = accounts.map((a) => ({
    platform: a.platform,
    score: a.subscriber_count * 0.5 + a.engagement_rate * 1000 * 0.5,
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.platform);
}

// ============================================
// MONETIZATION STRATEGY
// ============================================

/**
 * Build monetization strategy keyed on phase and revenue driver data.
 */
function buildMonetizationStrategy(
  phase: Phase,
  revenueDrivers: { source: string; platform: string; totalCents: number }[]
): StrategyState['monetizationStrategy'] {
  // Base PPV pricing per vulnerability tier (in dollars)
  const basePpv: Record<Phase, Record<number, number>> = {
    foundation: { 1: 5, 2: 8, 3: 10 },
    growth: { 1: 5, 2: 10, 3: 15, 4: 20 },
    monetization: { 1: 5, 2: 10, 3: 20, 4: 30, 5: 50 },
    scale: { 1: 8, 2: 15, 3: 25, 4: 40, 5: 75 },
    sex_work: { 1: 10, 2: 20, 3: 35, 4: 50, 5: 100 },
  };

  // Base subscription pricing per platform (in dollars)
  const baseSub: Record<Phase, Record<string, number>> = {
    foundation: { onlyfans: 5 },
    growth: { onlyfans: 8, fansly: 7 },
    monetization: { onlyfans: 12, fansly: 10 },
    scale: { onlyfans: 15, fansly: 12, loyalfans: 10 },
    sex_work: { onlyfans: 20, fansly: 18, loyalfans: 15 },
  };

  // Base tip goals (in dollars)
  const baseTips: Record<Phase, { daily: number; weekly: number }> = {
    foundation: { daily: 5, weekly: 25 },
    growth: { daily: 15, weekly: 75 },
    monetization: { daily: 40, weekly: 200 },
    scale: { daily: 80, weekly: 400 },
    sex_work: { daily: 150, weekly: 750 },
  };

  // If top revenue driver is PPV, bump PPV prices slightly
  const topDriver = revenueDrivers[0];
  const ppvPricing = { ...basePpv[phase] };
  if (topDriver?.source === 'ppv' && topDriver.totalCents > 5000) {
    for (const tier of Object.keys(ppvPricing)) {
      ppvPricing[Number(tier)] = Math.round(ppvPricing[Number(tier)] * 1.1);
    }
  }

  return {
    ppvPricing,
    subscriptionPricing: baseSub[phase],
    tipGoals: baseTips[phase],
  };
}

// ============================================
// AUDIENCE INSIGHTS
// ============================================

/**
 * Aggregate audience insights from platform accounts.
 */
function buildAudienceInsights(accounts: PlatformAccountRow[]): StrategyState['audienceInsights'] {
  if (accounts.length === 0) {
    return {
      totalSubscribers: 0,
      activeSubscribers: 0,
      topPlatform: '',
      peakEngagementTimes: [],
    };
  }

  const totalSubscribers = accounts.reduce((s, a) => s + (a.subscriber_count ?? 0), 0);
  const activeSubscribers = accounts.reduce((s, a) => s + (a.active_subscriber_count ?? 0), 0);

  // Top platform by subscriber count (already sorted desc from fetch)
  const topPlatform = accounts[0].platform;

  // Collect peak times across platforms, de-duplicate
  const allTimes = accounts.flatMap((a) => a.peak_times ?? []);
  const uniqueTimes = Array.from(new Set(allTimes));

  return {
    totalSubscribers,
    activeSubscribers,
    topPlatform,
    peakEngagementTimes: uniqueTimes,
  };
}

// ============================================
// CONTENT CALENDAR GENERATION
// ============================================

/** Content type pools per phase for calendar slot variety. */
const CONTENT_POOLS: Record<Phase, string[]> = {
  foundation: ['selfie', 'lifestyle', 'behind_the_scenes', 'poll', 'teaser'],
  growth: ['selfie', 'teaser', 'lingerie', 'behind_the_scenes', 'poll', 'lifestyle'],
  monetization: ['teaser', 'lingerie', 'ppv_preview', 'selfie', 'lifestyle', 'behind_the_scenes'],
  scale: ['ppv_preview', 'lingerie', 'teaser', 'explicit', 'custom', 'collab', 'behind_the_scenes'],
  sex_work: ['explicit', 'ppv_preview', 'custom', 'fetish', 'lingerie', 'teaser', 'collab'],
};

/** Slots per day by phase: [min, max]. */
const SLOTS_PER_DAY: Record<Phase, [number, number]> = {
  foundation: [1, 1],
  growth: [2, 2],
  monetization: [2, 3],
  scale: [3, 3],
  sex_work: [3, 3],
};

/** Vulnerability tier range by phase: [min, max]. */
const VULN_RANGE: Record<Phase, [number, number]> = {
  foundation: [1, 1],
  growth: [1, 2],
  monetization: [2, 4],
  scale: [2, 5],
  sex_work: [3, 5],
};

/** Difficulty range by phase: [min, max]. */
const DIFF_RANGE: Record<Phase, [number, number]> = {
  foundation: [1, 2],
  growth: [1, 3],
  monetization: [2, 4],
  scale: [2, 5],
  sex_work: [3, 5],
};

/**
 * Pick a random integer in [min, max] inclusive.
 */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate content calendar slots for the next `days` days.
 *
 * Based on the current phase, produces 1-3 slots per day with
 * appropriate content types, vulnerability tiers, difficulty,
 * and deadlines (4-6 hour windows).
 */
export async function generateContentCalendar(
  userId: string,
  days: number = 7
): Promise<ContentCalendarSlot[]> {
  const strategy = await getStrategy(userId);
  const phase = strategy?.currentPhase ?? (await determinePhase(userId));
  const platforms = strategy?.platformPriority ?? ['onlyfans'];
  const pool = CONTENT_POOLS[phase];
  const [minSlots, maxSlots] = SLOTS_PER_DAY[phase];
  const [vulnMin, vulnMax] = VULN_RANGE[phase];
  const [diffMin, diffMax] = DIFF_RANGE[phase];

  const slots: ContentCalendarSlot[] = [];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1); // start from tomorrow

  for (let d = 0; d < days; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];

    const slotCount = randInt(minSlots, maxSlots);

    for (let s = 0; s < slotCount; s++) {
      // Pick content type, cycling through the pool
      const contentType = pool[(d * maxSlots + s) % pool.length];

      // Distribute across platforms: first slot to top platform,
      // subsequent slots rotate through available platforms
      const slotPlatforms =
        platforms.length > 1 && s > 0
          ? [platforms[s % platforms.length]]
          : [platforms[0]];

      // Deadline: stagger across the day with 4-6 hour windows
      const baseHour = 10 + s * randInt(4, 6);
      const deadlineHour = Math.min(baseHour, 22);
      const deadlineDate = new Date(date);
      deadlineDate.setHours(deadlineHour, 0, 0, 0);

      slots.push({
        date: dateStr,
        contentType,
        platforms: slotPlatforms,
        vulnerabilityTier: randInt(vulnMin, vulnMax),
        difficulty: randInt(diffMin, diffMax),
        deadline: deadlineDate.toISOString(),
      });
    }
  }

  return slots;
}

// ============================================
// CORE PUBLIC FUNCTIONS
// ============================================

/**
 * Load the current strategy from the handler_strategy table.
 * Returns null if no strategy row exists for this user.
 */
export async function getStrategy(userId: string): Promise<StrategyState | null> {
  const { data, error } = await supabase
    .from('handler_strategy')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  return rowToStrategy(data as StrategyRow);
}

/**
 * Get the current content calendar stored in handler_strategy.
 * Returns an empty array if no strategy or calendar exists.
 */
export async function getContentCalendar(userId: string): Promise<ContentCalendarSlot[]> {
  const { data, error } = await supabase
    .from('handler_strategy')
    .select('content_calendar')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return [];

  const rows = (data as Pick<StrategyRow, 'content_calendar'>).content_calendar;
  if (!rows || !Array.isArray(rows)) return [];

  return rows.map(rowToSlot);
}

/**
 * Update the strategy in the handler_strategy table.
 * Merges `updates` into the existing strategy; creates a new row
 * if none exists.
 */
export async function updateStrategy(
  userId: string,
  updates: Partial<StrategyState>
): Promise<void> {
  const existing = await getStrategy(userId);

  const merged: StrategyState = {
    currentPhase: updates.currentPhase ?? existing?.currentPhase ?? 'foundation',
    contentFocus: {
      ...(existing?.contentFocus ?? {
        primaryTypes: [],
        secondaryTypes: [],
        avoidTypes: [],
        vulnerabilityTarget: 1,
        frequencyDaily: 1,
      }),
      ...updates.contentFocus,
    },
    platformPriority: updates.platformPriority ?? existing?.platformPriority ?? [],
    monetizationStrategy: {
      ...(existing?.monetizationStrategy ?? {
        ppvPricing: {},
        subscriptionPricing: {},
        tipGoals: { daily: 0, weekly: 0 },
      }),
      ...updates.monetizationStrategy,
    },
    audienceInsights: {
      ...(existing?.audienceInsights ?? {
        totalSubscribers: 0,
        activeSubscribers: 0,
        topPlatform: '',
        peakEngagementTimes: [],
      }),
      ...updates.audienceInsights,
    },
    performanceTrends: {
      ...(existing?.performanceTrends ?? {
        engagementTrend: 'stable' as const,
        revenueTrend: 'stable' as const,
        subscriberTrend: 'stable' as const,
      }),
      ...updates.performanceTrends,
    },
  };

  // Preserve existing calendar on partial updates
  const existingCalendar = await getContentCalendar(userId);
  const row = strategyToRow(userId, merged, existingCalendar);

  const { error } = await supabase
    .from('handler_strategy')
    .upsert(row, { onConflict: 'user_id' });

  if (error) {
    console.error('Error updating strategy:', error);
    throw new Error(`Failed to update strategy: ${error.message}`);
  }
}

/**
 * Full strategy evaluation cycle (intended to run weekly).
 *
 * Steps:
 * 1. Fetch performance data from revenue_events and platform_accounts
 * 2. Analyze top-performing content types
 * 3. Identify top revenue drivers
 * 4. Determine current phase
 * 5. Build content focus, platform priority, monetization strategy,
 *    audience insights, and performance trends
 * 6. Save the full strategy to handler_strategy
 * 7. Generate a 7-day content calendar
 * 8. Generate action items
 * 9. Log the decision to handler_decisions
 * 10. Return the StrategyDecision
 */
export async function evaluateAndUpdate(userId: string): Promise<StrategyDecision> {
  // 1. Fetch performance data
  const [revenueEvents, platformAccounts, contentPerformance, phase] = await Promise.all([
    getRevenueEvents(userId, 30),
    getPlatformAccounts(userId),
    getContentPerformance(userId, 30),
    determinePhase(userId),
  ]);

  // 2. Analyze content type performance
  const contentTypePerf = analyzeContentTypes(contentPerformance);

  // 3. Identify top revenue drivers
  const revenueDrivers = identifyTopRevenueDrivers(revenueEvents);

  // 4. Phase already determined above

  // 5. Build strategy components
  const contentFocus = buildContentFocus(phase, contentTypePerf);
  const platformPriority = buildPlatformPriority(platformAccounts);
  const monetizationStrategy = buildMonetizationStrategy(phase, revenueDrivers);
  const audienceInsights = buildAudienceInsights(platformAccounts);

  const revenueTrend = computeRevenueTrend(revenueEvents);
  const engagementTrend = computeEngagementTrend(contentPerformance);

  // Subscriber trend: compare current total vs. stored previous total
  const existingStrategy = await getStrategy(userId);
  const previousSubscribers = existingStrategy?.audienceInsights.totalSubscribers ?? 0;
  const subscriberTrend = computeTrend(audienceInsights.totalSubscribers, previousSubscribers);

  const performanceTrends: StrategyState['performanceTrends'] = {
    engagementTrend,
    revenueTrend,
    subscriberTrend,
  };

  const strategy: StrategyState = {
    currentPhase: phase,
    contentFocus,
    platformPriority,
    monetizationStrategy,
    audienceInsights,
    performanceTrends,
  };

  // 7. Generate 7-day content calendar
  // We need to save the strategy first so generateContentCalendar can read it,
  // but we also need the calendar to save. Build the calendar directly here.
  const pool = CONTENT_POOLS[phase];
  const [minSlots, maxSlots] = SLOTS_PER_DAY[phase];
  const [vulnMin, vulnMax] = VULN_RANGE[phase];
  const [diffMin, diffMax] = DIFF_RANGE[phase];

  const calendarSlots: ContentCalendarSlot[] = [];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 1);

  for (let d = 0; d < 7; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];
    const slotCount = randInt(minSlots, maxSlots);

    for (let s = 0; s < slotCount; s++) {
      const contentType = pool[(d * maxSlots + s) % pool.length];
      const slotPlatforms =
        platformPriority.length > 1 && s > 0
          ? [platformPriority[s % platformPriority.length]]
          : [platformPriority[0] ?? 'onlyfans'];
      const baseHour = 10 + s * randInt(4, 6);
      const deadlineHour = Math.min(baseHour, 22);
      const deadlineDate = new Date(date);
      deadlineDate.setHours(deadlineHour, 0, 0, 0);

      calendarSlots.push({
        date: dateStr,
        contentType,
        platforms: slotPlatforms,
        vulnerabilityTier: randInt(vulnMin, vulnMax),
        difficulty: randInt(diffMin, diffMax),
        deadline: deadlineDate.toISOString(),
      });
    }
  }

  // 6. Save strategy + calendar to handler_strategy
  const row = strategyToRow(userId, strategy, calendarSlots);
  const { error: upsertError } = await supabase
    .from('handler_strategy')
    .upsert(row, { onConflict: 'user_id' });

  if (upsertError) {
    console.error('Error saving strategy:', upsertError);
    throw new Error(`Failed to save strategy: ${upsertError.message}`);
  }

  // 8. Generate action items
  const actionItems = generateActionItems(strategy, performanceTrends, contentTypePerf, revenueDrivers);

  // 9. Log decision to handler_decisions
  await logStrategyDecision(userId, strategy, actionItems);

  return {
    strategy,
    actionItems,
    briefsToCreate: calendarSlots,
  };
}

// ============================================
// ACTION ITEM GENERATION
// ============================================

/**
 * Produce human-readable action items based on strategy analysis.
 */
function generateActionItems(
  strategy: StrategyState,
  trends: StrategyState['performanceTrends'],
  contentPerf: ContentTypePerformance[],
  revenueDrivers: { source: string; platform: string; totalCents: number }[]
): string[] {
  const items: string[] = [];

  // Phase-based guidance
  items.push(`Current phase: ${strategy.currentPhase} - ${getPhaseDescription(strategy.currentPhase).split('.')[0]}.`);

  // Revenue trend actions
  if (trends.revenueTrend === 'down') {
    items.push('Revenue is trending down. Consider increasing PPV frequency or running a promotion.');
  } else if (trends.revenueTrend === 'up') {
    items.push('Revenue is trending up. Maintain current strategy and consider incremental price increases.');
  }

  // Engagement trend actions
  if (trends.engagementTrend === 'down') {
    items.push('Engagement is declining. Try more interactive content (polls, Q&A, behind-the-scenes).');
  }

  // Subscriber trend actions
  if (trends.subscriberTrend === 'down') {
    items.push('Subscriber count is dropping. Focus on retention: exclusive content, direct messages, loyalty rewards.');
  } else if (trends.subscriberTrend === 'up') {
    items.push('Subscriber growth is positive. Consider launching a referral incentive.');
  }

  // Top content type recommendation
  if (contentPerf.length > 0) {
    const topType = contentPerf[0];
    items.push(
      `Top performing content type: "${topType.contentType}" (avg engagement: ${topType.avgEngagement.toFixed(1)}). Prioritize this in upcoming calendar.`
    );
  }

  // Top revenue driver
  if (revenueDrivers.length > 0) {
    const topDriver = revenueDrivers[0];
    items.push(
      `Top revenue source: ${topDriver.source} on ${topDriver.platform} ($${(topDriver.totalCents / 100).toFixed(2)} last 30 days).`
    );
  }

  // Platform priority
  if (strategy.platformPriority.length > 0) {
    items.push(`Platform priority: ${strategy.platformPriority.join(' > ')}.`);
  }

  // Content frequency
  items.push(`Target content frequency: ${strategy.contentFocus.frequencyDaily} post(s) per day.`);

  // Vulnerability push
  if (strategy.contentFocus.vulnerabilityTarget >= 3) {
    items.push(`Vulnerability target is ${strategy.contentFocus.vulnerabilityTarget}/5. Continue pushing boundaries with appropriate safety checks.`);
  }

  return items;
}

// ============================================
// DECISION LOGGING
// ============================================

/**
 * Log the strategy decision to the handler_decisions table for audit.
 */
async function logStrategyDecision(
  userId: string,
  strategy: StrategyState,
  actionItems: string[]
): Promise<void> {
  const { error } = await supabase.from('handler_decisions').insert({
    user_id: userId,
    decision_type: 'strategy_evaluation',
    decision_data: {
      phase: strategy.currentPhase,
      platform_priority: strategy.platformPriority,
      content_focus: strategy.contentFocus.primaryTypes,
      vulnerability_target: strategy.contentFocus.vulnerabilityTarget,
      frequency_daily: strategy.contentFocus.frequencyDaily,
      action_items: actionItems,
      trends: strategy.performanceTrends,
    },
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Error logging strategy decision:', error);
  }
}
