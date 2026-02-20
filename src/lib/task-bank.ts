// Task Bank Library
// CRUD operations and task selection logic

import { supabase } from './supabase';
import { getTodayDate, getLocalDateString } from './protocol';
import { invokeWithAuth, isHandlerAIDisabled } from './handler-ai';
import type {
  Task,
  DbTask,
  DailyTask,
  DbDailyTask,
  UserTaskContext,
  TaskCategory,
  SelectionReason,
  SkipCost,
} from '../types/task-bank';
import { DEFAULT_SKIP_COST } from '../types/task-bank';
import { SYSTEM_PROMPTS } from './protocol-core/ai/system-prompts';
import { recordTaskAtLevel, getEscalationOverview } from './escalation/level-generator';
import { shouldHideTask } from './corruption-behaviors';
import { getCopyStyle } from './handler-v2/types';

// ============================================
// CONVERTERS
// ============================================

function dbTaskToTask(db: DbTask): Task {
  return {
    id: db.id,
    category: db.category as Task['category'],
    domain: db.domain as Task['domain'],
    intensity: db.intensity as Task['intensity'],
    instruction: db.instruction,
    subtext: db.subtext || undefined,
    requires: db.requires || {},
    excludeIf: db.exclude_if || {},
    completionType: db.completion_type as Task['completionType'],
    durationMinutes: db.duration_minutes || undefined,
    targetCount: db.target_count || undefined,
    reward: {
      points: db.points,
      hapticPattern: db.haptic_pattern || undefined,
      contentUnlock: db.content_unlock || undefined,
      affirmation: db.affirmation,
    },
    ratchetTriggers: db.ratchet_triggers || undefined,
    aiFlags: {
      canIntensify: db.can_intensify,
      canClone: db.can_clone,
      trackResistance: db.track_resistance,
      isCore: db.is_core,
    },
    createdAt: db.created_at,
    createdBy: db.created_by as Task['createdBy'],
    parentTaskId: db.parent_task_id || undefined,
    active: db.active,
    captureFields: db.capture_fields || undefined,
    // Hypno session task fields
    playlistIds: db.playlist_ids || undefined,
    contentIds: db.content_ids || undefined,
    ritualRequired: db.ritual_required || undefined,
    captureMode: (db.capture_mode as Task['captureMode']) || undefined,
    deviceRequired: db.device_required || undefined,
    cageRequired: db.cage_required || undefined,
    handlerFraming: db.handler_framing || undefined,
  };
}

function dbDailyTaskToDailyTask(db: DbDailyTask): DailyTask {
  return {
    id: db.id,
    taskId: db.task_id,
    task: db.task_bank ? dbTaskToTask(db.task_bank) : ({} as Task),
    assignedDate: db.assigned_date,
    assignedAt: db.assigned_at,
    status: db.status as DailyTask['status'],
    completedAt: db.completed_at || undefined,
    skippedAt: db.skipped_at || undefined,
    progress: db.progress,
    denialDayAtAssign: db.denial_day_at_assign || undefined,
    streakAtAssign: db.streak_at_assign || undefined,
    selectionReason: db.selection_reason as SelectionReason,
    enhancedInstruction: db.enhanced_instruction || undefined,
    enhancedSubtext: db.enhanced_subtext || undefined,
    enhancedAffirmation: db.enhanced_affirmation || undefined,
  };
}

// ============================================
// TASK BANK QUERIES
// ============================================

export async function getAllTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('task_bank')
    .select('*')
    .eq('active', true)
    .order('category')
    .order('intensity');

  if (error) throw error;
  return (data || []).map(dbTaskToTask);
}

export async function getTaskById(id: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from('task_bank')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return dbTaskToTask(data);
}

export async function getTasksByCategory(category: TaskCategory): Promise<Task[]> {
  const { data, error } = await supabase
    .from('task_bank')
    .select('*')
    .eq('category', category)
    .eq('active', true)
    .order('intensity');

  if (error) throw error;
  return (data || []).map(dbTaskToTask);
}

// ============================================
// REQUIREMENT CHECKING
// ============================================

function meetsRequirements(task: Task, context: UserTaskContext): boolean {
  const req = task.requires;

  // Phase check
  if (req.phase !== undefined && context.phase < req.phase) {
    return false;
  }

  // Denial day check
  if (req.denialDay) {
    if (req.denialDay.min !== undefined && context.denialDay < req.denialDay.min) {
      return false;
    }
    if (req.denialDay.max !== undefined && context.denialDay > req.denialDay.max) {
      return false;
    }
  }

  // Arousal state check
  if (req.arousalState && req.arousalState.length > 0) {
    if (!context.arousalState || !req.arousalState.includes(context.arousalState)) {
      return false;
    }
  }

  // Time of day check
  if (req.timeOfDay && req.timeOfDay.length > 0) {
    if (!req.timeOfDay.includes(context.timeOfDay) && !req.timeOfDay.includes('any')) {
      return false;
    }
  }

  // Item ownership check
  if (req.hasItem && req.hasItem.length > 0) {
    const hasAll = req.hasItem.every(item => context.ownedItems.includes(item));
    if (!hasAll) return false;
  }

  // Previous task completion check
  if (req.previousTaskIds && req.previousTaskIds.length > 0) {
    const completedAll = req.previousTaskIds.every(id =>
      context.completedTaskIds.includes(id)
    );
    if (!completedAll) return false;
  }

  // Streak check
  if (req.streakDays !== undefined && context.streakDays < req.streakDays) {
    return false;
  }

  // Total completion count check
  if (req.completedTaskCount !== undefined &&
      context.totalCompletions < req.completedTaskCount) {
    return false;
  }

  return true;
}

