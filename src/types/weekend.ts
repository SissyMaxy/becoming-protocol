/**
 * Weekend Gina Integration System Types
 *
 * Types for weekend activities focused on partner (Gina) involvement
 * in feminization activities.
 */

// Activity categories in priority order
export type WeekendActivityCategory =
  | 'gina_feminizing'  // She does something TO you (highest priority)
  | 'shared'           // Activities done TOGETHER
  | 'intimacy'         // Intimacy rituals
  | 'support';         // Service, planning, affirmation

// Integration levels (Gina's comfort/participation depth)
export type IntegrationLevel = 1 | 2 | 3 | 4 | 5;

// Time blocks for weekend scheduling
export type WeekendTimeBlock = 'morning' | 'afternoon' | 'evening' | 'flexible';

// Your role in Gina-feminizing activities
export type YourRole = 'passive' | 'receptive' | 'collaborative';

// Intimacy levels
export type IntimacyLevel = 'non_intimate' | 'sensual' | 'intimate' | 'sexual';

// Gina involvement level for weekend plans
export type GinaInvolvementLevel = 'light' | 'moderate' | 'deep';

/**
 * Weekend Activity Definition
 * Seeded data defining available weekend activities
 */
export interface WeekendActivity {
  id: string;
  activityId: string;  // Unique identifier like 'skincare_together'
  name: string;
  description: string;

  // Categorization
  category: WeekendActivityCategory;
  subcategory?: string;
  integrationLevel: IntegrationLevel;

  // For Gina-feminizing activities
  ginaAction?: string;      // What she specifically does
  yourRole?: YourRole;

  // Framing
  ginaFraming: string;      // Exact words to present to Gina
  feminizationBenefit: string;
  ginaBenefit?: string;     // What she gets out of it

  // Requirements
  requiresPriorActivity?: string;  // Activity ID that must be done first
  requiresSupplies?: boolean;
  suppliesNeeded?: string[];

  // Timing
  durationMinutes: number;
  bestTime: WeekendTimeBlock;

  // Flags
  isIntimate: boolean;
  intimacyLevel?: IntimacyLevel;
  photoOpportunity: boolean;
  contentPotential: boolean;
  contentNotes?: string;

  // Domains touched (for cross-tracking with main protocol)
  feminizationDomains: string[];

  // Status
  active: boolean;
}

/**
 * Weekend Session
 * A logged/completed weekend activity
 */
export interface WeekendSession {
  id: string;
  userId: string;

  // Timing
  sessionDate: string;      // ISO date
  dayOfWeek: 'saturday' | 'sunday';
  timeBlock: WeekendTimeBlock;

  // Activity
  activityId: string;
  activity?: WeekendActivity;  // Joined data

  // Completion
  startedAt?: string;
  completedAt?: string;
  durationMinutes?: number;
  completed: boolean;

  // Gina participation
  ginaParticipated: boolean;
  ginaInitiated: boolean;
  ginaEngagementRating?: number;  // 1-5

  // Your experience
  feminizationRating?: number;    // 1-5
  connectionRating?: number;      // 1-5
  enjoymentRating?: number;       // 1-5

  // Evidence
  photosCaptured: number;

  // Journal
  notes?: string;
  ginaReactions?: string;
  whatWorked?: string;
  whatToImprove?: string;

  // For future suggestions
  wouldRepeat: boolean;
  suggestedFollowup?: string;

  createdAt: string;
}

/**
 * Planned Activity
 * An activity scheduled in a weekend plan
 */
export interface PlannedActivity {
  activityId: string;
  timeBlock: WeekendTimeBlock;

  // For user
  feminizationFocus: string;

  // For Gina
  ginaFraming: string;
  presentAsOption: boolean;
  alternativeActivity?: string;

  // Tracking
  photoOpportunity: boolean;
  journalPrompt?: string;

  // Points
  points: number;

  // Status
  status: 'pending' | 'completed' | 'skipped';
}

/**
 * Weekend Plan (Prescription)
 * The plan for a specific weekend
 */
export interface WeekendPlan {
  id: string;
  userId: string;

  // Which weekend
  weekendStart: string;  // Saturday date (ISO)

  // Planned activities by day
  saturdayActivities: PlannedActivity[];
  sundayActivities: PlannedActivity[];

  // AI-generated context
  saturdayTheme?: string;
  sundayTheme?: string;
  weekendFocus: string;

  // Goals
  ginaInvolvementLevel: GinaInvolvementLevel;
  intimacyGoal?: string;
  feminizationFocus: string[];

  // Stretch activity (for progression)
  stretchActivity?: {
    activityId: string;
    whyNow: string;
    howToIntroduce: string;
  };

