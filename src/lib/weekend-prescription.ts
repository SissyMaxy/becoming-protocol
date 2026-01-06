/**
 * Weekend Prescription Logic
 *
 * Generates weekend activity plans based on Gina's integration level,
 * past activities, and engagement patterns.
 */

import type {
  WeekendActivity,
  WeekendPlan,
  PlannedActivity,
  GinaIntegrationProgress,
  WeekendActivityCategory,
  IntegrationLevel,
  WeekendTimeBlock
} from '../types/weekend';
import { getWeekendStart } from '../types/weekend';
import {
  ALL_WEEKEND_ACTIVITIES,
  INTIMACY_ACTIVITIES,
  getMilestoneForActivity
} from '../data/weekend-activities';

// =====================================================
// Configuration
// =====================================================

// Points for different activity types
const ACTIVITY_POINTS: Record<WeekendActivityCategory, number> = {
  gina_feminizing: 25,
  shared: 20,
  intimacy: 20,
  support: 15
};

// Target activities per time block
const TARGET_ACTIVITIES_PER_BLOCK = {
  morning: { min: 1, max: 2 },
  afternoon: { min: 1, max: 2 },
  evening: { min: 2, max: 3 }
};

// Category priority (lower = higher priority)
const CATEGORY_PRIORITY: Record<WeekendActivityCategory, number> = {
  gina_feminizing: 1,
  shared: 2,
  intimacy: 3,
  support: 4
};

// =====================================================
// Main Prescription Generation
// =====================================================

export interface WeekendPrescriptionContext {
  integrationProgress: GinaIntegrationProgress;
  previousActivityIds: string[];
  lastWeekendActivityIds: string[];
  completedMilestones: string[];
}

/**
 * Generate a weekend plan based on current context
 */
export function generateWeekendPrescription(
  context: WeekendPrescriptionContext
): Omit<WeekendPlan, 'id' | 'userId' | 'createdAt'> {
  const { integrationProgress, previousActivityIds, lastWeekendActivityIds } = context;

  // Calculate max level for activities (current + 1, capped at 5)
  const maxLevel = Math.min(integrationProgress.currentLevel + 1, 5) as IntegrationLevel;

  // Get available activities
  const availableActivities = getAvailableActivities(
    maxLevel,
    previousActivityIds,
    lastWeekendActivityIds
  );

  // Generate Saturday activities
  const saturdayActivities = generateDayActivities(
    availableActivities,
    'saturday',
    integrationProgress,
    previousActivityIds
  );

  // Remove Saturday activities from pool for Sunday
  const saturdayIds = saturdayActivities.map(a => a.activityId);
  const sundayPool = availableActivities.filter(a => !saturdayIds.includes(a.activityId));

  // Generate Sunday activities
  const sundayActivities = generateDayActivities(
    sundayPool,
    'sunday',
    integrationProgress,
    previousActivityIds
  );

  // Determine involvement level based on activities
  const allActivities = [...saturdayActivities, ...sundayActivities];
  const ginaInvolvementLevel = determineInvolvementLevel(allActivities, integrationProgress);

  // Find stretch activity (one level above current)
  const stretchActivity = findStretchActivity(
    integrationProgress.currentLevel,
    previousActivityIds
  );

  // Generate intimacy suggestion
  const intimacySuggestion = generateIntimacySuggestion(
    integrationProgress,
    previousActivityIds
  );

  // Generate themes
  const saturdayTheme = generateDayTheme(saturdayActivities);
  const sundayTheme = generateDayTheme(sundayActivities);
  const weekendFocus = generateWeekendFocus(integrationProgress, allActivities);

  // Get feminization domains being targeted
  const feminizationFocus = [
    ...new Set(allActivities.flatMap(a => {
      const activity = ALL_WEEKEND_ACTIVITIES.find(wa => wa.activityId === a.activityId);
      return activity?.feminizationDomains || [];
    }))
  ];

  return {
    weekendStart: getWeekendStart(),
    saturdayActivities,
    sundayActivities,
    saturdayTheme,
    sundayTheme,
    weekendFocus,
    ginaInvolvementLevel,
    feminizationFocus,
    stretchActivity,
    intimacySuggestion,
    finalized: false
  };
}

