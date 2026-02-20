/**
 * Exercise Engine
 *
 * Session lifecycle, streak tracking, gym gate logic,
 * template selection, and body measurements.
 */

import { supabase } from './supabase';
import { getTemplateById, getTemplatesForLevel } from '../data/workout-templates';
import type {
  SessionType,
  ExerciseStreakData,
  BodyMeasurement,
  ExerciseCompleted,
  SessionCompletionResult,
  WorkoutTemplate,
  ExerciseDomainConfig,
  ExerciseDomainLevel,
  ExerciseProgression,
} from '../types/exercise';
import { DOMAIN_LEVEL_THRESHOLDS } from '../types/exercise';

// ============================================
// SESSION LIFECYCLE
// ============================================

export async function startSession(
  userId: string,
  templateId: string,
  deviceUsed: boolean,
  denialDay: number,
): Promise<string | null> {
  const template = getTemplateById(templateId);
  if (!template) return null;

  const sessionType: SessionType =
    templateId === 'mvw' ? 'mvw' :
    template.location === 'gym' ? 'gym' : 'full';

  const { data, error } = await supabase
    .from('exercise_sessions')
    .insert({
      user_id: userId,
      session_type: sessionType,
      template_used: templateId,
      location: template.location,
      exercises_completed: [],
      device_used: deviceUsed,
      denial_day: denialDay,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Exercise] Failed to start session:', error.message);
    return null;
  }

  return data?.id || null;
}

export async function completeSession(
  userId: string,
  sessionId: string,
  exercisesCompleted: ExerciseCompleted[],
  durationMinutes: number,
  templateId: string,
  streakWeeks: number,
): Promise<SessionCompletionResult | null> {
  const template = getTemplateById(templateId);
  if (!template) return null;

  const totalReps = exercisesCompleted.reduce((sum, e) => sum + e.reps, 0);
  const totalSets = exercisesCompleted.reduce((sum, e) => sum + e.sets, 0);

  // Calculate total exercises in template
  const templateExerciseCount =
    template.warmup.length + template.main.length + template.cooldown.length;
  const allCompleted = exercisesCompleted.length >= templateExerciseCount;

  // Points: 25 base + 5 per streak week (cap 25) + 10 if all completed
  const streakBonus = Math.min(streakWeeks * 5, 25);
  const completionBonus = allCompleted ? 10 : 0;
  const pointsAwarded = 25 + streakBonus + completionBonus;

  // Update session record
  const { error } = await supabase
    .from('exercise_sessions')
    .update({
      exercises_completed: exercisesCompleted,
      duration_minutes: durationMinutes,
    })
    .eq('id', sessionId);

  if (error) {
    console.error('[Exercise] Failed to complete session:', error.message);
    return null;
  }

  // Update streak
  const sessionType: SessionType =
    templateId === 'mvw' ? 'mvw' :
    template.location === 'gym' ? 'gym' : 'full';

  const streak = await updateStreakOnCompletion(userId, sessionType);

  // Pick random affirmation
  const affirmation = template.completionAffirmations[
    Math.floor(Math.random() * template.completionAffirmations.length)
  ];

  return {
    totalReps,
    totalSets,
    durationSeconds: durationMinutes * 60,
    pointsAwarded,
    newStreakWeeks: streak?.currentStreakWeeks || 0,
    sessionsThisWeek: streak?.sessionsThisWeek || 0,
    affirmation,
  };
}

export async function abandonSession(sessionId: string): Promise<void> {
  await supabase
    .from('exercise_sessions')
    .delete()
    .eq('id', sessionId);
}

// ============================================
// STREAK MANAGEMENT
// ============================================

