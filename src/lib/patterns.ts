/**
 * Pattern Catch System Library
 *
 * Database functions for managing masculine patterns and catch instances.
 */

import { supabase } from './supabase';
import { pushPatternCatch, getNotificationManager } from './notifications';
import type {
  MasculinePattern,
  PatternCatch,
  PatternStats,
  PatternCategory,
  PatternStatus,
} from '../types/patterns';

// Transform database row to MasculinePattern
function toPattern(row: Record<string, unknown>): MasculinePattern {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    category: row.category as PatternCategory,
    patternName: row.pattern_name as string,
    description: row.description as string | null,
    firstIdentified: row.first_identified as string,
    timesCaught: row.times_caught as number,
    timesCorrected: row.times_corrected as number,
    status: row.status as PatternStatus,
    feminineReplacement: row.feminine_replacement as string | null,
    replacementAutomaticity: row.replacement_automaticity as number,
  };
}

// Transform database row to PatternCatch
function toCatch(row: Record<string, unknown>): PatternCatch {
  return {
    id: row.id as string,
    patternId: row.pattern_id as string,
    userId: row.user_id as string,
    caughtAt: row.caught_at as string,
    context: row.context as string | null,
    triggerCause: row.trigger_cause as string | null,
    correctionApplied: row.correction_applied as boolean,
    correctionSuccess: row.correction_success as boolean | null,
  };
}

/**
 * Get all patterns for a user
 */
export async function getPatterns(userId: string): Promise<MasculinePattern[]> {
  const { data, error } = await supabase
    .from('masculine_patterns')
    .select('*')
    .eq('user_id', userId)
    .order('first_identified', { ascending: false });

  if (error) {
    console.error('Error fetching patterns:', error);
    return [];
  }

  return (data || []).map(toPattern);
}

/**
 * Get patterns filtered by status
 */
export async function getPatternsByStatus(
  userId: string,
  status: PatternStatus
): Promise<MasculinePattern[]> {
  const { data, error } = await supabase
    .from('masculine_patterns')
    .select('*')
    .eq('user_id', userId)
    .eq('status', status)
    .order('times_caught', { ascending: false });

  if (error) {
    console.error('Error fetching patterns by status:', error);
    return [];
  }

  return (data || []).map(toPattern);
}

/**
 * Get a single pattern by ID
 */
export async function getPattern(patternId: string): Promise<MasculinePattern | null> {
  const { data, error } = await supabase
    .from('masculine_patterns')
    .select('*')
    .eq('id', patternId)
    .single();

  if (error) {
    console.error('Error fetching pattern:', error);
    return null;
  }

  return data ? toPattern(data) : null;
}

/**
 * Create a new pattern
 */
export async function createPattern(
  userId: string,
  data: {
    category: PatternCategory;
    patternName: string;
    description?: string;
    feminineReplacement?: string;
    replacementAutomaticity?: number;
  }
): Promise<MasculinePattern | null> {
  const { data: result, error } = await supabase
    .from('masculine_patterns')
    .insert({
      user_id: userId,
      category: data.category,
      pattern_name: data.patternName,
      description: data.description || null,
      feminine_replacement: data.feminineReplacement || null,
      replacement_automaticity: data.replacementAutomaticity || 0,
      status: 'active',
      times_caught: 0,
      times_corrected: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating pattern:', error);
    return null;
  }

  return result ? toPattern(result) : null;
}

/**
 * Update a pattern
 */
export async function updatePattern(
  patternId: string,
  updates: Partial<{
    patternName: string;
    description: string | null;
    status: PatternStatus;
    feminineReplacement: string | null;
    replacementAutomaticity: number;
  }>
): Promise<boolean> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.patternName !== undefined) dbUpdates.pattern_name = updates.patternName;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.feminineReplacement !== undefined) dbUpdates.feminine_replacement = updates.feminineReplacement;
  if (updates.replacementAutomaticity !== undefined) dbUpdates.replacement_automaticity = updates.replacementAutomaticity;

  const { error } = await supabase
    .from('masculine_patterns')
    .update(dbUpdates)
    .eq('id', patternId);

  if (error) {
    console.error('Error updating pattern:', error);
    return false;
  }

  return true;
}

