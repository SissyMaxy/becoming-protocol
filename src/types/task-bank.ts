// Task Bank Types
// Directive conditioning system - the system decides, she obeys

// ============================================
// TASK CLASSIFICATION
// ============================================

export type TaskCategory =
  | 'wear'           // Put something on your body
  | 'listen'         // Audio conditioning
  | 'say'            // Verbal affirmation/commitment
  | 'apply'          // Sensory anchoring (scent, lotion, etc.)
  | 'watch'          // Visual conditioning
  | 'edge'           // Arousal maintenance
  | 'lock'           // Chastity/containment
  | 'practice'       // Skill building (voice, movement, makeup)
  | 'use'            // Use an investment item
  | 'remove'         // Dispose of masculine item
  | 'commit'         // Make a binding commitment
  | 'expose'         // Social/visibility tasks
  | 'serve'          // Obedience/goddess worship tasks
  | 'surrender'      // Identity erosion tasks
  | 'plug'           // Anal training & plug wear
  | 'sissygasm'      // Prostate/sissygasm conditioning
  | 'oral'           // Oral/cock service training
  | 'thirst'         // Exhibitionism & attention seeking
  | 'fantasy'        // Visualization & fantasy exploration
  | 'corrupt'        // Deep sissification & turning out
  | 'worship'        // Cock/cum worship conditioning
  | 'deepen'         // Submission intensification
  | 'bambi'          // Bimbo-specific training
  | 'acquire'        // Purchase or obtain an item
  | 'explore'        // Research, sample, discover
  | 'ritual'         // Daily/recurring rituals
  | 'measure'        // Track progress metrics
  | 'milestone'      // Gate checks and achievements
  | 'condition'      // Arousal-paired conditioning
  | 'care';          // Self-care and nutrition

export type FeminizationDomain =
  | 'voice'
  | 'movement'
  | 'skincare'
  | 'style'
  | 'makeup'
  | 'social'
  | 'body_language'
  | 'inner_narrative'
  | 'arousal'
  | 'chastity'
  | 'conditioning'
  | 'identity'
  | 'exercise'
  | 'scent'
  | 'nutrition'
  | 'wigs';

export type TaskCompletionType = 'binary' | 'duration' | 'count' | 'confirm' | 'scale' | 'reflect' | 'log_entry' | 'session_complete';

// ============================================
// CAPTURE FIELD DEFINITIONS (for log_entry)
// ============================================

export type CaptureFieldType = 'date' | 'select' | 'toggle' | 'slider' | 'number' | 'text';

export interface CaptureFieldDef {
  key: string;
  type: CaptureFieldType;
  label?: string;
  optional?: boolean;
  default?: string | number | boolean;
  // select
  options?: string[];
  // slider / number
  min?: number;
  max?: number;
  step?: number;
}

export type TimeWindow = 'morning' | 'afternoon' | 'evening' | 'night' | 'any';

export type TaskStatus = 'pending' | 'completed' | 'skipped';

export type SelectionReason =
  | 'mandatory'           // Required for the day
  | 'resistance_target'   // Addressing detected avoidance
  | 'progressive'         // Advancing phase goals
  | 'surprise'            // Random reinforcement
  | 'escalation'          // Time-locked escalation
  | 'ceremony';           // Point of no return ceremony

// ============================================
// TASK REQUIREMENTS
// ============================================

export interface TaskRequirements {
  phase?: number;
  denialDay?: { min?: number; max?: number };
  arousalState?: string[];
  timeOfDay?: TimeWindow[];
  hasItem?: string[];
  previousTaskIds?: string[];
  streakDays?: number;
  completedTaskCount?: number; // Must have completed X tasks total
  categoryCompletions?: Record<TaskCategory, number>; // Must have X completions in category
}

export interface TaskExclusions {
  ginaHome?: boolean;
  recentlyServedDays?: number;
  maxCompletions?: number;
}

// ============================================
// TASK REWARDS
// ============================================

