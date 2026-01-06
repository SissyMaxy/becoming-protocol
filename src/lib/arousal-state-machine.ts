// Arousal State Machine Logic

import type {
  ArousalState,
  ArousalMetrics,
  ReleaseType,
  StateRecommendation,
} from '../types/arousal';

// ============================================
// STATE TRANSITION CONTEXT
// ============================================

interface StateTransitionContext {
  currentState: ArousalState;
  daysSinceRelease: number;
  recentEdgeCount: number;
  releaseType?: ReleaseType;
  userMetrics?: Partial<ArousalMetrics>;
}

// ============================================
// STATE TRANSITION LOGIC
// ============================================

/**
 * Calculate the next arousal state based on context
 */
export function calculateNextState(ctx: StateTransitionContext): ArousalState {
  const { currentState, daysSinceRelease, recentEdgeCount, releaseType, userMetrics } = ctx;

  // If a release just happened, handle release transition
  if (releaseType) {
    return handleReleaseTransition(releaseType);
  }

  // Otherwise, handle time-based transitions
  return handleTimeBasedTransition(currentState, daysSinceRelease, recentEdgeCount, userMetrics);
}

/**
 * Handle state transition after a release event
 */
function handleReleaseTransition(releaseType: ReleaseType): ArousalState {
  switch (releaseType) {
    case 'full':
    case 'accident':
    case 'wet_dream':
      return 'post_release';

    case 'ruined':
      return 'recovery'; // Partial reset

    case 'prostate':
    case 'sissygasm':
      return 'sweet_spot'; // These don't reset denial state

    case 'edge_only':
      return 'sweet_spot'; // Maintains state

    default:
      return 'post_release';
  }
}

/**
 * Handle time-based state transitions
 */
function handleTimeBasedTransition(
  currentState: ArousalState,
  daysSinceRelease: number,
  recentEdgeCount: number,
  metrics?: Partial<ArousalMetrics>
): ArousalState {
  // Use personalized thresholds if available, otherwise defaults
  const sweetSpotDay = metrics?.averageSweetSpotEntryDay || 3;
  const overloadThreshold = metrics?.optimalMaxDays || 10;

  switch (currentState) {
    case 'post_release':
      // Post-release lasts about 2 days
      return daysSinceRelease >= 2 ? 'recovery' : 'post_release';

    case 'recovery':
      // Recovery transitions to building
      return daysSinceRelease >= 2 ? 'building' : 'recovery';

    case 'building':
      // Building transitions to sweet spot when threshold reached
      return daysSinceRelease >= sweetSpotDay ? 'sweet_spot' : 'building';

    case 'sweet_spot':
      // Sweet spot can transition to overload with too much edging
      if (daysSinceRelease > overloadThreshold && recentEdgeCount > 5) {
        return 'overload';
      }
      return 'sweet_spot';

    case 'overload':
      // Overload returns to sweet spot with cool-down (no edging)
      return recentEdgeCount === 0 ? 'sweet_spot' : 'overload';

    case 'baseline':
      // Baseline moves to building after day 1
      return daysSinceRelease >= 1 ? 'building' : 'baseline';

    default:
      return 'baseline';
  }
}

// ============================================
// STATE RECOMMENDATIONS
// ============================================

/**
 * Get recommendations for a given arousal state
 */
export function getStateRecommendations(state: ArousalState): StateRecommendation {
  const recommendations: Record<ArousalState, StateRecommendation> = {
    baseline: {
      state: 'baseline',
      practiceIntensity: 'normal',
      contentDepth: 'moderate',
      breakthroughAttempts: 'available',
      primaryMessage: 'Neutral state. Normal practice.',
      suggestions: [
        'Consistent practice builds toward sweet spot',
        'Good time for planning and reflection',
      ],
      warnings: [],
    },

    building: {
      state: 'building',
      practiceIntensity: 'increased',
      contentDepth: 'deep',
      breakthroughAttempts: 'encouraged',
      primaryMessage: 'Arousal building. Receptivity increasing.',
      suggestions: [
        'Good time for feminization content',
        'Practice will land deeper now',
        'Edge once to accelerate toward sweet spot',
        'Sweet spot approaching',
      ],
      warnings: [],
    },

    sweet_spot: {
      state: 'sweet_spot',
      practiceIntensity: 'maximum',
      contentDepth: 'deepest',
      breakthroughAttempts: 'optimal',
      primaryMessage: 'SWEET SPOT — Maximum receptivity. Protect this state.',
      suggestions: [
        'Optimal for transformation work',
        'Breakthrough attempts most likely to succeed',
        'Arousal-locked learning available',
        'How can you serve her today?',
        'Deep content will land powerfully',
      ],
      warnings: [
        'Avoid unplanned release',
        'Too much edging can push to overload',
      ],
    },

    overload: {
      state: 'overload',
      practiceIntensity: 'light',
      contentDepth: 'maintenance',
      breakthroughAttempts: 'not_recommended',
      primaryMessage: 'Overload. Decide: release, cool-down, or ride it.',
      suggestions: [
        'Options: release, cool-down, or continue',
        'If release, make it intentional',
        'Consider a planned release',
      ],
      warnings: [
        'High risk of unplanned release',
        'Not optimal for breakthrough attempts',
        'Decision point: control or release',
      ],
    },

    post_release: {
      state: 'post_release',
      practiceIntensity: 'minimum',
      contentDepth: 'light',
      breakthroughAttempts: 'not_recommended',
      primaryMessage: 'Post-release. Low receptivity. Maintenance mode.',
      suggestions: [
        'Light practice only',
        'Good time for planning',
        'This passes — you\'ll be building again soon',
        'Rest and reflect',
      ],
      warnings: [
        'Content may not land as deeply',
        'Avoid breakthrough attempts',
        'Low energy normal',
      ],
    },

    recovery: {
      state: 'recovery',
      practiceIntensity: 'light',
      contentDepth: 'moderate',
      breakthroughAttempts: 'wait',
      primaryMessage: 'Recovery. Climbing back toward building.',
      suggestions: [
        'Gentle stimulation helps rebuild',
        'Light content can accelerate recovery',
        'Building state coming soon',
      ],
      warnings: [],
    },
  };

  return recommendations[state];
}

