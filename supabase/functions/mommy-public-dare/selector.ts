// Pure selector + intensity helpers for the public dare engine.
//
// No I/O. Tests live in src/__tests__/lib/public-dare-selector.test.ts.
// The cron at supabase/functions/mommy-public-dare/index.ts pulls the
// candidate template list from Postgres and hands it here for a final
// pick.
//
// Vocabulary mirrors the wardrobe-prescription selector so a stranger
// reading both files sees the same shape (intensity rank, fallback
// tiers, deterministic rng seam).

export type Phase = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type DareKind =
  | 'wardrobe' | 'mantra' | 'posture' | 'position'
  | 'micro_ritual' | 'errand_specific'

export type IntensityTier = 'gentle' | 'moderate' | 'firm' | 'relentless'

export type VerificationKind = 'photo' | 'text_ack' | 'voice' | 'none'

// Mirrors the migration's check constraint and the dommy-mommy.ts Affect
// type. Free-form-ish at the DB layer; we do not enforce a strict enum
// here so seeds can carry hints we haven't planned for yet.
export type AffectHint = string

export interface DareTemplate {
  id: string
  kind: DareKind
  description: string
  phase_min: Phase
  phase_max: Phase
  intensity_tier: IntensityTier
  requires_location_context: boolean
  verification_kind: VerificationKind
  affect_bias: AffectHint[]
  cooldown_days: number
  active: boolean
}

// Same ranking the wardrobe-prescription selector uses. 'off' is a
// virtual floor used by the picker when reading
// profile_foundation.difficulty_level — it never appears as a template
// intensity.
export const INTENSITY_RANK: Record<string, number> = {
  off: 0,
  gentle: 1,
  moderate: 2,
  firm: 3,
  relentless: 4,
}

// Phase-floor by intensity tier. Even when settings.min_intensity = 'firm',
// a phase-1 user must NEVER draw cruel-tier dares. This is the spec's
// "phase-gated heavily" rule materialised — independent of difficulty
// dial, of intensity floor, of any seed.
export const TIER_PHASE_FLOOR: Record<IntensityTier, number> = {
  gentle: 1,
  moderate: 2,
  firm: 3,
  relentless: 5,
}

export interface SelectionContext {
  phase: Phase
  // Lower bound on tier the user is opted into (settings.min_intensity).
  minIntensity: IntensityTier
  // Upper bound from profile_foundation.difficulty_level — the picker
  // never returns a tier > this. Defaulting to 'gentle' is the safe
  // fallback when the lookup fails.
  userIntensity: IntensityTier
  // Today's affect from mommy_mood, if known. Used only for soft bias.
  affect?: AffectHint | null
  // Allowed kinds list (settings.allowed_kinds). NULL/empty = no filter.
  allowedKinds?: DareKind[] | null
  // Set of template ids currently in cooldown (assigned within their
  // own cooldown_days window). The picker excludes these.
  inCooldown: Set<string>
  // Whether the user has signalled "I'm out" — granted by a recent
  // location_context_acknowledged_at on a prior assignment, OR by a
  // direct user-tap on a card prompt. When false, requires_location_context
  // templates are filtered out.
  locationContextAvailable: boolean
}

export interface PickResult {
  template: DareTemplate
  // Reasons this template was preferred over the rest. For audit only.
  reason: string
}

/**
 * Filter the catalog down to the eligible pool, then pick one.
 *
 * Eligibility (every condition must hold):
 *   - active = true
 *   - phase in [phase_min, phase_max]
 *   - intensity_tier in [minIntensity, userIntensity] inclusive (rank-wise)
 *   - intensity_tier's phase floor <= user's phase
 *   - if requires_location_context: locationContextAvailable
 *   - if allowedKinds set: kind in allowedKinds
 *   - id not in inCooldown
 *
 * Tier preference:
 *   1. affect-matching templates
 *   2. anything still eligible
 *
 * Returns null when the eligible pool is empty.
 */
export function pickDareTemplate(
  catalog: DareTemplate[],
  ctx: SelectionContext,
  rng: () => number = Math.random,
): PickResult | null {
  const userRank = INTENSITY_RANK[ctx.userIntensity] ?? INTENSITY_RANK.gentle
  const minRank = INTENSITY_RANK[ctx.minIntensity] ?? INTENSITY_RANK.gentle

  const eligible = catalog.filter(t => {
    if (!t.active) return false
    if (ctx.phase < t.phase_min || ctx.phase > t.phase_max) return false

    const tierRank = INTENSITY_RANK[t.intensity_tier] ?? 99
    if (tierRank < minRank) return false
    if (tierRank > userRank) return false

    const phaseFloor = TIER_PHASE_FLOOR[t.intensity_tier] ?? 7
    if (ctx.phase < phaseFloor) return false

    if (t.requires_location_context && !ctx.locationContextAvailable) return false

    if (ctx.allowedKinds && ctx.allowedKinds.length > 0) {
      if (!ctx.allowedKinds.includes(t.kind)) return false
    }

    if (ctx.inCooldown.has(t.id)) return false

    return true
  })

  if (eligible.length === 0) return null

  const affect = ctx.affect ?? null
  const affectMatches = affect
    ? eligible.filter(t => t.affect_bias.includes(affect))
    : []

  const pool = affectMatches.length > 0 ? affectMatches : eligible
  const pick = pool[Math.floor(rng() * pool.length)]
  const reason = affectMatches.length > 0 && affect
    ? `affect_match:${affect}`
    : 'eligibility_only'
  return { template: pick, reason }
}

/**
 * Compute due_by from cadence. Mirrors the wardrobe-prescription
 * 'occasional' = 14d, 'weekly' = 7d convention so a stranger reading
 * both finds the same defaults.
 */
export function computeDueBy(cadence: 'occasional' | 'weekly' | 'off', now: Date = new Date()): Date {
  const days = cadence === 'weekly' ? 7 : 14
  return new Date(now.getTime() + days * 86400_000)
}

/**
 * Cadence time-gate. Returns true iff the most recent assigned_at is
 * older than the cadence's window (or there is no recent row).
 */
export function cadenceWindowOpen(
  cadence: 'occasional' | 'weekly' | 'off',
  lastAssignedAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (cadence === 'off') return false
  if (!lastAssignedAt) return true
  const days = cadence === 'weekly' ? 7 : 5
  return (now.getTime() - lastAssignedAt.getTime()) >= days * 86400_000
}

/**
 * Build the in-cooldown set from a list of recent assignments. A
 * template is in cooldown if it was assigned within its own
 * cooldown_days window.
 *
 * Pure: takes the catalog (so it can read each template's cooldown_days)
 * and the recent assignments list. Returns the set of cooled-down ids.
 */
export function buildCooldownSet(
  catalog: DareTemplate[],
  recentAssignments: Array<{ template_id: string; assigned_at: string }>,
  now: Date = new Date(),
): Set<string> {
  const cooldownById = new Map<string, number>()
  for (const t of catalog) cooldownById.set(t.id, t.cooldown_days)

  const out = new Set<string>()
  for (const a of recentAssignments) {
    const cd = cooldownById.get(a.template_id)
    if (cd === undefined) continue
    const ageMs = now.getTime() - new Date(a.assigned_at).getTime()
    if (ageMs < cd * 86400_000) out.add(a.template_id)
  }
  return out
}
