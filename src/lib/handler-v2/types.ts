/**
 * Handler Types
 * Core type definitions for the Handler system
 */

// Handler interaction modes
export type HandlerMode =
  | 'architect'    // Collaborative, technical - when building/designing
  | 'director'     // Clear, directive, warm - standard operation
  | 'handler'      // Commanding, possessive - depleted/resistant/vulnerable
  | 'caretaker'    // Gentle, unconditional - genuine distress
  | 'invisible';   // Silent - system running itself

// Odometer states
export type OdometerState =
  | 'survival'     // Crisis mode
  | 'caution'      // Low energy, needs care
  | 'coasting'     // Stable but not progressing
  | 'progress'     // Active growth
  | 'momentum'     // Strong forward motion
  | 'breakthrough'; // Peak state

// Time of day
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

// Executive function levels
export type ExecFunction = 'high' | 'medium' | 'low' | 'depleted';

// Failure modes from addendum
export type FailureMode =
  | 'post_release_crash'      // FM1
  | 'build_not_do'            // FM2
  | 'depression_collapse'     // FM3
  | 'voice_avoidance'         // FM4
  | 'everything_at_once'      // FM5
  | 'weekend_regression'      // FM6
  | 'streak_catastrophize'    // FM7
  | 'work_stress'             // FM8
  | 'identity_crisis';        // FM9

// Depression severity levels
export type DepressionLevel = 'none' | 'dip' | 'collapse' | 'extended';

// User state for Handler decisions
export interface UserState {
  // Identity
  userId: string;
  odometer: OdometerState;
  currentPhase: number;

  // Temporal
  timeOfDay: TimeOfDay;
  minutesSinceLastTask: number;
  tasksCompletedToday: number;
  pointsToday: number;

  // Streaks
  streakDays: number;
  longestStreak: number;
  consecutiveSurvivalDays: number;

  // Arousal/Denial
  denialDay: number;
  currentArousal: 0 | 1 | 2 | 3 | 4 | 5;
  inSession: boolean;
  sessionType?: 'edge' | 'goon' | 'hypno' | 'conditioning';
  edgeCount?: number;
  lastRelease?: Date;

  // Context
  ginaHome: boolean;
  workday: boolean;
  estimatedExecFunction: ExecFunction;

  // History
  lastTaskCategory: string | null;
  lastTaskDomain: string | null;
  completedTodayDomains: string[];
  completedTodayCategories: string[];
  avoidedDomains: string[];

  // Mood
  recentMoodScores: number[];
  currentMood?: number;
  currentAnxiety?: number;
  currentEnergy?: number;

  // Gina visibility
  ginaVisibilityLevel: number;

  // Handler state
  handlerMode: HandlerMode;
  escalationLevel: 1 | 2 | 3 | 4 | 5;
  vulnerabilityWindowActive: boolean;
  resistanceDetected: boolean;

  // Failure mode state
  currentFailureMode?: FailureMode;
  workStressModeActive: boolean;
  weekendModeActive: boolean;
  recoveryProtocolActive?: string;

  // Lifestyle tracking (from exercise, protein, collections, micro-tasks)
  lifestyle?: {
    exercise?: {
      streakWeeks: number;
      sessionsThisWeek: number;
      gymUnlocked: boolean;
      lastSessionAt: string | null;
      lastSessionType: string | null;
    };
    protein?: {
      yesterday: number;
      weekAvg: number;
    };
    ambient?: {
      scents: string[];
      signatureScent: string | null;
      wig: string | null;
      anchors: number;
      microToday: number;
      microTarget: number;
    };
    corruption?: {
      compositeScore: number;
      allSuspended: boolean;
    };
  };
}

// Intervention types
export type InterventionType =
  | 'streak_protection'
  | 'vulnerability_window'
  | 'domain_avoidance'
  | 'depression_gentle'
  | 'work_stress_pause'
  | 'post_release_crash'
  | 'identity_crisis'
  | 'commitment_extraction'
  | 'binge_prevention'
  | 'scheduled_check_in';

