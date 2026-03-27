/**
 * Adaptive Session Engine
 *
 * Real-time session adjustment based on Whoop biometric data.
 * Monitors HR, HRV, and trends to detect physiological states
 * and adjust conditioning content/device intensity accordingly.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type SessionAction =
  | 'continue'
  | 'adjust_device'
  | 'escalate'
  | 'switch_content'
  | 'soothe_then_retry';

export interface AdaptationResult {
  action: SessionAction;
  newContentId?: string;
  deviceAdjustment?: {
    direction: 'increase' | 'decrease';
    targetIntensity: number; // 0-100
  };
  reason: string;
}

interface WhoopReading {
  heart_rate: number;
  heart_rate_trend: 'rising' | 'stable' | 'declining';
  hrv: number;
  hrv_baseline: number;
  recorded_at: string;
}

interface PlaylistItem {
  contentId: string;
  contentType: string;
  phase: string;
  intensity: number;
}

// ============================================
// THRESHOLDS
// ============================================

const THRESHOLDS = {
  /** HR > 140 and rising = approaching orgasm */
  ORGASM_APPROACH_HR: 140,

  /** HR < 75 and declining = disengagement */
  DISENGAGEMENT_HR: 75,

  /** HRV > 1.3x baseline and stable = deep trance */
  DEEP_TRANCE_HRV_MULTIPLIER: 1.3,

  /** HRV < 0.7x baseline + HR > 90 = resistance / anxiety */
  RESISTANCE_HRV_MULTIPLIER: 0.7,
  RESISTANCE_HR: 90,
} as const;

// ============================================
// REAL-TIME ADAPTATION
// ============================================

/**
 * Query the latest biometric data and determine if the session
 * needs adjustment.
 *
 * Decision tree:
 * 1. HR > 140 rising       → reduce device (approaching orgasm, maintain edge)
 * 2. HR < 75 declining     → escalate content (losing engagement)
 * 3. HRV > 1.3x stable    → switch to identity content (deep trance = prime time)
 * 4. HRV < 0.7x + HR > 90 → soothe then retry (resistance/anxiety detected)
 * 5. Otherwise             → continue as-is
 */
