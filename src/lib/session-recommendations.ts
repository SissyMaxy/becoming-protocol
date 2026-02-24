// Session Recommendations Engine
// Smart session suggestions based on arousal state, denial day, and patterns

import type { ArousalState, ArousalMetrics } from '../types/arousal';

export type SessionType = 'edge' | 'goon' | 'denial' | 'freestyle' | 'conditioning';

export interface SessionRecommendation {
  sessionType: SessionType;
  priority: number; // 1-10, higher = more recommended
  reason: string;
  optimalFor: string[];
  warnings: string[];
  suggestedDuration: { min: number; max: number }; // minutes
  suggestedIntensity: 'gentle' | 'moderate' | 'intense';
  badges: ('recommended' | 'challenging' | 'recovery' | 'breakthrough' | 'avoid')[];
}

export interface RecommendationContext {
  arousalState: ArousalState;
  denialDay: number;
  lastSessionDate?: string;
  lastSessionType?: SessionType;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  isWeekend: boolean;
  metrics?: ArousalMetrics;
  recentEdgeCount?: number;
  isInSweetSpot?: boolean;
}

// Session type configurations
const SESSION_CONFIGS: Record<SessionType, {
  baseIntensity: 'gentle' | 'moderate' | 'intense';
  minDenialDays: number;
  optimalArousalStates: ArousalState[];
  avoidArousalStates: ArousalState[];
  baseDuration: { min: number; max: number };
}> = {
  edge: {
    baseIntensity: 'moderate',
    minDenialDays: 0,
    optimalArousalStates: ['building', 'sweet_spot'],
    avoidArousalStates: ['post_release'],
    baseDuration: { min: 15, max: 30 },
  },
  goon: {
    baseIntensity: 'intense',
    minDenialDays: 3,
    optimalArousalStates: ['sweet_spot', 'overload'],
    avoidArousalStates: ['baseline', 'post_release', 'recovery'],
    baseDuration: { min: 20, max: 45 },
  },
  denial: {
    baseIntensity: 'intense',
    minDenialDays: 1,
    optimalArousalStates: ['building', 'sweet_spot'],
    avoidArousalStates: ['post_release', 'baseline'],
    baseDuration: { min: 20, max: 40 },
  },
  freestyle: {
    baseIntensity: 'gentle',
    minDenialDays: 0,
    optimalArousalStates: ['baseline', 'building', 'recovery'],
    avoidArousalStates: [],
    baseDuration: { min: 10, max: 60 },
  },
  conditioning: {
    baseIntensity: 'moderate',
    minDenialDays: 2,
    optimalArousalStates: ['sweet_spot', 'building'],
    avoidArousalStates: ['post_release'],
    baseDuration: { min: 15, max: 30 },
  },
};

// Generate recommendations based on context
export function getSessionRecommendations(
  context: RecommendationContext
): SessionRecommendation[] {
  const recommendations: SessionRecommendation[] = [];

  for (const [type, config] of Object.entries(SESSION_CONFIGS)) {
    const sessionType = type as SessionType;
    const rec = generateRecommendation(sessionType, config, context);
    recommendations.push(rec);
  }

  // Sort by priority descending
  recommendations.sort((a, b) => b.priority - a.priority);

  return recommendations;
}

