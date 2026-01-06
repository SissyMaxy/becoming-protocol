// Content library management

import { supabase } from './supabase';
import type {
  RewardContent,
  DbRewardContent,
  UserContentUnlock,
  DbUserContentUnlock,
  ContentType,
  ContentTier,
  ContentUnlockRequirement,
} from '../types/rewards';

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getAuthUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  return user.id;
}

// ============================================
// MAPPERS
// ============================================

function mapDbToContent(db: DbRewardContent): RewardContent {
  return {
    id: db.id,
    title: db.title,
    description: db.description || undefined,
    contentType: db.content_type as ContentType,
    tier: db.tier as ContentTier,
    contentUrl: db.content_url || undefined,
    thumbnailUrl: db.thumbnail_url || undefined,
    durationSeconds: db.duration_seconds || undefined,
    unlockRequirement: db.unlock_requirement as unknown as ContentUnlockRequirement | undefined,
    tags: db.tags || [],
    intensityLevel: db.intensity_level || undefined,
    isActive: db.is_active,
    createdAt: db.created_at,
  };
}

function mapDbToContentUnlock(db: DbUserContentUnlock, content?: RewardContent): UserContentUnlock {
  return {
    id: db.id,
    userId: db.user_id,
    contentId: db.content_id,
    content,
    unlockedAt: db.unlocked_at,
    unlockSource: db.unlock_source || undefined,
    timesPlayed: db.times_played,
    lastPlayedAt: db.last_played_at || undefined,
  };
}

// ============================================
// CONTENT LIBRARY
// ============================================

/**
 * Get all active content in the library
 */
export async function getContentLibrary(options?: {
  tier?: ContentTier;
  contentType?: ContentType;
  tags?: string[];
}): Promise<RewardContent[]> {
  let query = supabase
    .from('reward_content')
    .select('*')
    .eq('is_active', true)
    .order('tier', { ascending: true })
    .order('created_at', { ascending: false });

  if (options?.tier) {
    query = query.eq('tier', options.tier);
  }

  if (options?.contentType) {
    query = query.eq('content_type', options.contentType);
  }

  if (options?.tags && options.tags.length > 0) {
    query = query.overlaps('tags', options.tags);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to get content library:', error);
    throw error;
  }

  return (data as DbRewardContent[]).map(mapDbToContent);
}

/**
 * Get content by ID
 */
export async function getContentById(contentId: string): Promise<RewardContent | null> {
  const { data, error } = await supabase
    .from('reward_content')
    .select('*')
    .eq('id', contentId)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Failed to get content:', error);
    throw error;
  }

  return mapDbToContent(data as DbRewardContent);
}

/**
 * Get daily tier content (always available)
 */
export async function getDailyContent(): Promise<RewardContent[]> {
  return getContentLibrary({ tier: 'daily' });
}

// ============================================
// USER UNLOCKS
// ============================================

/**
 * Get all content the user has unlocked
 */
export async function getUserUnlocks(): Promise<UserContentUnlock[]> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('user_content_unlocks')
    .select(`
      *,
      reward_content (*)
    `)
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false });

  if (error) {
    console.error('Failed to get user unlocks:', error);
    throw error;
  }

  return (data || []).map((row: any) => {
    const content = row.reward_content
      ? mapDbToContent(row.reward_content as DbRewardContent)
      : undefined;
    return mapDbToContentUnlock(row as DbUserContentUnlock, content);
  });
}

/**
 * Check if user has unlocked specific content
 */
export async function hasUnlockedContent(contentId: string): Promise<boolean> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('user_content_unlocks')
    .select('id')
    .eq('user_id', userId)
    .eq('content_id', contentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return false;
    console.error('Failed to check content unlock:', error);
    throw error;
  }

  return !!data;
}

/**
 * Check if user can access content (tier check + unlock check)
 */
export async function canAccessContent(contentId: string): Promise<{
  canAccess: boolean;
  reason?: string;
}> {
  const content = await getContentById(contentId);
  if (!content) {
    return { canAccess: false, reason: 'Content not found' };
  }

  // Daily tier is always accessible
  if (content.tier === 'daily') {
    return { canAccess: true };
  }

  // Check if user has unlocked this specific content
  const unlocked = await hasUnlockedContent(contentId);
  if (unlocked) {
    return { canAccess: true };
  }

  // Not unlocked
  return {
    canAccess: false,
    reason: `Requires unlock (${content.tier} tier)`,
  };
}

/**
 * Unlock content for the user
 */
