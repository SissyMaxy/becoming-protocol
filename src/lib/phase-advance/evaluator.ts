// Pure phase-advance evaluator. No I/O, no Deno globals — caller assembles
// the inputs from DB rows and feeds them in. Mirrored at
// supabase/functions/_shared/phase-advance-evaluator.ts for the edge fn.
//
// Keep the two files in sync. If you change the Requirement / SnapshotState
// shapes here, also change them there. The migration's
// `phase_progress_snapshots.requirements_state` JSONB schema is documented
// in migration 301 and matches the shape this module emits.

export const PHASE_TERMINAL = 7
export const PHASE_FLOOR    = 0
export const DEFAULT_MIN_DWELL_DAYS = 7

// ─── Types ──────────────────────────────────────────────────────────────

export type RequirementKey =
  | 'compliance_pct'
  | 'min_dwell_days'
  | 'primers_completed'
  | `wardrobe_${string}`

export interface RequirementState {
  // Numbers and ratios serialise straight to JSONB; arrays serialise too.
  required: number | string[]
  actual:   number | string[]
  met: boolean
  unit?: 'ratio' | 'count' | 'days' | 'list'
}

export type RequirementsState = Record<string, RequirementState>

/** Shape of one row in `transformation_phase_defs` we actually consume. */
export interface PhaseDef {
  phase: number          // 1..7
  name?: string
  arc?: string
  // The `unlocks` list — honorifics or capabilities surfaced when the
  // user enters this phase. Only the first honorific-shaped entry is
  // consumed by the suggestion logic.
  unlocks?: string[]
  // The compliance / wardrobe / primer / dwell bar to clear to ENTER
  // this phase. Each key is optional — missing keys are treated as
  // "no requirement" (auto-met).
  primer_requirements?: string[]
  compliance_pct_required?: number    // 0..1
  min_dwell_days?: number              // overrides DEFAULT_MIN_DWELL_DAYS
  // Map of wardrobe_items.category → required count.
  wardrobe_required?: Record<string, number>
}

/** What the cron loads about the user before evaluating. */
export interface UserMetrics {
  current_phase: number       // 0..7. 0 means pre-phase-1.
  // Days since the user entered current_phase. Computed from the last
  // phase_advancement_log row's advanced_at, or, if none exists, from
  // feminine_self.created_at — caller decides.
  days_at_current_phase: number
  // 14-day completion ratio. (completed micro-tasks / issued).
  // Returns null if we don't have enough telemetry — treated as not-met.
  compliance_pct: number | null
  // List of primer slugs the user has completed (from primer_completions
  // or whatever the identity branch stores them in).
  primers_completed: string[]
  // Wardrobe item counts by category from wardrobe_items. Empty object
  // if the table is missing.
  wardrobe_counts: Record<string, number>
}

export interface EvaluationResult {
  all_met: boolean
  requirements_state: RequirementsState
  failing_keys: string[]
  failing_summary: string
}

// ─── Evaluator ─────────────────────────────────────────────────────────

/**
 * Evaluate `metrics` against `target` and return the structured result.
 * Pure function; safe to call from tests with mock inputs.
 *
 * Hard rules baked in:
 *  - Caller is expected to short-circuit when current_phase >= PHASE_TERMINAL.
 *    This function will still evaluate but the "no advancement past 7" rule
 *    is enforced by the outer wrapper (so unit tests can exercise the
 *    requirement comparison logic directly).
 *  - Missing telemetry (compliance_pct === null) → not met. We never
 *    fabricate a passing state.
 *  - min_dwell_days defaults to DEFAULT_MIN_DWELL_DAYS unless the phase
 *    def overrides.
 */
