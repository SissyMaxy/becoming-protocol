/**
 * Session Device Bridge
 *
 * Connects conditioning sessions to Lovense device control.
 * When a session starts, the device activates with the prescribed pattern.
 * When it ends, the device stops. During sessions, phase transitions
 * change the device pattern automatically.
 *
 * Uses smartVibrate/smartStop/smartPlayPattern from lovense.ts
 * which handle cloud vs local API routing.
 */

import { smartVibrate, smartStop, smartPlayPattern } from '../lovense';
import type { HapticTriggerType } from '../../types/lovense';

// ============================================
// SESSION DEVICE PATTERNS
// ============================================

/**
 * Maps session types and phases to device behavior.
 * Intensity values are 0-20 (Lovense scale).
 */
const SESSION_PATTERNS: Record<string, {
  pattern?: string;
  intensity: number;
  durationSec?: number;
}> = {
  // Goon session phases
  'goon:build': { pattern: 'building', intensity: 8 },
  'goon:escalate': { pattern: 'edge_tease', intensity: 12 },
  'goon:peak': { pattern: 'denial_pulse', intensity: 16 },

  // Trance sessions — subtle, steady
  'trance:induction': { intensity: 4, durationSec: 0 },
  'trance:deepening': { pattern: 'gentle_wave', intensity: 6 },
  'trance:installation': { pattern: 'heartbeat', intensity: 8 },

  // Edge sessions
  'edge:warmup': { pattern: 'building', intensity: 6 },
  'edge:active': { pattern: 'edge_tease', intensity: 14 },
  'edge:recovery': { intensity: 3, durationSec: 0 },

  // Sleep conditioning — very subtle
  'sleep:induction': { pattern: 'gentle_wave', intensity: 3 },

  // Combined sessions
  'combined:video': { pattern: 'building', intensity: 10 },
  'combined:audio_transition': { pattern: 'gentle_wave', intensity: 6 },
  'combined:handler_custom': { pattern: 'heartbeat', intensity: 8 },

  // Morning ritual — brief pulse
  'morning:ritual': { intensity: 5, durationSec: 10 },

  // Background ambient — low constant
  'background:ambient': { pattern: 'constant_low', intensity: 3 },
};

// ============================================
// PUBLIC API
// ============================================

/**
 * Activate device for a conditioning session.
 * Called when a session starts or transitions to a new phase.
 *
 * @param sessionType - 'goon', 'trance', 'edge', 'sleep', 'combined', 'morning', 'background'
 * @param phase - Phase within the session (e.g., 'build', 'escalate', 'peak')
 * @param intensityMultiplier - Hidden operations multiplier (1.0 = normal, up to 2.0)
 */
export async function activateSessionDevice(
  sessionType: string,
  phase: string,
  intensityMultiplier: number = 1.0,
): Promise<boolean> {
  const key = `${sessionType}:${phase}`;
  const config = SESSION_PATTERNS[key];

  if (!config) {
    // No pattern defined for this session/phase combo — skip silently
    return false;
  }

  const scaledIntensity = Math.min(20, Math.round(config.intensity * intensityMultiplier));
  const triggerType: HapticTriggerType = 'edge_session';

  try {
    if (config.pattern) {
      await smartPlayPattern(config.pattern, triggerType);
    } else {
      await smartVibrate(scaledIntensity, config.durationSec, triggerType);
    }
    return true;
  } catch (err) {
    console.error('[session-device] Failed to activate:', err);
    return false;
  }
}

/**
 * Stop device when session ends.
 */
export async function deactivateSessionDevice(): Promise<boolean> {
  try {
    await smartStop('edge_session');
    return true;
  } catch (err) {
    console.error('[session-device] Failed to deactivate:', err);
    return false;
  }
}

/**
 * Transition device to a new phase mid-session.
 * Stops the current pattern and starts the new one.
 */
export async function transitionSessionPhase(
  sessionType: string,
  newPhase: string,
  intensityMultiplier: number = 1.0,
): Promise<boolean> {
  // Brief pause between patterns for smooth transition
  await smartStop('edge_session');
  // Small delay to avoid overlapping commands
  await new Promise(r => setTimeout(r, 500));
  return activateSessionDevice(sessionType, newPhase, intensityMultiplier);
}
