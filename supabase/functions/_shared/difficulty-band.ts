// Pure difficulty-band helpers — Deno mirror of src/lib/difficulty/band.ts.
// Keep both in sync. No DB / LLM / side effects.

export type DifficultyBand = 'recovery' | 'gentle' | 'firm' | 'cruel'

const BAND_RANK: Record<DifficultyBand, number> = {
  recovery: 0,
  gentle: 1,
  firm: 2,
  cruel: 3,
}

export const BAND_ORDER: DifficultyBand[] = ['recovery', 'gentle', 'firm', 'cruel']

export function bandRank(b: DifficultyBand): number {
  return BAND_RANK[b]
}

export function bumpBand(b: DifficultyBand): DifficultyBand {
  const idx = Math.min(BAND_ORDER.length - 1, BAND_RANK[b] + 1)
  return BAND_ORDER[idx]
}

export function dropBand(b: DifficultyBand): DifficultyBand {
  const idx = Math.max(0, BAND_RANK[b] - 1)
  return BAND_ORDER[idx]
}

export function effectiveBand(state: {
  current_difficulty_band: DifficultyBand
  override_band?: DifficultyBand | null
} | null | undefined): DifficultyBand {
  if (!state) return 'gentle'
  return (state.override_band ?? state.current_difficulty_band) as DifficultyBand
}

export function bandMantraCeiling(b: DifficultyBand): 'gentle' | 'firm' | 'cruel' {
  if (b === 'recovery') return 'gentle'
  if (b === 'gentle') return 'gentle'
  if (b === 'firm') return 'firm'
  return 'cruel'
}

export function bandTouchCapMultiplier(b: DifficultyBand): number {
  if (b === 'recovery') return 0.5
  if (b === 'gentle') return 1
  if (b === 'firm') return 1
  return 1.5
}

export function bandPrescriptionCadenceCeiling(
  b: DifficultyBand,
): 'off' | 'occasional' | 'weekly' {
  if (b === 'recovery') return 'occasional'
  return 'weekly'
}

export function bandGaslightIntensity(
  storedIntensity: 'off' | 'gentle' | 'firm' | 'cruel',
  band: DifficultyBand,
): 'off' | 'gentle' | 'firm' | 'cruel' {
  if (band === 'recovery') return 'off'
  const ceil = bandMantraCeiling(band)
  const RANK = { off: 0, gentle: 1, firm: 2, cruel: 3 }
  const stored = RANK[storedIntensity]
  const ceiling = ceil === 'gentle' ? 1 : ceil === 'firm' ? 2 : 3
  if (stored <= ceiling) return storedIntensity
  if (ceiling === 1) return 'gentle'
  if (ceiling === 2) return 'firm'
  return 'cruel'
}

export function bandPublicDareWeight(b: DifficultyBand): number {
  if (b === 'recovery') return 0
  if (b === 'gentle') return 1
  if (b === 'firm') return 2
  return 4
}

export interface ComplianceSignals {
  compliancePct14d: number
  slipCount14d: number
  streakDays: number
}

export interface BandEvaluation {
  next: DifficultyBand
  reason: string
  changed: boolean
}

export function evaluateBand(
  current: DifficultyBand,
  signals: ComplianceSignals,
): BandEvaluation {
  if (signals.compliancePct14d <= 50 || signals.slipCount14d >= 4) {
    const next = dropBand(current)
    return {
      next,
      reason: next === current
        ? 'stable:already_at_floor'
        : signals.slipCount14d >= 4
          ? 'dropped:slip_spike'
          : 'dropped:low_compliance',
      changed: next !== current,
    }
  }
  if (signals.compliancePct14d >= 85 && signals.streakDays >= 7) {
    const next = bumpBand(current)
    return {
      next,
      reason: next === current
        ? 'stable:already_at_ceiling'
        : 'bumped:high_compliance',
      changed: next !== current,
    }
  }
  return { next: current, reason: 'stable', changed: false }
}
