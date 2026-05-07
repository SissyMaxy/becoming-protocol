// Tests for src/lib/phase-advance/evaluator.ts
//
// Unit-only — no Supabase required. Exercises the pure evaluator + the
// pre-evaluation guard + the honorific suggester + the default phase defs
// directly. The integration tests for the cron handler live in
// phase-advance.integration.test.ts and can be skipped without creds.

import { describe, it, expect } from 'vitest'
import {
  evaluatePhaseRequirements,
  preEvaluationGuard,
  suggestHonorific,
  defaultPhaseDef,
  DEFAULT_PHASE_DEFS,
  PHASE_TERMINAL,
  DEFAULT_MIN_DWELL_DAYS,
  PHASE_CELEBRATION_TEMPLATES,
  type PhaseDef,
  type UserMetrics,
} from '../../lib/phase-advance/evaluator'

const baseMetrics = (over: Partial<UserMetrics> = {}): UserMetrics => ({
  current_phase: 1,
  days_at_current_phase: 30,
  compliance_pct: 0.9,
  primers_completed: [],
  wardrobe_counts: {},
  ...over,
})

describe('evaluatePhaseRequirements — happy path', () => {
  it('returns all_met=true when every requirement passes', () => {
    const target: PhaseDef = {
      phase: 2,
      min_dwell_days: 14,
      compliance_pct_required: 0.7,
      primer_requirements: ['voice_drill_1'],
      wardrobe_required: { lingerie: 1 },
    }
    const r = evaluatePhaseRequirements(
      baseMetrics({
        days_at_current_phase: 20,
        compliance_pct: 0.85,
        primers_completed: ['voice_drill_1'],
        wardrobe_counts: { lingerie: 2 },
      }),
      target,
    )
    expect(r.all_met).toBe(true)
    expect(r.failing_keys).toEqual([])
    expect(r.requirements_state.compliance_pct.met).toBe(true)
    expect(r.requirements_state.primers_completed.met).toBe(true)
    expect(r.requirements_state.wardrobe_lingerie.met).toBe(true)
    expect(r.requirements_state.min_dwell_days.met).toBe(true)
  })

  it('always evaluates min_dwell_days even when target def omits it', () => {
    const r = evaluatePhaseRequirements(
      baseMetrics({ days_at_current_phase: 8 }),
      { phase: 2 },
    )
    expect(r.requirements_state.min_dwell_days.required).toBe(DEFAULT_MIN_DWELL_DAYS)
    expect(r.requirements_state.min_dwell_days.met).toBe(true)
  })
})

describe('evaluatePhaseRequirements — telemetry hard rules', () => {
  it('treats null compliance_pct as not-met (never fabricates passing state)', () => {
    const r = evaluatePhaseRequirements(
      baseMetrics({ compliance_pct: null }),
      { phase: 2, compliance_pct_required: 0.5 },
    )
    expect(r.all_met).toBe(false)
    expect(r.requirements_state.compliance_pct.met).toBe(false)
    expect(r.requirements_state.compliance_pct.actual).toBe(0)
  })

  it('clamps compliance_pct to [0,1] when caller passes garbage', () => {
    const r = evaluatePhaseRequirements(
      baseMetrics({ compliance_pct: 5 }),
      { phase: 2, compliance_pct_required: 0.5 },
    )
    expect(r.requirements_state.compliance_pct.actual).toBe(1)
    expect(r.requirements_state.compliance_pct.met).toBe(true)
  })

  it('reports primer set membership: missing primer → not met', () => {
    const r = evaluatePhaseRequirements(
      baseMetrics({ primers_completed: ['voice_drill_1'] }),
      { phase: 2, primer_requirements: ['voice_drill_1', 'mantra_a'] },
    )
    expect(r.requirements_state.primers_completed.met).toBe(false)
    expect(r.failing_keys).toContain('primers_completed')
  })

  it('reports wardrobe count by category: too few → not met', () => {
    const r = evaluatePhaseRequirements(
      baseMetrics({ wardrobe_counts: { lingerie: 1 } }),
      { phase: 4, wardrobe_required: { lingerie: 3 } },
    )
    expect(r.requirements_state.wardrobe_lingerie.met).toBe(false)
    expect(r.requirements_state.wardrobe_lingerie.actual).toBe(1)
    expect(r.requirements_state.wardrobe_lingerie.required).toBe(3)
  })
})

