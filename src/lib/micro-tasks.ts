/**
 * Micro-task system — DB operations, scheduling, and stats.
 */

import { supabase } from './supabase';
import { selectMicroTask } from '../data/micro-tasks';
import type {
  MicroTaskConfig,
  MicroTaskResult,
  MicroTaskStats,
  ScheduledMicro,
  MicroTask,
} from '../types/micro-tasks';

// =============================
// Config
// =============================

function rowToConfig(row: Record<string, unknown>): MicroTaskConfig {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    enabled: row.enabled as boolean,
    workStart: row.work_start as string,
    workEnd: row.work_end as string,
    tasksPerDay: row.tasks_per_day as number,
    minGapMinutes: row.min_gap_minutes as number,
    maxGapMinutes: row.max_gap_minutes as number,
    createdAt: row.created_at as string,
  };
}

export async function getMicroTaskConfig(userId: string): Promise<MicroTaskConfig | null> {
  const { data, error } = await supabase
    .from('micro_task_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToConfig(data);
}

export async function getOrCreateMicroTaskConfig(userId: string): Promise<MicroTaskConfig> {
  const existing = await getMicroTaskConfig(userId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('micro_task_config')
    .insert({ user_id: userId })
    .select()
    .single();

  if (error || !data) {
    return {
      id: '',
      userId,
      enabled: true,
      workStart: '09:00',
      workEnd: '17:00',
      tasksPerDay: 8,
      minGapMinutes: 45,
      maxGapMinutes: 90,
      createdAt: new Date().toISOString(),
    };
  }
  return rowToConfig(data);
}

export async function updateMicroTaskConfig(
  userId: string,
  fields: Partial<Pick<MicroTaskConfig, 'enabled' | 'workStart' | 'workEnd' | 'tasksPerDay' | 'minGapMinutes' | 'maxGapMinutes'>>
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (fields.enabled !== undefined) row.enabled = fields.enabled;
  if (fields.workStart !== undefined) row.work_start = fields.workStart;
  if (fields.workEnd !== undefined) row.work_end = fields.workEnd;
  if (fields.tasksPerDay !== undefined) row.tasks_per_day = fields.tasksPerDay;
  if (fields.minGapMinutes !== undefined) row.min_gap_minutes = fields.minGapMinutes;
  if (fields.maxGapMinutes !== undefined) row.max_gap_minutes = fields.maxGapMinutes;

  await supabase
    .from('micro_task_config')
    .update(row)
    .eq('user_id', userId);
}

// =============================
// Completions
// =============================

export async function logMicroTaskCompletion(
  userId: string,
  task: MicroTask,
  result: MicroTaskResult,
  scheduledAt: Date,
  pointsAwarded: number
): Promise<void> {
  await supabase.from('micro_task_completions').insert({
    user_id: userId,
    micro_task_type: task.type,
    instruction: task.instruction,
    result,
    points_awarded: pointsAwarded,
    scheduled_at: scheduledAt.toISOString(),
    responded_at: result !== 'expired' ? new Date().toISOString() : null,
  });
}

export async function getMicroTaskStats(userId: string): Promise<MicroTaskStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
  if (weekStart > new Date()) weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  // Today's completions
  const { data: todayData } = await supabase
    .from('micro_task_completions')
    .select('result')
    .eq('user_id', userId)
    .gte('scheduled_at', todayStart.toISOString());

  const todayResults = todayData || [];
  const completedToday = todayResults.filter(r => r.result === 'completed').length;
  const totalToday = todayResults.length;

  // This week's completions
  const { data: weekData } = await supabase
    .from('micro_task_completions')
    .select('result')
    .eq('user_id', userId)
    .gte('scheduled_at', weekStart.toISOString());

  const weekResults = weekData || [];
  const completedThisWeek = weekResults.filter(r => r.result === 'completed').length;
  const totalThisWeek = weekResults.length;

  return { completedToday, totalToday, completedThisWeek, totalThisWeek };
}

/** Get today's completed/logged task count (to know how many have already fired). */
export async function getTodayCompletionCount(userId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('micro_task_completions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('scheduled_at', todayStart.toISOString());

  return count ?? 0;
}

// =============================
// Scheduling
// =============================

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Generate today's micro-task schedule.
 * Starts from current time if after work_start, or from work_start if before.
 * Skips slots that are in the past.
 */
export function scheduleMicroTasks(
  config: MicroTaskConfig,
  alreadyCompleted: number
): ScheduledMicro[] {
  const schedule: ScheduledMicro[] = [];
  const now = new Date();
  const today = new Date(now);

  const startMin = timeToMinutes(config.workStart);
  const endMin = timeToMinutes(config.workEnd);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // If past work_end, no tasks to schedule
  if (nowMin >= endMin) return [];

  // Start from work_start + offset, or from now if after work_start
  const effectiveStart = Math.max(startMin, nowMin);
  let currentMin = effectiveStart + randomBetween(5, 20);

  // How many tasks still need to be scheduled
  const tasksNeeded = config.tasksPerDay - alreadyCompleted;

  for (let i = 0; i < tasksNeeded && currentMin < endMin - 5; i++) {
    const task = selectMicroTask(schedule);
    const scheduledAt = new Date(today);
    scheduledAt.setHours(Math.floor(currentMin / 60), currentMin % 60, 0, 0);

    schedule.push({
      task,
      scheduledAt,
      status: 'pending',
    });

    currentMin += randomBetween(config.minGapMinutes, config.maxGapMinutes);
  }

  return schedule;
}

/**
 * Check if current time is within work hours.
 */
export function isWithinWorkHours(config: MicroTaskConfig): boolean {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= timeToMinutes(config.workStart) && nowMin < timeToMinutes(config.workEnd);
}