// =====================================================
// Activity Selection
// =====================================================

/**
 * Get activities available for prescription
 */
function getAvailableActivities(
  maxLevel: IntegrationLevel,
  previousActivityIds: string[],
  _lastWeekendActivityIds: string[] // Reserved for future variety logic
): WeekendActivity[] {
  return ALL_WEEKEND_ACTIVITIES.filter(activity => {
    // Must be active and within level
    if (!activity.active || activity.integrationLevel > maxLevel) {
      return false;
    }

    // Check prerequisite
    if (activity.requiresPriorActivity) {
      if (!previousActivityIds.includes(activity.requiresPriorActivity)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Generate activities for a single day
 */
function generateDayActivities(
  availableActivities: WeekendActivity[],
  _day: 'saturday' | 'sunday', // Reserved for day-specific logic
  progress: GinaIntegrationProgress,
  previousActivityIds: string[]
): PlannedActivity[] {
  const activities: PlannedActivity[] = [];
  const usedIds: Set<string> = new Set();

  // Target time blocks with priorities (excludes 'flexible')
  const timeBlocks: Array<'morning' | 'afternoon' | 'evening'> = ['morning', 'afternoon', 'evening'];

  for (const timeBlock of timeBlocks) {
    const target = TARGET_ACTIVITIES_PER_BLOCK[timeBlock];
    const blockActivities = selectActivitiesForBlock(
      availableActivities,
      timeBlock,
      target.min,
      target.max,
      usedIds,
      progress,
      previousActivityIds
    );

    for (const activity of blockActivities) {
      usedIds.add(activity.activityId);
      activities.push(createPlannedActivity(activity, timeBlock));
    }
  }

  return activities;
}

/**
 * Select activities for a specific time block
 */
function selectActivitiesForBlock(
  availableActivities: WeekendActivity[],
  timeBlock: WeekendTimeBlock,
  minCount: number,
  maxCount: number,
  usedIds: Set<string>,
  progress: GinaIntegrationProgress,
  previousActivityIds: string[]
): WeekendActivity[] {
  // Filter to activities for this time block that haven't been used
  const blockActivities = availableActivities.filter(a =>
    !usedIds.has(a.activityId) &&
    (a.bestTime === timeBlock || a.bestTime === 'flexible')
  );

  // Score and sort activities
  const scored = blockActivities.map(activity => ({
    activity,
    score: scoreActivity(activity, progress, previousActivityIds)
  }));

  scored.sort((a, b) => b.score - a.score);

  // Select top activities up to max
  const count = Math.min(scored.length, maxCount);
  return scored.slice(0, Math.max(count, minCount)).map(s => s.activity);
}

/**
 * Score an activity for selection priority
 */
function scoreActivity(
  activity: WeekendActivity,
  progress: GinaIntegrationProgress,
  _previousActivityIds: string[] // Reserved for history-based scoring
): number {
  let score = 0;

  // Category priority (gina_feminizing highest)
  score += (5 - CATEGORY_PRIORITY[activity.category]) * 20;

  // Prefer activities she's done before (comfort)
  if (progress.lockedActivities.includes(activity.activityId)) {
    score += 15;
  }

  // Prefer activities with photo opportunity
  if (activity.photoOpportunity) {
    score += 10;
  }

  // Slight preference for lower integration levels (more comfortable)
  score += (6 - activity.integrationLevel) * 5;

  // Bonus for content potential
  if (activity.contentPotential) {
    score += 5;
  }

  // Slight randomization to vary prescriptions
  score += Math.random() * 10;

  return score;
}

/**
 * Create a PlannedActivity from a WeekendActivity
 */
function createPlannedActivity(
  activity: WeekendActivity,
  timeBlock: WeekendTimeBlock
): PlannedActivity {
  // Find an alternative activity in same category/level
  const alternatives = ALL_WEEKEND_ACTIVITIES.filter(a =>
    a.active &&
    a.activityId !== activity.activityId &&
    a.category === activity.category &&
    a.integrationLevel <= activity.integrationLevel &&
    (a.bestTime === timeBlock || a.bestTime === 'flexible')
  );

  const alternative = alternatives.length > 0
    ? alternatives[Math.floor(Math.random() * alternatives.length)]
    : undefined;

  return {
    activityId: activity.activityId,
    timeBlock,
    feminizationFocus: activity.feminizationBenefit,
    ginaFraming: activity.ginaFraming,
    presentAsOption: alternative !== undefined,
    alternativeActivity: alternative?.activityId,
    photoOpportunity: activity.photoOpportunity,
    journalPrompt: generateJournalPrompt(activity),
    points: ACTIVITY_POINTS[activity.category],
    status: 'pending'
  };
}

// =====================================================
// Helper Generators
// =====================================================

/**
 * Determine overall involvement level for the weekend
 */
function determineInvolvementLevel(
  activities: PlannedActivity[],
  progress: GinaIntegrationProgress
): 'light' | 'moderate' | 'deep' {
  const avgPoints = activities.reduce((sum, a) => sum + a.points, 0) / activities.length;

  // Also factor in integration level
  const levelFactor = progress.currentLevel;

  const score = avgPoints * 0.7 + levelFactor * 3;

  if (score > 25) return 'deep';
  if (score > 18) return 'moderate';
  return 'light';
}

/**
 * Find a stretch activity for progression
 */
function findStretchActivity(
  currentLevel: IntegrationLevel,
  previousActivityIds: string[]
): WeekendPlan['stretchActivity'] | undefined {
  const nextLevel = Math.min(currentLevel + 1, 5) as IntegrationLevel;

  // Find activities at the next level that haven't been done
  const stretchCandidates = ALL_WEEKEND_ACTIVITIES.filter(a =>
    a.active &&
    a.integrationLevel === nextLevel &&
    !previousActivityIds.includes(a.activityId) &&
    // Check prerequisite is met
    (!a.requiresPriorActivity || previousActivityIds.includes(a.requiresPriorActivity))
  );

  if (stretchCandidates.length === 0) return undefined;

  // Prefer gina_feminizing category
  const preferredCandidates = stretchCandidates.filter(a => a.category === 'gina_feminizing');
  const candidates = preferredCandidates.length > 0 ? preferredCandidates : stretchCandidates;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  return {
    activityId: chosen.activityId,
    whyNow: generateWhyNow(chosen, previousActivityIds),
    howToIntroduce: chosen.ginaFraming
  };
}

/**
 * Generate intimacy suggestion
 */
function generateIntimacySuggestion(
  progress: GinaIntegrationProgress,
  previousActivityIds: string[]
): WeekendPlan['intimacySuggestion'] | undefined {
  // Only suggest if integration level is at least 2
  if (progress.currentLevel < 2) return undefined;

  // Find appropriate intimacy activity
  const maxLevel = Math.min(progress.currentLevel + 1, 5) as IntegrationLevel;
  const candidates = INTIMACY_ACTIVITIES.filter(a =>
    a.active &&
    a.integrationLevel <= maxLevel &&
    (!a.requiresPriorActivity || previousActivityIds.includes(a.requiresPriorActivity))
  );

  if (candidates.length === 0) return undefined;

  // Prefer activities she's done before for comfort
  const familiar = candidates.filter(a => progress.lockedActivities.includes(a.activityId));
  const pool = familiar.length > 0 ? familiar : candidates;

  const chosen = pool[Math.floor(Math.random() * pool.length)];

  return {
    ritualId: chosen.activityId,
    suggestedTiming: 'Saturday evening after other activities',
    feminizedElement: chosen.feminizationBenefit,
    ginaFraming: chosen.ginaFraming,
    onlyIfNatural: true
  };
}

/**
 * Generate day theme based on activities
 */
function generateDayTheme(activities: PlannedActivity[]): string {
  const activityDetails = activities.map(a =>
    ALL_WEEKEND_ACTIVITIES.find(wa => wa.activityId === a.activityId)
  ).filter(Boolean) as WeekendActivity[];

  // Count categories
  const categoryCounts: Record<string, number> = {};
  for (const activity of activityDetails) {
    categoryCounts[activity.category] = (categoryCounts[activity.category] || 0) + 1;
  }

  // Find dominant category
  const dominant = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])[0];

  const themes: Record<string, string[]> = {
    gina_feminizing: [
      'Gina takes care of you',
      'Her hands, your transformation',
      'Being feminized by her'
    ],
    shared: [
      'Quality time together',
      'Connecting through care',
      'Building rituals together'
    ],
    intimacy: [
      'Deepening connection',
      'Intimate exploration',
      'Feminine intimacy'
    ],
    support: [
      'Service and care',
      'Domestic harmony',
      'Building your partnership'
    ]
  };

  const category = dominant?.[0] || 'shared';
  const categoryThemes = themes[category] || themes.shared;

  return categoryThemes[Math.floor(Math.random() * categoryThemes.length)];
}

/**
 * Generate weekend focus based on context
 */
function generateWeekendFocus(
  progress: GinaIntegrationProgress,
  activities: PlannedActivity[]
): string {
  const level = progress.currentLevel;
  const hasGinaFeminizing = activities.some(a => {
    const activity = ALL_WEEKEND_ACTIVITIES.find(wa => wa.activityId === a.activityId);
    return activity?.category === 'gina_feminizing';
  });

  if (level === 1) {
    return hasGinaFeminizing
      ? 'Introducing Gina to caring for you in new ways'
      : 'Building comfortable routines together';
  } else if (level === 2) {
    return 'Expanding her participation in your feminization';
  } else if (level === 3) {
    return 'Exploring together with more openness';
  } else if (level === 4) {
    return 'Deepening her active role in your journey';
  } else {
    return 'Full partnership in your transformation';
  }
}

/**
 * Generate journal prompt for an activity
 */
function generateJournalPrompt(activity: WeekendActivity): string {
  const prompts: Record<WeekendActivityCategory, string[]> = {
    gina_feminizing: [
      'How did it feel having her do this for you?',
      'What did you notice about her engagement?',
      'How did this change your sense of yourself?'
    ],
    shared: [
      'How did doing this together feel different?',
      'What did you appreciate about sharing this?',
      'Did you feel closer after this activity?'
    ],
    intimacy: [
      'How did this intimacy feel different?',
      'What did you notice about the power dynamic?',
      'How did this affect your connection?'
    ],
    support: [
      'How did serving her in this way feel?',
      'What did you notice about your mindset?',
      'How did she respond to your care?'
    ]
  };

  const categoryPrompts = prompts[activity.category];
  return categoryPrompts[Math.floor(Math.random() * categoryPrompts.length)];
}

/**
 * Generate "why now" explanation for stretch activity
 */
function generateWhyNow(activity: WeekendActivity, _previousActivityIds: string[]): string {
  const prereq = activity.requiresPriorActivity;
  if (prereq) {
    const prereqActivity = ALL_WEEKEND_ACTIVITIES.find(a => a.activityId === prereq);
    return `She's done ${prereqActivity?.name || prereq}—${activity.name} is a natural next step`;
  }

  return `Based on her current comfort level, she may be ready for ${activity.name}`;
}

// =====================================================
// Utility Functions
// =====================================================

/**
 * Get today's activities from a weekend plan
 */
export function getTodayActivitiesFromPlan(plan: WeekendPlan): PlannedActivity[] {
  const today = new Date().getDay();

  if (today === 6) {
    return plan.saturdayActivities;
  } else if (today === 0) {
    return plan.sundayActivities;
  }

  return [];
}

/**
 * Check if an activity has a milestone associated with it
 */
export function getActivityMilestone(activityId: string): string | null {
  return getMilestoneForActivity(activityId);
}

/**
 * Calculate weekend completion rate
 */
export function calculateWeekendCompletion(plan: WeekendPlan): {
  completed: number;
  total: number;
  percentage: number;
} {
  const allActivities = [...plan.saturdayActivities, ...plan.sundayActivities];
  const completed = allActivities.filter(a => a.status === 'completed').length;
  const total = allActivities.length;

  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0
  };
}