  // Intimacy suggestion
  intimacySuggestion?: {
    ritualId: string;
    suggestedTiming: string;
    feminizedElement: string;
    ginaFraming: string;
    onlyIfNatural: boolean;
  };

  // Status
  createdAt: string;
  finalized: boolean;
}

/**
 * Gina Integration Progress
 * Tracks overall progress with Gina's participation (ratchet)
 */
export interface GinaIntegrationProgress {
  id: string;
  userId: string;

  // Overall level (1-5)
  currentLevel: IntegrationLevel;

  // Per-category levels
  levelGinaFeminizing: IntegrationLevel;
  levelSharedActivities: IntegrationLevel;
  levelIntimacy: IntegrationLevel;
  levelSupport: IntegrationLevel;

  // Milestone tracking (date achieved)
  milestones: {
    firstNailPainting?: string;
    firstMakeup?: string;
    firstFullMakeup?: string;
    firstPhotoshoot?: string;
    firstCageCheck?: string;
    firstDressedIntimacy?: string;
    firstRoleReversal?: string;
    firstNameUsage?: string;
  };

  // Activity counts
  totalGinaFeminizingSessions: number;
  totalSharedSessions: number;
  totalIntimacySessions: number;
  totalSupportSessions: number;

  // Engagement tracking
  ginaAvgEngagement: number;
  ginaInitiatedCount: number;

  // Locked activities (ratchet - she's done these, can't undo)
  lockedActivities: string[];

  updatedAt: string;
}

/**
 * Activity Feedback
 * User feedback after completing an activity
 */
export interface ActivityFeedback {
  completed: boolean;
  ginaParticipated: boolean;
  ginaInitiated?: boolean;
  ginaEngagementRating?: number;
  feminizationRating?: number;
  connectionRating?: number;
  enjoymentRating?: number;
  notes?: string;
  ginaReactions?: string;
  photosCaptured?: number;
  wouldRepeat?: boolean;
}

/**
 * Weekend Context for prescription generation
 */
export interface WeekendPrescriptionContext {
  integrationLevel: number;
  levelByCategory: Record<WeekendActivityCategory, number>;
  previousActivities: string[];
  lastWeekendActivities: string[];
  ginaEngagementAvg: number;
  ginaInitiatedCount: number;
  completedMilestones: string[];
}

/**
 * Helper to check if today is a weekend
 */
export function isWeekend(date?: Date): boolean {
  const d = date || new Date();
  const day = d.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Get weekend day type
 */
export function getWeekendDay(date?: Date): 'saturday' | 'sunday' | null {
  const d = date || new Date();
  const day = d.getDay();
  if (day === 6) return 'saturday';
  if (day === 0) return 'sunday';
  return null;
}

/**
 * Get the Saturday date for a given date's weekend
 */
export function getWeekendStart(date?: Date): string {
  const d = date || new Date();
  const day = d.getDay();

  // If Sunday, go back 1 day to Saturday
  if (day === 0) {
    d.setDate(d.getDate() - 1);
  }
  // If Saturday, use current date
  // If weekday, go forward to next Saturday
  else if (day !== 6) {
    d.setDate(d.getDate() + (6 - day));
  }

  return d.toISOString().split('T')[0];
}

/**
 * Category display config
 */
export const WEEKEND_CATEGORY_CONFIG: Record<WeekendActivityCategory, {
  label: string;
  emoji: string;
  color: string;
  priority: number;
}> = {
  gina_feminizing: {
    label: 'Gina Feminizing You',
    emoji: '💅',
    color: '#ec4899', // pink
    priority: 1
  },
  shared: {
    label: 'Shared Activities',
    emoji: '👫',
    color: '#8b5cf6', // purple
    priority: 2
  },
  intimacy: {
    label: 'Intimacy',
    emoji: '💕',
    color: '#f43f5e', // rose
    priority: 3
  },
  support: {
    label: 'Support',
    emoji: '🤍',
    color: '#06b6d4', // cyan
    priority: 4
  }
};

/**
 * Integration level labels
 */
export const INTEGRATION_LEVEL_LABELS: Record<IntegrationLevel, {
  label: string;
  description: string;
}> = {
  1: {
    label: 'Normal Couple Stuff',
    description: "Activities that feel natural, she doesn't register as feminization"
  },
  2: {
    label: 'Taking Care',
    description: "Caregiving framed activities"
  },
  3: {
    label: 'Exploring Together',
    description: "Curiosity framed, more explicitly feminine"
  },
  4: {
    label: 'Helping Your Journey',
    description: "Explicitly supportive of your feminization"
  },
  5: {
    label: 'Active Participation',
    description: "She's invested in the outcome"
  }
};
