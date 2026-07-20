/**
 * Reconditioning phase-walk policy — the tested spec of the SQL `recon_program_walk`
 * (mig 681). THE UNLOCK: drives a program through the early phase edges
 * induction→install→reinforce→…→measure so it actually reaches the efficacy loop
 * (the measure→advance edge, which already works but was unreachable).
 *
 * SQL is the executor (it queries deliveries/reps/timers + calls the legal-transition
 * gate `recon_program_advance`); this module pins the DECISION policy so the dwell/
 * delivery/timer thresholds are regression-tested. Advancement is +1 through the legal
 * matrix only — it can never skip a phase, and the SQL self-gates on safeword/pause.
 *
 * measure→{retain|reinforce|install} is NOT decided here — that edge is owned by
 * recon-measure / the probe card and is efficacy-driven (delta vs baseline).
 */

export type ReconPhase =
  | 'induction' | 'install' | 'reinforce' | 'reconsolidate' | 'measure' | 'retain';

export const INDUCTION_DWELL_DAYS = 3;
export const INSTALL_DWELL_DAYS = 5;
export const MIN_IN_PHASE_DELIVERIES = 2;

export interface PhaseWalkInput {
  phase: ReconPhase;
  status: 'running' | 'paused' | 'completed' | 'retired';
  /** days since phase_entered_at */
  dwellDays: number;
  /** deliveries tagged to this target since phase_entered_at */
  inPhaseDeliveries: number;
  /** whether the target has a captured baseline (required to install) */
  hasBaseline: boolean;
  /** whether now >= next_measure_due_at (the reclaimed cadence timer) */
  measureDue: boolean;
  /** total graded SM-2 reps for the target (a measure is never taken cold) */
  reps: number;
}

/**
 * The next phase to advance to, or null to hold. Mirrors mig 681
 * `recon_program_walk`. Holding is a no-op (re-present the current phase task);
 * never a penalty.
 */
export function decidePhaseWalk(p: PhaseWalkInput): ReconPhase | null {
  if (p.status !== 'running') return null;

  switch (p.phase) {
    case 'induction':
      // Cannot install without a baseline (SQL re-checks; policy mirrors it).
      if (p.hasBaseline && p.dwellDays >= INDUCTION_DWELL_DAYS && p.inPhaseDeliveries >= MIN_IN_PHASE_DELIVERIES) {
        return 'install';
      }
      return null;

    case 'install':
      if (p.dwellDays >= INSTALL_DWELL_DAYS && p.inPhaseDeliveries >= MIN_IN_PHASE_DELIVERIES) {
        return 'reinforce';
      }
      return null;

    case 'reinforce':
    case 'reconsolidate':
      // Reclaim next_measure_due_at as the cadence timer; require a graded rep.
      if (p.measureDue && p.reps >= 1) return 'measure';
      return null;

    // measure / retain are efficacy-driven elsewhere.
    default:
      return null;
  }
}