export interface TaskReward {
  points: number;
  hapticPattern?: string;
  contentUnlock?: string;
  affirmation: string;
}

// ============================================
// RATCHET INTEGRATION
// ============================================

export type RatchetActionType =
  | 'log_evidence'
  | 'increment_counter'
  | 'unlock_content'
  | 'trigger_ceremony'
  | 'update_baseline'
  | 'apply_decay'
  | 'flag_resistance'
  | 'schedule_followup';

export interface RatchetAction {
  type: RatchetActionType;
  target: string;
  value?: number | string;
}

export interface TaskRatchetTriggers {
  onComplete?: RatchetAction[];
  onSkip?: RatchetAction[];
}

// ============================================
// AI EVOLUTION FLAGS
// ============================================

export interface TaskAIFlags {
  canIntensify: boolean;
  canClone: boolean;
  trackResistance: boolean;
  isCore: boolean;
}

// ============================================
// MAIN TASK INTERFACE
// ============================================

export interface Task {
  id: string;

  // Classification
  category: TaskCategory;
  domain: FeminizationDomain;
  intensity: 1 | 2 | 3 | 4 | 5;

  // Content
  instruction: string;
  subtext?: string;

  // Conditions
  requires: TaskRequirements;
  excludeIf: TaskExclusions;

  // Completion
  completionType: TaskCompletionType;
  durationMinutes?: number;
  targetCount?: number;
  captureFields?: CaptureFieldDef[];

  // Rewards
  reward: TaskReward;

  // Ratchet integration
  ratchetTriggers?: TaskRatchetTriggers;

  // AI flags
  aiFlags: TaskAIFlags;

  // Hypno session task fields (when category === 'condition' or 'watch')
  playlistIds?: string[];
  contentIds?: string[];
  ritualRequired?: boolean;
  captureMode?: 'passive' | 'active' | 'none';
  deviceRequired?: boolean;
  cageRequired?: boolean;
  handlerFraming?: string;

  // Metadata
  createdAt: string;
  createdBy: 'seed' | 'ai' | 'user';
  parentTaskId?: string;
  active: boolean;
}

// ============================================
// DATABASE ROW INTERFACES
// ============================================

export interface DbTask {
  id: string;
  category: string;
  domain: string;
  intensity: number;
  instruction: string;
  subtext: string | null;
  requires: TaskRequirements;
  exclude_if: TaskExclusions;
  completion_type: string;
  duration_minutes: number | null;
  target_count: number | null;
  points: number;
  haptic_pattern: string | null;
  content_unlock: string | null;
  affirmation: string;
  ratchet_triggers: TaskRatchetTriggers | null;
  can_intensify: boolean;
  can_clone: boolean;
  track_resistance: boolean;
  is_core: boolean;
  created_at: string;
  created_by: string;
  parent_task_id: string | null;
  active: boolean;
  // New columns (057 migration)
  level: number | null;
  steps: string | null;
  trigger_condition: string | null;
  time_window: string | null;
  requires_privacy: boolean;
  resource_url: string | null;
  consequence_if_declined: string | null;
  pivot_if_unable: string | null;
  // New column (084 migration)
  capture_fields: CaptureFieldDef[] | null;
  // New columns (086 migration) — hypno session task fields
  playlist_ids: string[] | null;
  content_ids: string[] | null;
  ritual_required: boolean;
  capture_mode: string | null;
  device_required: boolean;
  cage_required: boolean;
  handler_framing: string | null;
}

export interface DailyTask {
  id: string;
  taskId: string;
  task: Task;
  assignedDate: string;
  assignedAt: string;
  status: TaskStatus;
  completedAt?: string;
  skippedAt?: string;
  progress: number;
  denialDayAtAssign?: number;
  streakAtAssign?: number;
  selectionReason: SelectionReason;
  // Claude-personalized text (overrides base task fields when present)
  enhancedInstruction?: string;
  enhancedSubtext?: string;
  enhancedAffirmation?: string;
  // Arousal-gated copy formatting
  copyStyle?: 'normal' | 'short' | 'command';
}

