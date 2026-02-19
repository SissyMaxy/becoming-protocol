/**
 * Fan Memory System — Sprint 5
 * Build fan profiles from interaction history, whale detection.
 * The Handler remembers every fan. Fans feel personally known.
 * This drives retention, tips, and emotional investment.
 */

import { supabase } from '../supabase';

// ============================================
// Types
// ============================================

export interface FanProfile {
  id: string;
  userId: string;
  platform: string;
  username: string;
  displayName: string | null;
  engagementScore: number;
  totalSpentCents: number;
  messageCount: number;
  tipCount: number;
  fanTier: string;
  notes: string | null;
  lastInteractionAt: string | null;
  // Memory extension fields (from 083)
  fanPreferences: Record<string, unknown>;
  triggerContent: string | null;
  communicationStyle: string | null;
  personalDetailsShared: Record<string, unknown>;
  engagementPattern: string | null;
  whaleStatus: boolean;
  handlerRelationshipNotes: string | null;
}

interface FanInteractionSummary {
  totalFans: number;
  whaleCount: number;
  totalRevenueCents: number;
  avgEngagementScore: number;
  recentlyActive: number; // interacted in last 7 days
  topFans: FanProfile[];
}

const WHALE_THRESHOLD_CENTS = 5000; // $50

// ============================================
// Fan Profile CRUD
// ============================================

/**
 * Get or create a fan profile for an interaction.
 */