/**
 * Delete a pattern and its catches
 */
export async function deletePattern(patternId: string): Promise<boolean> {
  // Delete catches first
  const { error: catchError } = await supabase
    .from('pattern_catches')
    .delete()
    .eq('pattern_id', patternId);

  if (catchError) {
    console.error('Error deleting pattern catches:', catchError);
    return false;
  }

  // Delete pattern
  const { error } = await supabase
    .from('masculine_patterns')
    .delete()
    .eq('id', patternId);

  if (error) {
    console.error('Error deleting pattern:', error);
    return false;
  }

  return true;
}

/**
 * Log a pattern catch instance
 */
export async function logPatternCatch(
  patternId: string,
  userId: string,
  data: {
    context?: string;
    triggerCause?: string;
    correctionApplied: boolean;
    correctionSuccess?: boolean;
  }
): Promise<PatternCatch | null> {
  // Insert catch record
  const { data: result, error } = await supabase
    .from('pattern_catches')
    .insert({
      pattern_id: patternId,
      user_id: userId,
      context: data.context || null,
      trigger_cause: data.triggerCause || null,
      correction_applied: data.correctionApplied,
      correction_success: data.correctionApplied ? data.correctionSuccess : null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error logging pattern catch:', error);
    return null;
  }

  // Increment times_caught
  await supabase
    .from('masculine_patterns')
    .update({ times_caught: supabase.rpc('increment_field') })
    .eq('id', patternId);

  // Actually, let's do this with a simple increment approach
  const pattern = await getPattern(patternId);
  if (pattern) {
    const updates: Record<string, number> = {
      times_caught: pattern.timesCaught + 1,
    };
    if (data.correctionApplied && data.correctionSuccess) {
      updates.times_corrected = pattern.timesCorrected + 1;
    }

    await supabase
      .from('masculine_patterns')
      .update(updates)
      .eq('id', patternId);
  }

  return result ? toCatch(result) : null;
}

/**
 * Get catches for a pattern
 */
export async function getPatternCatches(
  patternId: string,
  limit: number = 20
): Promise<PatternCatch[]> {
  const { data, error } = await supabase
    .from('pattern_catches')
    .select('*')
    .eq('pattern_id', patternId)
    .order('caught_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching pattern catches:', error);
    return [];
  }

  return (data || []).map(toCatch);
}

/**
 * Get all catches for a user (for stats)
 */
export async function getUserCatches(
  userId: string,
  since?: string
): Promise<PatternCatch[]> {
  let query = supabase
    .from('pattern_catches')
    .select('*')
    .eq('user_id', userId)
    .order('caught_at', { ascending: false });

  if (since) {
    query = query.gte('caught_at', since);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching user catches:', error);
    return [];
  }

  return (data || []).map(toCatch);
}

/**
 * Get pattern statistics for a user
 */
export async function getPatternStats(userId: string): Promise<PatternStats> {
  const patterns = await getPatterns(userId);

  // Get today's catches
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCatches = await getUserCatches(userId, today.toISOString());

  const totalPatterns = patterns.length;
  const activePatterns = patterns.filter(p => p.status === 'active' || p.status === 'recurring').length;
  const resolvedPatterns = patterns.filter(p => p.status === 'resolved').length;
  const catchesToday = todayCatches.length;
  const totalCatches = patterns.reduce((sum, p) => sum + p.timesCaught, 0);

  const avgAutomaticity = totalPatterns > 0
    ? Math.round(patterns.reduce((sum, p) => sum + p.replacementAutomaticity, 0) / totalPatterns)
    : 0;

  const totalCorrected = patterns.reduce((sum, p) => sum + p.timesCorrected, 0);
  const correctionRate = totalCatches > 0
    ? Math.round((totalCorrected / totalCatches) * 100)
    : 0;

  return {
    totalPatterns,
    activePatterns,
    resolvedPatterns,
    catchesToday,
    totalCatches,
    avgAutomaticity,
    correctionRate,
  };
}