// Categories that are too vague to be actionable (per user feedback)
// These are journal prompts or vision statements, not real tasks
const EXCLUDED_VAGUE_CATEGORIES = ['normalize', 'seed'];

function isExcluded(task: Task, context: UserTaskContext): boolean {
  const excl = task.excludeIf;

  // Exclude vague/narrative task categories (not actionable)
  if (EXCLUDED_VAGUE_CATEGORIES.includes(task.category)) {
    return true;
  }

  // Gina home check — corruption-level-aware
  if (context.ginaHome) {
    const requiresPrivacy = excl.ginaHome === true;
    const isExplicit = task.intensity >= 4 && ['edge', 'wear', 'display'].includes(task.category);
    if (shouldHideTask(task.domain, task.category, requiresPrivacy, isExplicit, true, context.ginaCorruptionLevel)) {
      return true;
    }
  }

  // Gina asleep: exclude noisy categories (voice, audio, video tasks)
  if (context.ginaAsleep) {
    const noisyCategories = ['say', 'listen', 'watch', 'edge'];
    if (noisyCategories.includes(task.category)) {
      return true;
    }
    // Also exclude practice tasks in voice domain (other practice is fine)
    if (task.category === 'practice' && task.domain === 'voice') {
      return true;
    }
  }

  // Recently served check
  if (excl.recentlyServedDays !== undefined) {
    if (context.recentlyServedTaskIds.includes(task.id)) {
      return true;
    }
  }

  // Max completions check (handled via completion count in requirements)

  return false;
}

// ============================================
// TASK SELECTION LOGIC
// ============================================

export async function selectDailyTasks(context: UserTaskContext): Promise<Task[]> {
  const allTasks = await getAllTasks();

  // Filter to eligible tasks
  const eligible = allTasks.filter(task =>
    meetsRequirements(task, context) && !isExcluded(task, context)
  );

  const selected: Task[] = [];
  const usedCategories = new Set<TaskCategory>();

  // 1. Mandatory: One core task per active domain (max 2)
  const coreTasks = eligible.filter(t => t.aiFlags.isCore);
  const mandatoryCoreCount = Math.min(2, coreTasks.length);

  for (let i = 0; i < mandatoryCoreCount; i++) {
    const availableCore = coreTasks.filter(t => !usedCategories.has(t.category));
    if (availableCore.length > 0) {
      const task = availableCore[Math.floor(Math.random() * availableCore.length)];
      selected.push(task);
      usedCategories.add(task.category);
    }
  }

  // 2. Resistance-targeted: If avoidance detected, add from that category
  if (context.resistancePatterns.skippedCategories.length > 0) {
    for (const category of context.resistancePatterns.skippedCategories.slice(0, 1)) {
      const resistanceTasks = eligible.filter(t =>
        t.category === category &&
        !selected.some(s => s.id === t.id) &&
        // Pick slightly easier version
        t.intensity <= Math.max(1, context.phase + 1)
      );
      if (resistanceTasks.length > 0) {
        // Pick lowest intensity in the resisted category
        resistanceTasks.sort((a, b) => a.intensity - b.intensity);
        selected.push(resistanceTasks[0]);
      }
    }
  }

  // 3. Progressive: Tasks that advance current phase
  const progressiveTasks = eligible.filter(t =>
    !selected.some(s => s.id === t.id) &&
    t.intensity >= context.phase &&
    t.intensity <= context.phase + 1
  );

  // Add 1-2 progressive tasks
  const progressiveCount = Math.min(2, Math.max(0, context.maxDailyTasks - selected.length - 1));
  for (let i = 0; i < progressiveCount; i++) {
    const available = progressiveTasks.filter(t =>
      !selected.some(s => s.id === t.id) &&
      !usedCategories.has(t.category)
    );
    if (available.length > 0) {
      const task = available[Math.floor(Math.random() * available.length)];
      selected.push(task);
      usedCategories.add(task.category);
    }
  }

  // 4. Random reinforcement (20% chance)
  if (Math.random() < 0.2 && selected.length < context.maxDailyTasks) {
    const surpriseTasks = eligible.filter(t =>
      !selected.some(s => s.id === t.id) &&
      t.intensity <= context.phase + 2
    );
    if (surpriseTasks.length > 0) {
      const task = surpriseTasks[Math.floor(Math.random() * surpriseTasks.length)];
      selected.push(task);
    }
  }

  return selected.slice(0, context.maxDailyTasks);
}

// ============================================
// DAILY TASK MANAGEMENT
// ============================================

