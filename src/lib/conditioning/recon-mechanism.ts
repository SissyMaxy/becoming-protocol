/**
 * Reconditioning mechanism attribution (Phase 3) — tested policy mirroring the SQL
 * in mig 683 (recon_select_mechanism + recon_attribute_efficacy). The SQL is the
 * executor (it reads the profile + windows the deliveries); this pins the selection
 * rotation + the attribution-credit math.
 *
 * The five mechanisms the conditioning rides on. Each delivery is tagged with one so
 * a later measured shift can be attributed to the mix that preceded it, building a
 * per-user response profile ("narrative moves your self-reference; arousal-pairing
 * moves your association").
 */

export const MECHANISMS = ['arousal_pairing', 'trance', 'pairing', 'narrative', 'retrieval'] as const;
export type Mechanism = typeof MECHANISMS[number];

export interface MechanismScore {
  mechanism: Mechanism;
  effectiveness: number;
  sampleN: number;
}

/**
 * Pick the mechanism to deliver: best-effectiveness first, offset by `rotation`
 * (a Phase-2 switch rotates to the next-best). Untried mechanisms rank last so
 * repeated switches eventually explore them. Mirrors recon_select_mechanism.
 */
export function selectMechanism(profile: MechanismScore[], rotation: number): Mechanism {
  const scoreOf = (m: Mechanism): { eff: number; n: number } => {
    const row = profile.find((p) => p.mechanism === m);
    return row ? { eff: row.effectiveness, n: row.sampleN } : { eff: -1e9, n: 0 };
  };
  const ranked = [...MECHANISMS].sort((a, b) => {
    const sa = scoreOf(a), sb = scoreOf(b);
    return sb.eff - sa.eff || sb.n - sa.n || MECHANISMS.indexOf(a) - MECHANISMS.indexOf(b);
  });
  const r = ((rotation % ranked.length) + ranked.length) % ranked.length;
  return ranked[r];
}

/** Per-mechanism credit for a measured window: signed progress × delivery share. */
export function attributionCredit(progress: number, mechanismDeliveries: number, totalDeliveries: number): number {
  if (totalDeliveries <= 0) return 0;
  return progress * (mechanismDeliveries / totalDeliveries);
}

/** Exponential moving average update (matches the SQL alpha). */
export function emaUpdate(oldValue: number, observation: number, alpha = 0.3): number {
  return oldValue * (1 - alpha) + observation * alpha;
}
