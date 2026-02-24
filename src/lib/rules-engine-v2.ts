/**
 * Rules Engine v2 - Layer 1
 * Implements v2 Part 8.3: Task selection algorithm
 *
 * Rules:
 * 1. Time window filtering (morning/evening/night/any)
 * 2. Trigger conditions (denial day, arousal state, etc.)
 * 3. Privacy filtering (no intimate tasks when Gina home)
 * 4. No immediate repetition (category+domain combo)
 * 5. Avoidance confrontation (30% chance to surface avoided domains)
 * 6. Intensity scaling based on odometer state
 * 7. Weighted random selection (core tasks weighted higher)
 */

import type { Task } from '../types/task-bank';

// Privacy-required domains/categories — shared with view-layer filters
export const PRIVACY_REQUIRED_DOMAINS: string[] = ['arousal', 'conditioning'];
export const PRIVACY_REQUIRED_CATEGORIES: string[] = ['edge', 'goon', 'deepen', 'worship', 'bambi', 'corrupt', 'session'];

// Time of day derived from current hour
// Matches TimeWindow from task-bank types
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

// Odometer states from v2 spec
export type OdometerState = 'survival' | 'caution' | 'coasting' | 'progress' | 'momentum' | 'breakthrough';

// User state for task selection
export interface UserStateForSelection {
  userId: string;

  // Time context
  timeOfDay: TimeOfDay;

  // Privacy context
  ginaHome: boolean;

  // Arousal/denial context
  denialDay: number;
  currentArousal: number; // 0-5
  inSession: boolean;

  // Energy/mental state
  odometer: OdometerState;
  estimatedExecFunction: 'high' | 'medium' | 'low' | 'depleted';

  // Progress context
  currentPhase: number;
  streakDays: number;

  // Last task context (for no-repeat)
  lastTaskId: string | null;
  lastTaskCategory: string | null;
  lastTaskDomain: string | null;

  // Avoidance tracking
  avoidedDomains: string[];

  // Completed today (for variety)
  completedTodayDomains: string[];
  completedTodayCategories: string[];

  // Items owned (for has_item requirements)
  ownedItems: string[];

  // Completed task IDs (for prerequisite checks)
  completedTaskIds: string[];
}

/**
 * Get current time of day.
 * When wakeHour/bedHour are provided, windows are calculated relative to wake time.
 * Default: wake=5, bed=22
 */
export function getCurrentTimeOfDay(wakeHour?: number, bedHour?: number): TimeOfDay {
  const hour = new Date().getHours();
  const wake = wakeHour ?? 5;
  const bed = bedHour ?? 22;
  const midDay = wake + Math.floor((bed - wake) * 0.4); // ~40% of awake time = afternoon
  const evening = wake + Math.floor((bed - wake) * 0.75); // ~75% = evening

  if (hour >= wake && hour < midDay) return 'morning';
  if (hour >= midDay && hour < evening) return 'afternoon';
  if (hour >= evening && hour < bed) return 'evening';
  return 'night';
}

/** Map canonical TimeOfDay to late_night variant used by some handler contexts */
export function mapTimeOfDayLateNight(t: TimeOfDay): 'morning' | 'afternoon' | 'evening' | 'late_night' {
  return t === 'night' ? 'late_night' : t;
}

/**
 * Get target intensity based on odometer state
 */
function getTargetIntensity(state: UserStateForSelection): number {
  const odometerMap: Record<OdometerState, number> = {
    'survival': 1,
    'caution': 2,
    'coasting': 3,
    'progress': 3,
    'momentum': 4,
    'breakthrough': 5,
  };

  let base = odometerMap[state.odometer] || 3;

  // Boost intensity if high arousal and denial day 4+
  if (state.currentArousal >= 4 && state.denialDay >= 4) {
    base = Math.min(5, base + 1);
  }

  // Reduce intensity if depleted exec function
  if (state.estimatedExecFunction === 'depleted') {
    base = Math.max(1, base - 1);
  }

  return base;
}

/**
 * Check if task meets time window requirement
 */
function meetsTimeWindow(task: Task, state: UserStateForSelection): boolean {
  const timeWindow = task.requires.timeOfDay;

  // No time restriction
  if (!timeWindow || timeWindow.length === 0 || timeWindow.includes('any')) {
    return true;
  }

  // Map time_window values to TimeOfDay
  // Task CSV uses: morning, daytime, evening, night, any
  return timeWindow.includes(state.timeOfDay);
}

/**
 * Evaluate CSV trigger_condition string against current state.
 * Known triggers map to state checks. Unknown triggers return false (conservative).
 */