export interface DbDailyTask {
  id: string;
  user_id: string;
  task_id: string;
  assigned_date: string;
  assigned_at: string;
  status: string;
  completed_at: string | null;
  skipped_at: string | null;
  progress: number;
  denial_day_at_assign: number | null;
  streak_at_assign: number | null;
  selection_reason: string;
  created_at: string;
  // Claude-personalized text
  enhanced_instruction: string | null;
  enhanced_subtext: string | null;
  enhanced_affirmation: string | null;
  // Joined task data
  task_bank?: DbTask;
}

export interface TaskCompletion {
  id: string;
  userId: string;
  taskId: string;
  dailyTaskId: string;
  completedAt: string;
  denialDay?: number;
  arousalState?: string;
  streakDay?: number;
  feltGood?: boolean;
  notes?: string;
  pointsEarned: number;
  captureData?: CompletionData;
}

export interface DbTaskCompletion {
  id: string;
  user_id: string;
  task_id: string;
  daily_task_id: string;
  completed_at: string;
  denial_day: number | null;
  arousal_state: string | null;
  streak_day: number | null;
  felt_good: boolean | null;
  notes: string | null;
  points_earned: number;
  capture_data: Record<string, unknown> | null;
  created_at: string;
}

// ============================================
// COMPLETION INPUT DATA
// ============================================

/**
 * Data emitted by CompletionInput components.
 * Sent alongside task completion to be stored in task_completions.capture_data.
 */
export interface CompletionData {
  completion_type: TaskCompletionType;
  /** Duration input: actual seconds elapsed */
  actual_duration_seconds?: number;
  /** Scale input: 1-10 rating */
  scale_value?: number;
  /** Count input: final count */
  count_value?: number;
  /** Reflect input: free text */
  reflection_text?: string;
  /** Generic structured capture (for future log_entry, etc.) */
  fields?: Record<string, unknown>;
}

export interface TaskResistance {
  id: string;
  userId: string;
  taskId: string;
  resistanceType: 'skip' | 'delay' | 'partial' | 'category_avoidance';
  detectedAt: string;
  aiResponse?: string;
  responseTaskId?: string;
  resolved: boolean;
  resolvedAt?: string;
}

export interface DbTaskResistance {
  id: string;
  user_id: string;
  task_id: string;
  resistance_type: string;
  detected_at: string;
  ai_response: string | null;
  response_task_id: string | null;
  resolved: boolean;
  resolved_at: string | null;
}

// ============================================
// USER CONTEXT FOR TASK SELECTION
// ============================================

export interface UserTaskContext {
  userId: string;
  phase: number;
  denialDay: number;
  streakDays: number;
  arousalState?: string;
  timeOfDay: TimeWindow;
  ginaHome: boolean;
  ginaAsleep: boolean;
  ginaCorruptionLevel: number; // 0-5, from corruption state (gina domain)
  ownedItems: string[];
  completedTaskIds: string[];
  recentlyServedTaskIds: string[]; // Last 7 days
  categoryCompletions: Record<TaskCategory, number>;
  totalCompletions: number;
  resistancePatterns: {
    skippedCategories: TaskCategory[];
    skippedTaskIds: string[];
    delayPatterns: boolean;
  };
  maxDailyTasks: number;
}

// ============================================
// TASK BANK STATISTICS
// ============================================

export interface TaskBankStats {
  totalTasks: number;
  tasksByCategory: Record<TaskCategory, number>;
  tasksByIntensity: Record<number, number>;
  tasksByDomain: Record<FeminizationDomain, number>;
  userStats: {
    totalCompleted: number;
    totalSkipped: number;
    currentStreak: number;
    longestStreak: number;
    favoriteCategory: TaskCategory;
    resistanceAreas: TaskCategory[];
  };
}

