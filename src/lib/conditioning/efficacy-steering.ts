/**
 * Efficacy steering — the 2-D (engagement × efficacy) control policy (Phase 2).
 *
 * The reconditioning intensity control was 1-D: it only ever SOFTENED on task
 * skip-rate (engagement), by explicit design, to never push a resisting user.
 * That protection is correct for DISENGAGEMENT — but it also meant a user who is
 * fully engaged (doing the tasks) yet not measurably moving got nothing but the
 * same gentle treatment forever. This adds the second axis: measured efficacy.
 *
 * Policy (operator-chosen: escalate + switch on engaged-but-flat):
 *  - disengaging (high skip)      → soften / re-present (UNCHANGED; never penalized)
 *  - engaged + rising efficacy    → escalate, ride the winner (no switch)
 *  - engaged + flat/wrong efficacy→ escalate intensity AND switch mechanism
 *    (the authorized ratchet on a consenting, engaged sub — this is NOT the
 *     soften-only case, which only ever protected genuine disengagement)
 *  - moderate / no-signal          → hold
 *
 * Escalation stays bounded elsewhere: the safeword halts advancement, and the
 * phase machine is untouched (efficacy steers intensity/mechanism, never phase).
 */

export type EfficacySignal = 'rising' | 'flat' | 'wrong' | 'unknown';

export interface DecreeRate {
  total: number;
  missed: number;
  skipRate: number;
}

export interface SteeringDecision {
  nextIntensity: number;
  suppressToday: boolean;
  /** switch to a different mechanism/approach (engaged but not moving) */
  switchMechanism: boolean;
}

export const INTENSITY_MIN = 1;
export const INTENSITY_MAX = 5;

/**
 * Judge a measurement trend against the target's desired direction.
 * `slopeDir` is the raw sign from recon_measurement_trend (+1/0/-1); `targetDir`
 * is the target's `target_direction`. `n` is the number of measurements.
 */
export function classifyEfficacy(
  slopeDir: number | null | undefined,
  targetDir: 'increase' | 'decrease',
  n: number,
): EfficacySignal {
  if (slopeDir == null || n < 2) return 'unknown';
  if (slopeDir === 0) return 'flat';
  const good = targetDir === 'increase' ? slopeDir > 0 : slopeDir < 0;
  return good ? 'rising' : 'wrong';
}

export function computeSteering(
  rate: DecreeRate,
  currentIntensity: number,
  efficacy: EfficacySignal,
): SteeringDecision {
  const hold: SteeringDecision = { nextIntensity: currentIntensity, suppressToday: false, switchMechanism: false };
  if (rate.total < 3) return hold; // not enough engagement signal

  // Disengagement is protected — soften only, never switch/escalate on resistance.
  if (rate.skipRate >= 0.7) {
    const next = Math.max(INTENSITY_MIN, currentIntensity - 1);
    return { nextIntensity: next, suppressToday: next <= INTENSITY_MIN, switchMechanism: false };
  }
  if (rate.skipRate >= 0.4) {
    return { nextIntensity: Math.max(INTENSITY_MIN, currentIntensity - 1), suppressToday: false, switchMechanism: false };
  }

  const engaged = rate.skipRate <= 0.1 && (rate.total - rate.missed) >= 3;
  if (engaged) {
    const up = Math.min(INTENSITY_MAX, currentIntensity + 1);
    if (efficacy === 'flat' || efficacy === 'wrong') {
      // Engaged but not moving → ratchet AND change approach.
      return { nextIntensity: up, suppressToday: false, switchMechanism: true };
    }
    // rising (ride it) or unknown (prior clean-streak behavior) → escalate, no switch.
    return { nextIntensity: up, suppressToday: false, switchMechanism: false };
  }

  return hold; // moderate engagement — steady
}