function meetsTriggerString(trigger: string, state: UserStateForSelection): boolean {
  const t = trigger.toLowerCase().trim();

  // Denial-based triggers
  if (t === 'denial_48hr+' || t === 'denial_2d+') return state.denialDay >= 2;
  if (t === 'denial_72hr+' || t === 'denial_3d+') return state.denialDay >= 3;
  if (t === 'denial_7d+' || t === 'denial_1w+') return state.denialDay >= 7;
  if (t === 'denial_14d+' || t === 'denial_2w+') return state.denialDay >= 14;
  if (t === 'denial_30d+' || t === 'denial_1m+') return state.denialDay >= 30;

  // Arousal-based triggers
  if (t === 'peak_arousal' || t === 'arousal_peak') return state.currentArousal >= 5;
  if (t === 'high_arousal' || t === 'arousal_high') return state.currentArousal >= 4;
  if (t === 'medium_arousal') return state.currentArousal >= 3;

  // Session-based triggers
  if (t === 'in_session' || t === 'during_session') return state.inSession;
  if (t === 'post_session' || t === 'after_session') return !state.inSession && state.currentArousal >= 2;
  if (t === 'goon_30min+' || t === 'goon_session') return state.inSession && state.currentArousal >= 4;
  if (t === 'post_hypno') return !state.inSession;

  // Streak-based triggers
  if (t === 'streak_7d+' || t === 'streak_1w+') return state.streakDays >= 7;
  if (t === 'streak_14d+' || t === 'streak_2w+') return state.streakDays >= 14;
  if (t === 'streak_30d+') return state.streakDays >= 30;

  // Privacy/time triggers (already handled by other filters, pass through)
  if (t === 'alone' || t === 'private' || t === 'privacy') return !state.ginaHome;
  if (t === 'nighttime' || t === 'bedtime') return state.timeOfDay === 'night';

  // Phase triggers
  if (t.startsWith('phase_')) {
    const phaseNum = parseInt(t.replace('phase_', ''), 10);
    if (!isNaN(phaseNum)) return state.currentPhase >= phaseNum;
  }

  // Odometer triggers
  if (t === 'momentum' || t === 'momentum+') return state.odometer === 'momentum' || state.odometer === 'breakthrough';
  if (t === 'breakthrough') return state.odometer === 'breakthrough';

  // Unknown trigger — default to false (conservative: don't show task)
  return false;
}

/**
 * Check if task meets trigger conditions
 */
function meetsTriggerConditions(task: Task, state: UserStateForSelection): boolean {
  const req = task.requires;

  // Phase check
  if (req.phase !== undefined && state.currentPhase < req.phase) {
    return false;
  }

  // Denial day check
  if (req.denialDay) {
    if (req.denialDay.min !== undefined && state.denialDay < req.denialDay.min) {
      return false;
    }
    if (req.denialDay.max !== undefined && state.denialDay > req.denialDay.max) {
      return false;
    }
  }

  // Arousal state check
  if (req.arousalState && req.arousalState.length > 0) {
    const arousalStateNames = ['none', 'low', 'medium', 'high', 'very_high', 'peak'];
    const currentArousalName = arousalStateNames[state.currentArousal] || 'none';
    if (!req.arousalState.includes(currentArousalName)) {
      return false;
    }
  }

  // Item ownership check
  if (req.hasItem && req.hasItem.length > 0) {
    const hasAll = req.hasItem.every(item => state.ownedItems.includes(item));
    if (!hasAll) return false;
  }

  // Previous task completion check
  if (req.previousTaskIds && req.previousTaskIds.length > 0) {
    const completedAll = req.previousTaskIds.every(id =>
      state.completedTaskIds.includes(id)
    );
    if (!completedAll) return false;
  }

  // Streak check
  if (req.streakDays !== undefined && state.streakDays < req.streakDays) {
    return false;
  }

  // Day of week check
  if (req.dayOfWeek && req.dayOfWeek.length > 0) {
    const today = new Date().getDay();
    if (!req.dayOfWeek.includes(today)) return false;
  }

  // Trigger condition string check (from CSV trigger_condition)
  // Unknown triggers default to false (conservative — don't show task if we can't verify)
  if (req.trigger) {
    if (!meetsTriggerString(req.trigger, state)) return false;
  }

  return true;
}

/**
 * Check privacy filtering - no intimate tasks when Gina home
 */
function meetsPrivacyRequirement(task: Task, state: UserStateForSelection): boolean {
  if (!state.ginaHome) {
    return true; // Gina not home, all tasks available
  }

  // Check excludeIf.ginaHome
  if (task.excludeIf?.ginaHome === true) {
    return false;
  }

  // Also check requires_privacy flag if present
  // Categories that require privacy:
  const privacyRequiredDomains = PRIVACY_REQUIRED_DOMAINS;
  const privacyRequiredCategories = PRIVACY_REQUIRED_CATEGORIES;

  if (privacyRequiredDomains.includes(task.domain) ||
      privacyRequiredCategories.includes(task.category)) {
    return false;
  }

  return true;
}