function getCurrentMonday(): string {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

export async function getOrCreateStreak(userId: string): Promise<ExerciseStreakData> {
  const currentMonday = getCurrentMonday();

  const { data: existing } = await supabase
    .from('exercise_streaks')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    // First time — create streak row
    const { data: created } = await supabase
      .from('exercise_streaks')
      .insert({
        user_id: userId,
        week_start: currentMonday,
        sessions_this_week: 0,
        current_streak_weeks: 0,
        longest_streak_weeks: 0,
        total_sessions: 0,
        total_mvw_sessions: 0,
        total_full_sessions: 0,
        total_gym_sessions: 0,
      })
      .select('*')
      .single();

    return mapStreakRow(created);
  }

  // Check if week rolled over
  if (existing.week_start !== currentMonday) {
    // Week changed — check if previous week maintained streak
    const prevSessionsThisWeek = existing.sessions_this_week || 0;
    let newStreakWeeks = existing.current_streak_weeks || 0;

    if (prevSessionsThisWeek >= 3) {
      newStreakWeeks += 1;
    } else {
      newStreakWeeks = 0;
    }

    const longestStreak = Math.max(
      existing.longest_streak_weeks || 0,
      newStreakWeeks,
    );

    // Check gym gate
    let gymGateUnlocked = existing.gym_gate_unlocked || false;
    let gymGateUnlockedAt = existing.gym_gate_unlocked_at;
    if (!gymGateUnlocked) {
      const measurementCount = await getMeasurementCount(userId);
      gymGateUnlocked = checkGymGate(
        { ...existing, current_streak_weeks: newStreakWeeks },
        measurementCount,
      );
      if (gymGateUnlocked) {
        gymGateUnlockedAt = new Date().toISOString();
      }
    }

    const { data: updated } = await supabase
      .from('exercise_streaks')
      .update({
        week_start: currentMonday,
        sessions_this_week: 0,
        current_streak_weeks: newStreakWeeks,
        longest_streak_weeks: longestStreak,
        gym_gate_unlocked: gymGateUnlocked,
        gym_gate_unlocked_at: gymGateUnlockedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select('*')
      .single();

    return mapStreakRow(updated);
  }

  return mapStreakRow(existing);
}

async function updateStreakOnCompletion(
  userId: string,
  sessionType: SessionType,
): Promise<ExerciseStreakData> {
  const streak = await getOrCreateStreak(userId);

  const updates: Record<string, unknown> = {
    sessions_this_week: streak.sessionsThisWeek + 1,
    total_sessions: streak.totalSessions + 1,
    last_session_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (sessionType === 'mvw') {
    updates.total_mvw_sessions = streak.totalMvwSessions + 1;
  } else if (sessionType === 'gym') {
    updates.total_gym_sessions = streak.totalGymSessions + 1;
  } else {
    updates.total_full_sessions = streak.totalFullSessions + 1;
  }

  const { data: updated } = await supabase
    .from('exercise_streaks')
    .update(updates)
    .eq('user_id', userId)
    .select('*')
    .single();

  return mapStreakRow(updated);
}

// ============================================
// GYM GATE
// ============================================

interface StreakLike {
  current_streak_weeks: number;
  total_sessions: number;
  total_full_sessions: number;
}

function checkGymGate(streak: StreakLike, measurementCount: number): boolean {
  return (
    streak.current_streak_weeks >= 6 &&
    streak.total_sessions >= 18 &&
    streak.total_full_sessions >= 12 &&
    measurementCount >= 2
  );
}

// ============================================
// TEMPLATE SELECTION
// ============================================

export function selectTemplate(
  denialDay: number,
  lastTemplate: string | null,
  gymUnlocked: boolean,
  location: 'home' | 'gym' = 'home',
  domainLevel: ExerciseDomainLevel = 1,
): WorkoutTemplate {
  const available = getTemplatesForLevel(domainLevel);

  if (location === 'gym' && gymUnlocked) {
    const gymTemplates = available.filter(t => t.gymGateRequired);
    if (gymTemplates.length > 0) {
      return lastTemplate === 'gym_glute'
        ? gymTemplates.find(t => t.id === 'gym_shelf') || gymTemplates[0]
        : gymTemplates.find(t => t.id === 'gym_glute') || gymTemplates[0];
    }
  }

  const homeTemplates = available.filter(t => !t.gymGateRequired);

  // Low denial or low energy — MVW or lighter
  if (denialDay <= 2) {
    const mvw = homeTemplates.find(t => t.id === 'mvw');
    const flex = homeTemplates.find(t => t.id === 'flexibility');
    if (lastTemplate === 'mvw' && flex) return flex;
    return mvw || homeTemplates[0];
  }

  // High denial — heavy day
  if (denialDay >= 5) {
    return homeTemplates.find(t => t.id === 'glute_power') || homeTemplates[0];
  }

  // Mid range — rotate through all available home templates (novelty)
  const rotation = homeTemplates.filter(t => t.id !== 'mvw').map(t => t.id);
  if (rotation.length === 0) return homeTemplates[0];
  const lastIndex = lastTemplate ? rotation.indexOf(lastTemplate) : -1;
  const nextIndex = (lastIndex + 1) % rotation.length;
  return homeTemplates.find(t => t.id === rotation[nextIndex]) || homeTemplates[0];
}

export async function getLastTemplateUsed(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('exercise_sessions')
    .select('template_used')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  return data?.[0]?.template_used || null;
}

// ============================================
// BODY MEASUREMENTS
// ============================================

export async function getLatestMeasurement(userId: string): Promise<BodyMeasurement | null> {
  const { data } = await supabase
    .from('body_measurements')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;
  return mapMeasurementRow(data[0]);
}

export async function saveMeasurement(
  userId: string,
  input: Omit<BodyMeasurement, 'id' | 'hipWaistRatio' | 'measuredAt'>,
): Promise<BodyMeasurement | null> {
  const { data, error } = await supabase
    .from('body_measurements')
    .insert({
      user_id: userId,
      hips_inches: input.hipsInches,
      waist_inches: input.waistInches,
      thigh_left_inches: input.thighLeftInches,
      thigh_right_inches: input.thighRightInches,
      shoulders_inches: input.shouldersInches,
      weight_lbs: input.weightLbs,
      notes: input.notes,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[Exercise] Failed to save measurement:', error.message);
    return null;
  }

  return mapMeasurementRow(data);
}

export async function getMeasurementCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('body_measurements')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  return count || 0;
}

// ============================================
// ROW MAPPERS
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStreakRow(row: any): ExerciseStreakData {
  return {
    currentStreakWeeks: row?.current_streak_weeks || 0,
    sessionsThisWeek: row?.sessions_this_week || 0,
    weekStart: row?.week_start || getCurrentMonday(),
    totalSessions: row?.total_sessions || 0,
    totalMvwSessions: row?.total_mvw_sessions || 0,
    totalFullSessions: row?.total_full_sessions || 0,
    totalGymSessions: row?.total_gym_sessions || 0,
    longestStreakWeeks: row?.longest_streak_weeks || 0,
    gymGateUnlocked: row?.gym_gate_unlocked || false,
    gymGateUnlockedAt: row?.gym_gate_unlocked_at || null,
    lastSessionAt: row?.last_session_at || null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMeasurementRow(row: any): BodyMeasurement {
  return {
    id: row.id,
    hipsInches: row.hips_inches,
    waistInches: row.waist_inches,
    hipWaistRatio: row.hip_waist_ratio,
    thighLeftInches: row.thigh_left_inches,
    thighRightInches: row.thigh_right_inches,
    shouldersInches: row.shoulders_inches,
    weightLbs: row.weight_lbs,
    notes: row.notes,
    measuredAt: row.measured_at,
  };
}

// ============================================
// DOMAIN CONFIG
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDomainConfigRow(row: any): ExerciseDomainConfig {
  return {
    id: row.id,
    userId: row.user_id,
    domainLevel: (row.domain_level || 1) as ExerciseDomainLevel,
    tasksCompletedThisLevel: row.tasks_completed_this_level || 0,
    targetSessionsPerWeek: row.target_sessions_per_week || 3,
    preferredWorkoutDays: row.preferred_workout_days || [],
    equipmentOwned: row.equipment_owned || [],
    noveltyRotationIndex: row.novelty_rotation_index || 0,
  };
}

export async function getOrCreateDomainConfig(userId: string): Promise<ExerciseDomainConfig> {
  const { data: existing } = await supabase
    .from('exercise_domain_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return mapDomainConfigRow(existing);

  const { data: created } = await supabase
    .from('exercise_domain_config')
    .insert({ user_id: userId })
    .select('*')
    .single();

  return mapDomainConfigRow(created);
}

export async function updateDomainConfig(
  userId: string,
  fields: Partial<Pick<ExerciseDomainConfig, 'domainLevel' | 'tasksCompletedThisLevel' | 'targetSessionsPerWeek' | 'preferredWorkoutDays' | 'equipmentOwned' | 'noveltyRotationIndex'>>,
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.domainLevel !== undefined) row.domain_level = fields.domainLevel;
  if (fields.tasksCompletedThisLevel !== undefined) row.tasks_completed_this_level = fields.tasksCompletedThisLevel;
  if (fields.targetSessionsPerWeek !== undefined) row.target_sessions_per_week = fields.targetSessionsPerWeek;
  if (fields.preferredWorkoutDays !== undefined) row.preferred_workout_days = fields.preferredWorkoutDays;
  if (fields.equipmentOwned !== undefined) row.equipment_owned = fields.equipmentOwned;
  if (fields.noveltyRotationIndex !== undefined) row.novelty_rotation_index = fields.noveltyRotationIndex;

  await supabase
    .from('exercise_domain_config')
    .update(row)
    .eq('user_id', userId);
}

export async function checkDomainAdvancement(
  userId: string,
  config: ExerciseDomainConfig,
): Promise<ExerciseDomainConfig> {
  const newCount = config.tasksCompletedThisLevel + 1;
  const threshold = DOMAIN_LEVEL_THRESHOLDS[config.domainLevel];

  if (newCount >= threshold && config.domainLevel < 5) {
    const newLevel = (config.domainLevel + 1) as ExerciseDomainLevel;
    await updateDomainConfig(userId, {
      domainLevel: newLevel,
      tasksCompletedThisLevel: 0,
    });
    return {
      ...config,
      domainLevel: newLevel,
      tasksCompletedThisLevel: 0,
    };
  }

  await updateDomainConfig(userId, { tasksCompletedThisLevel: newCount });
  return { ...config, tasksCompletedThisLevel: newCount };
}

// ============================================
// MEASUREMENT HISTORY
// ============================================

export async function getMeasurementHistory(
  userId: string,
  limit: number = 10,
): Promise<BodyMeasurement[]> {
  const { data } = await supabase
    .from('body_measurements')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at', { ascending: true })
    .limit(limit);

  if (!data) return [];
  return data.map(mapMeasurementRow);
}

// ============================================
// EXERCISE PROGRESSION
// ============================================

export async function saveExerciseProgression(
  userId: string,
  exerciseName: string,
  weightLbs?: number,
  bandLevel?: string,
  notes?: string,
): Promise<void> {
  await supabase
    .from('exercise_progressions')
    .insert({
      user_id: userId,
      exercise_name: exerciseName,
      weight_lbs: weightLbs || null,
      band_level: bandLevel || null,
      notes: notes || null,
    });
}

export async function getLatestProgressions(
  userId: string,
): Promise<Record<string, ExerciseProgression>> {
  const { data } = await supabase
    .from('exercise_progressions')
    .select('*')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false });

  if (!data) return {};

  const result: Record<string, ExerciseProgression> = {};
  for (const row of data) {
    const name = row.exercise_name as string;
    if (!result[name]) {
      result[name] = {
        id: row.id,
        exerciseName: name,
        weightLbs: row.weight_lbs,
        bandLevel: row.band_level,
        notes: row.notes,
        recordedAt: row.recorded_at,
      };
    }
  }
  return result;
}
