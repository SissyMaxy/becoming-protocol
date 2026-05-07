// Pure mantra selector — Deno mirror of src/lib/persona/mantra-select.ts.
// Keep both in sync. No DB / LLM / side effects.

export type MantraIntensity = 'gentle' | 'firm' | 'cruel'

export type MantraCategory =
  | 'identity'
  | 'submission'
  | 'desire'
  | 'belonging'
  | 'surrender'
  | 'transformation'
  | 'ritual'

export interface MantraRow {
  id: string
  text: string
  affect_tags: string[]
  phase_min: number
  phase_max: number
  intensity_tier: MantraIntensity
  category: MantraCategory
  voice_settings_hint?: Record<string, unknown> | null
}

export interface MantraSelectContext {
  affect: string
  phase: number
  intensity: MantraIntensity
  recentlyDelivered?: Record<string, string>
  dedupWindowDays?: number
  rng?: () => number
  now?: number
}

const TIER_RANK: Record<MantraIntensity, number> = { gentle: 0, firm: 1, cruel: 2 }

export function intensityAllowed(tier: MantraIntensity, cap: MantraIntensity): boolean {
  return TIER_RANK[tier] <= TIER_RANK[cap]
}

export function filterEligible(catalog: MantraRow[], ctx: MantraSelectContext): MantraRow[] {
  return catalog.filter(m =>
    ctx.phase >= m.phase_min &&
    ctx.phase <= m.phase_max &&
    intensityAllowed(m.intensity_tier, ctx.intensity),
  )
}

export function scoreMantra(m: MantraRow, ctx: MantraSelectContext): number {
  const recentDays = ctx.dedupWindowDays ?? 7
  const now = ctx.now ?? Date.now()
  const last = ctx.recentlyDelivered?.[m.id]
  let w = m.intensity_tier === 'gentle' ? 3 : m.intensity_tier === 'firm' ? 2 : 1
  if (m.affect_tags.includes(ctx.affect)) w *= 4
  if (last) {
    const ageDays = (now - new Date(last).getTime()) / 86_400_000
    if (ageDays < recentDays) {
      const f = Math.max(0.02, ageDays / recentDays)
      w *= f
    }
  }
  return w
}

function weightedPick<T>(items: Array<{ item: T; w: number }>, rng: () => number): T | null {
  const total = items.reduce((s, x) => s + x.w, 0)
  if (total <= 0) return null
  let r = rng() * total
  for (const x of items) {
    r -= x.w
    if (r <= 0) return x.item
  }
  return items[items.length - 1].item
}

export function pickMantra(catalog: MantraRow[], ctx: MantraSelectContext): MantraRow | null {
  const eligible = filterEligible(catalog, ctx)
  if (eligible.length === 0) return null
  const rng = ctx.rng ?? Math.random
  const scored = eligible.map(item => ({ item, w: scoreMantra(item, ctx) }))
  return weightedPick(scored, rng)
}

export function phaseToMantraScale(currentPhase: number | null | undefined): number {
  const p = Math.max(0, Math.min(5, Math.round(Number(currentPhase ?? 0))))
  return p + 1
}
