/**
 * Task Types
 *
 * Core task interfaces for the protocol system.
 * CSV tasks are the base, dynamic tasks extend with additional metadata.
 */

// ============================================
// BASE TASK (CSV-derived)
// ============================================

export type TaskCompletionType = 'binary' | 'duration' | 'count' | 'confirm' | 'scale' | 'reflect';
export type TaskTimeWindow = 'morning' | 'daytime' | 'evening' | 'night' | 'any';
export type TaskDomain = 'voice' | 'movement' | 'skincare' | 'style' | 'social' | 'mindset' | 'body' | 'arousal' | 'gina' | 'makeup';
export type TaskCategory = 'explore' | 'practice' | 'routine' | 'ritual' | 'care' | 'learn' | 'acquire' | 'record' | 'listen';

export interface Task {
  id: string;
  category: TaskCategory | string;
  domain: TaskDomain | string;
  level: number;               // 1-5 within domain
  intensity: number;           // 1-5 overall difficulty
  instruction: string;
  steps?: string;              // Pipe-delimited steps
  subtext?: string;            // The quiet line underneath
  completion_type: TaskCompletionType;
  duration_minutes?: number;
  target_count?: number;
  points: number;
  affirmation?: string;
  is_core: boolean;
  trigger_condition?: string;
  time_window: TaskTimeWindow;
  requires_privacy: boolean;
  resource_url?: string;
  consequence_if_declined?: string;
  pivot_if_unable?: string;
}

// ============================================
// DYNAMIC TASK (Generated, not from CSV)
// ============================================

export type DynamicTaskType =
  | 'real_world'           // Go somewhere in person
  | 'partner_meetup'       // Attend a hookup
  | 'partner_message'      // Send partner a message
  | 'findom_content'       // Create findom content
  | 'findom_interaction'   // Interact with cash pig
  | 'professional'         // Professional identity task
  | 'capture'              // Vault capture opportunity
  | 'escalation'           // Forced escalation to new tier
  | 'crisis'               // Crisis intervention task
  | 'gina_tactical';       // Gina-related task

export interface DynamicTask extends Task {
  // Source identification
  isDynamic: true;
  dynamicType: DynamicTaskType;

  // Enforcement
  vaultEnforced: boolean;        // Backed by vault coercion
  coercionLevel?: number;        // 1-10, what level this task warrants

  // Location
  locationRequired?: boolean;
  locationName?: string;
  locationAddress?: string;
  locationType?: string;

  // Relationships
  partnerId?: string;            // For partner-related tasks
  partnerAlias?: string;
  cashPigId?: string;            // For findom tasks
  cashPigAlias?: string;

  // Evidence
  evidenceRequired?: string[];   // Types of evidence needed
  captureOpportunity?: boolean;  // Should capture vault content after

  // Timing
  deadline?: string;             // ISO timestamp
  deadlineMinutes?: number;      // Minutes from now

  // Preparation
  preparationChecklist?: string[];
  suggestedOutfit?: string;
  presentationLevel?: number;    // 1-5 how feminine

  // Context
  generatedReason?: string;      // Why this task was generated
  linkedTheatId?: string;        // If tied to a vault threat
  linkedMeetupId?: string;       // If tied to a meetup
}

// ============================================
// TASK SELECTION STATE
// ============================================

export interface TaskSelectionState {
  timeOfDay: TaskTimeWindow;
  ginaHome: boolean;
  denialDay: number;
  currentArousal: number;
  streakDays: number;
  inSession: boolean;
  sessionType?: string;
  edgeCount?: number;
  lastTaskCategory: string | null;
  lastTaskDomain: string | null;
  completedToday: string[];
  avoidedDomains: string[];
  tasksCompletedToday: number;

  // Extended state for lifestyle systems
  gymGateUnlocked?: boolean;
  proteinYesterday?: number;
  daysSinceExercise?: number;
}

// ============================================
// DOMAIN STATE
// ============================================

export interface DomainState {
  domain: TaskDomain | string;
  currentLevel: number;          // 1-5
  tasksCompleted: number;
  tasksCompletedThisLevel: number;
  streak: number;                // Days of consecutive practice
  lastPracticeAt: string | null;
  daysSinceLastPractice: number;
  totalPracticeMinutes: number;
  escalationPosition: number;    // Position within current level (0-100%)
  isAvoided: boolean;            // Has been avoided 3+ days
}

// ============================================
// TASK RESULT
// ============================================

export interface TaskCompletionResult {
  taskId: string;
  domain: string;
  category: string;
  intensity: number;
  pointsEarned: number;
  durationActual?: number;
  countActual?: number;
  evidence?: string;
  notes?: string;
  arousalLevel?: number;
  denialDay?: number;
  completedAt: string;
}

// ============================================
// HELPERS
// ============================================

/**
 * Parse CSV task row into Task object
 */
export function parseTaskFromCSV(row: Record<string, string>, index: number): Task {
  return {
    id: `task_${row.domain}_${row.category}_${index}`,
    category: row.category || 'practice',
    domain: row.domain || 'mindset',
    level: parseInt(row.level) || 1,
    intensity: parseInt(row.intensity) || 1,
    instruction: row.instruction || '',
    steps: row.steps,
    subtext: row.subtext,
    completion_type: (row.completion_type as TaskCompletionType) || 'binary',
    duration_minutes: row.duration_minutes ? parseInt(row.duration_minutes) : undefined,
    target_count: row.target_count ? parseInt(row.target_count) : undefined,
    points: parseInt(row.points) || 10,
    affirmation: row.affirmation,
    is_core: row.is_core === 'true' || row.is_core === 'TRUE',
    trigger_condition: row.trigger_condition || undefined,
    time_window: (row.time_window as TaskTimeWindow) || 'any',
    requires_privacy: row.requires_privacy === 'true' || row.requires_privacy === 'TRUE',
    resource_url: row.resource_url || undefined,
    consequence_if_declined: row.consequence_if_declined || undefined,
    pivot_if_unable: row.pivot_if_unable || undefined,
  };
}

/**
 * Check if a task is dynamic
 */
export function isDynamicTask(task: Task): task is DynamicTask {
  return 'isDynamic' in task && (task as DynamicTask).isDynamic === true;
}

/**
 * Create a dynamic task
 */
export function createDynamicTask(
  base: Partial<Task>,
  dynamicProps: Partial<DynamicTask>
): DynamicTask {
  return {
    id: `dynamic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    category: 'dynamic',
    domain: 'dynamic',
    level: 3,
    intensity: 3,
    instruction: '',
    completion_type: 'binary',
    points: 30,
    is_core: false,
    time_window: 'any',
    requires_privacy: false,
    ...base,
    isDynamic: true,
    dynamicType: 'real_world',
    vaultEnforced: false,
    ...dynamicProps,
  };
}
