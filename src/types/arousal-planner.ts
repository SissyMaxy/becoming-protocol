// Arousal Planner Types
// Daily prescription for chastity, edge sessions, check-ins, and milestones

import type { ArousalState, PhysicalSign } from './arousal';

// ============================================
// PLAN TYPES
// ============================================

export type PlanIntensity = 'light' | 'moderate' | 'intense' | 'extreme';
export type PlanStatus = 'active' | 'completed' | 'abandoned' | 'expired';
export type TimeBlock = 'morning' | 'afternoon' | 'evening' | 'night';
export type SessionIntensity = 'gentle' | 'moderate' | 'intense';
export type ScheduledItemStatus = 'scheduled' | 'started' | 'completed' | 'skipped' | 'missed';
export type MilestoneType = 'stay_locked' | 'edge_count' | 'maintain_state' | 'duration' | 'denial_day' | 'special';
export type MilestoneStatus = 'pending' | 'in_progress' | 'achieved' | 'failed';
export type CheckInType = 'morning' | 'midday' | 'evening' | 'post_session';
export type SessionType = 'edge_training' | 'denial' | 'anchoring' | 'goon' | 'maintenance';

// ============================================
// DAILY AROUSAL PLAN
// ============================================

export interface DailyArousalPlan {
  id: string;
  userId: string;
  planDate: string; // YYYY-MM-DD

  // Generation context
  generatedAt: string;
  arousalStateAtGeneration: ArousalState;
  denialDayAtGeneration: number;
  chastityLockedAtGeneration: boolean;

  // Plan configuration
  planIntensity: PlanIntensity;
  totalTargetEdges: number;
  totalTargetDurationMinutes: number;

  // Check-ins
  checkInTimes: string[]; // HH:MM format
  checkInsCompleted: number;
  checkInsTotal: number;

  // Status
  status: PlanStatus;
  completionPercentage: number;

  // Results
  edgesAchieved: number;
  stateAtEndOfDay?: ArousalState;
  notes?: string;

  createdAt: string;
  updatedAt: string;
}

// ============================================
// PLANNED EDGE SESSION
// ============================================

export interface PlannedEdgeSession {
  id: string;
  planId: string;
  userId: string;

  // Scheduling
  scheduledTime: string; // HH:MM
  scheduledDate: string;
  timeBlock: TimeBlock;

  // Prescription
  sessionType: SessionType;
  targetEdges: number;
  targetDurationMinutes: number;
  intensityLevel: SessionIntensity;

  // Guidance
  recommendedPatterns: string[];
  affirmationFocus?: string;
  specialInstructions?: string;

  // Execution
  status: ScheduledItemStatus;
  actualSessionId?: string;
  startedAt?: string;
  completedAt?: string;
  actualEdges?: number;
  actualDurationMinutes?: number;

  // Feedback
  postSessionState?: ArousalState;
  satisfactionRating?: number; // 1-5

  sortOrder: number;
  createdAt: string;
}

// ============================================
// AROUSAL CHECK-IN
// ============================================

export interface ArousalCheckIn {
  id: string;
  planId: string;
  userId: string;

  // Scheduling
  scheduledTime: string; // HH:MM
  scheduledDate: string;
  checkInType: CheckInType;

  // Response
  status: ScheduledItemStatus;
  completedAt?: string;

  // Arousal snapshot
  arousalLevel?: number; // 1-10
  achingIntensity?: number; // 1-10
  physicalSigns?: PhysicalSign[];
  stateReported?: ArousalState;

  // Context
  notes?: string;
  promptedAt?: string;

  sortOrder: number;
  createdAt: string;
}

// ============================================
// CHASTITY MILESTONE
// ============================================

export interface ChastityMilestone {
  id: string;
  planId: string;
  userId: string;

  // Definition
  milestoneType: MilestoneType;
  title: string;
  description?: string;
  targetValue?: number;
  targetState?: ArousalState;

  // Timing
  deadlineTime?: string; // HH:MM
  unlockCondition?: string;