// ============================================
// CATEGORY EMOJI MAPPING
// ============================================

export const CATEGORY_EMOJI: Record<TaskCategory, string> = {
  wear: '👙',
  listen: '🎧',
  say: '💬',
  apply: '✨',
  watch: '👁️',
  edge: '🔥',
  lock: '🔒',
  practice: '💃',
  use: '🎁',
  remove: '🗑️',
  commit: '📝',
  expose: '🌸',
  serve: '🙏',
  surrender: '💫',
  plug: '🍑',
  sissygasm: '💦',
  oral: '👄',
  thirst: '📸',
  fantasy: '💭',
  corrupt: '🖤',
  worship: '🛐',
  deepen: '⬇️',
  bambi: '🎀',
  acquire: '🛒',
  explore: '🔍',
  ritual: '🕯️',
  measure: '📏',
  milestone: '🏁',
  condition: '⚡',
  care: '💊',
};

export const CATEGORY_CONFIG: Record<TaskCategory, { label: string; description: string }> = {
  wear: { label: 'Wear', description: 'Put something feminine on' },
  listen: { label: 'Listen', description: 'Audio conditioning' },
  say: { label: 'Say', description: 'Verbal affirmation' },
  apply: { label: 'Apply', description: 'Sensory anchoring' },
  watch: { label: 'Watch', description: 'Visual conditioning' },
  edge: { label: 'Edge', description: 'Arousal maintenance' },
  lock: { label: 'Lock', description: 'Containment ritual' },
  practice: { label: 'Practice', description: 'Skill building' },
  use: { label: 'Use', description: 'Use an item' },
  remove: { label: 'Remove', description: 'Let go of the old' },
  commit: { label: 'Commit', description: 'Binding commitment' },
  expose: { label: 'Expose', description: 'Be seen' },
  serve: { label: 'Serve', description: 'Obedience task' },
  surrender: { label: 'Surrender', description: 'Identity work' },
  plug: { label: 'Plug', description: 'Anal training' },
  sissygasm: { label: 'Sissygasm', description: 'Prostate conditioning' },
  oral: { label: 'Oral', description: 'Service training' },
  thirst: { label: 'Thirst', description: 'Exhibitionism' },
  fantasy: { label: 'Fantasy', description: 'Visualization' },
  corrupt: { label: 'Corrupt', description: 'Deep sissification' },
  worship: { label: 'Worship', description: 'Cock/cum conditioning' },
  deepen: { label: 'Deepen', description: 'Submission intensification' },
  bambi: { label: 'Bambi', description: 'Bimbo training' },
  acquire: { label: 'Acquire', description: 'Get an item' },
  explore: { label: 'Explore', description: 'Research and discover' },
  ritual: { label: 'Ritual', description: 'Daily ritual' },
  measure: { label: 'Measure', description: 'Track progress' },
  milestone: { label: 'Milestone', description: 'Gate check' },
  condition: { label: 'Condition', description: 'Arousal-paired training' },
  care: { label: 'Care', description: 'Self-care and nutrition' },
};

// ============================================
// INTENSITY CONFIGURATION
// ============================================

export const INTENSITY_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: 'Gentle', color: 'emerald' },
  2: { label: 'Moderate', color: 'teal' },
  3: { label: 'Challenging', color: 'amber' },
  4: { label: 'Intense', color: 'orange' },
  5: { label: 'Extreme', color: 'red' },
};

// ============================================
// SKIP COSTS
// ============================================

export interface SkipCost {
  points: number;
  investmentDecayPercent: number;
  returnsNextDay: boolean;
  loggedPermanently: boolean;
}

export const DEFAULT_SKIP_COST: SkipCost = {
  points: 15,
  investmentDecayPercent: 0.5,
  returnsNextDay: true,
  loggedPermanently: true,
};

export const WEEKLY_SKIP_THRESHOLD = 3; // 3 skips = streak freeze warning
