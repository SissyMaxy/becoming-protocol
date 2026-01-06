// Lovense Feminization Integration
// Connects arousal/denial state with toy control

import * as lovense from './lovense';
import type { ArousalState, ArousalMetrics } from '../types/arousal';
import { AROUSAL_SESSION_PROMPTS } from './prompts';

// ============================================
// DENIAL-AWARE INTENSITY
// ============================================

export interface DenialIntensityConfig {
  baseIntensity: number;      // Starting intensity (0-20)
  maxIntensity: number;       // Maximum allowed (0-20)
  dayMultiplier: number;      // Intensity added per day denied
  sweetSpotBonus: number;     // Extra intensity in sweet spot
  overloadBonus: number;      // Extra intensity in overload
  postReleaseMax: number;     // Max intensity after release
}

const DEFAULT_DENIAL_CONFIG: DenialIntensityConfig = {
  baseIntensity: 4,
  maxIntensity: 18,
  dayMultiplier: 0.5,         // +0.5 intensity per day
  sweetSpotBonus: 3,
  overloadBonus: 5,
  postReleaseMax: 6,          // Keep it low after release
};

/**
 * Calculate intensity based on denial days and arousal state
 */
export function calculateDenialAwareIntensity(
  metrics: ArousalMetrics | null,
  config: Partial<DenialIntensityConfig> = {}
): number {
  const cfg = { ...DEFAULT_DENIAL_CONFIG, ...config };

  if (!metrics) {
    return cfg.baseIntensity;
  }

  const { currentStreakDays, currentState } = metrics;

  // Post-release state has limited intensity
  if (currentState === 'post_release' || currentState === 'recovery') {
    return Math.min(cfg.postReleaseMax, cfg.baseIntensity);
  }

  // Base calculation: increases with denial days
  let intensity = cfg.baseIntensity + (currentStreakDays * cfg.dayMultiplier);

  // State bonuses
  if (currentState === 'sweet_spot') {
    intensity += cfg.sweetSpotBonus;
  } else if (currentState === 'overload') {
    intensity += cfg.overloadBonus;
  } else if (currentState === 'building') {
    intensity += 1;
  }

  // Clamp to max
  return Math.min(cfg.maxIntensity, Math.round(intensity));
}

/**
 * Get intensity range for current state
 */
export function getIntensityRange(
  metrics: ArousalMetrics | null
): { min: number; max: number; recommended: number } {
  const recommended = calculateDenialAwareIntensity(metrics);

  if (!metrics || metrics.currentState === 'post_release' || metrics.currentState === 'recovery') {
    return { min: 0, max: 8, recommended };
  }

  if (metrics.currentState === 'overload') {
    return { min: 5, max: 20, recommended };
  }

  if (metrics.currentState === 'sweet_spot') {
    return { min: 3, max: 18, recommended };
  }

  return { min: 0, max: 16, recommended };
}

// ============================================
// EDGE TRAINING WITH COMMITMENTS
// ============================================

export interface EdgeCommitment {
  id: string;
  label: string;
  description: string;
  action: () => void | Promise<void>;
}

export interface EdgeTrainingConfig {
  onEdge5?: (commitments: EdgeCommitment[]) => Promise<string | null>;
  onEdge8?: (commitments: EdgeCommitment[]) => Promise<string | null>;
  onEdge10?: (commitments: EdgeCommitment[]) => Promise<string | null>;
  onCommitmentMade?: (edgeCount: number, commitment: string) => void;
}

/**
 * Get commitment options for an edge milestone
 */
