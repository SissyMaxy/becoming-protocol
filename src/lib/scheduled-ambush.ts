/**
 * Scheduled Ambush Service
 *
 * Manages quick micro-tasks that appear throughout the day.
 * Handles scheduling, delivery, completion, and snoozing.
 */

import { supabase } from './supabase';
import {
  mapDbToScheduledAmbush,
  mapDbToMicroTaskTemplate,
  type ScheduledAmbush,
  type MicroTaskTemplate,
  type DbScheduledAmbush,
  type DbMicroTaskTemplate,
  type AmbushDayStats,
} from '../types/scheduled-ambush';

// ============================================
// SCHEDULING
// ============================================

/**
 * Schedule ambushes for today (or a specific date)
 * Uses the database function for consistent scheduling
 */
export async function scheduleDailyAmbushes(
  userId: string,
  date: string = new Date().toISOString().split('T')[0]
): Promise<number> {
  const { data, error } = await supabase.rpc('schedule_daily_ambushes', {
    p_user_id: userId,
    p_date: date,
  });

  if (error) {
    console.error('Failed to schedule ambushes:', error);
    return 0;
  }

  return data || 0;
}

/**
 * Get all ambushes for a specific date
 */
export async function getAmbushesForDate(
  userId: string,
  date: string = new Date().toISOString().split('T')[0]
): Promise<ScheduledAmbush[]> {
  const { data, error } = await supabase
    .from('scheduled_ambushes')
    .select(`
      *,
      micro_task_templates (*)
    `)
    .eq('user_id', userId)
    .eq('plan_date', date)
    .order('scheduled_time', { ascending: true });

  if (error) {
    console.error('Failed to get ambushes:', error);
    return [];
  }

  return (data || []).map((row: DbScheduledAmbush) => mapDbToScheduledAmbush(row));
}

/**
 * Get pending ambushes that should be delivered now
 */
export async function getPendingAmbushes(userId: string): Promise<ScheduledAmbush[]> {
  const { data, error } = await supabase.rpc('get_pending_ambushes', {
    p_user_id: userId,
    p_current_time: new Date().toISOString(),
  });

  if (error) {
    console.error('Failed to get pending ambushes:', error);
    return [];
  }

  // Need to fetch templates separately since RPC doesn't join
  if (!data || data.length === 0) return [];

  const templateIds = [...new Set(data.map((a: DbScheduledAmbush) => a.template_id))];
  const { data: templates } = await supabase
    .from('micro_task_templates')
    .select('*')
    .in('id', templateIds);

  const templateMap = new Map(
    (templates || []).map((t: DbMicroTaskTemplate) => [t.id, mapDbToMicroTaskTemplate(t)])
  );

  return data.map((row: DbScheduledAmbush) => ({
    ...mapDbToScheduledAmbush(row),
    template: templateMap.get(row.template_id),
  }));
}

/**
 * Get the next pending ambush (if any)
 */
export async function getNextAmbush(userId: string): Promise<ScheduledAmbush | null> {
  const pending = await getPendingAmbushes(userId);
  return pending[0] || null;
}

// ============================================
// DELIVERY
// ============================================

/**
 * Mark an ambush as delivered (shown to user)
 */
export async function markAmbushDelivered(ambushId: string): Promise<boolean> {
  const { error } = await supabase
    .from('scheduled_ambushes')
    .update({
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    })
    .eq('id', ambushId);

  return !error;
}

// ============================================
// COMPLETION
// ============================================

/**
 * Complete an ambush
 */
export async function completeAmbush(
  ambushId: string,
  options?: {
    proofUrl?: string;
    feltGood?: boolean;
    difficulty?: number;
  }
): Promise<ScheduledAmbush | null> {
  const { data, error } = await supabase.rpc('complete_ambush', {
    p_ambush_id: ambushId,
    p_proof_url: options?.proofUrl || null,
    p_felt_good: options?.feltGood ?? null,
    p_difficulty: options?.difficulty ?? null,
  });

  if (error) {
    console.error('Failed to complete ambush:', error);
    return null;
  }

  return data ? mapDbToScheduledAmbush(data) : null;
}

/**
 * Skip an ambush (mark as missed)
 */
export async function skipAmbush(ambushId: string): Promise<boolean> {
  const { error } = await supabase
    .from('scheduled_ambushes')
    .update({ status: 'missed' })
    .eq('id', ambushId);

  return !error;
}

