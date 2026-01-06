// Anchor management

import { supabase } from './supabase';
import type {
  UserAnchor,
  DbUserAnchor,
  AnchorType,
  AnchorInput,
  AnchorEffectivenessLog,
  DbAnchorEffectivenessLog,
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

function mapDbToAnchor(db: DbUserAnchor): UserAnchor {
  return {
    id: db.id,
    userId: db.user_id,
    anchorType: db.anchor_type as AnchorType,
    name: db.name,
    isActive: db.is_active,
    effectivenessRating: db.effectiveness_rating || undefined,
    timesUsed: db.times_used,
    lastUsedAt: db.last_used_at || undefined,
    notes: db.notes || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function mapDbToEffectivenessLog(db: DbAnchorEffectivenessLog): AnchorEffectivenessLog {
  return {
    id: db.id,
    userId: db.user_id,
    anchorId: db.anchor_id,
    sessionId: db.session_id || undefined,
    effectivenessRating: db.effectiveness_rating,
    arousalChange: db.arousal_change,
    recordedAt: db.recorded_at,
  };
}

// ============================================
// CRUD OPERATIONS
// ============================================

/**
 * Get all anchors for the current user
 */
export async function getAnchors(): Promise<UserAnchor[]> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('user_anchors')
    .select('*')
    .eq('user_id', userId)
    .order('is_active', { ascending: false })
    .order('times_used', { ascending: false });

  if (error) {
    console.error('Failed to get anchors:', error);
    throw error;
  }

  return (data as DbUserAnchor[]).map(mapDbToAnchor);
}

/**
 * Get only active anchors
 */
export async function getActiveAnchors(): Promise<UserAnchor[]> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('user_anchors')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('times_used', { ascending: false });

  if (error) {
    console.error('Failed to get active anchors:', error);
    throw error;
  }

  return (data as DbUserAnchor[]).map(mapDbToAnchor);
}

/**
 * Get anchor by ID
 */
export async function getAnchorById(anchorId: string): Promise<UserAnchor | null> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('user_anchors')
    .select('*')
    .eq('id', anchorId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Failed to get anchor:', error);
    throw error;
  }

  return mapDbToAnchor(data as DbUserAnchor);
}

/**
 * Add a new anchor
 */
export async function addAnchor(input: AnchorInput): Promise<UserAnchor> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('user_anchors')
    .insert({
      user_id: userId,
      anchor_type: input.anchorType,
      name: input.name,
      notes: input.notes || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to add anchor:', error);
    throw error;
  }

  return mapDbToAnchor(data as DbUserAnchor);
}

/**
 * Update anchor name/notes
 */
export async function updateAnchor(
  anchorId: string,
  updates: { name?: string; notes?: string }
): Promise<UserAnchor> {
  const userId = await getAuthUserId();

  const updateData: Partial<DbUserAnchor> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }
  if (updates.notes !== undefined) {
    updateData.notes = updates.notes || null;
  }

  const { data, error } = await supabase
    .from('user_anchors')
    .update(updateData)
    .eq('id', anchorId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update anchor:', error);
    throw error;
  }

  return mapDbToAnchor(data as DbUserAnchor);
}

/**
 * Toggle anchor active status
 */
export async function toggleAnchor(anchorId: string, isActive: boolean): Promise<void> {
  const userId = await getAuthUserId();

  const { error } = await supabase
    .from('user_anchors')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', anchorId)
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to toggle anchor:', error);
    throw error;
  }
}

/**
 * Update anchor effectiveness rating
 */
export async function updateAnchorEffectiveness(
  anchorId: string,
  rating: number
): Promise<void> {
  const userId = await getAuthUserId();

  if (rating < 1 || rating > 5) {
    throw new Error('Effectiveness rating must be between 1 and 5');
  }

  const { error } = await supabase
    .from('user_anchors')
    .update({
      effectiveness_rating: rating,
      updated_at: new Date().toISOString(),
    })
    .eq('id', anchorId)
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update anchor effectiveness:', error);
    throw error;
  }
}

