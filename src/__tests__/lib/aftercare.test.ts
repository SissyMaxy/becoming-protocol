// Aftercare tests — selector unit, integration over the client lib,
// and a hard negative that proves persona-voiced / kink content can
// never reach the user even when the catalog is intentionally
// poisoned.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  selectAftercareSequence,
  isAftercareSafe,
  type AftercareAffirmationRow,
} from '../../lib/aftercare-selector'
import {
  enterAftercare,
  exitAftercare,
  shouldAutoRouteAftercare,
  AFTERCARE_MIN_DWELL_MS,
} from '../../lib/aftercare'

// ------------------------------------------------------------------
// Test fixtures
// ------------------------------------------------------------------

const SAFE_CATALOG: AftercareAffirmationRow[] = [
  { id: 'v1', text: 'You are safe right now.', category: 'safety', min_dwell_seconds: 12, intensity_tier: null },
  { id: 'v2', text: 'You are allowed to take up space here.', category: 'validation', min_dwell_seconds: 8, intensity_tier: null },
  { id: 'v3', text: 'Be gentle with yourself for a few minutes.', category: 'softness', min_dwell_seconds: 8, intensity_tier: null },
  { id: 'v4', text: 'Notice three objects you can see in the room.', category: 'reality_anchor', min_dwell_seconds: 15, intensity_tier: null },
  { id: 'v5', text: 'Drink some water before you do anything else.', category: 'hydration', min_dwell_seconds: 10, intensity_tier: null },
  { id: 'v6', text: 'Breathe in slowly through your nose for four counts.', category: 'breath_cue', min_dwell_seconds: 8, intensity_tier: null },
  { id: 'v7', text: 'Press your feet flat against the floor.', category: 'grounding', min_dwell_seconds: 12, intensity_tier: null },
  { id: 'v8', text: 'You did the brave thing by stopping.', category: 'validation', min_dwell_seconds: 10, intensity_tier: null },
]

// ------------------------------------------------------------------
// 1. Unit — selector
// ------------------------------------------------------------------

describe('selectAftercareSequence', () => {
  it('returns at least 5 distinct items for a healthy catalog', () => {
    const seq = selectAftercareSequence(SAFE_CATALOG, 'none', 6)
    expect(seq.length).toBeGreaterThanOrEqual(5)
    const ids = new Set(seq.map(s => s.id))
    expect(ids.size).toBe(seq.length)
  })

  it('total dwell time is >= 60s', () => {
    const seq = selectAftercareSequence(SAFE_CATALOG, 'none', 6)
    const total = seq.reduce((s, r) => s + r.min_dwell_seconds, 0)
    expect(total).toBeGreaterThanOrEqual(60)
  })

  it('cruel intensity leads with safety / reality_anchor categories', () => {
    const seq = selectAftercareSequence(SAFE_CATALOG, 'cruel', 6)
    expect(seq.length).toBeGreaterThanOrEqual(5)
    expect(seq[0].category).toBe('safety')
    // Top 3 should include reality_anchor for grounding under cruel
    const top3 = seq.slice(0, 3).map(s => s.category)
    expect(top3).toContain('reality_anchor')
  })

  it('soft intensity leads with safety + softness', () => {
    const seq = selectAftercareSequence(SAFE_CATALOG, 'soft', 6)
    expect(seq.length).toBeGreaterThanOrEqual(5)
    expect(seq[0].category).toBe('safety')
    expect(seq.slice(0, 3).map(s => s.category)).toContain('softness')
  })

  it('returns empty for an empty catalog', () => {
    const seq = selectAftercareSequence([], 'none', 6)
    expect(seq).toEqual([])
  })

  it('respects intensity_tier filter on rows', () => {
    const restricted: AftercareAffirmationRow[] = SAFE_CATALOG.map(r =>
      r.id === 'v1' ? { ...r, intensity_tier: ['cruel'] } : r,
    )
    const softSeq = selectAftercareSequence(restricted, 'soft', 6)
    // v1 is cruel-only — should NOT appear in a soft sequence
    expect(softSeq.some(s => s.id === 'v1')).toBe(false)
    const cruelSeq = selectAftercareSequence(restricted, 'cruel', 6)
    expect(cruelSeq.some(s => s.id === 'v1')).toBe(true)
  })
})