function generateRecommendation(
  sessionType: SessionType,
  config: typeof SESSION_CONFIGS[SessionType],
  context: RecommendationContext
): SessionRecommendation {
  let priority = 5; // Base priority
  const reasons: string[] = [];
  const optimalFor: string[] = [];
  const warnings: string[] = [];
  const badges: SessionRecommendation['badges'] = [];

  const {
    arousalState,
    denialDay,
    lastSessionDate,
    lastSessionType,
    timeOfDay,
    isWeekend,
    // metrics - unused for now, reserved for future arousal-based recommendations
  } = context;

  // Check arousal state alignment
  if (config.optimalArousalStates.includes(arousalState)) {
    priority += 3;
    reasons.push(`Perfect for your ${arousalState.replace('_', ' ')} state`);
    optimalFor.push(arousalState);
  } else if (config.avoidArousalStates.includes(arousalState)) {
    priority -= 4;
    warnings.push(`Not ideal during ${arousalState.replace('_', ' ')}`);
    badges.push('avoid');
  }

  // Check denial day requirements
  if (denialDay < config.minDenialDays) {
    priority -= 3;
    warnings.push(`Recommended after ${config.minDenialDays} days denial (you're on day ${denialDay})`);
  } else if (denialDay >= config.minDenialDays + 3) {
    priority += 2;
    reasons.push(`Great choice on day ${denialDay}`);
  }

  // Sweet spot bonus
  if (arousalState === 'sweet_spot') {
    if (sessionType === 'goon' || sessionType === 'conditioning') {
      priority += 2;
      badges.push('breakthrough');
      reasons.push('Maximum receptivity - breakthrough opportunity');
    }
  }

  // Overload state handling
  if (arousalState === 'overload') {
    if (sessionType === 'denial') {
      priority += 1;
      reasons.push('Practice control when you need it most');
      badges.push('challenging');
    } else if (sessionType === 'freestyle') {
      priority -= 2;
      warnings.push('Risk of losing control');
    }
  }

  // Post-release / Recovery state
  if (arousalState === 'post_release' || arousalState === 'recovery') {
    if (sessionType === 'freestyle') {
      priority += 2;
      reasons.push('Gentle rebuilding');
      badges.push('recovery');
    } else {
      priority -= 2;
      warnings.push('Give yourself time to rebuild');
    }
  }

  // Time of day considerations
  if (timeOfDay === 'night' && sessionType === 'goon') {
    priority += 1;
    optimalFor.push('late night sessions');
  }
  if (timeOfDay === 'morning' && sessionType === 'conditioning') {
    priority += 1;
    optimalFor.push('morning conditioning');
  }

  // Weekend bonus for longer sessions
  if (isWeekend && (sessionType === 'goon' || sessionType === 'conditioning')) {
    priority += 1;
    optimalFor.push('weekend deep dives');
  }

  // Session variety - don't repeat same type
  if (lastSessionType === sessionType && lastSessionDate) {
    const daysSince = getDaysSince(lastSessionDate);
    if (daysSince < 1) {
      priority -= 2;
      warnings.push('Try something different today');
    }
  }

  // Denial day milestones
  if (denialDay === 7 || denialDay === 14 || denialDay === 21 || denialDay === 30) {
    if (sessionType === 'goon' || sessionType === 'conditioning') {
      priority += 2;
      badges.push('breakthrough');
      reasons.push(`Day ${denialDay} milestone - prime for breakthroughs`);
    }
  }

  // High denial day adjustments
  if (denialDay >= 14) {
    if (sessionType === 'goon') {
      priority += 2;
      reasons.push('Deep state accessible');
    }
  }

  // Determine suggested intensity
  let suggestedIntensity = config.baseIntensity;
  if (denialDay >= 7 && config.baseIntensity !== 'intense') {
    suggestedIntensity = 'moderate';
  }
  if (denialDay >= 14) {
    suggestedIntensity = 'intense';
  }
  if (arousalState === 'recovery' || arousalState === 'post_release') {
    suggestedIntensity = 'gentle';
  }

  // Clamp priority
  priority = Math.max(1, Math.min(10, priority));

  // Add recommended badge if high priority
  if (priority >= 8) {
    badges.push('recommended');
  }

  // Build final reason string
  const reason = reasons.length > 0
    ? reasons[0]
    : getDefaultReason(sessionType, arousalState, denialDay);

  return {
    sessionType,
    priority,
    reason,
    optimalFor,
    warnings,
    suggestedDuration: config.baseDuration,
    suggestedIntensity,
    badges,
  };
}

function getDefaultReason(
  sessionType: SessionType,
  _arousalState: ArousalState,
  denialDay: number
): string {
  switch (sessionType) {
    case 'edge':
      return denialDay < 3
        ? 'Build your edge count'
        : 'Practice control and build stamina';
    case 'goon':
      return 'Zone out and surrender to sensation';
    case 'denial':
      return 'Test your limits with denial cycles';
    case 'freestyle':
      return 'Go at your own pace';
    case 'conditioning':
      return 'Rewire your responses';
    default:
      return 'Available session';
  }
}

function getDaysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  return diffTime / (1000 * 60 * 60 * 24);
}

// Re-export canonical time-of-day helper
export { getCurrentTimeOfDay as getTimeOfDay } from './rules-engine-v2';

// Check if today is weekend
export function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

// Get top recommendation
export function getTopRecommendation(
  context: RecommendationContext
): SessionRecommendation | null {
  const recommendations = getSessionRecommendations(context);
  return recommendations.length > 0 ? recommendations[0] : null;
}

// Session type display info
export const SESSION_DISPLAY_INFO: Record<SessionType, {
  name: string;
  description: string;
  emoji: string;
}> = {
  edge: {
    name: 'Edge Training',
    description: 'Build up, get close, back off. Repeat.',
    emoji: '🎯',
  },
  goon: {
    name: 'Goon Session',
    description: 'Zone out. Let go. Just feel it.',
    emoji: '🌀',
  },
  denial: {
    name: 'Denial Training',
    description: 'Build up and denial cycles.',
    emoji: '🔥',
  },
  freestyle: {
    name: 'Freestyle',
    description: 'Just vibes. Your own pace.',
    emoji: '🌊',
  },
  conditioning: {
    name: 'Conditioning',
    description: 'Rewire your responses. Deep focus.',
    emoji: '✨',
  },
};