export function getEdgeCommitments(
  edgeCount: number,
  handlers: {
    addEdges?: (count: number) => void;
    addDenialDays?: (days: number) => void;
    addLockHours?: (hours: number) => void;
    skipNextRelease?: () => void;
    listenToHypno?: () => void;
  }
): EdgeCommitment[] {
  if (edgeCount === 5) {
    return [
      {
        id: 'add_edges_3',
        label: 'Add 3 more edges',
        description: 'Push yourself further',
        action: () => handlers.addEdges?.(3),
      },
      {
        id: 'add_denial_1',
        label: 'Add 1 day to denial',
        description: 'Extend your streak goal',
        action: () => handlers.addDenialDays?.(1),
      },
      {
        id: 'lock_12h',
        label: 'Lock for 12 hours',
        description: 'After this session',
        action: () => handlers.addLockHours?.(12),
      },
    ];
  }

  if (edgeCount === 8) {
    return [
      {
        id: 'add_edges_5',
        label: 'Add 5 more edges',
        description: 'She wants you deeper',
        action: () => handlers.addEdges?.(5),
      },
      {
        id: 'add_denial_2',
        label: 'Add 2 days to denial',
        description: 'Your honest brain knows what it wants',
        action: () => handlers.addDenialDays?.(2),
      },
      {
        id: 'lock_24h',
        label: 'Lock for 24 hours',
        description: 'Full day of anticipation',
        action: () => handlers.addLockHours?.(24),
      },
      {
        id: 'hypno',
        label: 'Listen to hypno tonight',
        description: 'Reinforce the conditioning',
        action: () => handlers.listenToHypno?.(),
      },
    ];
  }

  if (edgeCount >= 10) {
    return [
      {
        id: 'add_denial_week',
        label: 'Add a full week to denial',
        description: 'A serious commitment',
        action: () => handlers.addDenialDays?.(7),
      },
      {
        id: 'lock_48h',
        label: '48-hour lock starting now',
        description: 'Two days of sweet anticipation',
        action: () => handlers.addLockHours?.(48),
      },
      {
        id: 'skip_release',
        label: 'Skip next release (ruined only)',
        description: 'Your next must be ruined, not full',
        action: () => handlers.skipNextRelease?.(),
      },
    ];
  }

  return [];
}

/**
 * Get the prompt text for edge commitment
 */
export function getEdgeCommitmentPrompt(edgeCount: number): string | null {
  if (edgeCount === 5) {
    return AROUSAL_SESSION_PROMPTS.midSessionCommitments.edge5.body;
  }
  if (edgeCount === 8) {
    return AROUSAL_SESSION_PROMPTS.midSessionCommitments.edge8.body;
  }
  if (edgeCount >= 10) {
    return AROUSAL_SESSION_PROMPTS.midSessionCommitments.edge10.body;
  }
  return null;
}

// ============================================
// TASK REWARD BUZZES
// ============================================

export interface RewardBuzzConfig {
  taskComplete: { intensity: number; duration: number };
  streakMilestone: { intensity: number; duration: number; pulses: number };
  achievementUnlock: { intensity: number; duration: number; pattern: 'pulse' | 'wave' | 'ramp' };
  levelUp: { intensity: number; duration: number; pattern: 'celebration' };
}

const DEFAULT_REWARD_BUZZ: RewardBuzzConfig = {
  taskComplete: { intensity: 8, duration: 500 },
  streakMilestone: { intensity: 12, duration: 300, pulses: 3 },
  achievementUnlock: { intensity: 14, duration: 1000, pattern: 'wave' },
  levelUp: { intensity: 16, duration: 2000, pattern: 'celebration' },
};

/**
 * Send a reward buzz for task completion
 * Uses cloud API pattern if available, falls back to local
 */
export async function sendTaskCompleteBuzz(toyId?: string): Promise<void> {
  // Try cloud API first (uses predefined pattern)
  if (lovense.isCloudApiEnabled()) {
    const result = await lovense.sendTaskCompleteBuzz();
    if (result.success) return;
    // Fall through to local if cloud fails
  }

  // Local fallback
  const cfg = DEFAULT_REWARD_BUZZ.taskComplete;
  if (toyId) {
    await lovense.vibrate(toyId, cfg.intensity);
    setTimeout(() => lovense.stop(toyId), cfg.duration);
  } else {
    await lovense.vibrateAll(cfg.intensity);
    setTimeout(() => lovense.stopAll(), cfg.duration);
  }
}

/**
 * Send a streak milestone buzz (pulsing)
 * Uses cloud API pattern if available, falls back to local
 */
export async function sendStreakMilestoneBuzz(toyId?: string): Promise<void> {
  // Try cloud API first
  if (lovense.isCloudApiEnabled()) {
    const result = await lovense.sendStreakMilestoneBuzz();
    if (result.success) return;
  }

  // Local fallback
  const cfg = DEFAULT_REWARD_BUZZ.streakMilestone;
  for (let i = 0; i < cfg.pulses; i++) {
    if (toyId) {
      await lovense.vibrate(toyId, cfg.intensity);
    } else {
      await lovense.vibrateAll(cfg.intensity);
    }
    await sleep(cfg.duration);

    if (toyId) {
      await lovense.stop(toyId);
    } else {
      await lovense.stopAll();
    }

    if (i < cfg.pulses - 1) {
      await sleep(200);
    }
  }
}