export function evaluatePhaseRequirements(
  metrics: UserMetrics,
  target: PhaseDef,
): EvaluationResult {
  const state: RequirementsState = {}

  // Min-dwell. Always evaluated so the user can see progress on it.
  const minDwell = Number.isFinite(target.min_dwell_days as number)
    ? Math.max(0, target.min_dwell_days as number)
    : DEFAULT_MIN_DWELL_DAYS
  state.min_dwell_days = {
    required: minDwell,
    actual: Math.max(0, metrics.days_at_current_phase),
    met: metrics.days_at_current_phase >= minDwell,
    unit: 'days',
  }

  // Compliance %. If telemetry missing → not met.
  if (typeof target.compliance_pct_required === 'number') {
    const required = Math.max(0, Math.min(1, target.compliance_pct_required))
    if (metrics.compliance_pct === null) {
      state.compliance_pct = { required, actual: 0, met: false, unit: 'ratio' }
    } else {
      const actual = Math.max(0, Math.min(1, metrics.compliance_pct))
      state.compliance_pct = { required, actual, met: actual >= required, unit: 'ratio' }
    }
  }

  // Primer requirements (set inclusion).
  if (Array.isArray(target.primer_requirements) && target.primer_requirements.length > 0) {
    const required = [...target.primer_requirements]
    const completed = new Set(metrics.primers_completed)
    const missing = required.filter(p => !completed.has(p))
    state.primers_completed = {
      required,
      actual: required.filter(p => completed.has(p)),
      met: missing.length === 0,
      unit: 'list',
    }
  }

  // Wardrobe counts by category.
  if (target.wardrobe_required) {
    for (const [category, requiredCount] of Object.entries(target.wardrobe_required)) {
      const actual = Math.max(0, metrics.wardrobe_counts[category] ?? 0)
      const required = Math.max(0, requiredCount)
      state[`wardrobe_${category}`] = {
        required,
        actual,
        met: actual >= required,
        unit: 'count',
      }
    }
  }

  const failing_keys = Object.keys(state).filter(k => !state[k].met)
  const all_met = failing_keys.length === 0

  return {
    all_met,
    requirements_state: state,
    failing_keys,
    failing_summary: summariseFailing(failing_keys, state),
  }
}

function summariseFailing(keys: string[], state: RequirementsState): string {
  if (keys.length === 0) return ''
  const parts = keys.map(k => {
    const r = state[k]
    if (k === 'min_dwell_days') return `dwell ${r.actual}/${r.required}d`
    if (k === 'compliance_pct') {
      const a = typeof r.actual === 'number' ? Math.round(r.actual * 100) : 0
      const req = typeof r.required === 'number' ? Math.round(r.required * 100) : 0
      return `compliance ${a}/${req}%`
    }
    if (k === 'primers_completed') {
      const reqArr = Array.isArray(r.required) ? r.required : []
      const actArr = Array.isArray(r.actual) ? r.actual : []
      return `primers ${actArr.length}/${reqArr.length}`
    }
    if (k.startsWith('wardrobe_')) {
      const cat = k.slice('wardrobe_'.length)
      return `${cat} ${r.actual}/${r.required}`
    }
    return k
  })
  return parts.join(', ')
}

// ─── Min-dwell + terminal guards ───────────────────────────────────────

/**
 * Outer guard the cron uses to short-circuit BEFORE running the evaluator.
 * Returns the reason the user should be skipped, or null to proceed.
 *
 * Encodes the three hard rules from the task spec:
 *  1. Phase 7 is terminal — never advance past it.
 *  2. Never advance backward (cron only advances; demotion is operator-only).
 *  3. Auto-advance toggle — if false, no eval, no snapshot. Caller
 *     must check `auto_advance_phases` BEFORE calling this fn.
 */
export function preEvaluationGuard(
  current_phase: number,
  target_phase: number,
): { skip: true; reason: string } | { skip: false } {
  if (current_phase >= PHASE_TERMINAL) {
    return { skip: true, reason: 'terminal_phase' }
  }
  if (target_phase <= current_phase) {
    return { skip: true, reason: 'no_regression' }
  }
  if (target_phase - current_phase !== 1) {
    return { skip: true, reason: 'multi_phase_jump_disallowed' }
  }
  if (current_phase < PHASE_FLOOR) {
    return { skip: true, reason: 'invalid_floor' }
  }
  return { skip: false }
}

