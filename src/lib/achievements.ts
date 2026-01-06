// Achievement checking and awarding

import { supabase } from './supabase';
import { addPoints } from './rewards';
import type {
  Achievement,
  DbAchievement,
  UserAchievement,
  DbUserAchievement,
  AchievementCheckContext,
  AchievementCondition,
} from '../types/rewards';
import { ACHIEVEMENT_POINTS } from '../types/rewards';

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

function mapDbToAchievement(db: DbAchievement): Achievement {
  return {
    id: db.id,
    name: db.name,
    description: db.description,
    icon: db.icon,
    rarity: db.rarity as Achievement['rarity'],
    category: db.category as Achievement['category'],
    points: db.points,
    unlockCondition: db.unlock_condition as unknown as AchievementCondition,
    isHidden: db.is_hidden,
    createdAt: db.created_at,
  };
}

function mapDbToUserAchievement(db: DbUserAchievement, achievement?: Achievement): UserAchievement {
  return {
    id: db.id,
    userId: db.user_id,
    achievementId: db.achievement_id,
    achievement,
    unlockedAt: db.unlocked_at,
    pointsAwarded: db.points_awarded,
  };
}

// ============================================
// CRUD OPERATIONS
// ============================================

/**
 * Get all available achievements
 */
export async function getAchievements(): Promise<Achievement[]> {
  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .order('rarity', { ascending: true });

  if (error) {
    console.error('Failed to get achievements:', error);
    throw error;
  }

  return (data as DbAchievement[]).map(mapDbToAchievement);
}

/**
 * Get achievements the user has unlocked
 */
export async function getUserAchievements(): Promise<UserAchievement[]> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('user_achievements')
    .select(`
      *,
      achievements (*)
    `)
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false });

  if (error) {
    console.error('Failed to get user achievements:', error);
    throw error;
  }

  return (data || []).map((row: any) => {
    const achievement = row.achievements
      ? mapDbToAchievement(row.achievements as DbAchievement)
      : undefined;
    return mapDbToUserAchievement(row as DbUserAchievement, achievement);
  });
}

/**
 * Get achievement by ID
 */
export async function getAchievementById(achievementId: string): Promise<Achievement | null> {
  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .eq('id', achievementId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Failed to get achievement:', error);
    throw error;
  }

  return mapDbToAchievement(data as DbAchievement);
}

// ============================================
// CONDITION EVALUATION
// ============================================

/**
 * Evaluate if an achievement condition is met
 */
function evaluateCondition(
  condition: AchievementCondition,
  context: AchievementCheckContext
): boolean {
  const { type, value } = condition;

  switch (type) {
    case 'streak':
      return (context.streak || 0) >= value;

    case 'level':
      return (context.level || 1) >= value;

    case 'sessions':
      return (context.totalSessions || 0) >= value;

    case 'narration_count':
      return (context.narrationCount || 0) >= value;

    case 'anchors':
      return (context.anchorsCount || 0) >= value;

    case 'total_points':
      return (context.totalPoints || 0) >= value;

    case 'investment':
      return (context.totalInvested || 0) >= value;

    default:
      console.warn(`Unknown achievement condition type: ${type}`);
      return false;
  }
}

// ============================================
// ACHIEVEMENT AWARDING
// ============================================

/**
 * Check all achievements and award any newly unlocked ones
 * Returns array of newly unlocked achievements
 */
