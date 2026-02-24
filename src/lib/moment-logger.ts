// Moment Logger - Supabase CRUD operations
import { supabase } from './supabase';
import { getCurrentTimeOfDay } from './rules-engine-v2';
import {
  MomentLog,
  DbMomentLog,
  MomentLogInput,
  MomentLogContext,
  MomentType,
  MomentIntensity,
  TimeOfDay,
  SupportType,
} from '../types/moment-logger';

// ============================================
// HELPERS
// ============================================

async function getAuthUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No authenticated user');
  return user.id;
}

function mapDbToMomentLog(db: DbMomentLog): MomentLog {
  return {
    id: db.id,
    userId: db.user_id,
    type: db.type as MomentType,
    intensity: db.intensity as MomentIntensity,
    loggedAt: db.logged_at,
    triggers: db.triggers || [],
    customTriggerText: db.custom_trigger_text || undefined,
    note: db.note || undefined,
    timeOfDay: db.time_of_day as TimeOfDay,
    dayOfWeek: db.day_of_week,
    denialDay: db.denial_day || undefined,
    arousalState: db.arousal_state || undefined,
    recentTaskCompleted: db.recent_task_completed || undefined,
    supportOffered: db.support_offered,
    supportTaken: db.support_taken as SupportType | undefined,
    createdAt: db.created_at,
  };
}

export function getTimeOfDay(): TimeOfDay {
  return getCurrentTimeOfDay();
}

export function getDayOfWeek(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}

// ============================================
// CRUD OPERATIONS
// ============================================

/**
 * Log a new moment (euphoria or dysphoria)
 */
export async function logMoment(
  input: MomentLogInput,
  context: MomentLogContext
): Promise<MomentLog> {
  const userId = await getAuthUserId();

  const dbData = {
    user_id: userId,
    type: input.type,
    intensity: input.intensity,
    logged_at: new Date().toISOString(),
    triggers: input.triggers || [],
    custom_trigger_text: input.customTriggerText || null,
    note: input.note || null,
    time_of_day: getTimeOfDay(),
    day_of_week: getDayOfWeek(),
    denial_day: context.denialDay || null,
    arousal_state: context.arousalState || null,
    recent_task_completed: context.recentTaskCompleted || null,
    support_offered: input.type === 'dysphoria',
    support_taken: null,
  };

  const { data, error } = await supabase
    .from('moment_logs')
    .insert(dbData)
    .select()
    .single();

  if (error) {
    console.error('Error logging moment:', error);
    throw error;
  }

  return mapDbToMomentLog(data as DbMomentLog);
}

/**
 * Update support taken for a dysphoria moment
 */
export async function updateMomentSupport(
  id: string,
  support: SupportType
): Promise<void> {
  const userId = await getAuthUserId();

  const { error } = await supabase
    .from('moment_logs')
    .update({ support_taken: support })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating moment support:', error);
    throw error;
  }
}

/**
 * Get recent moments for the current user
 */
export async function getRecentMoments(limit: number = 10): Promise<MomentLog[]> {
  const userId = await getAuthUserId();

  const { data, error } = await supabase
    .from('moment_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent moments:', error);
    return [];
  }

  return (data || []).map(row => mapDbToMomentLog(row as DbMomentLog));
}

/**
 * Get today's moments for stats
 */
export async function getTodayMoments(): Promise<MomentLog[]> {
  const userId = await getAuthUserId();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('moment_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_at', today.toISOString())
    .order('logged_at', { ascending: false });

  if (error) {
    console.error('Error fetching today moments:', error);
    return [];
  }

  return (data || []).map(row => mapDbToMomentLog(row as DbMomentLog));
}

/**
 * Get today's stats (count of euphoria vs dysphoria)
 */
export async function getTodayStats(): Promise<{ euphoria: number; dysphoria: number }> {
  const moments = await getTodayMoments();
  return {
    euphoria: moments.filter(m => m.type === 'euphoria').length,
    dysphoria: moments.filter(m => m.type === 'dysphoria').length,
  };
}