export async function getOrCreateFanProfile(
  userId: string,
  platform: string,
  username: string,
): Promise<FanProfile | null> {
  // Try to find existing
  const { data: existing } = await supabase
    .from('fan_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('username', username)
    .maybeSingle();

  if (existing) return mapFanProfile(existing);

  // Create new
  const { data: created, error } = await supabase
    .from('fan_profiles')
    .insert({
      user_id: userId,
      platform,
      username,
      engagement_score: 1,
      total_spent_cents: 0,
      message_count: 0,
      tip_count: 0,
      fan_tier: 'casual',
      fan_preferences: {},
      personal_details_shared: {},
      whale_status: false,
    })
    .select()
    .single();

  if (error || !created) {
    console.error('Failed to create fan profile:', error);
    return null;
  }

  return mapFanProfile(created);
}

/**
 * Update fan memory with new interaction data.
 */
export async function updateFanMemory(
  userId: string,
  fanId: string,
  update: Partial<{
    preferences: Record<string, unknown>;
    triggerContent: string;
    communicationStyle: string;
    personalDetails: Record<string, unknown>;
    engagementPattern: string;
    handlerNotes: string;
  }>,
): Promise<void> {
  const patch: Record<string, unknown> = {};

  if (update.preferences) patch.fan_preferences = update.preferences;
  if (update.triggerContent) patch.trigger_content = update.triggerContent;
  if (update.communicationStyle) patch.communication_style = update.communicationStyle;
  if (update.personalDetails) patch.personal_details_shared = update.personalDetails;
  if (update.engagementPattern) patch.engagement_pattern = update.engagementPattern;
  if (update.handlerNotes) patch.handler_relationship_notes = update.handlerNotes;
  patch.updated_at = new Date().toISOString();

  await supabase
    .from('fan_profiles')
    .update(patch)
    .eq('id', fanId)
    .eq('user_id', userId);
}

/**
 * Record a fan interaction (message, tip, comment, etc.)
 */
export async function recordFanInteraction(
  userId: string,
  fanId: string,
  interaction: {
    type: 'message' | 'tip' | 'comment' | 'subscribe' | 'purchase';
    amountCents?: number;
  },
): Promise<void> {
  // Get current profile
  const { data: profile } = await supabase
    .from('fan_profiles')
    .select('message_count, tip_count, total_spent_cents, engagement_score')
    .eq('id', fanId)
    .eq('user_id', userId)
    .single();

  if (!profile) return;

  const patch: Record<string, unknown> = {
    last_interaction_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (interaction.type === 'message') {
    patch.message_count = (profile.message_count ?? 0) + 1;
    patch.engagement_score = Math.min(100, (profile.engagement_score ?? 0) + 1);
  }

  if (interaction.type === 'tip' || interaction.type === 'purchase') {
    patch.tip_count = (profile.tip_count ?? 0) + 1;
    const newTotal = (profile.total_spent_cents ?? 0) + (interaction.amountCents ?? 0);
    patch.total_spent_cents = newTotal;
    patch.engagement_score = Math.min(100, (profile.engagement_score ?? 0) + 5);

    // Whale detection
    if (newTotal >= WHALE_THRESHOLD_CENTS) {
      patch.whale_status = true;
      patch.fan_tier = 'whale';
    }
  }

  if (interaction.type === 'subscribe') {
    patch.engagement_score = Math.min(100, (profile.engagement_score ?? 0) + 10);
    patch.fan_tier = 'supporter';
  }

  if (interaction.type === 'comment') {
    patch.engagement_score = Math.min(100, (profile.engagement_score ?? 0) + 2);
  }

  // Auto-tier upgrade based on engagement score
  const newScore = (patch.engagement_score ?? profile.engagement_score ?? 0) as number;
  if (!patch.fan_tier) {
    if (newScore >= 50) patch.fan_tier = 'supporter';
    else if (newScore >= 20) patch.fan_tier = 'regular';
  }

  await supabase
    .from('fan_profiles')
    .update(patch)
    .eq('id', fanId)
    .eq('user_id', userId);
}

// ============================================
// Whale Detection & Management
// ============================================

/**
 * Get all whale fans.
 */
export async function getWhales(userId: string): Promise<FanProfile[]> {
  const { data, error } = await supabase
    .from('fan_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('whale_status', true)
    .order('total_spent_cents', { ascending: false });

  if (error || !data) return [];
  return data.map(mapFanProfile);
}

/**
 * Get fans who need Handler attention (inactive whales, new big spenders).
 */
export async function getFansNeedingAttention(userId: string): Promise<FanProfile[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Whales who haven't interacted in 7+ days
  const { data: inactiveWhales } = await supabase
    .from('fan_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('whale_status', true)
    .lt('last_interaction_at', sevenDaysAgo);

  // High-value fans (supporter+) who haven't interacted in 7+ days
  const { data: inactiveSupport } = await supabase
    .from('fan_profiles')
    .select('*')
    .eq('user_id', userId)
    .in('fan_tier', ['supporter', 'whale'])
    .lt('last_interaction_at', sevenDaysAgo);

  const all = [...(inactiveWhales ?? []), ...(inactiveSupport ?? [])];
  // Deduplicate by id
  const seen = new Set<string>();
  const unique = all.filter(f => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  return unique.map(mapFanProfile);
}

// ============================================
// Queries
// ============================================

/**
 * Get top fans by engagement score.
 */
export async function getTopFans(
  userId: string,
  limit = 10,
): Promise<FanProfile[]> {
  const { data, error } = await supabase
    .from('fan_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('engagement_score', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map(mapFanProfile);
}

/**
 * Get a fan interaction summary for Handler context.
 */
export async function getFanInteractionSummary(
  userId: string,
): Promise<FanInteractionSummary> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [totalResult, whaleResult, recentResult, topResult] = await Promise.allSettled([
    supabase
      .from('fan_profiles')
      .select('total_spent_cents, engagement_score', { count: 'exact', head: false })
      .eq('user_id', userId),
    supabase
      .from('fan_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('whale_status', true),
    supabase
      .from('fan_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('last_interaction_at', sevenDaysAgo),
    getTopFans(userId, 5),
  ]);

  const allFans = totalResult.status === 'fulfilled' ? totalResult.value : null;
  const whales = whaleResult.status === 'fulfilled' ? whaleResult.value : null;
  const recent = recentResult.status === 'fulfilled' ? recentResult.value : null;
  const topFans = topResult.status === 'fulfilled' ? topResult.value : [];

  const fanData = allFans?.data ?? [];
  const totalRevenue = fanData.reduce(
    (sum: number, f: { total_spent_cents: number }) => sum + (f.total_spent_cents ?? 0),
    0,
  );
  const avgEngagement =
    fanData.length > 0
      ? fanData.reduce(
          (sum: number, f: { engagement_score: number }) => sum + (f.engagement_score ?? 0),
          0,
        ) / fanData.length
      : 0;

  return {
    totalFans: allFans?.count ?? fanData.length,
    whaleCount: whales?.count ?? 0,
    totalRevenueCents: totalRevenue,
    avgEngagementScore: Math.round(avgEngagement * 10) / 10,
    recentlyActive: recent?.count ?? 0,
    topFans,
  };
}

/**
 * Build a fan context prompt for Handler AI DM responses.
 */
export function buildFanDmContext(fan: FanProfile): string {
  const parts = [
    `FAN: ${fan.username} (${fan.platform})`,
    `  tier: ${fan.fanTier}, engagement: ${fan.engagementScore}, spent: $${(fan.totalSpentCents / 100).toFixed(2)}`,
  ];

  if (fan.communicationStyle) {
    parts.push(`  style: ${fan.communicationStyle}`);
  }
  if (fan.triggerContent) {
    parts.push(`  responds to: ${fan.triggerContent}`);
  }
  if (fan.engagementPattern) {
    parts.push(`  pattern: ${fan.engagementPattern}`);
  }
  if (fan.whaleStatus) {
    parts.push('  *** WHALE — prioritize, personalize, retain ***');
  }
  if (fan.handlerRelationshipNotes) {
    parts.push(`  notes: ${fan.handlerRelationshipNotes}`);
  }

  return parts.join('\n');
}

/**
 * Build summary context for Handler systems context.
 */
export async function buildFanMemoryContext(userId: string): Promise<string> {
  try {
    const summary = await getFanInteractionSummary(userId);
    if (summary.totalFans === 0) return '';

    const parts = [
      `FANS: ${summary.totalFans} tracked, ${summary.recentlyActive} active (7d), ${summary.whaleCount} whales`,
      `  revenue: $${(summary.totalRevenueCents / 100).toFixed(0)}, avg engagement: ${summary.avgEngagementScore}`,
    ];

    if (summary.topFans.length > 0) {
      const top = summary.topFans
        .slice(0, 3)
        .map(f => `${f.username}(${f.fanTier})`)
        .join(', ');
      parts.push(`  top: ${top}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// Mapper
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFanProfile(row: any): FanProfile {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform,
    username: row.username,
    displayName: row.display_name,
    engagementScore: row.engagement_score ?? 0,
    totalSpentCents: row.total_spent_cents ?? 0,
    messageCount: row.message_count ?? 0,
    tipCount: row.tip_count ?? 0,
    fanTier: row.fan_tier ?? 'casual',
    notes: row.notes,
    lastInteractionAt: row.last_interaction_at,
    fanPreferences: row.fan_preferences ?? {},
    triggerContent: row.trigger_content,
    communicationStyle: row.communication_style,
    personalDetailsShared: row.personal_details_shared ?? {},
    engagementPattern: row.engagement_pattern,
    whaleStatus: row.whale_status ?? false,
    handlerRelationshipNotes: row.handler_relationship_notes,
  };
}