/**
 * Send an achievement unlock buzz
 * Uses cloud API pattern if available, falls back to local
 */
export async function sendAchievementBuzz(toyId?: string): Promise<void> {
  // Try cloud API first
  if (lovense.isCloudApiEnabled()) {
    const result = await lovense.sendAchievementBuzz();
    if (result.success) return;
  }

  // Local fallback
  const cfg = DEFAULT_REWARD_BUZZ.achievementUnlock;
  const steps = 5;
  const stepDuration = cfg.duration / steps;

  for (let i = 0; i < steps; i++) {
    const intensity = Math.round(cfg.intensity * (0.5 + (i / steps) * 0.5));
    if (toyId) {
      await lovense.vibrate(toyId, intensity);
    } else {
      await lovense.vibrateAll(intensity);
    }
    await sleep(stepDuration);
  }

  if (toyId) {
    await lovense.stop(toyId);
  } else {
    await lovense.stopAll();
  }
}

/**
 * Send a level up celebration buzz
 * Uses cloud API pattern if available, falls back to local
 */
export async function sendLevelUpBuzz(toyId?: string): Promise<void> {
  // Try cloud API first
  if (lovense.isCloudApiEnabled()) {
    const result = await lovense.sendLevelUpBuzz();
    if (result.success) return;
  }

  // Local fallback
  const cfg = DEFAULT_REWARD_BUZZ.levelUp;

  // Build up
  for (let i = 0; i <= 10; i++) {
    const intensity = Math.round((i / 10) * cfg.intensity);
    if (toyId) {
      await lovense.vibrate(toyId, intensity);
    } else {
      await lovense.vibrateAll(intensity);
    }
    await sleep(100);
  }

  // Hold at peak
  await sleep(500);

  // Pulsing celebration
  for (let i = 0; i < 3; i++) {
    if (toyId) {
      await lovense.vibrate(toyId, cfg.intensity);
    } else {
      await lovense.vibrateAll(cfg.intensity);
    }
    await sleep(200);

    if (toyId) {
      await lovense.vibrate(toyId, cfg.intensity / 2);
    } else {
      await lovense.vibrateAll(cfg.intensity / 2);
    }
    await sleep(200);
  }

  // Wind down
  for (let i = 10; i >= 0; i--) {
    const intensity = Math.round((i / 10) * cfg.intensity);
    if (toyId) {
      await lovense.vibrate(toyId, intensity);
    } else {
      await lovense.vibrateAll(intensity);
    }
    await sleep(50);
  }

  if (toyId) {
    await lovense.stop(toyId);
  } else {
    await lovense.stopAll();
  }
}

/**
 * Send an affirmation buzz (for "good girl" moments)
 * Uses cloud API pattern if available, falls back to local
 */
export async function sendAffirmationBuzz(toyId?: string): Promise<void> {
  // Try cloud API first
  if (lovense.isCloudApiEnabled()) {
    const result = await lovense.sendAffirmationBuzz();
    if (result.success) return;
  }

  // Local fallback - gentle wave
  const intensity = 10;
  const duration = 1500;
  const steps = 5;
  const stepDuration = duration / steps;

  for (let i = 0; i < steps; i++) {
    const wave = Math.round(intensity * (0.5 + Math.sin(i * Math.PI / steps) * 0.5));
    if (toyId) {
      await lovense.vibrate(toyId, wave);
    } else {
      await lovense.vibrateAll(wave);
    }
    await sleep(stepDuration);
  }

  if (toyId) {
    await lovense.stop(toyId);
  } else {
    await lovense.stopAll();
  }
}

// ============================================
// CONDITIONING PATTERNS
// ============================================

export interface ConditioningPattern {
  id: string;
  name: string;
  description: string;
  triggerType: 'voice_target' | 'affirmation' | 'posture' | 'anchor_focus' | 'name_spoken';
  rewardIntensity: number;
  rewardDuration: number;
  buildUp: boolean;
}

