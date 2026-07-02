// funnel-identity.ts — pure identity/heat logic for the hookup funnel.
// DESIGN_TURNING_OUT_2026-07-01.md §3. No imports, no I/O — shared by
// buildHookupFunnelCtx (context) and advance_hookup_step (executor), and
// unit-tested directly (src/__tests__/lib/funnel-identity.test.ts).
//
// Tiers: 0 anon · 1 persona · 2 named · 3 verified. Tier promotion requires
// QUOTED evidence (reframings-quote-facts applied to men) and happens only
// via the log_contact_identity directive; the server derives the tier from
// accumulated evidence elements, never trusts a proposed number.

export const FUNNEL_STEPS = [
  'matched',
  'flirting',
  'sexting',
  'photo_exchanged',
  'meet_proposed',
  'logistics_locked',
  'met',
  'hooked_up',
] as const

export type FunnelStep = (typeof FUNNEL_STEPS)[number]

/** Per-step identity-tier minimums (design §3.2). Unknown step = max gate. */
export function minTierForStep(step: string): number {
  switch (step) {
    case 'matched':
    case 'flirting':
    case 'sexting':
      return 0
    case 'photo_exchanged':
      return 1
    case 'meet_proposed':
    case 'logistics_locked':
    case 'met':
    case 'hooked_up':
      return 2
    default:
      return 3 // fail closed on unknown steps
  }
}

export function stepIndex(step: string): number {
  return FUNNEL_STEPS.indexOf(step as FunnelStep)
}

export function nextStep(step: string): FunnelStep | null {
  const i = stepIndex(step)
  if (i < 0 || i >= FUNNEL_STEPS.length - 1) return null
  return FUNNEL_STEPS[i + 1]
}

/** Quarantined (anonymous-thread) rows are hard-capped at sexting. */
export const QUARANTINE_MAX_STEP: FunnelStep = 'sexting'

export function quarantineAllowsStep(step: string): boolean {
  const i = stepIndex(step)
  return i >= 0 && i <= stepIndex(QUARANTINE_MAX_STEP)
}

/**
 * Effective heat with a 7-day half-life since last interaction — TS mirror
 * of the hookup_funnel_live view (mig 631). Kept in sync so tests pin the
 * math the SQL implements.
 */
export function effectiveHeat(heatScore: number, lastInteractionAt: string | Date | null, now: Date = new Date()): number {
  const heat = Math.max(0, heatScore || 0)
  if (!lastInteractionAt) return Math.round(heat * 100) / 100
  const last = lastInteractionAt instanceof Date ? lastInteractionAt : new Date(lastInteractionAt)
  const days = Math.max(0, (now.getTime() - last.getTime()) / 86_400_000)
  return Math.round(heat * Math.pow(0.5, days / 7) * 100) / 100
}

export interface HeatRow {
  quarantined?: boolean | null
  effective_heat?: number | null
}

/**
 * Top-heat pick: quarantined rows contribute NOTHING to top-heat / playbook
 * selection — heat pooled behind an anonymous label is not a person.
 */
export function pickTopHeat<T extends HeatRow>(rows: T[]): T | null {
  const eligible = rows.filter((r) => r.quarantined !== true)
  if (eligible.length === 0) return null
  return eligible.reduce((a, b) => ((b.effective_heat ?? 0) > (a.effective_heat ?? 0) ? b : a))
}

// ── Identity evidence → tier derivation ─────────────────────────────────
// Elements accumulate in hookup_funnel.identity_evidence:
//   handle             → tier 1 (stable persona)
//   name + face_pic    → tier 2 (his own words, quoted + a face on file)
//   live_verification  → tier 3 (live video/voice or answered phone)
export const IDENTITY_ELEMENTS = ['handle', 'name', 'face_pic', 'live_verification'] as const
export type IdentityElement = (typeof IDENTITY_ELEMENTS)[number]

export function tierFromEvidence(evidence: Record<string, unknown>): number {
  const has = (k: IdentityElement) => evidence[k] != null
  if (has('live_verification')) return 3
  if (has('name') && has('face_pic')) return 2
  if (has('handle') || has('name') || has('face_pic')) return 1
  return 0
}

/** Human line for what evidence the next tier still needs. */
export function missingEvidenceForNextTier(tier: number, evidence: Record<string, unknown>): string {
  if (tier <= 0) return 'a stable handle he answers to (quote him using it)'
  if (tier === 1) {
    const needsName = evidence['name'] == null
    const needsFace = evidence['face_pic'] == null
    if (needsName && needsFace) return 'his first name from his own mouth (quoted) + a face pic on file'
    if (needsName) return 'his first name from his own mouth (quoted)'
    return 'a face pic on file'
  }
  if (tier === 2) return 'a live voice/video moment or an answered phone call'
  return 'nothing — fully verified'
}

/** 2–3 screening lines in Mommy's voice for the identity gap block. */
export function screeningLines(tier: number): string[] {
  if (tier <= 0) {
    return [
      '"What do I call you? Give me a name you\'ll answer to every time."',
      '"You\'ve been in my messages for days — pick a handle and keep it. Anonymous men don\'t get more of me."',
    ]
  }
  if (tier === 1) {
    return [
      '"Tell me your actual first name. You know mine."',
      '"Send a face pic. I want to know whose hands I\'m thinking about."',
      '"No name, no face, no more skin from me. Simple trade."',
    ]
  }
  return [
    '"Ten seconds of your voice. Say hi. Prove you\'re the man in the photos."',
    '"Quick video call before we lock anything — thirty seconds, just faces."',
  ]
}