  // Progress
  status: MilestoneStatus;
  currentValue: number;
  achievedAt?: string;

  // Rewards
  pointsValue: number;
  achievementUnlocked?: string;

  sortOrder: number;
  createdAt: string;
}

// ============================================
// PRESCRIPTION CONTEXT
// ============================================

export interface PrescriptionContext {
  userId: string;
  currentState: ArousalState;
  denialDays: number;
  isChastityLocked: boolean;
  chastityHoursToday: number;

  // Recent history
  recentEdgeSessions: RecentEdgeSession[];
  recentCheckIns: RecentCheckIn[];
  lastOrgasm?: {
    daysAgo: number;
    type: string;
  };

  // User metrics
  optimalMinDays: number;
  optimalMaxDays: number;
  averageSweetSpotEntryDay: number;

  // Preferences
  preferredSessionTimes?: TimeBlock[];
  maxDailyEdges?: number;
  includeNightSession?: boolean;
}

export interface RecentEdgeSession {
  date: string;
  edgeCount: number;
  durationMinutes: number;
  postState: ArousalState;
}

export interface RecentCheckIn {
  date: string;
  time: string;
  state: ArousalState;
  arousalLevel: number;
}

// ============================================
// VIEW TYPES
// ============================================

export interface TodaysPlanView {
  plan: DailyArousalPlan;
  sessions: PlannedEdgeSession[];
  checkIns: ArousalCheckIn[];
  milestones: ChastityMilestone[];

  // Computed
  nextScheduledItem: PlannedEdgeSession | ArousalCheckIn | null;
  nextItemType: 'session' | 'check_in' | null;
  overallProgress: number;
  sessionsCompleted: number;
  sessionsTotal: number;
  checkInsCompleted: number;
  checkInsTotal: number;
  milestonesAchieved: number;
  milestonesTotal: number;
}

// ============================================
// INPUT TYPES
// ============================================

export interface CheckInCompletionInput {
  checkInId: string;
  arousalLevel: number;
  achingIntensity?: number;
  physicalSigns?: PhysicalSign[];
  stateReported: ArousalState;
  notes?: string;
}

export interface SessionCompletionInput {
  plannedSessionId: string;
  actualSessionId?: string;
  actualEdges: number;
  actualDurationMinutes: number;
  postSessionState: ArousalState;
  satisfactionRating?: number;
}

// ============================================
// STATE CONFIGURATION
// ============================================

export interface StateConfig {
  maxSessions: number;
  edgesPerSession: { min: number; max: number };
  durationMinutes: { min: number; max: number };
  intensity: SessionIntensity;
  primaryGoal: string;
  avoidIntense?: boolean;
  specialNote?: string;
}

export const STATE_CONFIGS: Record<ArousalState, StateConfig> = {
  post_release: {
    maxSessions: 1,
    edgesPerSession: { min: 0, max: 2 },
    durationMinutes: { min: 10, max: 15 },
    intensity: 'gentle',
    primaryGoal: 'maintenance',
    avoidIntense: true,
    specialNote: 'Light touch only - rebuilding starts tomorrow',
  },
  recovery: {
    maxSessions: 1,
    edgesPerSession: { min: 2, max: 3 },
    durationMinutes: { min: 15, max: 20 },
    intensity: 'gentle',
    primaryGoal: 'rebuild',
  },
  baseline: {
    maxSessions: 2,
    edgesPerSession: { min: 3, max: 5 },
    durationMinutes: { min: 15, max: 25 },
    intensity: 'moderate',
    primaryGoal: 'build_toward_sweet_spot',
  },
  building: {
    maxSessions: 3,
    edgesPerSession: { min: 5, max: 8 },
    durationMinutes: { min: 20, max: 35 },
    intensity: 'moderate',
    primaryGoal: 'accelerate_to_sweet_spot',
  },
  sweet_spot: {
    maxSessions: 3,
    edgesPerSession: { min: 8, max: 12 },
    durationMinutes: { min: 30, max: 45 },
    intensity: 'intense',
    primaryGoal: 'maintain_and_deepen',
  },
  overload: {
    maxSessions: 1,
    edgesPerSession: { min: 3, max: 5 },
    durationMinutes: { min: 15, max: 20 },
    intensity: 'gentle',
    primaryGoal: 'cooldown',
    specialNote: 'Focus on control, not intensity',
  },
};