export async function adaptSessionInRealTime(
  userId: string,
  sessionId: string,
  currentContentId: string,
  playlist: PlaylistItem[]
): Promise<AdaptationResult> {
  try {
    // Get latest Whoop reading
    const reading = await getLatestWhoopReading(userId);

    if (!reading) {
      return { action: 'continue', reason: 'No biometric data available' };
    }

    const hrvRatio = reading.hrv_baseline > 0
      ? reading.hrv / reading.hrv_baseline
      : 1;

    // Check conditions in priority order

    // 1. Approaching orgasm — reduce device to maintain edge
    if (
      reading.heart_rate > THRESHOLDS.ORGASM_APPROACH_HR &&
      reading.heart_rate_trend === 'rising'
    ) {
      const result: AdaptationResult = {
        action: 'adjust_device',
        deviceAdjustment: {
          direction: 'decrease',
          targetIntensity: 20, // Drop to 20% to prevent release
        },
        reason: `HR ${reading.heart_rate} rising — approaching orgasm, reducing device to maintain edge`,
      };

      await logAdaptation(userId, sessionId, currentContentId, result);
      return result;
    }

    // 2. Disengagement — escalate content
    if (
      reading.heart_rate < THRESHOLDS.DISENGAGEMENT_HR &&
      reading.heart_rate_trend === 'declining'
    ) {
      const nextContent = findEscalationContent(currentContentId, playlist);
      const result: AdaptationResult = {
        action: 'escalate',
        newContentId: nextContent?.contentId,
        deviceAdjustment: {
          direction: 'increase',
          targetIntensity: 70,
        },
        reason: `HR ${reading.heart_rate} declining — disengagement detected, escalating`,
      };

      await logAdaptation(userId, sessionId, currentContentId, result);
      return result;
    }

    // 3. Deep trance — switch to identity content (prime conditioning window)
    if (
      hrvRatio > THRESHOLDS.DEEP_TRANCE_HRV_MULTIPLIER &&
      reading.heart_rate_trend === 'stable'
    ) {
      const identityContent = findIdentityContent(playlist);
      const result: AdaptationResult = {
        action: 'switch_content',
        newContentId: identityContent?.contentId,
        reason: `HRV ${reading.hrv} (${(hrvRatio * 100).toFixed(0)}% baseline) stable — deep trance detected, switching to identity content`,
      };

      await logAdaptation(userId, sessionId, currentContentId, result);
      return result;
    }

    // 4. Resistance / anxiety — soothe then retry
    if (
      hrvRatio < THRESHOLDS.RESISTANCE_HRV_MULTIPLIER &&
      reading.heart_rate > THRESHOLDS.RESISTANCE_HR
    ) {
      const result: AdaptationResult = {
        action: 'soothe_then_retry',
        deviceAdjustment: {
          direction: 'decrease',
          targetIntensity: 10,
        },
        reason: `HRV ${reading.hrv} (${(hrvRatio * 100).toFixed(0)}% baseline) + HR ${reading.heart_rate} — resistance detected, soothing`,
      };

      await logAdaptation(userId, sessionId, currentContentId, result);
      return result;
    }

    // 5. Normal — continue
    return { action: 'continue', reason: 'Biometrics within normal session range' };
  } catch (error) {
    console.error('Adaptive session error:', error);
    return {
      action: 'continue',
      reason: `Adaptation check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}

// ============================================
// INTERNAL HELPERS
// ============================================

async function getLatestWhoopReading(userId: string): Promise<WhoopReading | null> {
  const { data, error } = await supabase
    .from('whoop_metrics')
    .select('heart_rate, heart_rate_trend, hrv, hrv_baseline, recorded_at')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch Whoop data:', error.message);
    return null;
  }

  return data as WhoopReading | null;
}

/**
 * Find the next higher-intensity content in the playlist.
 */
function findEscalationContent(
  currentContentId: string,
  playlist: PlaylistItem[]
): PlaylistItem | undefined {
  const currentIndex = playlist.findIndex((p) => p.contentId === currentContentId);

  if (currentIndex === -1) {
    // Not found in playlist — return highest intensity item
    return playlist.sort((a, b) => b.intensity - a.intensity)[0];
  }

  // Find next item with higher intensity
  const remaining = playlist.slice(currentIndex + 1);
  return remaining.find((p) => p.intensity > playlist[currentIndex].intensity)
    || remaining[0];
}

/**
 * Find identity-type content in the playlist (best used during deep trance).
 */
function findIdentityContent(playlist: PlaylistItem[]): PlaylistItem | undefined {
  return playlist.find(
    (p) =>
      p.contentType === 'identity' ||
      p.contentType === 'identity_reinforcement' ||
      p.phase === 'identity'
  );
}

/**
 * Log the adaptation to the session record for analysis.
 */
async function logAdaptation(
  userId: string,
  sessionId: string,
  contentId: string,
  result: AdaptationResult
): Promise<void> {
  try {
    // Read current adaptations
    const { data: session } = await supabase
      .from('conditioning_sessions_v2')
      .select('adaptations')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    const existing: unknown[] = Array.isArray(session?.adaptations)
      ? session.adaptations
      : [];

    const entry = {
      timestamp: new Date().toISOString(),
      content_id: contentId,
      action: result.action,
      reason: result.reason,
      new_content_id: result.newContentId || null,
      device_adjustment: result.deviceAdjustment || null,
    };

    await supabase
      .from('conditioning_sessions_v2')
      .update({ adaptations: [...existing, entry] })
      .eq('id', sessionId)
      .eq('user_id', userId);
  } catch (error) {
    // Fire-and-forget — don't break the session over a logging failure
    console.error('Failed to log adaptation:', error);
  }
}