// ============================================
// NOTIFICATION INTEGRATION
// ============================================

/**
 * Push a pattern catch notification to the notification system
 */
export function pushPatternNotification(
  pattern: MasculinePattern,
  onCatch: (corrected: boolean) => void
): string {
  return pushPatternCatch(
    pattern.patternName,
    pattern.feminineReplacement || 'Stay mindful of this pattern',
    () => onCatch(true)
  );
}

/**
 * Check for patterns that need proactive reminders
 * Based on frequency of catches and time since last occurrence
 */
export async function checkPatternReminders(userId: string): Promise<void> {
  const patterns = await getPatternsByStatus(userId, 'active');
  const manager = getNotificationManager();

  // Get recent catches to see pattern frequencies
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const recentCatches = await getUserCatches(userId, yesterday.toISOString());

  // Group catches by pattern
  const catchesByPattern = new Map<string, number>();
  recentCatches.forEach(c => {
    const count = catchesByPattern.get(c.patternId) || 0;
    catchesByPattern.set(c.patternId, count + 1);
  });

  // Find patterns with high recent frequency - they might need attention
  const hour = new Date().getHours();

  for (const pattern of patterns) {
    const recentCount = catchesByPattern.get(pattern.id) || 0;

    // If pattern has been caught 3+ times recently with low correction rate
    if (recentCount >= 3 && pattern.replacementAutomaticity < 50) {
      // Check if we already have an active notification for this pattern
      const existing = manager.getActive().find(
        n => n.type === 'pattern_catch' && n.data?.patternId === pattern.id
      );

      if (!existing) {
        manager.push({
          type: 'pattern_catch',
          priority: 'medium',
          title: 'Pattern Reminder',
          message: `"${pattern.patternName}" has been catching you often`,
          details: pattern.feminineReplacement || 'Stay mindful',
          icon: 'Eye',
          source: 'pattern_system',
          data: { patternId: pattern.id },
          action: {
            label: 'Log Awareness',
            callback: () => {
              // This would typically open the pattern catch UI
              window.dispatchEvent(new CustomEvent('open-pattern-catch', {
                detail: { patternId: pattern.id }
              }));
            },
          },
        });
      }
    }
  }

  // Time-based reminders for patterns that often occur at certain times
  // (This is a simplified version - a full implementation would track time-of-day patterns)
  if (hour >= 8 && hour <= 10) {
    // Morning reminder for high-frequency patterns
    const frequentPatterns = patterns.filter(p => p.timesCaught > 10 && p.replacementAutomaticity < 30);
    if (frequentPatterns.length > 0) {
      const topPattern = frequentPatterns[0];
      const existing = manager.getActive().find(
        n => n.type === 'reminder' && n.data?.source === 'morning_pattern'
      );

      if (!existing) {
        manager.push({
          type: 'reminder',
          priority: 'low',
          title: 'Morning Mindfulness',
          message: `Watch for "${topPattern.patternName}" today`,
          details: topPattern.feminineReplacement || undefined,
          icon: 'Eye',
          source: 'pattern_system',
          data: { source: 'morning_pattern', patternId: topPattern.id },
        });
      }
    }
  }
}

/**
 * Get patterns that should trigger notifications based on activity
 */
export async function getPriorityPatterns(userId: string): Promise<MasculinePattern[]> {
  const patterns = await getPatternsByStatus(userId, 'active');

  // Sort by a combination of catch frequency and low automaticity (needs more work)
  return patterns
    .filter(p => p.replacementAutomaticity < 50)
    .sort((a, b) => {
      // Higher frequency + lower automaticity = higher priority
      const scoreA = a.timesCaught * (100 - a.replacementAutomaticity);
      const scoreB = b.timesCaught * (100 - b.replacementAutomaticity);
      return scoreB - scoreA;
    })
    .slice(0, 5);
}