export const CONDITIONING_PATTERNS: ConditioningPattern[] = [
  {
    id: 'voice_reward',
    name: 'Voice Target Reward',
    description: 'Buzz when you hit your voice target pitch',
    triggerType: 'voice_target',
    rewardIntensity: 10,
    rewardDuration: 1000,
    buildUp: false,
  },
  {
    id: 'affirmation_pulse',
    name: 'Affirmation Pulse',
    description: 'Gentle pulse as you speak affirmations',
    triggerType: 'affirmation',
    rewardIntensity: 6,
    rewardDuration: 500,
    buildUp: true,
  },
  {
    id: 'posture_reward',
    name: 'Posture Reward',
    description: 'Reward for maintaining proper posture',
    triggerType: 'posture',
    rewardIntensity: 8,
    rewardDuration: 800,
    buildUp: false,
  },
  {
    id: 'anchor_deepening',
    name: 'Anchor Deepening',
    description: 'Building intensity as you focus on anchors',
    triggerType: 'anchor_focus',
    rewardIntensity: 12,
    rewardDuration: 2000,
    buildUp: true,
  },
  {
    id: 'name_response',
    name: 'Name Response',
    description: 'Instant buzz when you say her name',
    triggerType: 'name_spoken',
    rewardIntensity: 14,
    rewardDuration: 600,
    buildUp: false,
  },
];

/**
 * Send a conditioning reward
 * Uses cloud API pattern if available, falls back to local
 */
export async function sendConditioningReward(
  pattern: ConditioningPattern,
  toyId?: string
): Promise<void> {
  // Try cloud API first based on trigger type
  if (lovense.isCloudApiEnabled()) {
    let result;
    switch (pattern.triggerType) {
      case 'voice_target':
        result = await lovense.sendVoiceRewardBuzz();
        break;
      case 'posture':
        result = await lovense.sendPostureRewardBuzz();
        break;
      case 'anchor_focus':
        result = await lovense.sendAnchorBuzz();
        break;
      case 'affirmation':
        result = await lovense.sendAffirmationBuzz();
        break;
      default:
        result = await lovense.sendAnchorBuzz();
    }
    if (result.success) return;
  }

  // Local fallback
  if (pattern.buildUp) {
    // Gradual build to reward intensity
    const steps = 5;
    const stepDuration = pattern.rewardDuration / steps;

    for (let i = 1; i <= steps; i++) {
      const intensity = Math.round((i / steps) * pattern.rewardIntensity);
      if (toyId) {
        await lovense.vibrate(toyId, intensity);
      } else {
        await lovense.vibrateAll(intensity);
      }
      await sleep(stepDuration);
    }
  } else {
    // Instant reward
    if (toyId) {
      await lovense.vibrate(toyId, pattern.rewardIntensity);
    } else {
      await lovense.vibrateAll(pattern.rewardIntensity);
    }
    await sleep(pattern.rewardDuration);
  }

  if (toyId) {
    await lovense.stop(toyId);
  } else {
    await lovense.stopAll();
  }
}

// ============================================
// STATE-AWARE SESSION CONTROL
// ============================================

/**
 * Get session recommendations based on arousal state
 */
export function getSessionRecommendation(state: ArousalState): {
  allowSession: boolean;
  toyEnabled: boolean;
  maxIntensity: number;
  warning?: string;
  recommendation: string;
} {
  switch (state) {
    case 'post_release':
      return {
        allowSession: true,
        toyEnabled: true,
        maxIntensity: 6,
        warning: 'Low receptivity state. Keep intensity gentle.',
        recommendation: 'Light session recommended. Focus on anchors, not arousal.',
      };

    case 'recovery':
      return {
        allowSession: true,
        toyEnabled: true,
        maxIntensity: 10,
        recommendation: 'Moderate session okay. Rebuilding toward sweet spot.',
      };

    case 'baseline':
      return {
        allowSession: true,
        toyEnabled: true,
        maxIntensity: 14,
        recommendation: 'Normal session. Good time for conditioning.',
      };

    case 'building':
      return {
        allowSession: true,
        toyEnabled: true,
        maxIntensity: 16,
        recommendation: 'Intensity building. Good receptivity for deeper work.',
      };

    case 'sweet_spot':
      return {
        allowSession: true,
        toyEnabled: true,
        maxIntensity: 18,
        recommendation: 'Maximum receptivity! Ideal for conditioning and breakthroughs.',
      };

    case 'overload':
      return {
        allowSession: true,
        toyEnabled: true,
        maxIntensity: 20,
        warning: 'High risk state. Be mindful of slip potential.',
        recommendation: 'Intense session possible, but watch for overload.',
      };

    default:
      return {
        allowSession: true,
        toyEnabled: true,
        maxIntensity: 14,
        recommendation: 'Standard session.',
      };
  }
}

// ============================================
// HELPERS
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