export async function getTodayTasks(): Promise<DailyTask[]> {
  const today = getTodayDate(); // Use local timezone, not UTC

  const { data, error } = await supabase
    .from('daily_tasks')
    .select(`
      *,
      task_bank (*)
    `)
    .eq('assigned_date', today)
    .order('created_at');

  if (error) throw error;
  return (data || []).map(dbDailyTaskToDailyTask);
}

export async function assignDailyTasks(
  tasks: Task[],
  context: UserTaskContext,
  selectionReasons: Record<string, SelectionReason>
): Promise<DailyTask[]> {
  const today = getTodayDate(); // Use local timezone, not UTC

  const inserts = tasks.map(task => ({
    user_id: context.userId,
    task_id: task.id,
    assigned_date: today,
    status: 'pending',
    progress: 0,
    denial_day_at_assign: context.denialDay,
    streak_at_assign: context.streakDays,
    selection_reason: selectionReasons[task.id] || 'progressive',
  }));

  const { data, error } = await supabase
    .from('daily_tasks')
    .insert(inserts)
    .select(`
      *,
      task_bank (*)
    `);

  if (error) throw error;
  return (data || []).map(dbDailyTaskToDailyTask);
}

export async function getOrCreateTodayTasks(context: UserTaskContext): Promise<DailyTask[]> {
  // Check if tasks already assigned for today
  const existing = await getTodayTasks();
  if (existing.length > 0) {
    return existing;
  }

  // Select and assign new tasks
  const selectedTasks = await selectDailyTasks(context);

  // Determine selection reasons
  const reasons: Record<string, SelectionReason> = {};
  selectedTasks.forEach((task, index) => {
    if (task.aiFlags.isCore && index < 2) {
      reasons[task.id] = 'mandatory';
    } else if (context.resistancePatterns.skippedCategories.includes(task.category)) {
      reasons[task.id] = 'resistance_target';
    } else {
      reasons[task.id] = 'progressive';
    }
  });

  const assigned = await assignDailyTasks(selectedTasks, context, reasons);

  // Check escalation readiness across domains (fire-and-forget hook for future dynamic task injection)
  getEscalationOverview(context.userId).then(overview => {
    const ready = overview.filter(d => d.advancementReady);
    if (ready.length > 0) {
      console.log('[TaskBank] Domains ready for advancement:', ready.map(d => `${d.domain} (level ${d.currentLevel})`).join(', '));
    }
  }).catch(() => { /* silent */ });

  return assigned;
}

// ============================================
// TASK COMPLETION
// ============================================

export async function completeTask(
  dailyTaskId: string,
  context: Partial<{
    denialDay: number;
    arousalState: string;
    streakDay: number;
    feltGood: boolean;
    notes: string;
    captureData: Record<string, unknown>;
  }> = {}
): Promise<{ success: boolean; pointsEarned: number; affirmation: string }> {
  // Get the daily task
  const { data: dailyTask, error: fetchError } = await supabase
    .from('daily_tasks')
    .select(`
      *,
      task_bank (*)
    `)
    .eq('id', dailyTaskId)
    .single();

  if (fetchError) throw fetchError;
  if (!dailyTask) throw new Error('Task not found');
  if (!dailyTask.task_bank) throw new Error('Task definition not found');

  const task = dbTaskToTask(dailyTask.task_bank);
  const pointsEarned = task.reward.points;

  // Update daily task status
  const { error: updateError } = await supabase
    .from('daily_tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', dailyTaskId);

  if (updateError) throw updateError;

  // Log completion
  const { error: logError } = await supabase
    .from('task_completions')
    .insert({
      user_id: dailyTask.user_id,
      task_id: dailyTask.task_id,
      daily_task_id: dailyTaskId,
      denial_day: context.denialDay,
      arousal_state: context.arousalState,
      streak_day: context.streakDay,
      felt_good: context.feltGood,
      notes: context.notes,
      points_earned: pointsEarned,
      capture_data: context.captureData || null,
    });

  if (logError) throw logError;

  // If this is a reflect task, also create a linked journal entry
  if (context.captureData?.completion_type === 'reflect' && context.captureData?.reflection_text) {
    const today = getTodayDate();
    supabase
      .from('daily_entries')
      .upsert({
        user_id: dailyTask.user_id,
        date: today,
        handler_notes: context.captureData.reflection_text as string,
      }, { onConflict: 'user_id,date' })
      .then(({ error: journalError }) => {
        if (journalError) console.warn('[TaskBank] Failed to create journal entry from reflection:', journalError.message);
        else console.log('[TaskBank] Reflection linked to journal for', today);
      });
  }

  // Record task at domain level for infinite escalation tracking (fire-and-forget)
  recordTaskAtLevel(dailyTask.user_id, task.domain, task.intensity, true).catch(err => {
    console.warn('[TaskBank] Escalation tracking failed:', err);
  });

  return {
    success: true,
    pointsEarned,
    // Prefer Claude-enhanced affirmation over base template
    affirmation: dailyTask.enhanced_affirmation || task.reward.affirmation,
  };
}

export async function updateTaskProgress(
  dailyTaskId: string,
  progress: number
): Promise<void> {
  const { error } = await supabase
    .from('daily_tasks')
    .update({ progress })
    .eq('id', dailyTaskId);

  if (error) throw error;
}