// ============================================
// SNOOZING
// ============================================

/**
 * Snooze an ambush
 */
export async function snoozeAmbush(ambushId: string): Promise<ScheduledAmbush | null> {
  const { data, error } = await supabase.rpc('snooze_ambush', {
    p_ambush_id: ambushId,
  });

  if (error) {
    console.error('Failed to snooze ambush:', error);
    return null;
  }

  return data ? mapDbToScheduledAmbush(data) : null;
}

/**
 * Check if an ambush can be snoozed
 */
export async function canSnooze(ambushId: string): Promise<boolean> {
  const { data: ambush } = await supabase
    .from('scheduled_ambushes')
    .select('snooze_count, user_id')
    .eq('id', ambushId)
    .single();

  if (!ambush) return false;

  const { data: settings } = await supabase
    .from('ambush_user_settings')
    .select('snooze_limit')
    .eq('user_id', ambush.user_id)
    .single();

  const limit = settings?.snooze_limit ?? 2;
  return ambush.snooze_count < limit;
}

// ============================================
// TEMPLATES
// ============================================

/**
 * Get all active micro-task templates
 */
export async function getTemplates(): Promise<MicroTaskTemplate[]> {
  const { data, error } = await supabase
    .from('micro_task_templates')
    .select('*')
    .eq('active', true)
    .order('type', { ascending: true });

  if (error) {
    console.error('Failed to get templates:', error);
    return [];
  }

  return (data || []).map((row: DbMicroTaskTemplate) => mapDbToMicroTaskTemplate(row));
}

// ============================================
// USER SETTINGS
// ============================================

export interface AmbushUserSettings {
  minAmbushesPerDay: number;
  maxAmbushesPerDay: number;
  minGapMinutes: number;
  timeWindows: Record<string, { start: string; end: string; enabled: boolean }>;
  allowPhotoProof: boolean;
  allowAudioProof: boolean;
  snoozeLimit: number;
  snoozeDurationMinutes: number;
  notificationEnabled: boolean;
  notificationSound: boolean;
  notificationVibrate: boolean;
  preferredIntensity: number;
  enabledTypes: string[];
}

/**
 * Get user's ambush settings
 */
export async function getAmbushSettings(userId: string): Promise<AmbushUserSettings | null> {
  const { data, error } = await supabase
    .from('ambush_user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // Return defaults if no settings exist
    return {
      minAmbushesPerDay: 3,
      maxAmbushesPerDay: 8,
      minGapMinutes: 45,
      timeWindows: {
        morning: { start: '07:00', end: '12:00', enabled: true },
        afternoon: { start: '12:00', end: '17:00', enabled: true },
        evening: { start: '17:00', end: '21:00', enabled: true },
        night: { start: '21:00', end: '23:30', enabled: true },
      },
      allowPhotoProof: true,
      allowAudioProof: true,
      snoozeLimit: 2,
      snoozeDurationMinutes: 15,
      notificationEnabled: true,
      notificationSound: true,
      notificationVibrate: true,
      preferredIntensity: 3,
      enabledTypes: ['posture', 'voice', 'affirmation', 'pose', 'breath', 'check_in', 'micro_task', 'anchor', 'visualization', 'movement'],
    };
  }

  return {
    minAmbushesPerDay: data.min_ambushes_per_day,
    maxAmbushesPerDay: data.max_ambushes_per_day,
    minGapMinutes: data.min_gap_minutes,
    timeWindows: data.time_windows,
    allowPhotoProof: data.allow_photo_proof,
    allowAudioProof: data.allow_audio_proof,
    snoozeLimit: data.snooze_limit,
    snoozeDurationMinutes: data.snooze_duration_minutes,
    notificationEnabled: data.notification_enabled,
    notificationSound: data.notification_sound,
    notificationVibrate: data.notification_vibrate,
    preferredIntensity: data.preferred_intensity,
    enabledTypes: data.enabled_types,
  };
}

/**
 * Update user's ambush settings
 */
