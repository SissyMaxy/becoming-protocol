// Task Bank Library
// CRUD operations and task selection logic

import { supabase } from './supabase';
import { getTodayDate, getLocalDateString } from './protocol';
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

function isExcluded(task: Task, context: UserTaskContext): boolean {
  const excl = task.excludeIf;

  // Gina home check
  if (excl.ginaHome === true && context.ginaHome) {
    return true;
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

  return assignDailyTasks(selectedTasks, context, reasons);
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
    });

  if (logError) throw logError;

  return {
    success: true,
    pointsEarned,
    affirmation: task.reward.affirmation,
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

  // Get all skips
  const { count: skipCount, error: skipError } = await supabase
    .from('daily_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'skipped');

  if (skipError) throw skipError;

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