export async function unlockContent(
  contentId: string,
  source: string
): Promise<UserContentUnlock> {
  const userId = await getAuthUserId();

  // Check if already unlocked
  const existing = await hasUnlockedContent(contentId);
  if (existing) {
    throw new Error('Content already unlocked');
  }

  const { data, error } = await supabase
    .from('user_content_unlocks')
    .insert({
      user_id: userId,
      content_id: contentId,
      unlock_source: source,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to unlock content:', error);
    throw error;
  }

  const content = await getContentById(contentId);
  return mapDbToContentUnlock(data as DbUserContentUnlock, content || undefined);
}

/**
 * Record content playback
 */
export async function recordContentPlay(contentId: string): Promise<void> {
  const userId = await getAuthUserId();

  // Update play count and last played
  const { error } = await supabase
    .from('user_content_unlocks')
    .update({
      times_played: supabase.rpc('increment', { x: 1 }),
      last_played_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('content_id', contentId);

  if (error) {
    console.error('Failed to record content play:', error);
    // Don't throw - this shouldn't block playback
  }
}

// ============================================
// CONTENT RECOMMENDATIONS
// ============================================

/**
 * Get recommended content for user (based on tier access)
 */
export async function getRecommendedContent(limit = 5): Promise<RewardContent[]> {
  await getAuthUserId(); // Validate auth but userId not currently needed

  // Get user's unlocks
  const unlocks = await getUserUnlocks();
  const unlockedIds = new Set(unlocks.map(u => u.contentId));

  // Get all daily content (always accessible)
  const dailyContent = await getDailyContent();

  // Get earned content the user has unlocked
  const earnedContent = unlocks
    .filter(u => u.content && u.content.tier === 'earned')
    .map(u => u.content!)
    .filter(c => !unlockedIds.has(c.id)); // Remove already played

  // Combine and shuffle
  const available = [...dailyContent, ...earnedContent];

  // Shuffle and limit
  const shuffled = available.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

/**
 * Get content by tags (for session content selection)
 */
export async function getContentByTags(
  tags: string[],
  options?: {
    tier?: ContentTier;
    contentType?: ContentType;
    limit?: number;
  }
): Promise<RewardContent[]> {
  let query = supabase
    .from('reward_content')
    .select('*')
    .eq('is_active', true)
    .overlaps('tags', tags);

  if (options?.tier) {
    query = query.eq('tier', options.tier);
  }

  if (options?.contentType) {
    query = query.eq('content_type', options.contentType);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to get content by tags:', error);
    throw error;
  }

  return (data as DbRewardContent[]).map(mapDbToContent);
}

// ============================================
// CONTENT STATS
// ============================================

/**
 * Get content library stats
 */
export async function getContentStats(): Promise<{
  totalContent: number;
  byTier: Record<ContentTier, number>;
  byType: Record<ContentType, number>;
  userUnlocked: number;
  totalPlaytime: number;
}> {
  const allContent = await getContentLibrary();
  const unlocks = await getUserUnlocks();

  const byTier: Record<string, number> = {
    daily: 0,
    earned: 0,
    premium: 0,
    vault: 0,
  };

  const byType: Record<string, number> = {
    audio: 0,
    text: 0,
    video: 0,
    image: 0,
    hypno: 0,
  };

  for (const content of allContent) {
    byTier[content.tier]++;
    byType[content.contentType]++;
  }

  // Calculate total playtime from unlocks
  const totalPlaytime = unlocks.reduce((sum, u) => {
    if (u.content?.durationSeconds && u.timesPlayed > 0) {
      return sum + (u.content.durationSeconds * u.timesPlayed);
    }
    return sum;
  }, 0);

  return {
    totalContent: allContent.length,
    byTier: byTier as Record<ContentTier, number>,
    byType: byType as Record<ContentType, number>,
    userUnlocked: unlocks.length,
    totalPlaytime,
  };
}

/**
 * Get user's most played content
 */
export async function getMostPlayedContent(limit = 5): Promise<UserContentUnlock[]> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('user_content_unlocks')
    .select(`
      *,
      reward_content (*)
    `)
    .eq('user_id', userId)
    .gt('times_played', 0)
    .order('times_played', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get most played content:', error);
    throw error;
  }

  return (data || []).map((row: any) => {
    const content = row.reward_content
      ? mapDbToContent(row.reward_content as DbRewardContent)
      : undefined;
    return mapDbToContentUnlock(row as DbUserContentUnlock, content);
  });
}