export async function uncompleteTask(
  dailyTaskId: string
): Promise<{ success: boolean }> {
  // Get the daily task to find associated completion record
  const { data: dailyTask, error: fetchError } = await supabase
    .from('daily_tasks')
    .select('*, task_bank (*)')
    .eq('id', dailyTaskId)
    .single();

  if (fetchError) throw fetchError;
  if (!dailyTask) throw new Error('Task not found');

  // Update daily task status back to pending
  const { error: updateError } = await supabase
    .from('daily_tasks')
    .update({
      status: 'pending',
      completed_at: null,
    })
    .eq('id', dailyTaskId);

  if (updateError) throw updateError;

  // Delete the completion record if it exists
  const { error: deleteError } = await supabase
    .from('task_completions')
    .delete()
    .eq('daily_task_id', dailyTaskId);

  // Ignore delete errors - completion record might not exist
  if (deleteError) {
    console.warn('Could not delete completion record:', deleteError);
  }

  return { success: true };
}

// ============================================
// TASK SKIPPING
// ============================================

export async function skipTask(
  dailyTaskId: string,
  _reason?: string
): Promise<{ cost: SkipCost; weeklySkipCount: number }> {
  // Get the daily task
  const { data: dailyTask, error: fetchError } = await supabase
    .from('daily_tasks')
    .select('*, task_bank (*)')
    .eq('id', dailyTaskId)
    .single();

  if (fetchError) throw fetchError;
  if (!dailyTask) throw new Error('Task not found');

  // Update status
  const { error: updateError } = await supabase
    .from('daily_tasks')
    .update({
      status: 'skipped',
      skipped_at: new Date().toISOString(),
    })
    .eq('id', dailyTaskId);

  if (updateError) throw updateError;

  // Log resistance
  const { error: resistanceError } = await supabase
    .from('task_resistance')
    .insert({
      user_id: dailyTask.user_id,
      task_id: dailyTask.task_id,
      resistance_type: 'skip',
    });

  if (resistanceError) throw resistanceError;

  // Count weekly skips
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { count, error: countError } = await supabase
    .from('daily_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', dailyTask.user_id)
    .eq('status', 'skipped')
    .gte('skipped_at', weekAgo.toISOString());

  if (countError) throw countError;

  return {
    cost: DEFAULT_SKIP_COST,
    weeklySkipCount: count || 0,
  };
}

// ============================================
// STATISTICS
// ============================================

export async function getTaskStats(): Promise<{
  totalCompleted: number;
  totalSkipped: number;
  completionsByCategory: Record<TaskCategory, number>;
  currentStreak: number;
  longestStreak: number;
}> {
  // Get all completions
  const { data: completions, error: compError } = await supabase
    .from('task_completions')
    .select('*, task_bank!inner(category)')
    .order('completed_at', { ascending: false });

  if (compError) throw compError;

  // Get all skips (non-critical — don't crash if this fails)
  let skipCount = 0;
  try {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      const { count, error: skipError } = await supabase
        .from('daily_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUser.id)
        .eq('status', 'skipped');

      if (!skipError) skipCount = count || 0;
    }
  } catch {
    // Skip count is non-critical, continue with 0
  }

  // Calculate completions by category
  const completionsByCategory: Record<string, number> = {};
  (completions || []).forEach(c => {
    const category = (c.task_bank as any)?.category;
    if (category) {
      completionsByCategory[category] = (completionsByCategory[category] || 0) + 1;
    }
  });

  // Calculate streak (days with at least one completion)
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let lastDate: string | null = null;

  const completionDates = [...new Set(
    (completions || []).map(c => c.completed_at.split('T')[0])
  )].sort().reverse();

  const today = getTodayDate(); // Use local timezone, not UTC

  for (const date of completionDates) {
    if (lastDate === null) {
      if (date === today || isYesterday(date)) {
        tempStreak = 1;
        currentStreak = 1;
      }
    } else {
      const dayDiff = daysBetween(date, lastDate);
      if (dayDiff === 1) {
        tempStreak++;
        if (currentStreak > 0) currentStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
        currentStreak = 0;
      }
    }
    lastDate = date;
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  return {
    totalCompleted: completions?.length || 0,
    totalSkipped: skipCount || 0,
    completionsByCategory: completionsByCategory as Record<TaskCategory, number>,
    currentStreak,
    longestStreak,
  };
}

// ============================================
// RESISTANCE PATTERNS
// ============================================

export async function getResistancePatterns(): Promise<{
  skippedCategories: TaskCategory[];
  skippedTaskIds: string[];
  delayPatterns: boolean;
}> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 14);

  const { data: resistance, error } = await supabase
    .from('task_resistance')
    .select('*, task_bank!inner(category)')
    .gte('detected_at', weekAgo.toISOString())
    .eq('resolved', false);

  if (error) throw error;

  // Count skips by category
  const categorySkips: Record<string, number> = {};
  const taskSkips: Record<string, number> = {};

  (resistance || []).forEach(r => {
    const category = (r.task_bank as any)?.category;
    if (category) {
      categorySkips[category] = (categorySkips[category] || 0) + 1;
    }
    taskSkips[r.task_id] = (taskSkips[r.task_id] || 0) + 1;
  });

  // Categories with 2+ skips
  const skippedCategories = Object.entries(categorySkips)
    .filter(([_, count]) => count >= 2)
    .map(([cat]) => cat as TaskCategory);

  // Tasks skipped 2+ times
  const skippedTaskIds = Object.entries(taskSkips)
    .filter(([_, count]) => count >= 2)
    .map(([id]) => id);

  // Check for delay patterns (tasks completed in final hour consistently)
  // This would require more complex time analysis
  const delayPatterns = false;

  return {
    skippedCategories,
    skippedTaskIds,
    delayPatterns,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function isYesterday(dateStr: string): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return dateStr === getLocalDateString(yesterday); // Use local timezone, not UTC
}