/**
 * Delete an anchor
 */
export async function deleteAnchor(anchorId: string): Promise<void> {
  const userId = await getAuthUserId();

  const { error } = await supabase
    .from('user_anchors')
    .delete()
    .eq('id', anchorId)
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to delete anchor:', error);
    throw error;
  }
}

// ============================================
// EFFECTIVENESS TRACKING
// ============================================

/**
 * Get effectiveness history for an anchor
 */
export async function getAnchorEffectivenessHistory(
  anchorId: string,
  limit = 20
): Promise<AnchorEffectivenessLog[]> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('anchor_effectiveness_log')
    .select('*')
    .eq('user_id', userId)
    .eq('anchor_id', anchorId)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get anchor effectiveness history:', error);
    throw error;
  }

  return (data as DbAnchorEffectivenessLog[]).map(mapDbToEffectivenessLog);
}

/**
 * Get average effectiveness for an anchor
 */
export async function getAnchorAverageEffectiveness(anchorId: string): Promise<{
  averageRating: number;
  averageArousalChange: number;
  usageCount: number;
}> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('anchor_effectiveness_log')
    .select('effectiveness_rating, arousal_change')
    .eq('user_id', userId)
    .eq('anchor_id', anchorId);

  if (error) {
    console.error('Failed to get anchor average effectiveness:', error);
    throw error;
  }

  const logs = data || [];
  if (logs.length === 0) {
    return { averageRating: 0, averageArousalChange: 0, usageCount: 0 };
  }

  const ratingSum = logs.reduce((sum, l) => sum + l.effectiveness_rating, 0);
  const arousalSum = logs.reduce((sum, l) => sum + l.arousal_change, 0);

  return {
    averageRating: ratingSum / logs.length,
    averageArousalChange: arousalSum / logs.length,
    usageCount: logs.length,
  };
}

// ============================================
// STATS & DISPLAY
// ============================================

/**
 * Get anchor stats for display
 */
export async function getAnchorStats(): Promise<{
  totalAnchors: number;
  activeAnchors: number;
  byType: Record<AnchorType, number>;
  mostUsed: UserAnchor | null;
  mostEffective: UserAnchor | null;
}> {
  const anchors = await getAnchors();

  const byType: Record<string, number> = {
    scent: 0,
    underwear: 0,
    tucking: 0,
    jewelry: 0,
    nail_polish: 0,
    makeup: 0,
    clothing: 0,
    custom: 0,
  };

  for (const anchor of anchors) {
    byType[anchor.anchorType]++;
  }

  // Find most used
  const activeAnchors = anchors.filter(a => a.isActive);
  const mostUsed = activeAnchors.length > 0
    ? activeAnchors.reduce((a, b) => (a.timesUsed > b.timesUsed ? a : b))
    : null;

  // Find most effective (with rating)
  const ratedAnchors = anchors.filter(a => a.effectivenessRating !== undefined);
  const mostEffective = ratedAnchors.length > 0
    ? ratedAnchors.reduce((a, b) =>
        (a.effectivenessRating || 0) > (b.effectivenessRating || 0) ? a : b
      )
    : null;

  return {
    totalAnchors: anchors.length,
    activeAnchors: activeAnchors.length,
    byType: byType as Record<AnchorType, number>,
    mostUsed,
    mostEffective,
  };
}

/**
 * Get anchors grouped by type for display
 */
export async function getAnchorsByType(): Promise<Record<AnchorType, UserAnchor[]>> {
  const anchors = await getAnchors();

  const byType: Record<string, UserAnchor[]> = {
    scent: [],
    underwear: [],
    tucking: [],
    jewelry: [],
    nail_polish: [],
    makeup: [],
    clothing: [],
    custom: [],
  };

  for (const anchor of anchors) {
    byType[anchor.anchorType].push(anchor);
  }

  return byType as Record<AnchorType, UserAnchor[]>;
}