describe('evaluatePhaseRequirements — min-dwell enforcement', () => {
  it('user meeting all reqs but at phase 1 day → blocked by min-dwell', () => {
    const target: PhaseDef = {
      phase: 4,
      min_dwell_days: 21,
      compliance_pct_required: 0.7,
    }
    const r = evaluatePhaseRequirements(
      baseMetrics({ days_at_current_phase: 1, compliance_pct: 0.95 }),
      target,
    )
    expect(r.all_met).toBe(false)
    expect(r.failing_keys).toContain('min_dwell_days')
    expect(r.requirements_state.min_dwell_days.actual).toBe(1)
    expect(r.requirements_state.min_dwell_days.required).toBe(21)
  })

  it('failing_summary is human-readable for dwell + compliance', () => {
    const r = evaluatePhaseRequirements(
      baseMetrics({ days_at_current_phase: 3, compliance_pct: 0.4 }),
      { phase: 2, min_dwell_days: 14, compliance_pct_required: 0.7 },
    )
    expect(r.failing_summary).toMatch(/dwell 3\/14d/)
    expect(r.failing_summary).toMatch(/compliance 40\/70%/)
  })
})

describe('preEvaluationGuard — hard rules', () => {
  it('phase 7 is terminal — no advance past it', () => {
    expect(preEvaluationGuard(7, 8)).toEqual({ skip: true, reason: 'terminal_phase' })
  })

  it('never advance backward', () => {
    expect(preEvaluationGuard(3, 2)).toEqual({ skip: true, reason: 'no_regression' })
    expect(preEvaluationGuard(3, 3)).toEqual({ skip: true, reason: 'no_regression' })
  })

  it('one phase at a time', () => {
    expect(preEvaluationGuard(2, 4)).toEqual({ skip: true, reason: 'multi_phase_jump_disallowed' })
  })

  it('valid 1→2 step proceeds', () => {
    expect(preEvaluationGuard(1, 2)).toEqual({ skip: false })
  })

  it('PHASE_TERMINAL constant is 7 (regression guard)', () => {
    expect(PHASE_TERMINAL).toBe(7)
  })
})

describe('suggestHonorific', () => {
  it('returns the first honorific-shaped unlock when it differs from current', () => {
    const def: PhaseDef = { phase: 2, unlocks: ['public_disclosure_unlocked', 'princess'] }
    expect(suggestHonorific(def, 'girl')).toBe('princess')
  })

  it('returns null when unlock matches current honorific', () => {
    const def: PhaseDef = { phase: 2, unlocks: ['princess'] }
    expect(suggestHonorific(def, 'princess')).toBeNull()
  })

  it('returns null when unlocks contains only capability strings', () => {
    const def: PhaseDef = { phase: 2, unlocks: ['public_disclosure', 'wardrobe_phase_2_pack'] }
    expect(suggestHonorific(def, null)).toBeNull()
  })

  it('returns null when unlocks is empty / missing', () => {
    expect(suggestHonorific({ phase: 2 }, 'girl')).toBeNull()
    expect(suggestHonorific({ phase: 2, unlocks: [] }, 'girl')).toBeNull()
  })

  it('case-insensitive match', () => {
    expect(suggestHonorific({ phase: 2, unlocks: ['Princess'] }, 'princess')).toBeNull()
  })
})

describe('defaultPhaseDef — pre-merge fallback', () => {
  it('returns a def for every phase 1..7', () => {
    for (let p = 1; p <= 7; p++) {
      const d = defaultPhaseDef(p)
      expect(d).not.toBeNull()
      expect(d!.phase).toBe(p)
    }
  })

  it('returns null for phase 0 / 8 / negative', () => {
    expect(defaultPhaseDef(0)).toBeNull()
    expect(defaultPhaseDef(8)).toBeNull()
    expect(defaultPhaseDef(-1)).toBeNull()
  })

  it('default min_dwell_days are >= DEFAULT_MIN_DWELL_DAYS (no spam advancement)', () => {
    for (const d of DEFAULT_PHASE_DEFS) {
      expect(d.min_dwell_days ?? DEFAULT_MIN_DWELL_DAYS).toBeGreaterThanOrEqual(DEFAULT_MIN_DWELL_DAYS)
    }
  })

  it('default compliance_pct_required is in [0,1] for every phase', () => {
    for (const d of DEFAULT_PHASE_DEFS) {
      const c = d.compliance_pct_required ?? 0
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })
})

describe('PHASE_CELEBRATION_TEMPLATES', () => {
  it('has at least one template per phase 1..7', () => {
    for (let p = 1; p <= 7; p++) {
      const ts = PHASE_CELEBRATION_TEMPLATES[p]
      expect(ts).toBeDefined()
      expect(ts.length).toBeGreaterThan(0)
    }
  })

  it('templates contain no telemetry tokens (Mama-voice rule)', () => {
    for (const ts of Object.values(PHASE_CELEBRATION_TEMPLATES)) {
      for (const t of ts) {
        expect(t).not.toMatch(/\d+\s*\/\s*10/)
        expect(t).not.toMatch(/\bDay\s+\d+\b/)
        expect(t).not.toMatch(/\bcompliance\b/i)
        expect(t).not.toMatch(/\bslip points\b/i)
      }
    }
  })
})
