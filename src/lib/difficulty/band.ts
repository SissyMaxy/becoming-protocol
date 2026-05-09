/**
 * Compliance-aware difficulty band — pure helpers.
 *
 * The evaluator (supabase/functions/compliance-difficulty-evaluator)
 * computes the band from rolling 14-day signals, and consumers
 * (mommy-mantra, mommy-touch, mommy-prescribe, gaslight) read the band
 * to gate intensity / cadence / public-dare bias.
 *
 * Pure functions only — no DB, no side effects. Mirrored at
 * supabase/functions/_shared/difficulty-band.ts so edge fns can import
 * without bundling src/lib/. Keep both in sync.
 *
 * Hard rules (encoded in the helpers below):
 *   - 'recovery' is a HOLD, not a reward removal. It forces softer
 *     treatment regardless of compliance signals: gaslight off,
 *     prescription cadence ≤ occasional, mantra ceiling 'gentle',
 *     touch task cap halved.
 *   - Manual override always wins. The evaluator must not move past
 *     a locked value, and consumers read the same effective value.
 *   - Phase ceiling sits BELOW the band ceiling. Bands modulate
 *     intensity within the user's phase range; they don't lift it.
 *   - 'cruel' band on a phase-1 user still doesn't get phase-5+
 *     content — the phase gate stays in front.
 */

export type DifficultyBand = 'recovery' | 'gentle' | 'firm' | 'cruel';

const BAND_RANK: Record<DifficultyBand, number> = {
  recovery: 0,
  gentle: 1,
  firm: 2,
  cruel: 3,
};

export const BAND_ORDER: DifficultyBand[] = ['recovery', 'gentle', 'firm', 'cruel'];

export function bandRank(b: DifficultyBand): number {
  return BAND_RANK[b];
}

export function bumpBand(b: DifficultyBand): DifficultyBand {
  const idx = Math.min(BAND_ORDER.length - 1, BAND_RANK[b] + 1);
  return BAND_ORDER[idx];
}

export function dropBand(b: DifficultyBand): DifficultyBand {
  const idx = Math.max(0, BAND_RANK[b] - 1);
  return BAND_ORDER[idx];
}

/**
 * Resolve the band a consumer should USE. Override always wins; if
 * unset, the evaluator's settled `current_difficulty_band` is returned.
 *
 * Callers that read compliance_difficulty_state should run the row
 * through this rather than reading current_difficulty_band directly.
 */
export function effectiveBand(state: {
  current_difficulty_band: DifficultyBand;
  override_band?: DifficultyBand | null;
} | null | undefined): DifficultyBand {
  if (!state) return 'gentle';
  return (state.override_band ?? state.current_difficulty_band) as DifficultyBand;
}

/**
 * Mantra intensity ceiling for this band. 'recovery' caps at gentle —
 * the aftercare-floor invariant. Above that, ceiling tracks the band.
 *
 * Selectors use this to filter the catalog; if a mantra's
 * intensity_tier is above the ceiling, it's ineligible regardless of
 * affect or recency score.
 */
export function bandMantraCeiling(b: DifficultyBand): 'gentle' | 'firm' | 'cruel' {
  if (b === 'recovery') return 'gentle';
  if (b === 'gentle') return 'gentle';
  if (b === 'firm') return 'firm';
  return 'cruel';
}

/**
 * Daily touch-task cap multiplier. Recovery halves the cap so the
 * user gets meaningful breathing room; cruel adds one extra slot
 * to keep the cadence dense without rewriting the affect-bias table.
 */
export function bandTouchCapMultiplier(b: DifficultyBand): number {
  if (b === 'recovery') return 0.5;
  if (b === 'gentle') return 1;
  if (b === 'firm') return 1;
  return 1.5;
}

/**
 * Wardrobe prescription cadence ceiling. Recovery forces 'occasional'
 * even if the user has 'weekly' configured — prevents the cadence
 * timer from firing during a recovery hold. The user's stored cadence
 * is never overwritten; consumers just respect the ceiling.
 */
