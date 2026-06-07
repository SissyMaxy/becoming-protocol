/**
 * Intervention Detector
 * Implements v2 Part 3.2: State-Based Intervention Logic
 *
 * The Handler checks state continuously and intervenes when conditions are met.
 */

import type {
  UserState,
  HandlerIntervention,
  InterventionType,
  FailureMode,
} from './types';
import { shouldOpenVulnerabilityWindow } from './mode-selector';

export interface InterventionCheck {
  shouldIntervene: boolean;
  intervention?: HandlerIntervention;
  failureMode?: FailureMode;
}

/**
 * Check if any intervention is needed based on current state
 */
export function checkForInterventions(state: UserState): InterventionCheck {
  // Priority order (highest first):
  // 1. Identity crisis
  // 2. Depression/caretaker triggers
  // 3. Post-release crash
  // 4. Work stress
  // 5. Streak protection
  // 6. Vulnerability window
  // 7. Domain avoidance
  // 8. Binge prevention

  // 1. Identity Crisis (FM9)
  const identityCrisis = checkIdentityCrisis(state);
  if (identityCrisis.shouldIntervene) {
    return identityCrisis;
  }

  // 2. Depression Collapse (FM3)
  const depression = checkDepressionCollapse(state);
  if (depression.shouldIntervene) {
    return depression;
  }

  // 3. Post-Release Crash (FM1)
  const postRelease = checkPostReleaseCrash(state);
  if (postRelease.shouldIntervene) {
    return postRelease;
  }

  // 4. Work Stress (FM8)
  const workStress = checkWorkStress(state);
  if (workStress.shouldIntervene) {
    return workStress;
  }

  // 5. Streak Protection
  const streakProtection = checkStreakProtection(state);
  if (streakProtection.shouldIntervene) {
    return streakProtection;
  }

  // 6. Vulnerability Window
  const vulnerability = checkVulnerabilityWindow(state);
  if (vulnerability.shouldIntervene) {
    return vulnerability;
  }

  // 7. Domain Avoidance (FM4)
  const avoidance = checkDomainAvoidance(state);
  if (avoidance.shouldIntervene) {
    return avoidance;
  }

  // 8. Binge Prevention (FM5)
  const binge = checkBingePrevention(state);
  if (binge.shouldIntervene) {
    return binge;
  }

  return { shouldIntervene: false };
}

/**
 * FM1: Post-Release Crash Detection
 */
function checkPostReleaseCrash(state: UserState): InterventionCheck {
  // Detection: denial_day reset to 0 or session just ended
  if (state.denialDay === 0 && state.lastRelease) {
    const minutesSinceRelease = (Date.now() - state.lastRelease.getTime()) / (1000 * 60);

    // Within 2 hours of release
    if (minutesSinceRelease <= 120) {
      return {
        shouldIntervene: true,
        failureMode: 'post_release_crash',
        intervention: {
          type: 'post_release_crash',
          mode: 'caretaker',
          message: '', // Will be filled by template/AI
          priority: 'high',
          suggestedTask: {
            id: 'skincare_minimum',
            category: 'care',
            domain: 'body',
          },
        },
      };
    }
  }

  return { shouldIntervene: false };
}

/**
 * FM3: Depression Collapse Detection
 */
