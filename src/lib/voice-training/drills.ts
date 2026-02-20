/**
 * Voice Training — Drills
 *
 * Structured daily drill system from the 34-drill CSV spec.
 * Level-appropriate drill selection, completion tracking, streak management.
 */

import { supabase } from '../supabase';
import type {
  VoiceDrill,
  DrillLog,
  VoiceTrainingProgress,
  DbVoiceDrill,
  DbDrillLog,
} from '../../types/voice-training';
import { mapDbDrill, mapDbDrillLog } from '../../types/voice-training';

// ── Voice level names ───────────────────────────────

export const VOICE_LEVELS: Record<number, string> = {
  1: 'Awareness',
  2: 'Exploration',
  3: 'Practice',
  4: 'Integration',
  5: 'Mastery',
};

// Drills needed per level to advance
export const LEVEL_THRESHOLDS: Record<number, number> = {
  1: 10,  // 10 drills to advance from L1 to L2
  2: 15,
  3: 20,
  4: 25,
  5: 30, // L5 is mastery, no advancement
};

// ── Get drills ──────────────────────────────────────

export async function getDrillsForLevel(level: number): Promise<VoiceDrill[]> {
  const { data, error } = await supabase
    .from('voice_drills')
    .select('*')
    .eq('is_active', true)
    .lte('level', level)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[drills] getDrillsForLevel error:', error);
    return [];
  }

  return (data as DbVoiceDrill[]).map(mapDbDrill);
}

export async function getDrillById(drillId: string): Promise<VoiceDrill | null> {
  const { data, error } = await supabase
    .from('voice_drills')
    .select('*')
    .eq('id', drillId)
    .single();

  if (error || !data) return null;
  return mapDbDrill(data as DbVoiceDrill);
}

/**
 * Get today's recommended drills based on level and what hasn't been done recently.
 * Returns a mix: 1 warmup + 2-3 level-appropriate drills.
 */
export async function getTodayDrills(userId: string, voiceLevel: number): Promise<VoiceDrill[]> {
  // Get all available drills at or below current level
  const allDrills = await getDrillsForLevel(voiceLevel);
  if (allDrills.length === 0) return [];

  // Get recently completed drill IDs (last 3 days) to avoid repetition
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data: recentLogs } = await supabase
    .from('voice_drill_logs')
    .select('drill_id')
    .eq('user_id', userId)
    .gte('completed_at', threeDaysAgo);

  const recentDrillIds = new Set((recentLogs || []).map(r => r.drill_id));

  // Separate warmups and non-warmups
  const warmups = allDrills.filter(d => d.drillType === 'warmup');
  const others = allDrills.filter(d => d.drillType !== 'warmup');

  // Prefer drills not done recently
  const freshOthers = others.filter(d => !recentDrillIds.has(d.id));
  const drillPool = freshOthers.length >= 3 ? freshOthers : others;

  // Pick 1 warmup + 3 others (shuffled)
  const todayDrills: VoiceDrill[] = [];

  if (warmups.length > 0) {
    todayDrills.push(warmups[Math.floor(Math.random() * warmups.length)]);
  }

  const shuffled = [...drillPool].sort(() => Math.random() - 0.5);
  // Prefer current-level drills
  const currentLevel = shuffled.filter(d => d.level === voiceLevel);
  const lowerLevel = shuffled.filter(d => d.level < voiceLevel);

  const picked = [...currentLevel.slice(0, 2), ...lowerLevel.slice(0, 1)];
  if (picked.length < 3) {
    picked.push(...shuffled.filter(d => !picked.includes(d)).slice(0, 3 - picked.length));
  }

  todayDrills.push(...picked.slice(0, 3));

  return todayDrills;
}

// ── Log drill completion ────────────────────────────