// ============================================
// STATE UTILITY FUNCTIONS
// ============================================

/**
 * Check if the current state is optimal for a specific action
 */
export function isStateOptimalFor(state: ArousalState, action: string): boolean {
  const optimalStates: Record<string, ArousalState[]> = {
    breakthrough_attempt: ['sweet_spot', 'building'],
    deep_practice: ['sweet_spot', 'building'],
    arousal_locked_learning: ['sweet_spot'],
    new_seed_introduction: ['sweet_spot', 'building'],
    partner_intimacy: ['sweet_spot', 'building', 'overload'],
    planning: ['post_release', 'recovery', 'baseline'],
    reflection: ['post_release', 'recovery'],
    light_practice: ['post_release', 'recovery', 'baseline'],
    intense_content: ['sweet_spot', 'building'],
    service_mindset: ['sweet_spot', 'building'],
  };

  return optimalStates[action]?.includes(state) ?? false;
}

/**
 * Check if a release type resets the denial streak
 */
export function doesReleaseResetStreak(releaseType: ReleaseType): boolean {
  const streakResetters: ReleaseType[] = ['full', 'ruined', 'accident', 'wet_dream'];
  return streakResetters.includes(releaseType);
}

/**
 * Get the priority order of states (for sorting/display)
 */
export function getStatePriority(state: ArousalState): number {
  const priorities: Record<ArousalState, number> = {
    sweet_spot: 1,
    building: 2,
    overload: 3,
    recovery: 4,
    baseline: 5,
    post_release: 6,
  };
  return priorities[state] ?? 99;
}

/**
 * Get states that are considered "high receptivity"
 */
export function isHighReceptivityState(state: ArousalState): boolean {
  return ['sweet_spot', 'building'].includes(state);
}

/**
 * Get states that are considered "low receptivity"
 */
export function isLowReceptivityState(state: ArousalState): boolean {
  return ['post_release', 'recovery', 'baseline'].includes(state);
}

/**
 * Get the expected next state transition (for prediction)
 */
export function predictNextState(
  currentState: ArousalState,
  daysInState: number
): { nextState: ArousalState; daysUntil: number } | null {
  switch (currentState) {
    case 'post_release':
      return { nextState: 'recovery', daysUntil: Math.max(0, 2 - daysInState) };
    case 'recovery':
      return { nextState: 'building', daysUntil: Math.max(0, 1 - daysInState) };
    case 'building':
      return { nextState: 'sweet_spot', daysUntil: Math.max(0, 3 - daysInState) };
    case 'sweet_spot':
      return null; // No automatic transition from sweet spot
    case 'overload':
      return null; // Requires action to transition
    case 'baseline':
      return { nextState: 'building', daysUntil: 1 };
    default:
      return null;
  }
}

/**
 * Get state-specific advice message
 */
export function getStateAdvice(state: ArousalState): string {
  const advice: Record<ArousalState, string> = {
    baseline: 'Start building arousal to increase feminization receptivity.',
    building: 'Keep building — sweet spot is approaching.',
    sweet_spot: 'You are maximally receptive. Use this window wisely.',
    overload: 'High risk zone. Make an intentional choice.',
    post_release: 'Low receptivity period. Rest and plan.',
    recovery: 'Rebuilding. Light engagement helps.',
  };
  return advice[state];
}

/**
 * Calculate optimal practice intensity multiplier for state
 */
export function getIntensityMultiplier(state: ArousalState): number {
  const multipliers: Record<ArousalState, number> = {
    sweet_spot: 1.5,
    building: 1.25,
    baseline: 1.0,
    overload: 0.75,
    recovery: 0.75,
    post_release: 0.5,
  };
  return multipliers[state];
}