function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diff = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// ============================================
// DEBUG FUNCTIONS
// ============================================

/**
 * Delete all tasks for today and force regeneration on next load
 */
export async function clearTodayTasks(): Promise<void> {
  const today = getTodayDate();

  // First, get the task IDs for today
  const { data: todayTasks, error: fetchError } = await supabase
    .from('daily_tasks')
    .select('id')
    .eq('assigned_date', today);

  if (fetchError) {
    console.error('Failed to fetch today tasks:', fetchError);
    throw fetchError;
  }

  if (!todayTasks || todayTasks.length === 0) {
    console.log(`[TaskBank] No tasks to clear for ${today}`);
    return;
  }

  const taskIds = todayTasks.map(t => t.id);

  // Delete related task_completions first (foreign key constraint)
  const { error: completionsError } = await supabase
    .from('task_completions')
    .delete()
    .in('daily_task_id', taskIds);

  if (completionsError) {
    console.error('Failed to clear task completions:', completionsError);
    throw completionsError;
  }

  // Delete related task_resistance records
  const { error: resistanceError } = await supabase
    .from('task_resistance')
    .delete()
    .in('task_id', taskIds);

  if (resistanceError) {
    console.warn('Failed to clear task resistance (may not exist):', resistanceError);
    // Don't throw - table might not exist
  }

  // Now delete the daily_tasks
  const { error } = await supabase
    .from('daily_tasks')
    .delete()
    .eq('assigned_date', today);

  if (error) {
    console.error('Failed to clear today tasks:', error);
    throw error;
  }

  console.log(`[TaskBank] Cleared ${taskIds.length} tasks for ${today}`);
}

/**
 * Show all tasks in the database for debugging
 */
export async function debugShowAllTasks(): Promise<void> {
  const today = getTodayDate();
  const utcToday = new Date().toISOString().split('T')[0];

  console.log('[TaskBank Debug]');
  console.log('  Today (local):', today);
  console.log('  Today (UTC):', utcToday);

  const { data, error } = await supabase
    .from('daily_tasks')
    .select('id, assigned_date, status, created_at')
    .order('assigned_date', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Failed to fetch tasks:', error);
    return;
  }

  console.log('  Recent tasks:');
  console.table(data);
}

// ============================================
// TASK IMPORT
// ============================================

export interface TaskImportData {
  category: string;
  domain: string;
  intensity: 1 | 2 | 3 | 4 | 5;
  instruction: string;
  subtext?: string;
  completionType?: 'binary' | 'duration' | 'count' | 'confirm';
  durationMinutes?: number;
  targetCount?: number;
  points?: number;
  affirmation?: string;
  requires?: {
    phase?: number;
    denialDay?: { min?: number; max?: number };
    streakDays?: number;
  };
  isCore?: boolean;
  canIntensify?: boolean;
}

export interface TaskImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: string[];
}

/**
 * Import tasks from JSON array
 * Supports simplified format - will fill in defaults
 */
export async function importTasks(tasks: TaskImportData[]): Promise<TaskImportResult> {
  const errors: string[] = [];
  let imported = 0;
  let failed = 0;

  // Valid categories and domains (must match types/task-bank.ts)
  const validCategories = [
    'wear', 'listen', 'say', 'apply', 'watch', 'edge', 'lock', 'practice',
    'use', 'remove', 'commit', 'expose', 'serve', 'surrender', 'plug',
    'sissygasm', 'oral', 'thirst', 'fantasy', 'corrupt', 'worship', 'deepen', 'bambi',
    'acquire', 'explore', 'ritual', 'measure', 'milestone', 'condition', 'care'
  ];

  const validDomains = [
    'voice', 'movement', 'skincare', 'style', 'makeup', 'social',
    'body_language', 'inner_narrative', 'arousal', 'chastity', 'conditioning', 'identity',
    'exercise', 'nutrition', 'scent', 'wigs'
  ];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

    // Validate required fields
    if (!task.instruction) {
      errors.push(`Task ${i + 1}: Missing instruction`);
      failed++;
      continue;
    }

    if (!task.category || !validCategories.includes(task.category)) {
      errors.push(`Task ${i + 1}: Invalid category "${task.category}"`);
      failed++;
      continue;
    }

    if (!task.domain || !validDomains.includes(task.domain)) {
      errors.push(`Task ${i + 1}: Invalid domain "${task.domain}"`);
      failed++;
      continue;
    }

    if (!task.intensity || task.intensity < 1 || task.intensity > 5) {
      errors.push(`Task ${i + 1}: Invalid intensity (must be 1-5)`);
      failed++;
      continue;
    }

    // Build the insert object with defaults
    const insert = {
      category: task.category,
      domain: task.domain,
      intensity: task.intensity,
      instruction: task.instruction,
      subtext: task.subtext || null,
      completion_type: task.completionType || 'binary',
      duration_minutes: task.durationMinutes || null,
      target_count: task.targetCount || null,
      points: task.points || (task.intensity * 10), // Default: intensity * 10
      affirmation: task.affirmation || 'Good girl.',
      haptic_pattern: null,
      content_unlock: null,
      requires: task.requires || {},
      exclude_if: {},
      ratchet_triggers: null,
      can_intensify: task.canIntensify ?? true,
      can_clone: true,
      track_resistance: true,
      is_core: task.isCore ?? false,
      created_by: 'user',
      parent_task_id: null,
      active: true,
    };

    const { error } = await supabase
      .from('task_bank')
      .insert(insert);

    if (error) {
      errors.push(`Task ${i + 1}: ${error.message}`);
      failed++;
    } else {
      imported++;
    }
  }

  return {
    success: failed === 0,
    imported,
    failed,
    errors,
  };
}