export async function logDrill(
  userId: string,
  drillId: string,
  result: {
    durationSeconds?: number;
    pitchAvgHz?: number;
    pitchMinHz?: number;
    pitchMaxHz?: number;
    qualityRating?: number;
    notes?: string;
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from('voice_drill_logs')
    .insert({
      user_id: userId,
      drill_id: drillId,
      duration_seconds: result.durationSeconds || null,
      pitch_avg_hz: result.pitchAvgHz || null,
      pitch_min_hz: result.pitchMinHz || null,
      pitch_max_hz: result.pitchMaxHz || null,
      quality_rating: result.qualityRating || null,
      notes: result.notes || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[drills] logDrill error:', error);
    return null;
  }

  // Update progress after logging
  await updateDrillProgress(userId, result.pitchAvgHz);

  return data.id;
}

// ── Get drill logs ──────────────────────────────────

export async function getTodayDrillLogs(userId: string): Promise<DrillLog[]> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('voice_drill_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('completed_at', todayStart.toISOString())
    .order('completed_at', { ascending: false });

  if (error) {
    console.error('[drills] getTodayDrillLogs error:', error);
    return [];
  }

  return (data as DbDrillLog[]).map(mapDbDrillLog);
}

export async function getRecentDrillLogs(userId: string, limit: number = 20): Promise<DrillLog[]> {
  const { data, error } = await supabase
    .from('voice_drill_logs')
    .select('*')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data as DbDrillLog[]).map(mapDbDrillLog);
}

// ── Progress management ─────────────────────────────

export async function getVoiceTrainingProgress(userId: string): Promise<VoiceTrainingProgress | null> {
  const { data, error } = await supabase
    .from('voice_game_progress')
    .select('baseline_pitch_hz, current_pitch_hz, target_pitch_hz, pitch_shift_hz, drill_streak, drill_streak_longest, last_drill_at, total_drills, total_drill_minutes, voice_level, days_since_last_practice')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    baselinePitchHz: data.baseline_pitch_hz,
    currentPitchHz: data.current_pitch_hz,
    targetPitchHz: data.target_pitch_hz || 190,
    pitchShiftHz: data.pitch_shift_hz || 0,
    drillStreak: data.drill_streak || 0,
    drillStreakLongest: data.drill_streak_longest || 0,
    lastDrillAt: data.last_drill_at,
    totalDrills: data.total_drills || 0,
    totalDrillMinutes: data.total_drill_minutes || 0,
    voiceLevel: data.voice_level || 1,
    daysSinceLastPractice: data.days_since_last_practice || 0,
  };
}

async function updateDrillProgress(userId: string, pitchHz?: number): Promise<void> {
  const current = await getVoiceTrainingProgress(userId);
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Calculate streak
  let newStreak = 1;
  if (current?.lastDrillAt) {
    const lastDate = new Date(current.lastDrillAt).toISOString().split('T')[0];
    const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0];

    if (lastDate === today) {
      newStreak = current.drillStreak; // Same day
    } else if (lastDate === yesterday) {
      newStreak = current.drillStreak + 1; // Consecutive
    }
  }

  const longestStreak = Math.max(newStreak, current?.drillStreakLongest || 0);
  const totalDrills = (current?.totalDrills || 0) + 1;

  // Check level advancement
  let voiceLevel = current?.voiceLevel || 1;
  const threshold = LEVEL_THRESHOLDS[voiceLevel] || 999;
  const drillsAtLevel = await countDrillsAtLevel(userId, voiceLevel);
  if (drillsAtLevel >= threshold && voiceLevel < 5) {
    voiceLevel++;
  }

  // Update pitch if provided
  const updateData: Record<string, unknown> = {
    drill_streak: newStreak,
    drill_streak_longest: longestStreak,
    last_drill_at: now.toISOString(),
    total_drills: totalDrills,
    total_drill_minutes: (current?.totalDrillMinutes || 0) + 1, // Approximation, refined by actual duration
    voice_level: voiceLevel,
    days_since_last_practice: 0,
    updated_at: now.toISOString(),
  };

  if (pitchHz && pitchHz > 0) {
    updateData.current_pitch_hz = pitchHz;
    if (!current?.baselinePitchHz) {
      updateData.baseline_pitch_hz = pitchHz;
    }
    const baseline = current?.baselinePitchHz || pitchHz;
    updateData.pitch_shift_hz = pitchHz - baseline;
  }

  const { error } = await supabase
    .from('voice_game_progress')
    .update(updateData)
    .eq('user_id', userId);

  if (error) {
    console.error('[drills] updateDrillProgress error:', error);
  }
}

async function countDrillsAtLevel(userId: string, _level: number): Promise<number> {
  // Count total drill logs as proxy for level advancement
  // (most drills at current level anyway due to selection logic)
  const { count, error } = await supabase
    .from('voice_drill_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error || count === null) return 0;
  return count;
}