export async function updateAmbushSettings(
  userId: string,
  settings: Partial<AmbushUserSettings>
): Promise<boolean> {
  const updates: Record<string, unknown> = {};

  if (settings.minAmbushesPerDay !== undefined) updates.min_ambushes_per_day = settings.minAmbushesPerDay;
  if (settings.maxAmbushesPerDay !== undefined) updates.max_ambushes_per_day = settings.maxAmbushesPerDay;
  if (settings.minGapMinutes !== undefined) updates.min_gap_minutes = settings.minGapMinutes;
  if (settings.timeWindows !== undefined) updates.time_windows = settings.timeWindows;
  if (settings.allowPhotoProof !== undefined) updates.allow_photo_proof = settings.allowPhotoProof;
  if (settings.allowAudioProof !== undefined) updates.allow_audio_proof = settings.allowAudioProof;
  if (settings.snoozeLimit !== undefined) updates.snooze_limit = settings.snoozeLimit;
  if (settings.snoozeDurationMinutes !== undefined) updates.snooze_duration_minutes = settings.snoozeDurationMinutes;
  if (settings.notificationEnabled !== undefined) updates.notification_enabled = settings.notificationEnabled;
  if (settings.notificationSound !== undefined) updates.notification_sound = settings.notificationSound;
  if (settings.notificationVibrate !== undefined) updates.notification_vibrate = settings.notificationVibrate;
  if (settings.preferredIntensity !== undefined) updates.preferred_intensity = settings.preferredIntensity;
  if (settings.enabledTypes !== undefined) updates.enabled_types = settings.enabledTypes;

  const { error } = await supabase
    .from('ambush_user_settings')
    .upsert({
      user_id: userId,
      ...updates,
    }, {
      onConflict: 'user_id',
    });

  return !error;
}

// ============================================
// STATISTICS
// ============================================

/**
 * Get ambush stats for a specific date
 */
export async function getAmbushDayStats(
  userId: string,
  date: string = new Date().toISOString().split('T')[0]
): Promise<AmbushDayStats> {
  const { data } = await supabase
    .from('scheduled_ambushes')
    .select('status, response_time_seconds, proof_submitted')
    .eq('user_id', userId)
    .eq('plan_date', date);

  const ambushes = data || [];

  const total = ambushes.length;
  const delivered = ambushes.filter(a => a.status !== 'scheduled').length;
  const completed = ambushes.filter(a => a.status === 'completed').length;
  const missed = ambushes.filter(a => a.status === 'missed').length;
  const proofs = ambushes.filter(a => a.proof_submitted).length;

  const responseTimes = ambushes
    .filter(a => a.response_time_seconds)
    .map(a => a.response_time_seconds);

  const avgResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : 0;

  return {
    date,
    total_scheduled: total,
    delivered,
    completed,
    missed,
    completion_rate: delivered > 0 ? completed / delivered : 0,
    avg_response_time_seconds: Math.round(avgResponseTime),
    proofs_submitted: proofs,
  };
}

/**
 * Get ambush completion rate for the last N days
 */
export async function getRecentCompletionRate(
  userId: string,
  days: number = 7
): Promise<number> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data } = await supabase
    .from('scheduled_ambushes')
    .select('status')
    .eq('user_id', userId)
    .gte('plan_date', startDate.toISOString().split('T')[0])
    .in('status', ['completed', 'missed']);

  if (!data || data.length === 0) return 0;

  const completed = data.filter(a => a.status === 'completed').length;
  return completed / data.length;
}

// ============================================
// INTEGRATION WITH DAILY PLAN
// ============================================

/**
 * Schedule ambushes as part of daily plan generation
 * Called by handler-ai.ts during plan generation
 */
export async function integrateWithDailyPlan(
  userId: string,
  _denialDay: number, // Reserved for future intensity scaling
  planDate: string = new Date().toISOString().split('T')[0]
): Promise<{
  scheduled: number;
  ambushes: ScheduledAmbush[];
}> {
  // Check if already scheduled for today
  const existing = await getAmbushesForDate(userId, planDate);
  if (existing.length > 0) {
    return { scheduled: 0, ambushes: existing };
  }

  // Schedule new ambushes
  const count = await scheduleDailyAmbushes(userId, planDate);
  const ambushes = await getAmbushesForDate(userId, planDate);

  return { scheduled: count, ambushes };
}

// ============================================
// RE-EXPORT TYPES AND MAPPERS
// ============================================

export { mapDbToScheduledAmbush, mapDbToMicroTaskTemplate } from '../types/scheduled-ambush';