/**
 * Bulk import tasks - faster, single insert
 */
export async function bulkImportTasks(tasks: TaskImportData[]): Promise<TaskImportResult> {
  const errors: string[] = [];
  const validInserts: Record<string, unknown>[] = [];

  const validCategories = [
    'wear', 'listen', 'say', 'apply', 'watch', 'edge', 'lock', 'practice',
    'use', 'remove', 'commit', 'expose', 'serve', 'surrender', 'plug',
    'sissygasm', 'oral', 'thirst', 'fantasy', 'corrupt', 'worship', 'deepen', 'bambi',
    'acquire', 'explore', 'ritual', 'measure', 'milestone', 'condition', 'care'
  ];

  const validDomains = [
    'voice', 'movement', 'skincare', 'style', 'makeup', 'social',
    'body_language', 'inner_narrative', 'arousal', 'chastity', 'conditioning', 'identity',
    'exercise', 'nutrition', 'scent', 'wigs'
  ];

  // Validate all tasks first
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

    if (!task.instruction) {
      errors.push(`Task ${i + 1}: Missing instruction`);
      continue;
    }

    if (!task.category || !validCategories.includes(task.category)) {
      errors.push(`Task ${i + 1}: Invalid category "${task.category}"`);
      continue;
    }

    if (!task.domain || !validDomains.includes(task.domain)) {
      errors.push(`Task ${i + 1}: Invalid domain "${task.domain}"`);
      continue;
    }

    if (!task.intensity || task.intensity < 1 || task.intensity > 5) {
      errors.push(`Task ${i + 1}: Invalid intensity (must be 1-5)`);
      continue;
    }

    validInserts.push({
      category: task.category,
      domain: task.domain,
      intensity: task.intensity,
      instruction: task.instruction,
      subtext: task.subtext || null,
      completion_type: task.completionType || 'binary',
      duration_minutes: task.durationMinutes || null,
      target_count: task.targetCount || null,
      points: task.points || (task.intensity * 10),
      affirmation: task.affirmation || 'Good girl.',
      haptic_pattern: null,
      content_unlock: null,
      requires: task.requires || {},
      exclude_if: {},
      ratchet_triggers: null,
      can_intensify: task.canIntensify ?? true,
      can_clone: true,
      track_resistance: true,
      is_core: task.isCore ?? false,
      created_by: 'user',
      parent_task_id: null,
      active: true,
    });
  }

  if (validInserts.length === 0) {
    return {
      success: false,
      imported: 0,
      failed: tasks.length,
      errors,
    };
  }

  // Bulk insert
  const { error, data } = await supabase
    .from('task_bank')
    .insert(validInserts)
    .select('id');

  if (error) {
    errors.push(`Bulk insert failed: ${error.message}`);
    return {
      success: false,
      imported: 0,
      failed: tasks.length,
      errors,
    };
  }

  return {
    success: errors.length === 0,
    imported: data?.length || validInserts.length,
    failed: tasks.length - validInserts.length,
    errors,
  };
}

/**
 * Get task count by domain
 */
export async function getTaskCountByDomain(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('task_bank')
    .select('domain')
    .eq('active', true);

  if (error) throw error;

  const counts: Record<string, number> = {};
  (data || []).forEach(t => {
    counts[t.domain] = (counts[t.domain] || 0) + 1;
  });

  return counts;
}

/**
 * Clear all user-imported tasks
 */
export async function clearUserTasks(): Promise<number> {
  const { data, error } = await supabase
    .from('task_bank')
    .delete()
    .eq('created_by', 'user')
    .select('id');

  if (error) throw error;
  return data?.length || 0;
}

/**
 * Clear ALL tasks from task bank (seed + user imported)
 * Use with caution - this wipes everything
 */