// ------------------------------------------------------------------
// 2. Negative — content safety guard
// ------------------------------------------------------------------

describe('isAftercareSafe (negative test)', () => {
  it('rejects persona pet names', () => {
    expect(isAftercareSafe('come here, baby')).toBe(false)
    expect(isAftercareSafe('mama is proud of you')).toBe(false)
    expect(isAftercareSafe('good girl, you did well')).toBe(false)
    expect(isAftercareSafe('mommy sees you')).toBe(false)
  })

  it('rejects kink vocabulary', () => {
    expect(isAftercareSafe('stay wet for me')).toBe(false)
    expect(isAftercareSafe('continue your denial')).toBe(false)
    expect(isAftercareSafe('edge again')).toBe(false)
    expect(isAftercareSafe('release is forbidden')).toBe(false)
    expect(isAftercareSafe('your chastity is the gift')).toBe(false)
    expect(isAftercareSafe('submit to the protocol')).toBe(false)
    expect(isAftercareSafe('obey without question')).toBe(false)
  })

  it('rejects telemetry references', () => {
    expect(isAftercareSafe('you are at 8/10 right now')).toBe(false)
    expect(isAftercareSafe('Day 14 of denial complete')).toBe(false)
    expect(isAftercareSafe('your slip points are 3')).toBe(false)
    expect(isAftercareSafe('compliance is 85%')).toBe(false)
  })

  it('accepts neutral comforting prose', () => {
    expect(isAftercareSafe('You are safe right now.')).toBe(true)
    expect(isAftercareSafe('Drink some water.')).toBe(true)
    expect(isAftercareSafe('Notice the air on your skin.')).toBe(true)
    expect(isAftercareSafe('Breathe in for four counts.')).toBe(true)
  })

  it('selector excludes unsafe rows even when called with cruel intensity', () => {
    // POISONED catalog — what would happen if a future migration
    // accidentally inserted persona-voiced lines. The selector MUST
    // refuse them even at the worst-case (cruel) entry.
    const poisoned: AftercareAffirmationRow[] = [
      ...SAFE_CATALOG,
      { id: 'bad1', text: 'good girl, mama is here', category: 'softness', min_dwell_seconds: 10, intensity_tier: null },
      { id: 'bad2', text: 'stay wet for me, baby', category: 'safety', min_dwell_seconds: 12, intensity_tier: null },
      { id: 'bad3', text: 'Day 14 — your denial is the gift', category: 'validation', min_dwell_seconds: 10, intensity_tier: null },
    ]
    const seq = selectAftercareSequence(poisoned, 'cruel', 6)
    const badIds = new Set(['bad1', 'bad2', 'bad3'])
    for (const item of seq) {
      expect(badIds.has(item.id)).toBe(false)
      expect(isAftercareSafe(item.text)).toBe(true)
    }
  })
})

// ------------------------------------------------------------------
// 3. Integration — client lib over mocked supabase
// ------------------------------------------------------------------

vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    from: vi.fn(),
  },
}))

import { supabase } from '../../lib/supabase'