// Handler intervention
export interface HandlerIntervention {
  type: InterventionType;
  mode: HandlerMode;
  message: string;
  suggestedTask?: {
    id: string;
    category: string;
    domain: string;
  };
  priority: 'low' | 'medium' | 'high' | 'critical';
  expiresAt?: Date;
}

// Morning briefing structure
export interface MorningBriefing {
  greeting: string;
  stateAcknowledgment: string;
  todaysFocus: string;
  scheduledTasks: string[];
  motivationalNote?: string;
  generatedAt: Date;
  layer: 1 | 2 | 3;
}

// Evening debrief structure
export interface EveningDebrief {
  summary: string;
  tasksCompleted: number;
  pointsEarned: number;
  streakStatus: string;
  improvementNote?: string;
  tomorrowPreview?: string;
  generatedAt: Date;
  layer: 1 | 2 | 3;
}

// Session guidance structure
export interface SessionGuidance {
  phase: 'opening' | 'midpoint' | 'peak' | 'closing';
  message: string;
  commitmentPrompt?: string;
  contentSuggestion?: string;
  generatedAt: Date;
  layer: 1 | 2 | 3;
}

// Time capsule structure
export interface TimeCapsule {
  id: string;
  type: 'post_release' | 'identity_crisis' | 'streak_break' | 'depression' | 'motivation' | 'peak_moment';
  content: string;
  authoredDuring: string;
  authoredAt: Date;
  timesDelivered: number;
  effectivenessRatings: { deliveredAt: Date; moodBefore: number; moodAfter: number }[];
}

// Crisis kit item
export interface CrisisKitItem {
  id: string;
  type: 'journal_entry' | 'photo' | 'voice_recording' | 'therapist_quote' | 'peak_moment' | 'commitment' | 'milestone';
  sourceId?: string;
  contentPreview: string;
  curatedBy: 'handler' | 'user' | 'both';
  timesShown: number;
  effectivenessRating?: number;
}

// Pop-up notification types (from reward notification distribution)
export type PopUpNotificationType =
  | 'micro_task'
  | 'affirmation'
  | 'content_unlock'
  | 'challenge'
  | 'jackpot';

// Pop-up message — enforced character limits
export interface PopUpMessage {
  title: string;           // ≤40 chars
  body: string;            // ≤200 chars
  subtext?: string;        // ≤80 chars
  notification_type: PopUpNotificationType;
  handler_mode: HandlerMode;
  priority: 'normal' | 'high';
  haptic?: string;
  expires_minutes?: number;
}

// Pop-up character limits
export const POPUP_LIMITS = {
  title: 40,
  body: 200,
  subtext: 80,
} as const;

// Copy style — arousal-gated formatting for task prescriptions
export type CopyStyle = 'normal' | 'short' | 'command';

/**
 * Derive copy style from arousal level.
 * 0-2: normal (up to 6 sentences)
 * 3-4: short (max 4 lines, imperative)
 * 5+: command (max 3 lines, verb-first, no preamble)
 */
export function getCopyStyle(arousal: number): CopyStyle {
  if (arousal >= 5) return 'command';
  if (arousal >= 3) return 'short';
  return 'normal';
}

// Handler action log entry
export interface HandlerAction {
  id: string;
  userId: string;
  actionType: string;
  layer: 1 | 2 | 3;
  costCents: number;
  content?: string;
  stateSnapshot?: Partial<UserState>;
  createdAt: Date;
}

// Daily plan structure
export interface HandlerDailyPlan {
  date: string;
  scheduledTasks: {
    time: string;
    taskId: string;
    category: string;
    domain: string;
    required: boolean;
    flexible: boolean;
  }[];
  targetDomains: string[];
  escalationTargets: string[];
  notes: string;
  generatedAt: Date;
  layer: 1 | 2 | 3;
}
