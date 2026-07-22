// _shared/session-conductor-core.ts — pure scoring for the daily session
// conductor (WS5). No DB, no Deno, no fetch — so the edge fn (Deno) and the
// vitest suite both use the same logic.
//
// The conductor picks ONE audio-session kind per day from her state:
//   score(kind) = baseWeight × recency × stateFit × efficacyEMA × (1 + prefLift)
// argmax wins; the edge fn turns it into a single audio_session_offers row that
// pick-next.ts already surfaces as the one Focus item. One task at a time.

export type ConductorKind =
  | 'session_goon'
  | 'session_edge'
  | 'session_denial'
  | 'session_conditioning'
  | 'session_embodiment'
  | 'session_cockwarming'
  | 'primer_universal'

export type Tier = 'gentle' | 'firm' | 'cruel'

export const CONDUCTOR_KINDS: ConductorKind[] = [
  'session_goon',
  'session_edge',
  'session_denial',
  'session_conditioning',
  'session_embodiment',
  'session_cockwarming',
  'primer_universal',
]

// Kinds whose content escalates the turn-out arc — suppressed while pacing is
// widened (gap_extra_days > 0 means the orchestrator wants a slower week).
const ARC_ESCALATING: ReadonlySet<ConductorKind> = new Set(['session_goon', 'session_denial'])

export interface ConductorFeatures {
  denialDay: number
  /** Whoop recovery 0-100, or null if unknown. */
  recovery: number | null
  /** turnout_state.gap_extra_days — >0 means pacing widened. */
  turnoutGapExtraDays: number
  isWednesday: boolean
  /** Active warming rung order, or null if the warming track isn't active. */
  activeWarmingRung: number | null
  /** Deepest running reconditioning-program phase weight (0-5). */
  reconPhaseWeight: number
  /** Days since each kind was last offered (large = long ago / never). */
  daysSinceKind: Partial<Record<ConductorKind, number>>
  /** Learned per-kind efficacy EMA (session_conductor_weights), ~0.5 default. */
  efficacyEMA: Partial<Record<ConductorKind, number>>
  /** Optional preference lift per kind (0..1) from erotic_preference_profile. */
  preferenceLift?: Partial<Record<ConductorKind, number>>
}

export interface KindScore {
  kind: ConductorKind
  score: number
  tier: Tier
}

const BASE_WEIGHT: Record<ConductorKind, number> = {
  session_goon: 1.0,
  session_edge: 0.9,
  session_denial: 0.9,
  session_conditioning: 0.8,
  session_embodiment: 0.7,
  session_cockwarming: 1.2, // the arc's center of mass — favored when eligible
  primer_universal: 0.5,
}

/** Recovery + depth → tier, capped gentle when her body is depleted. */
export function pickTier(f: ConductorFeatures): Tier {
  if (f.recovery != null && f.recovery < 40) return 'gentle'
  if (f.reconPhaseWeight >= 4 && f.denialDay >= 7) return 'cruel'
  if (f.reconPhaseWeight >= 3 && f.denialDay >= 4) return 'firm'
  return 'gentle'
}

/** Recency factor: kinds not offered in a while (or ever) are favored. */
function recency(days: number | undefined): number {
  const d = days == null ? 30 : days
  return Math.min(1, Math.max(0.1, d / 3))
}

function stateFit(kind: ConductorKind, f: ConductorFeatures): number {
  // Cockwarming: ONLY on Wednesday with an active warming rung — else excluded.
  if (kind === 'session_cockwarming') {
    return f.isWednesday && f.activeWarmingRung != null ? 1.5 : 0
  }
  let fit = 1
  // Denial / edge scale with how long she's been held.
  if (kind === 'session_denial' || kind === 'session_edge') {
    fit *= 0.6 + Math.min(1, f.denialDay / 10) * 0.8
  }
  // Low recovery softens the intense kinds toward the gentler ones.
  if (f.recovery != null && f.recovery < 40 && (kind === 'session_goon' || kind === 'session_denial' || kind === 'session_edge')) {
    fit *= 0.6
  }
  // Widened pacing suppresses arc-escalating kinds.
  if (f.turnoutGapExtraDays > 0 && ARC_ESCALATING.has(kind)) {
    fit *= 0.4
  }
  return fit
}

/** Score every kind (0 = ineligible). Sorted high→low, deterministic. */
export function scoreKinds(f: ConductorFeatures): KindScore[] {
  const tier = pickTier(f)
  const scored = CONDUCTOR_KINDS.map((kind) => {
    const base = BASE_WEIGHT[kind]
    const ema = f.efficacyEMA[kind] ?? 0.5
    const lift = 1 + (f.preferenceLift?.[kind] ?? 0)
    const score = base * recency(f.daysSinceKind[kind]) * stateFit(kind, f) * ema * lift
    return { kind, score, tier }
  })
  // Stable sort: score desc, then base-weight desc, then name for determinism.
  return scored.sort((a, b) =>
    (b.score - a.score) ||
    (BASE_WEIGHT[b.kind] - BASE_WEIGHT[a.kind]) ||
    a.kind.localeCompare(b.kind),
  )
}

/** The single winning offer, or null if nothing is eligible. */
export function pickOffer(f: ConductorFeatures): KindScore | null {
  const top = scoreKinds(f)[0]
  return top && top.score > 0 ? top : null
}