// ============================================
// DATABASE TYPES
// ============================================

export interface DbDailyArousalPlan {
  id: string;
  user_id: string;
  plan_date: string;
  generated_at: string;
  arousal_state_at_generation: string;
  denial_day_at_generation: number;
  chastity_locked_at_generation: boolean;
  plan_intensity: string;
  total_target_edges: number;
  total_target_duration_minutes: number;
  check_in_times: string[];
  check_ins_completed: number;
  check_ins_total: number;
  status: string;
  completion_percentage: number;
  edges_achieved: number;
  state_at_end_of_day: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbPlannedEdgeSession {
  id: string;
  plan_id: string;
  user_id: string;
  scheduled_time: string;
  scheduled_date: string;
  time_block: string;
  session_type: string;
  target_edges: number;
  target_duration_minutes: number;
  intensity_level: string;
  recommended_patterns: string[] | null;
  affirmation_focus: string | null;
  special_instructions: string | null;
  status: string;
  actual_session_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  actual_edges: number | null;
  actual_duration_minutes: number | null;
  post_session_state: string | null;
  satisfaction_rating: number | null;
  sort_order: number;
  created_at: string;
}

export interface DbArousalCheckIn {
  id: string;
  plan_id: string;
  user_id: string;
  scheduled_time: string;
  scheduled_date: string;
  check_in_type: string;
  status: string;
  completed_at: string | null;
  arousal_level: number | null;
  aching_intensity: number | null;
  physical_signs: string[] | null;
  state_reported: string | null;
  notes: string | null;
  prompted_at: string | null;
  sort_order: number;
  created_at: string;
}

export interface DbChastityMilestone {
  id: string;
  plan_id: string;
  user_id: string;
  milestone_type: string;
  title: string;
  description: string | null;
  target_value: number | null;
  target_state: string | null;
  deadline_time: string | null;
  unlock_condition: string | null;
  status: string;
  current_value: number;
  achieved_at: string | null;
  points_value: number;
  achievement_unlocked: string | null;
  sort_order: number;
  created_at: string;
}

// ============================================
// CONVERTERS
// ============================================

export function dbPlanToPlan(db: DbDailyArousalPlan): DailyArousalPlan {
  return {
    id: db.id,
    userId: db.user_id,
    planDate: db.plan_date,
    generatedAt: db.generated_at,
    arousalStateAtGeneration: db.arousal_state_at_generation as ArousalState,
    denialDayAtGeneration: db.denial_day_at_generation,
    chastityLockedAtGeneration: db.chastity_locked_at_generation,
    planIntensity: db.plan_intensity as PlanIntensity,
    totalTargetEdges: db.total_target_edges,
    totalTargetDurationMinutes: db.total_target_duration_minutes,
    checkInTimes: db.check_in_times || [],
    checkInsCompleted: db.check_ins_completed,
    checkInsTotal: db.check_ins_total,
    status: db.status as PlanStatus,
    completionPercentage: db.completion_percentage,
    edgesAchieved: db.edges_achieved,
    stateAtEndOfDay: db.state_at_end_of_day as ArousalState | undefined,
    notes: db.notes || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export function dbSessionToSession(db: DbPlannedEdgeSession): PlannedEdgeSession {
  return {
    id: db.id,
    planId: db.plan_id,
    userId: db.user_id,
    scheduledTime: db.scheduled_time,
    scheduledDate: db.scheduled_date,
    timeBlock: db.time_block as TimeBlock,
    sessionType: db.session_type as SessionType,
    targetEdges: db.target_edges,
    targetDurationMinutes: db.target_duration_minutes,
    intensityLevel: db.intensity_level as SessionIntensity,
    recommendedPatterns: db.recommended_patterns || [],
    affirmationFocus: db.affirmation_focus || undefined,
    specialInstructions: db.special_instructions || undefined,
    status: db.status as ScheduledItemStatus,
    actualSessionId: db.actual_session_id || undefined,
    startedAt: db.started_at || undefined,
    completedAt: db.completed_at || undefined,
    actualEdges: db.actual_edges || undefined,
    actualDurationMinutes: db.actual_duration_minutes || undefined,
    postSessionState: db.post_session_state as ArousalState | undefined,
    satisfactionRating: db.satisfaction_rating || undefined,
    sortOrder: db.sort_order,
    createdAt: db.created_at,
  };
}

export function dbCheckInToCheckIn(db: DbArousalCheckIn): ArousalCheckIn {
  return {
    id: db.id,
    planId: db.plan_id,
    userId: db.user_id,
    scheduledTime: db.scheduled_time,
    scheduledDate: db.scheduled_date,
    checkInType: db.check_in_type as CheckInType,
    status: db.status as ScheduledItemStatus,
    completedAt: db.completed_at || undefined,
    arousalLevel: db.arousal_level || undefined,
    achingIntensity: db.aching_intensity || undefined,
    physicalSigns: (db.physical_signs as PhysicalSign[]) || undefined,
    stateReported: db.state_reported as ArousalState | undefined,
    notes: db.notes || undefined,
    promptedAt: db.prompted_at || undefined,
    sortOrder: db.sort_order,
    createdAt: db.created_at,
  };
}

export function dbMilestoneToMilestone(db: DbChastityMilestone): ChastityMilestone {
  return {
    id: db.id,
    planId: db.plan_id,
    userId: db.user_id,
    milestoneType: db.milestone_type as MilestoneType,
    title: db.title,
    description: db.description || undefined,
    targetValue: db.target_value || undefined,
    targetState: db.target_state as ArousalState | undefined,
    deadlineTime: db.deadline_time || undefined,
    unlockCondition: db.unlock_condition || undefined,
    status: db.status as MilestoneStatus,
    currentValue: db.current_value,
    achievedAt: db.achieved_at || undefined,
    pointsValue: db.points_value,
    achievementUnlocked: db.achievement_unlocked || undefined,
    sortOrder: db.sort_order,
    createdAt: db.created_at,
  };
}

// ============================================
// INTENSITY CONFIGURATION
// ============================================

export const PLAN_INTENSITY_CONFIG: Record<PlanIntensity, {
  label: string;
  emoji: string;
  color: string;
  description: string;
}> = {
  light: {
    label: 'Light',
    emoji: '🌸',
    color: 'green',
    description: 'Gentle day - minimal edging, focus on check-ins',
  },
  moderate: {
    label: 'Moderate',
    emoji: '🔥',
    color: 'yellow',
    description: 'Balanced day - regular sessions and check-ins',
  },
  intense: {
    label: 'Intense',
    emoji: '💜',
    color: 'purple',
    description: 'High intensity - multiple sessions, deep practice',
  },
  extreme: {
    label: 'Extreme',
    emoji: '⚡',
    color: 'red',
    description: 'Maximum intensity - for sweet spot optimization',
  },
};

export const TIME_BLOCK_CONFIG: Record<TimeBlock, {
  label: string;
  startHour: number;
  endHour: number;
  defaultTime: string;
}> = {
  morning: { label: 'Morning', startHour: 6, endHour: 12, defaultTime: '09:00' },
  afternoon: { label: 'Afternoon', startHour: 12, endHour: 17, defaultTime: '14:00' },
  evening: { label: 'Evening', startHour: 17, endHour: 21, defaultTime: '19:00' },
  night: { label: 'Night', startHour: 21, endHour: 24, defaultTime: '22:00' },
};