function checkDepressionCollapse(state: UserState): InterventionCheck {
  // Level 1 (Dip): 2+ consecutive survival days
  if (state.consecutiveSurvivalDays >= 2) {
    let priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    let message = 'Rough patch detected';

    // Level 2 (Collapse): 3-5 days + low mood
    if (state.consecutiveSurvivalDays >= 3) {
      priority = 'high';
      message = 'Extended dip - caretaker mode active';
    }

    // Level 3 (Extended): 6+ days
    if (state.consecutiveSurvivalDays >= 6) {
      priority = 'critical';
      message = 'Extended collapse - minimal intervention, therapist suggestion';
    }

    return {
      shouldIntervene: true,
      failureMode: 'depression_collapse',
      intervention: {
        type: 'depression_gentle',
        mode: 'caretaker',
        message,
        priority,
        suggestedTask: {
          id: 'mood_log',
          category: 'care',
          domain: 'body',
        },
      },
    };
  }

  // Low mood pattern
  if (state.recentMoodScores.length >= 2) {
    const avg = state.recentMoodScores.reduce((a, b) => a + b, 0) / state.recentMoodScores.length;
    if (avg <= 3) {
      return {
        shouldIntervene: true,
        failureMode: 'depression_collapse',
        intervention: {
          type: 'depression_gentle',
          mode: 'caretaker',
          message: 'Low mood pattern detected',
          priority: 'medium',
          suggestedTask: {
            id: 'mood_log',
            category: 'care',
            domain: 'body',
          },
        },
      };
    }
  }

  return { shouldIntervene: false };
}

/**
 * FM8: Work Stress Detection
 */
function checkWorkStress(state: UserState): InterventionCheck {
  // Already in work stress mode - don't re-trigger
  if (state.workStressModeActive) {
    return { shouldIntervene: false };
  }

  // Detection: depleted exec function + high anxiety + reasonable energy + daytime
  if (
    (state.estimatedExecFunction === 'depleted' || state.estimatedExecFunction === 'low') &&
    state.currentAnxiety !== undefined &&
    state.currentAnxiety >= 7 &&
    state.currentEnergy !== undefined &&
    state.currentEnergy >= 4 &&
    (state.timeOfDay === 'morning' || state.timeOfDay === 'afternoon')
  ) {
    return {
      shouldIntervene: true,
      failureMode: 'work_stress',
      intervention: {
        type: 'work_stress_pause',
        mode: 'director', // Not caretaker - this is different
        message: 'Work stress detected - pausing notifications during work hours',
        priority: 'medium',
      },
    };
  }

  return { shouldIntervene: false };
}

/**
 * FM9: Identity Crisis Detection
 */
function checkIdentityCrisis(state: UserState): InterventionCheck {
  // Already flagged
  if (state.currentFailureMode === 'identity_crisis') {
    return {
      shouldIntervene: true,
      failureMode: 'identity_crisis',
      intervention: {
        type: 'identity_crisis',
        mode: 'caretaker',
        message: 'Identity crisis - deploying crisis kit',
        priority: 'critical',
      },
    };
  }

  // Detection would normally come from journal analysis or explicit user input
  // This is a placeholder for that detection
  return { shouldIntervene: false };
}

/**
 * Streak Protection
 */
function checkStreakProtection(state: UserState): InterventionCheck {
  // Only protect meaningful streaks
  if (state.streakDays < 3) {
    return { shouldIntervene: false };
  }

  // No tasks today and it's getting late
  if (
    state.tasksCompletedToday === 0 &&
    (state.timeOfDay === 'evening' || state.timeOfDay === 'night')
  ) {
    return {
      shouldIntervene: true,
      intervention: {
        type: 'streak_protection',
        mode: 'handler',
        message: `Your ${state.streakDays} day streak needs protecting`,
        priority: 'high',
        suggestedTask: {
          id: 'skincare_minimum',
          category: 'care',
          domain: 'body',
        },
      },
    };
  }

  // Long gap since last task
  if (state.minutesSinceLastTask > 180 && state.streakDays > 7) {
    return {
      shouldIntervene: true,
      intervention: {
        type: 'streak_protection',
        mode: 'director',
        message: 'Time to check in - streak maintenance',
        priority: 'medium',
        suggestedTask: {
          id: 'posture_check',
          category: 'anchor',
          domain: 'body',
        },
      },
    };
  }

  return { shouldIntervene: false };
}

/**
 * Vulnerability Window Detection
 */
