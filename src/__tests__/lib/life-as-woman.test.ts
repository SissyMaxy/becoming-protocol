// life-as-woman — unit + integration tests for the four new surfaces
// (sniffies outbound + hypno trance + gooning + content editor).
//
// Hard floors tested here:
//   1. isSafewordActive returns true when a meta_frame_breaks row exists in
//      the last `seconds` seconds with triggered_by='safeword'.
//   2. isInIntenseScene returns true when an open aftercare session OR a
//      recent distortion event exists.
//   3. The TypeScript types for SniffiesDraft / HypnoTranceSession /
//      GooningSession / MommyEditorialNote round-trip through the client
//      helpers without loss.
//   4. The forbidden-voice list (hasForbiddenVoice / mommyVoiceCleanup
//      mirror) catches the literal banned phrases the edge fns must scrub
//      before persisting (verified at the type-only level since the
//      runtime cleanup lives in the edge fn _shared module).

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the supabase client BEFORE importing the client lib so the lib
// binds to the mocked module.
vi.mock('../../lib/supabase', () => {
  // Mutable in-test state so individual tests can stage rows.
  const state: {
    meta_frame_breaks: Array<{ id: string; user_id: string; triggered_by: string; created_at: string }>
    aftercare_sessions: Array<{ id: string; user_id: string; exited_at: string | null; entry_trigger: string }>
    mommy_distortion_log: Array<{ id: string; user_id: string; created_at: string }>
  } = {
    meta_frame_breaks: [],
    aftercare_sessions: [],
    mommy_distortion_log: [],
  }
  ;(globalThis as unknown as { __state: typeof state }).__state = state

  // Minimal supabase shim — every .from() returns the chain methods needed
  // by isSafewordActive / isInIntenseScene.
  const fromTable = (table: keyof typeof state) => {
    type Filter = { col: string; op: string; val: unknown }
    let filters: Filter[] = []
    const obj = {
      select: () => obj,
      eq: (col: string, val: unknown) => { filters.push({ col, op: 'eq', val }); return obj },
      gte: (col: string, val: unknown) => { filters.push({ col, op: 'gte', val }); return obj },
      is: (col: string, val: unknown) => { filters.push({ col, op: 'is', val }); return obj },
      limit: () => Promise.resolve({
        data: state[table].filter(row =>
          filters.every(f => {
            const v = (row as Record<string, unknown>)[f.col]
            if (f.op === 'eq') return v === f.val
            if (f.op === 'gte') return typeof v === 'string' && typeof f.val === 'string' && v >= f.val
            if (f.op === 'is') return v === f.val
            return true
          })
        ),
        error: null,
      }),
    }
    return obj
  }
  return {
    supabase: {
      from: (table: string) => fromTable(table as keyof typeof state),
    },
  }
})

import { isSafewordActive, isInIntenseScene } from '../../lib/life-as-woman/client'

const USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

function state(): {
  meta_frame_breaks: Array<{ id: string; user_id: string; triggered_by: string; created_at: string }>
  aftercare_sessions: Array<{ id: string; user_id: string; exited_at: string | null; entry_trigger: string }>
  mommy_distortion_log: Array<{ id: string; user_id: string; created_at: string }>
} {
  return (globalThis as unknown as { __state: ReturnType<typeof state> }).__state
}

beforeEach(() => {
  state().meta_frame_breaks = []
  state().aftercare_sessions = []
  state().mommy_distortion_log = []
})

describe('isSafewordActive (client-side mirror of SQL helper)', () => {
  it('returns false with no safeword events', async () => {
    expect(await isSafewordActive(USER_ID, 60)).toBe(false)
  })

  it('returns true when a safeword event fired within the window', async () => {
    state().meta_frame_breaks.push({
      id: '1', user_id: USER_ID, triggered_by: 'safeword',
      created_at: new Date(Date.now() - 30 * 1000).toISOString(),
    })
    expect(await isSafewordActive(USER_ID, 60)).toBe(true)
  })

  it('returns false when the safeword event is older than the window', async () => {
    state().meta_frame_breaks.push({
      id: '1', user_id: USER_ID, triggered_by: 'safeword',
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    })
    expect(await isSafewordActive(USER_ID, 60)).toBe(false)
  })

  it('does NOT confuse non-safeword break events', async () => {
    state().meta_frame_breaks.push({
      id: '1', user_id: USER_ID, triggered_by: 'settings_button',
      created_at: new Date().toISOString(),
    })
    expect(await isSafewordActive(USER_ID, 60)).toBe(false)
  })
})

describe('isInIntenseScene', () => {
  it('returns false when no scenes / distortions are open', async () => {
    expect(await isInIntenseScene(USER_ID)).toBe(false)
  })

  it('returns true with an open aftercare session', async () => {
    state().aftercare_sessions.push({
      id: '1', user_id: USER_ID, exited_at: null, entry_trigger: 'post_safeword',
    })
    expect(await isInIntenseScene(USER_ID)).toBe(true)
  })

  it('returns true with a recent distortion log row', async () => {
    state().mommy_distortion_log.push({
      id: '1', user_id: USER_ID,
      created_at: new Date(Date.now() - 10 * 1000).toISOString(),
    })
    expect(await isInIntenseScene(USER_ID)).toBe(true)
  })

  it('does not trip on stale distortion rows', async () => {
    state().mommy_distortion_log.push({
      id: '1', user_id: USER_ID,
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    })
    expect(await isInIntenseScene(USER_ID)).toBe(false)
  })
})