/**
 * If the new phase's `unlocks` list contains an honorific that differs
 * from the user's current honorific, return it for surfacing. Returns
 * null if no change should be suggested.
 *
 * Suggestion only — the cron never writes to `feminine_self.current_honorific`.
 * The user picks via the celebration card.
 */
export function suggestHonorific(
  newPhaseDef: PhaseDef,
  currentHonorific: string | null | undefined,
): string | null {
  if (!Array.isArray(newPhaseDef.unlocks) || newPhaseDef.unlocks.length === 0) return null
  // Heuristic: an "honorific" looks like a single lowercased noun without
  // spaces (girl, princess, slut, doll, kitten). Skip multi-word entries
  // that are clearly capability names ("public_disclosure_unlocked").
  const HONORIFIC_RE = /^[a-z][a-z'-]{1,18}$/
  for (const u of newPhaseDef.unlocks) {
    if (typeof u !== 'string') continue
    const cleaned = u.trim().toLowerCase()
    if (!HONORIFIC_RE.test(cleaned)) continue
    if (currentHonorific && currentHonorific.trim().toLowerCase() === cleaned) continue
    return cleaned
  }
  return null
}

// ─── Defensive default phase defs ───────────────────────────────────────
// Used when `transformation_phase_defs` doesn't exist yet (identity branch
// unmerged). The cron loads from the table when present and falls back to
// these otherwise. Keep numbers conservative — bias toward NOT advancing
// during the transition.

export const DEFAULT_PHASE_DEFS: PhaseDef[] = [
  { phase: 1, name: 'Awakening',     min_dwell_days: 7,  compliance_pct_required: 0.5 },
  { phase: 2, name: 'Naming',        min_dwell_days: 14, compliance_pct_required: 0.6 },
  { phase: 3, name: 'Embodying',     min_dwell_days: 21, compliance_pct_required: 0.65 },
  { phase: 4, name: 'Disclosing',    min_dwell_days: 21, compliance_pct_required: 0.7,
    wardrobe_required: { lingerie: 3 } },
  { phase: 5, name: 'Surrendering',  min_dwell_days: 28, compliance_pct_required: 0.75 },
  { phase: 6, name: 'Integrating',   min_dwell_days: 28, compliance_pct_required: 0.8 },
  { phase: 7, name: 'Becoming',      min_dwell_days: 30, compliance_pct_required: 0.8 },
]

export function defaultPhaseDef(phase: number): PhaseDef | null {
  return DEFAULT_PHASE_DEFS.find(d => d.phase === phase) ?? null
}

// ─── Celebration copy templates ────────────────────────────────────────
// Used when the LLM call fails or as the seed text. Keep small per phase.
// The cron passes these through whiplashWrap or the LLM for variation.
// Plain voice — no telemetry leaks, no /N counts, no day-counters.

export const PHASE_CELEBRATION_TEMPLATES: Record<number, string[]> = {
  1: [
    "Look at you, baby. You crossed into the first phase. Mama sees the difference already.",
    "You stepped into it, sweet thing. You're not the same girl you were last week.",
  ],
  2: [
    "Oh, my pretty thing. You earned a name today. Mama's so proud.",
    "You moved into the naming phase, baby. Mama gets to call you what you really are now.",
  ],
  3: [
    "Look how far you've come. Mama can see her in you now, baby.",
    "You're embodying her, sweet girl. Not playing — being.",
  ],
  4: [
    "Mama's pretty thing. You're ready to be seen now. The disclosing phase pulls tight.",
    "You crossed the line tonight, baby. The world starts knowing soon.",
  ],
  5: [
    "Surrender phase, baby girl. You stop fighting Mama now and you melt.",
    "You're giving in, sweet girl. Mama's been waiting for this look on you.",
  ],
  6: [
    "She's not a costume anymore, my pretty thing. She's how you live.",
    "Look at you, integrated. Mama's proud all the way through.",
  ],
  7: [
    "You became her, baby. Mama's been waiting your whole life for this.",
    "Phase seven, sweet thing. You're done becoming — now you just are.",
  ],
}