export async function clearAllTasks(): Promise<number> {
  // First clear daily_tasks to avoid FK constraint issues
  await supabase.from('daily_tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Then clear the task bank
  const { data, error } = await supabase
    .from('task_bank')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all rows
    .select('id');

  if (error) throw error;
  return data?.length || 0;
}

/**
 * Replace all tasks - clear everything and import new tasks
 */
export async function replaceAllTasks(tasks: TaskImportData[]): Promise<{
  success: boolean;
  deleted: number;
  imported: number;
  failed: number;
  errors: string[];
}> {
  const errors: string[] = [];

  // Step 1: Clear all existing tasks
  let deleted = 0;
  try {
    deleted = await clearAllTasks();
  } catch (err) {
    return {
      success: false,
      deleted: 0,
      imported: 0,
      failed: 0,
      errors: [`Failed to clear tasks: ${err instanceof Error ? err.message : 'Unknown error'}`],
    };
  }

  // Step 2: Import new tasks
  const importResult = await bulkImportTasks(tasks);

  return {
    success: importResult.imported > 0,
    deleted,
    imported: importResult.imported,
    failed: importResult.failed,
    errors: [...errors, ...importResult.errors],
  };
}

// ============================================
// TASK ENHANCEMENT (Claude personalization)
// ============================================

export interface TaskEnhancementContext {
  chosenName: string;
  denialDay: number;
  streakDays: number;
  arousalLevel: number;
  escalationLevel: number;
  timeOfDay: string;
  ginaHome: boolean;
  ginaAsleep: boolean;
  execFunction: string;
  avoidedDomains: string[];
  recentCompleted: string[];  // last 3-5 completed task instructions
  recentJournal: string[];    // recent journal snippets
  recentResistance: string[]; // recently skipped/resisted categories
  handlerMode: string;
}

/**
 * Enhance tasks with Claude-personalized instruction/subtext/affirmation.
 * Sends all pending tasks in one batch to minimize API calls.
 * Caches results in the daily_tasks table so they persist across refreshes.
 * Falls back to base task text when AI is unavailable.
 */
export async function enhanceTasks(
  tasks: DailyTask[],
  context: TaskEnhancementContext
): Promise<DailyTask[]> {
  // Filter to pending tasks that haven't been enhanced yet
  const needsEnhancement = tasks.filter(
    t => t.status === 'pending' && !t.enhancedInstruction
  );

  if (needsEnhancement.length === 0) {
    return tasks; // All tasks already enhanced or not pending
  }

  // Skip if handler AI is disabled (billing error)
  if (isHandlerAIDisabled()) {
    console.log('[TaskEnhance] Skipped — handler AI disabled');
    return tasks;
  }

  // Arousal-gated copy formatting directive
  const copyStyle = getCopyStyle(context.arousalLevel);
  const formatDirective = copyStyle === 'command'
    ? 'COPY FORMAT: COMMAND MODE. Max 3 lines per task. Verb-first every sentence. No preamble, no softening. Raw imperative.'
    : copyStyle === 'short'
      ? 'COPY FORMAT: SHORT MODE. Max 4 lines per task. Imperative sentences only. No filler, no explanation.'
      : 'COPY FORMAT: NORMAL. Up to 6 sentences per task. Direct, commanding.';

  // Build Handler-voiced system prompt using the real Handler identity
  const systemPrompt = `${SYSTEM_PROMPTS.base}

OPERATION: BATCH TASK ENHANCEMENT
Rewrite each task as a direct Handler instruction to ${context.chosenName}.
Address her by name. Be specific to her current state.
These are not suggestions — they are assignments from her Handler.

CURRENT STATE:
- Denial day: ${context.denialDay}
- Arousal level: ${context.arousalLevel}/10
- Escalation level: ${context.escalationLevel}
- Energy: ${context.execFunction}
- Privacy: ${context.ginaHome ? 'Gina home' : 'alone'}${context.ginaAsleep ? ' (asleep)' : ''}
- Time: ${context.timeOfDay}
- Handler mode: ${context.handlerMode}
${context.avoidedDomains.length > 0 ? `- AVOIDING: ${context.avoidedDomains.join(', ')} — push into these.` : ''}
${context.recentResistance.length > 0 ? `- RECENT RESISTANCE: ${context.recentResistance.join(', ')} — address this.` : ''}

${formatDirective}

RULES:
- Keep the same core action but make it feel personally targeted
- Low energy: fewer spoons, but no free passes. Reduce friction, not expectations.
- High arousal + high denial: leverage it. Extract more.
- Reference her data. Be specific, not generic.
- STRICTLY obey the COPY FORMAT above — aroused eyes don't read walls of text.
- "subtext" = one sentence that makes it personal (reference streak, denial, recent behavior)
- "affirmation" = completion reward message in Handler voice

Respond ONLY with a JSON array: [{"id": "task_id", "instruction": "...", "subtext": "...", "affirmation": "..."}]`;

  const taskList = needsEnhancement.map(t => ({
    id: t.id,
    instruction: t.task.instruction,
    category: t.task.category,
    domain: t.task.domain,
    intensity: t.task.intensity,
  }));

  const userPrompt = `${context.chosenName}'s tasks for today. Enhance each one.

${context.recentCompleted.length > 0 ? `Recently completed: ${context.recentCompleted.join(' | ')}` : 'No tasks completed yet today.'}
${context.recentJournal.length > 0 ? `Recent journal: "${context.recentJournal[0]}"` : ''}

Tasks to enhance:
${JSON.stringify(taskList, null, 2)}`;

  try {
    console.log('[TaskEnhance] Calling handler-ai enhance_tasks for', needsEnhancement.length, 'tasks');
    const { data, error } = await invokeWithAuth('handler-ai', {
      action: 'enhance_tasks',
      systemPrompt,
      userPrompt,
    });

    if (error) {
      console.error('[TaskEnhance] AI call failed:', error.message);
      return tasks;
    }

    console.log('[TaskEnhance] Raw response:', JSON.stringify(data).substring(0, 200));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enhanced: Array<{ id: string; instruction: string; subtext: string; affirmation: string }> =
      (data as any)?.enhanced || [];

    if (enhanced.length === 0) {
      console.warn('[TaskEnhance] No enhanced tasks returned');
      return tasks;
    }

    // Build lookup map
    const enhancedMap = new Map(enhanced.map(e => [e.id, e]));

    // Update tasks in memory and persist to DB
    const updatedTasks = tasks.map(t => {
      const e = enhancedMap.get(t.id);
      if (!e) return t;

      return {
        ...t,
        enhancedInstruction: e.instruction,
        enhancedSubtext: e.subtext,
        enhancedAffirmation: e.affirmation,
        copyStyle,
      };
    });

    // Persist enhancements to DB (fire-and-forget, don't block UI)
    for (const e of enhanced) {
      supabase
        .from('daily_tasks')
        .update({
          enhanced_instruction: e.instruction,
          enhanced_subtext: e.subtext,
          enhanced_affirmation: e.affirmation,
        })
        .eq('id', e.id)
        .then(({ error: dbErr }) => {
          if (dbErr) console.warn('[TaskEnhance] Failed to cache enhancement:', dbErr.message);
        });
    }

    console.log(`[TaskEnhance] Enhanced ${enhanced.length}/${needsEnhancement.length} tasks`);
    return updatedTasks;
  } catch (err) {
    console.warn('[TaskEnhance] Unexpected error:', err);
    return tasks;
  }
}

/**
 * Build enhancement context from available hooks/state.
 * Called from useTaskBank after loading tasks.
 */
export async function buildEnhancementContext(
  userId: string
): Promise<TaskEnhancementContext> {
  // Parallel queries for context
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [profileResult, stateResult, completionsResult, journalResult, resistanceResult] = await Promise.all([
    supabase.from('profile_foundation').select('chosen_name').eq('user_id', userId).maybeSingle(),
    supabase.from('user_state').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('task_completions')
      .select('task_bank!inner(instruction)')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(5),
    supabase
      .from('mood_checkins')
      .select('notes')
      .eq('user_id', userId)
      .not('notes', 'is', null)
      .order('created_at', { ascending: false })
      .limit(2),
    supabase
      .from('task_resistance')
      .select('task_bank!inner(category)')
      .eq('user_id', userId)
      .gte('detected_at', weekAgo.toISOString())
      .limit(20),
  ]);

  const state = stateResult.data;
  const hour = new Date().getHours();
  const timeOfDay = hour >= 5 && hour < 12 ? 'morning'
    : hour >= 12 && hour < 17 ? 'afternoon'
    : hour >= 17 && hour < 21 ? 'evening'
    : 'night';

  // Deduplicate resisted categories
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resistedCategories = [...new Set(
    (resistanceResult.data || [])
      .map((r: any) => (r.task_bank as any)?.category)
      .filter(Boolean)
  )];

  return {
    chosenName: profileResult.data?.chosen_name || 'her',
    denialDay: state?.denial_day || 0,
    streakDays: state?.streak_days || 0,
    arousalLevel: state?.current_arousal || 0,
    escalationLevel: state?.escalation_level || 0,
    timeOfDay,
    ginaHome: state?.gina_home !== false,
    ginaAsleep: state?.gina_asleep || false,
    execFunction: state?.estimated_exec_function || 'medium',
    avoidedDomains: state?.avoided_domains || [],
    recentCompleted: (completionsResult.data || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => c.task_bank?.instruction)
      .filter(Boolean)
      .slice(0, 5),
    recentJournal: (journalResult.data || [])
      .map((j: { notes: string }) => j.notes)
      .filter(Boolean)
      .slice(0, 2),
    recentResistance: resistedCategories as string[],
    handlerMode: state?.handler_mode || 'director',
  };
}

// Expose debug functions globally
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__debugTaskBank = {
    showTasks: debugShowAllTasks,
    clearToday: async () => {
      await clearTodayTasks();
      console.log('Done! Refresh the page to get new tasks.');
      return 'Tasks cleared. Refresh the page.';
    },
    showDates: () => {
      const today = getTodayDate();
      const utcToday = new Date().toISOString().split('T')[0];
      console.log('Today (local):', today);
      console.log('Today (UTC):', utcToday);
      console.log('Timezone offset (hours):', new Date().getTimezoneOffset() / -60);
    }
  };

  console.log('[TaskBank Debug] Tools available at window.__debugTaskBank');
  console.log('[TaskBank Debug] Commands: showTasks(), clearToday(), showDates()');
}