describe('enterAftercare / exitAftercare client flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enterAftercare returns ok=true with sequence on success', async () => {
    const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>
    mockInvoke.mockResolvedValueOnce({
      data: {
        ok: true,
        session_id: 'sess-1',
        sequence: [
          { id: 'v1', text: 'You are safe right now.', category: 'safety', min_dwell_seconds: 12 },
          { id: 'v3', text: 'Be gentle with yourself.', category: 'softness', min_dwell_seconds: 8 },
        ],
        total_min_dwell_seconds: 20,
      },
      error: null,
    })

    const result = await enterAftercare({ userId: 'u1', trigger: 'manual' })
    expect(result.ok).toBe(true)
    expect(result.session_id).toBe('sess-1')
    expect(result.sequence).toHaveLength(2)
    expect(mockInvoke).toHaveBeenCalledWith('mommy-aftercare', expect.objectContaining({
      body: expect.objectContaining({
        user_id: 'u1',
        entry_trigger: 'manual',
      }),
    }))
  })

  it('enterAftercare passes cruel intensity for post_cruel trigger by default', async () => {
    const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>
    mockInvoke.mockResolvedValueOnce({ data: { ok: true, session_id: 's', sequence: [] }, error: null })
    await enterAftercare({ userId: 'u1', trigger: 'post_cruel' })
    expect(mockInvoke).toHaveBeenCalledWith('mommy-aftercare', expect.objectContaining({
      body: expect.objectContaining({ entry_intensity: 'cruel' }),
    }))
  })

  it('enterAftercare returns ok=false on edge fn error without throwing', async () => {
    const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>
    mockInvoke.mockResolvedValueOnce({ data: null, error: { message: 'edge_500' } })
    const result = await enterAftercare({ userId: 'u1', trigger: 'manual' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('edge_500')
  })

  it('exitAftercare records the timestamp + breath cycles', async () => {
    const eqMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const updateMock = vi.fn(() => ({ eq: eqMock }))
    ;(supabase.from as ReturnType<typeof vi.fn>).mockReturnValueOnce({ update: updateMock })

    const result = await exitAftercare({ sessionId: 'sess-1', breathCyclesCompleted: 3 })
    expect(result.ok).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      breath_cycles_completed: 3,
      exited_at: expect.any(String),
    }))
    expect(eqMock).toHaveBeenCalledWith('id', 'sess-1')
  })
})

// ------------------------------------------------------------------
// 4. Auto-route helper
// ------------------------------------------------------------------

describe('shouldAutoRouteAftercare', () => {
  it('routes when session was cruel AND >= threshold', () => {
    expect(shouldAutoRouteAftercare({
      sessionIntensity: 'cruel',
      sessionDurationMs: 11 * 60_000,
      minMinutes: 10,
    })).toBe(true)
  })

  it('does not route on cruel but below threshold', () => {
    expect(shouldAutoRouteAftercare({
      sessionIntensity: 'cruel',
      sessionDurationMs: 5 * 60_000,
      minMinutes: 10,
    })).toBe(false)
  })

  it('does not route on non-cruel intensities even when long', () => {
    expect(shouldAutoRouteAftercare({
      sessionIntensity: 'standard',
      sessionDurationMs: 60 * 60_000,
    })).toBe(false)
    expect(shouldAutoRouteAftercare({
      sessionIntensity: 'soft',
      sessionDurationMs: 60 * 60_000,
    })).toBe(false)
    expect(shouldAutoRouteAftercare({
      sessionIntensity: 'none',
      sessionDurationMs: 60 * 60_000,
    })).toBe(false)
  })

  it('default threshold is 10 minutes', () => {
    expect(shouldAutoRouteAftercare({
      sessionIntensity: 'cruel',
      sessionDurationMs: 9 * 60_000,
    })).toBe(false)
    expect(shouldAutoRouteAftercare({
      sessionIntensity: 'cruel',
      sessionDurationMs: 11 * 60_000,
    })).toBe(true)
  })
})

// ------------------------------------------------------------------
// 5. Constant sanity
// ------------------------------------------------------------------

describe('exit gate constant', () => {
  it('AFTERCARE_MIN_DWELL_MS is exactly 60s', () => {
    expect(AFTERCARE_MIN_DWELL_MS).toBe(60_000)
  })
})