function checkVulnerabilityWindow(state: UserState): InterventionCheck {
  if (!shouldOpenVulnerabilityWindow(state)) {
    return { shouldIntervene: false };
  }

  // Don't trigger during caretaker situations
  if (
    state.currentFailureMode === 'depression_collapse' ||
    state.currentFailureMode === 'identity_crisis'
  ) {
    return { shouldIntervene: false };
  }

  return {
    shouldIntervene: true,
    intervention: {
      type: 'vulnerability_window',
      mode: 'handler',
      message: 'Vulnerability window open - commitment extraction opportunity',
      priority: 'high',
    },
  };
}

/**
 * FM4: Domain Avoidance Detection
 */
function checkDomainAvoidance(state: UserState): InterventionCheck {
  // No avoided domains
  if (state.avoidedDomains.length === 0) {
    return { shouldIntervene: false };
  }

  // Don't confront during caretaker mode
  if (state.handlerMode === 'caretaker') {
    return { shouldIntervene: false };
  }

  // Voice is the primary target for avoidance confrontation
  if (state.avoidedDomains.includes('voice')) {
    return {
      shouldIntervene: true,
      failureMode: 'voice_avoidance',
      intervention: {
        type: 'domain_avoidance',
        mode: 'handler',
        message: 'Voice avoidance detected - time to confront',
        priority: 'medium',
        suggestedTask: {
          id: 'voice_minimum',
          category: 'practice',
          domain: 'voice',
        },
      },
    };
  }

  // Other domains
  const avoidedDomain = state.avoidedDomains[0];
  return {
    shouldIntervene: true,
    intervention: {
      type: 'domain_avoidance',
      mode: 'director',
      message: `You've been avoiding ${avoidedDomain}`,
      priority: 'low',
    },
  };
}

/**
 * FM5: Binge Prevention
 */
function checkBingePrevention(state: UserState): InterventionCheck {
  // Early in streak - enforce caps
  const cap = getTaskCapForStreak(state.streakDays);

  if (state.tasksCompletedToday >= cap) {
    return {
      shouldIntervene: true,
      failureMode: 'everything_at_once',
      intervention: {
        type: 'binge_prevention',
        mode: 'director',
        message: `That's your ${cap} for today. Consistency beats intensity.`,
        priority: 'medium',
      },
    };
  }

  return { shouldIntervene: false };
}

/**
 * Get task cap based on streak age
 */
function getTaskCapForStreak(streakDays: number): number {
  if (streakDays <= 5) return 3;
  if (streakDays <= 14) return 5;
  if (streakDays <= 30) return 7;
  return 8;
}

/**
 * Check if a specific intervention type should fire
 */
export function shouldFireIntervention(
  type: InterventionType,
  state: UserState,
  lastInterventionTime?: Date
): boolean {
  // Minimum gap between interventions (30 minutes)
  if (lastInterventionTime) {
    const minGap = 30 * 60 * 1000;
    if (Date.now() - lastInterventionTime.getTime() < minGap) {
      return false;
    }
  }

  // In session - only session-related interventions
  if (state.inSession && type !== 'commitment_extraction') {
    return false;
  }

  // Caretaker mode blocks most interventions
  if (state.handlerMode === 'caretaker') {
    const allowedInCaretaker: InterventionType[] = [
      'depression_gentle',
      'identity_crisis',
      'post_release_crash',
    ];
    return allowedInCaretaker.includes(type);
  }

  return true;
}

/**
 * Get intervention priority for sorting
 */
export function getInterventionPriority(type: InterventionType): number {
  const priorities: Record<InterventionType, number> = {
    identity_crisis: 100,
    depression_gentle: 90,
    post_release_crash: 80,
    work_stress_pause: 70,
    streak_protection: 60,
    vulnerability_window: 50,
    commitment_extraction: 45,
    domain_avoidance: 30,
    binge_prevention: 20,
    scheduled_check_in: 10,
  };

  return priorities[type] ?? 0;
}

/**
 * Filter and sort interventions by priority
 */
export function prioritizeInterventions(
  interventions: HandlerIntervention[]
): HandlerIntervention[] {
  return [...interventions].sort((a, b) => {
    const priorityA = getInterventionPriority(a.type);
    const priorityB = getInterventionPriority(b.type);
    return priorityB - priorityA;
  });
}
