/**
 * Lovense Shoot Triggers — Sprint 6 Item 28
 * Wire Lovense device to shoot lifecycle:
 * - Anticipation pulse during shoot setup
 * - Maintain arousal during capture
 * - Reward burst on shoot completion
 * - Denial enforcement on skip
 */

import {
  smartVibrate,
  smartPlayPattern,
  smartStop,
  sendTaskCompleteBuzz,
} from '../lovense';
import type { ShootPrescription, ShootType } from '../../types/industry';

// ============================================
// Shoot Phase Patterns
// ============================================

interface ShootPhaseConfig {
  intensity: number;
  durationSec: number;
  pattern?: string;
}

const ANTICIPATION_PATTERNS: Record<string, ShootPhaseConfig> = {
  photo_set: { intensity: 5, durationSec: 30 },
  short_video: { intensity: 6, durationSec: 20 },
  cage_check: { intensity: 8, durationSec: 15 },
  outfit_of_day: { intensity: 3, durationSec: 20 },
  toy_showcase: { intensity: 7, durationSec: 25 },
  tease_video: { intensity: 9, durationSec: 30 },
  progress_photo: { intensity: 4, durationSec: 15 },
  edge_capture: { intensity: 10, durationSec: 45 },
};

const MAINTAIN_INTENSITY: Record<string, number> = {
  photo_set: 3,
  short_video: 4,
  cage_check: 6,
  outfit_of_day: 2,
  toy_showcase: 5,
  tease_video: 7,
  progress_photo: 2,
  edge_capture: 8,
};

const REWARD_PATTERNS: Record<string, ShootPhaseConfig> = {
  default: { intensity: 15, durationSec: 10 },
  high_arousal: { intensity: 18, durationSec: 15 },
  edge_capture: { intensity: 20, durationSec: 20, pattern: 'edge_reward' },
};

// ============================================
// Shoot Lifecycle Triggers
// ============================================

/**
 * Fire anticipation pulse when shoot is prescribed / user opens shoot card.
 * Brief, attention-getting — "your body knows what's about to happen."
 */
export async function triggerShootAnticipation(
  prescription: ShootPrescription,
): Promise<boolean> {
  const config = ANTICIPATION_PATTERNS[prescription.shootType] ??
    ANTICIPATION_PATTERNS.photo_set;

  // Scale intensity with denial day
  const denialBoost = prescription.denialDay
    ? Math.min(5, Math.floor(prescription.denialDay / 2))
    : 0;

  const finalIntensity = Math.min(20, config.intensity + denialBoost);

  return smartVibrate(finalIntensity, config.durationSec, 'edge_session', prescription.id);
}

/**
 * Maintain low arousal during active shoot.
 * Keeps Maxy in-state without being distracting.
 */
export async function triggerShootMaintain(
  shootType: ShootType,
  denialDay: number,
): Promise<boolean> {
  const base = MAINTAIN_INTENSITY[shootType] ?? 3;
  const denialBoost = Math.min(3, Math.floor(denialDay / 3));
  const intensity = Math.min(10, base + denialBoost);

  return smartVibrate(intensity, 0, 'edge_session');
}

/**
 * Stop maintenance vibration.
 */
export async function stopShootMaintain(): Promise<boolean> {
  return smartStop('edge_session');
}

/**
 * Reward burst on shoot completion.
 * Positive reinforcement — completing shoots feels good.
 */
export async function triggerShootReward(
  shootType: ShootType,
  shotCount: number,
): Promise<boolean> {
  const isHighArousal = ['tease_video', 'edge_capture', 'toy_showcase'].includes(shootType);

  if (shootType === 'edge_capture') {
    const config = REWARD_PATTERNS.edge_capture;
    if (config.pattern) {
      return smartPlayPattern(config.pattern, 'task_complete');
    }
  }

  if (isHighArousal) {
    const config = REWARD_PATTERNS.high_arousal;
    return smartVibrate(config.intensity, config.durationSec, 'task_complete');
  }

  // Scale reward with effort (more shots = bigger reward)
  const effortBonus = Math.min(5, shotCount);
  const config = REWARD_PATTERNS.default;
  return smartVibrate(
    Math.min(20, config.intensity + effortBonus),
    config.durationSec,
    'task_complete',
  );
}

/**
 * Denial pulse on shoot skip — reminder of what was lost.
 * Brief, sharp, then nothing.
 */
export async function triggerSkipDenial(
  consecutiveSkips: number,
): Promise<boolean> {
  // First skip: brief pulse then silence
  // Subsequent skips: nothing — the silence IS the punishment
  if (consecutiveSkips <= 1) {
    await smartVibrate(15, 3, 'denial_training');
    await new Promise(r => setTimeout(r, 3000));
    return smartStop('denial_training');
  }
  // After first skip: no device response. Silence is louder.
  return true;
}

/**
 * Task complete buzz — generic completion reward.
 * Wraps the existing Lovense function for consistency.
 */
export async function triggerTaskComplete(): Promise<boolean> {
  try {
    await sendTaskCompleteBuzz();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the recommended Lovense config for a shoot type.
 * Used by UI to show what device activity to expect.
 */
export function getShootDevicePreview(shootType: ShootType): {
  anticipation: string;
  during: string;
  reward: string;
} {
  const antic = ANTICIPATION_PATTERNS[shootType] ?? ANTICIPATION_PATTERNS.photo_set;
  const maintain = MAINTAIN_INTENSITY[shootType] ?? 3;
  const isHighArousal = ['tease_video', 'edge_capture', 'toy_showcase'].includes(shootType);

  return {
    anticipation: `${antic.intensity}/20 for ${antic.durationSec}s`,
    during: `${maintain}/20 sustained`,
    reward: isHighArousal ? 'high intensity burst' : 'standard completion buzz',
  };
}