export async function checkAndAwardAchievements(
  context: AchievementCheckContext
): Promise<UserAchievement[]> {
  const userId = await getAuthUserId();

  // Get all achievements
  const allAchievements = await getAchievements();

  // Get user's existing achievements
  const { data: existing, error: existingError } = await supabase
    .from('user_achievements')
    .select('achievement_id')
    .eq('user_id', userId);

  if (existingError) {
    console.error('Failed to get existing achievements:', existingError);
    throw existingError;
  }

  const existingIds = new Set((existing || []).map(e => e.achievement_id));

  // Check each unearned achievement
  const newlyUnlocked: UserAchievement[] = [];

  for (const achievement of allAchievements) {
    // Skip if already earned
    if (existingIds.has(achievement.id)) continue;

    // Check if condition is met
    const unlocked = evaluateCondition(achievement.unlockCondition, context);

    if (unlocked) {
      const points = ACHIEVEMENT_POINTS[achievement.rarity];

      // Insert user achievement
      const { data: userAchievement, error: insertError } = await supabase
        .from('user_achievements')
        .insert({
          user_id: userId,
          achievement_id: achievement.id,
          points_awarded: points,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to award achievement:', insertError);
        continue; // Don't throw, try to award others
      }

      // Award points (this handles level-up checks too)
      await addPoints(points, 'achievement', achievement.id, {
        name: achievement.name,
        rarity: achievement.rarity,
      });

      newlyUnlocked.push(
        mapDbToUserAchievement(userAchievement as DbUserAchievement, achievement)
      );
    }
  }

  return newlyUnlocked;
}

/**
 * Award a specific achievement by ID
 * Use for special/hidden achievements that don't use standard conditions
 */
export async function awardAchievement(achievementId: string): Promise<UserAchievement | null> {
  const userId = await getAuthUserId();

  // Check if already earned
  const { data: existing } = await supabase
    .from('user_achievements')
    .select('id')
    .eq('user_id', userId)
    .eq('achievement_id', achievementId)
    .single();

  if (existing) {
    // Already earned
    return null;
  }

  // Get achievement details
  const achievement = await getAchievementById(achievementId);
  if (!achievement) {
    console.error('Achievement not found:', achievementId);
    return null;
  }

  const points = ACHIEVEMENT_POINTS[achievement.rarity];

  // Insert user achievement
  const { data: userAchievement, error } = await supabase
    .from('user_achievements')
    .insert({
      user_id: userId,
      achievement_id: achievementId,
      points_awarded: points,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to award achievement:', error);
    throw error;
  }

  // Award points
  await addPoints(points, 'achievement', achievementId, {
    name: achievement.name,
    rarity: achievement.rarity,
  });

  return mapDbToUserAchievement(userAchievement as DbUserAchievement, achievement);
}

// ============================================
// STATS & DISPLAY
// ============================================

/**
 * Get achievement progress stats
 */
export async function getAchievementStats(): Promise<{
  total: number;
  unlocked: number;
  byRarity: Record<string, { total: number; unlocked: number }>;
  totalPointsEarned: number;
}> {
  const allAchievements = await getAchievements();
  const userAchievements = await getUserAchievements();

  const unlockedIds = new Set(userAchievements.map(ua => ua.achievementId));

  const byRarity: Record<string, { total: number; unlocked: number }> = {
    common: { total: 0, unlocked: 0 },
    uncommon: { total: 0, unlocked: 0 },
    rare: { total: 0, unlocked: 0 },
    epic: { total: 0, unlocked: 0 },
    legendary: { total: 0, unlocked: 0 },
  };

  for (const achievement of allAchievements) {
    byRarity[achievement.rarity].total++;
    if (unlockedIds.has(achievement.id)) {
      byRarity[achievement.rarity].unlocked++;
    }
  }

  const totalPointsEarned = userAchievements.reduce(
    (sum, ua) => sum + ua.pointsAwarded,
    0
  );

  return {
    total: allAchievements.length,
    unlocked: userAchievements.length,
    byRarity,
    totalPointsEarned,
  };
}

/**
 * Get visible achievements for display (hides locked hidden achievements)
 */
export async function getVisibleAchievements(): Promise<{
  unlocked: Achievement[];
  locked: Achievement[];
}> {
  const allAchievements = await getAchievements();
  const userAchievements = await getUserAchievements();

  const unlockedIds = new Set(userAchievements.map(ua => ua.achievementId));

  const unlocked: Achievement[] = [];
  const locked: Achievement[] = [];

  for (const achievement of allAchievements) {
    if (unlockedIds.has(achievement.id)) {
      unlocked.push(achievement);
    } else if (!achievement.isHidden) {
      // Only show locked achievements that aren't hidden
      locked.push(achievement);
    }
  }

  return { unlocked, locked };
}