/**
 * Check no immediate repetition — blocks the exact same task ID,
 * not the entire category+domain combo (which was too aggressive).
 */
function passesNoRepeatRule(task: Task, state: UserStateForSelection): boolean {
  // Don't repeat the exact same task back-to-back
  if (state.lastTaskId && task.id === state.lastTaskId) {
    return false;
  }

  return true;
}

/**
 * Check intensity scaling
 */
function meetsIntensityScaling(task: Task, state: UserStateForSelection): boolean {
  const targetIntensity = getTargetIntensity(state);

  // Allow tasks within 1 level of target
  const diff = Math.abs(task.intensity - targetIntensity);
  return diff <= 1;
}

/**
 * Weighted random selection (core tasks weighted higher)
 */
function weightedRandomSelect(tasks: Task[]): Task | null {
  if (tasks.length === 0) return null;

  // Core tasks get 2x weight
  const weights = tasks.map(t => t.aiFlags.isCore ? 2 : 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  let random = Math.random() * totalWeight;
  for (let i = 0; i < tasks.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return tasks[i];
    }
  }

  return tasks[tasks.length - 1];
}

/**
 * Select a single task using v2 Rules Engine Layer 1
 */
export function selectTask(state: UserStateForSelection, tasks: Task[]): Task | null {
  // 1. Filter by time window
  let candidates = tasks.filter(t => meetsTimeWindow(t, state));

  // 2. Filter by trigger conditions
  candidates = candidates.filter(t => meetsTriggerConditions(t, state));

  // 3. Filter by privacy (exclude intimate if Gina home)
  candidates = candidates.filter(t => meetsPrivacyRequirement(t, state));

  // 4. Avoid repetition (don't repeat category/domain from last task)
  candidates = candidates.filter(t => passesNoRepeatRule(t, state));

  // 5. Prioritize avoided domains (confront avoidance - 30% chance)
  const avoidanceTasks = candidates.filter(t =>
    state.avoidedDomains.includes(t.domain)
  );
  if (avoidanceTasks.length > 0 && Math.random() < 0.3) {
    candidates = avoidanceTasks;
  }

  // 6. Intensity matching
  candidates = candidates.filter(t => meetsIntensityScaling(t, state));

  // If no candidates after intensity filter, relax intensity but cap at target+1
  // (defense-in-depth: fallback never surfaces tasks more than 1 level above target)
  if (candidates.length === 0) {
    const maxIntensity = Math.min(5, getTargetIntensity(state) + 1) as 1 | 2 | 3 | 4 | 5;
    candidates = tasks.filter(t =>
      meetsTimeWindow(t, state) &&
      meetsTriggerConditions(t, state) &&
      meetsPrivacyRequirement(t, state) &&
      passesNoRepeatRule(t, state) &&
      t.intensity <= maxIntensity
    );
  }

  // 7. Weighted random selection (core tasks weighted higher)
  return weightedRandomSelect(candidates);
}

/**
 * Select multiple tasks for daily assignment
 */
export function selectDailyTasks(
  state: UserStateForSelection,
  tasks: Task[],
  count: number = 4
): Task[] {
  const selected: Task[] = [];
  const usedDomains = new Set<string>(state.completedTodayDomains);
  const usedCategories = new Set<string>(state.completedTodayCategories);

  // Create a working copy of state that we'll update as we select
  let workingState = { ...state };

  for (let i = 0; i < count; i++) {
    // Update working state with last selected task
    if (selected.length > 0) {
      const last = selected[selected.length - 1];
      workingState = {
        ...workingState,
        lastTaskId: last.id,
        lastTaskCategory: last.category,
        lastTaskDomain: last.domain,
      };
    }

    // Filter out already selected tasks + enforce domain diversity cap (max 3 per domain)
    const domainCounts = new Map<string, number>();
    selected.forEach(t => domainCounts.set(t.domain, (domainCounts.get(t.domain) || 0) + 1));
    const available = tasks.filter(t =>
      !selected.some(s => s.id === t.id) &&
      (domainCounts.get(t.domain) || 0) < 3
    );

    // Select next task
    const task = selectTask(workingState, available);
    if (task) {
      selected.push(task);
      usedDomains.add(task.domain);
      usedCategories.add(task.category);
    }
  }

  return selected;
}

/**
 * Validate that a task is still valid for the current state
 * Used when checking if a prescribed task should still be shown
 */
export function isTaskStillValid(task: Task, state: UserStateForSelection): boolean {
  // Always valid if already in progress or completed
  // Privacy filter is the main concern for real-time changes
  return meetsPrivacyRequirement(task, state);
}