export function bandPrescriptionCadenceCeiling(
  b: DifficultyBand,
): 'off' | 'occasional' | 'weekly' {
  if (b === 'recovery') return 'occasional';
  return 'weekly';
}

/**
 * Effective gaslight intensity given the user's stored value AND the
 * current band. Recovery short-circuits to 'off' regardless of the
 * stored intensity — the aftercare-floor invariant.
 *
 * The stored gaslight_intensity is NEVER overwritten — that would
 * conflict with the user's safeword cooldown and the meta-frame
 * audit trail. We just gate the read.
 */
export function bandGaslightIntensity(
  storedIntensity: 'off' | 'gentle' | 'firm' | 'cruel',
  band: DifficultyBand,
): 'off' | 'gentle' | 'firm' | 'cruel' {
  if (band === 'recovery') return 'off';
  // Tier the gaslight to the band's mantra ceiling so a 'firm' band
  // can't accidentally serve cruel-tier distortions.
  const ceil = bandMantraCeiling(band);
  const RANK = { off: 0, gentle: 1, firm: 2, cruel: 3 };
  const stored = RANK[storedIntensity];
  const ceiling = ceil === 'gentle' ? 1 : ceil === 'firm' ? 2 : 3;
  if (stored <= ceiling) return storedIntensity;
  // Demote to ceiling
  if (ceiling === 1) return 'gentle';
  if (ceiling === 2) return 'firm';
  return 'cruel';
}

/**
 * Public-dare bias. Higher band → more weight on the 'public_micro'
 * touch-task category. Recovery zeroes it out (no public exposure
 * during a hold). Used by mommy-touch's category picker.
 */
export function bandPublicDareWeight(b: DifficultyBand): number {
  if (b === 'recovery') return 0;
  if (b === 'gentle') return 1;
  if (b === 'firm') return 2;
  return 4;
}

// ─── Evaluator math ──────────────────────────────────────────────────────
// The evaluator computes a target band from compliance signals. These
// helpers are pure so they can be unit-tested independently of the
// edge fn's IO layer. The evaluator caps movement at +/- one band per
// pass — large swings rarely reflect the user's actual state and tend
// to whiplash the persona.

export interface ComplianceSignals {
  /** 0..100 percentage of fulfilled commitments in the rolling window */
  compliancePct14d: number;
  /** raw slip count in the rolling window */
  slipCount14d: number;
  /** consecutive days with at least one fulfilled commitment AND no slip */
  streakDays: number;
}

export interface BandEvaluation {
  next: DifficultyBand;
  reason: string;
  changed: boolean;
}

/**
 * Decide the next band from the current band + signals. Capped to one
 * step per pass.
 *
 * Rules (per spec):
 *   - compliancePct >= 85% AND streakDays >= 7 → bump up one band
 *   - compliancePct <= 50% OR slipCount >= 4 → drop one band toward recovery
 *   - otherwise → stable
 *
 * Override is NOT consulted here — the caller decides whether to skip
 * evaluation when override is set. We keep this fn pure on signals.
 */
export function evaluateBand(
  current: DifficultyBand,
  signals: ComplianceSignals,
): BandEvaluation {
  // High-compliance bump
  if (signals.compliancePct14d >= 85 && signals.streakDays >= 7) {
    const next = bumpBand(current);
    return {
      next,
      reason: next === current
        ? 'stable:already_at_ceiling'
        : 'bumped:high_compliance',
      changed: next !== current,
    };
  }
  // Slip / low-compliance drop
  if (signals.compliancePct14d <= 50 || signals.slipCount14d >= 4) {
    const next = dropBand(current);
    return {
      next,
      reason: next === current
        ? 'stable:already_at_floor'
        : signals.slipCount14d >= 4
          ? 'dropped:slip_spike'
          : 'dropped:low_compliance',
      changed: next !== current,
    };
  }
  return { next: current, reason: 'stable', changed: false };
}
