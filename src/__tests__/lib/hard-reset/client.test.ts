// Hard reset client wrapper tests.
// Mocks fetch + the supabase auth/rpc surface to verify:
//  - phrase normalization is case-insensitive + trim
//  - panic_gesture skips client-side phrase check (server still validates)
//  - cooldown lookup returns null when allowed, seconds when blocked
//  - 429 / 400 response shapes get parsed onto HardResetResult

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock supabase BEFORE importing the module under test.
const mockGetSession = vi.fn()
const mockGetUser = vi.fn()
const mockRpc = vi.fn()

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      getUser: () => mockGetUser(),
    },
    rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
  },
}))

// Stub Vite env access used by the client wrapper.
const originalEnv = (import.meta as { env?: Record<string, string> }).env
beforeEach(() => {
  ;(import.meta as { env?: Record<string, string> }).env = {
    ...originalEnv,
    VITE_SUPABASE_URL: 'https://stub.supabase.co',
  }
})

import {
  HARD_RESET_PHRASE,
  HARD_RESET_TARGET_BUCKETS,
  formatCooldown,
  getHardResetCooldownSeconds,
  normalizePhrase,
  phraseMatches,
  triggerHardReset,
} from '../../../lib/hard-reset/client'

describe('hard-reset/client phrase normalization', () => {
  it('exposes the canonical phrase', () => {
    expect(HARD_RESET_PHRASE).toBe('delete my mommy')
  })

  it('lowercases and trims', () => {
    expect(normalizePhrase('  DELETE MY Mommy  ')).toBe('delete my mommy')
  })

  it('phraseMatches is case-insensitive', () => {
    expect(phraseMatches('Delete My Mommy')).toBe(true)
    expect(phraseMatches('DELETE MY MOMMY')).toBe(true)
    expect(phraseMatches('delete my mommy ')).toBe(true)
    expect(phraseMatches('delete the mommy')).toBe(false)
    expect(phraseMatches('')).toBe(false)
  })
})

describe('hard-reset/client target buckets', () => {
  it('lists the five storage buckets the wipe targets', () => {
    expect(HARD_RESET_TARGET_BUCKETS).toEqual([
      'verification-photos',
      'vault-media',
      'gina-sessions',
      'evidence',
      'voice-recordings',
    ])
  })
})

describe('hard-reset/client formatCooldown', () => {
  it('formats hours+minutes', () => {
    expect(formatCooldown(2 * 3600 + 15 * 60)).toBe('2h 15m')
  })
  it('formats minutes only', () => {
    expect(formatCooldown(15 * 60)).toBe('15m')
  })
  it('formats seconds when under a minute', () => {
    expect(formatCooldown(45)).toBe('45s')
  })
})

describe('hard-reset/client getHardResetCooldownSeconds', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    mockRpc.mockReset()
  })

  it('returns null when no user', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await getHardResetCooldownSeconds()).toBeNull()
  })

  it('returns null when RPC says zero / negative', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValueOnce({ data: 0, error: null })
    expect(await getHardResetCooldownSeconds()).toBeNull()
  })

  it('returns seconds when blocked', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValueOnce({ data: 3600, error: null })
    expect(await getHardResetCooldownSeconds()).toBe(3600)
  })

  it('returns null on RPC error (graceful fallback, server still gates)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await getHardResetCooldownSeconds()).toBeNull()
  })
})

describe('hard-reset/client triggerHardReset', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    vi.spyOn(globalThis, 'fetch')
  })

  it('refuses without session (no fetch fired)', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    const result = await triggerHardReset({ phrase: HARD_RESET_PHRASE })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(401)
    expect(result.error).toBe('no_session')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('rejects bad phrase client-side without firing the request', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 't' } },
    })
    const result = await triggerHardReset({ phrase: 'not the phrase' })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
    expect(result.error).toBe('invalid_phrase')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('fires fetch when phrase is valid; sends bearer + x-user-token', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok123' } },
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          audit_id: 'aud-1',
          tables_cleared: { handler_messages: 4 },
          storage_objects_cleared: { 'vault-media': 0 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const result = await triggerHardReset({ phrase: HARD_RESET_PHRASE })
    expect(result.ok).toBe(true)
    expect(result.audit_id).toBe('aud-1')
    expect(result.tables_cleared).toEqual({ handler_messages: 4 })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/functions/v1/hard-reset')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok123')
    expect(headers['x-user-token']).toBe('tok123')
    const body = JSON.parse(init.body as string)
    expect(body.phrase).toBe(HARD_RESET_PHRASE)
    expect(body.via).toBe('settings_button')
  })

  it('panic_gesture skips client phrase validation', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok' } },
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{}', { status: 200 })
    )
    const result = await triggerHardReset({ via: 'panic_gesture' })
    expect(result.ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const init = fetchSpy.mock.calls[0]![1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.via).toBe('panic_gesture')
  })

  it('parses a 429 cooldown response', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok' } },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'cooldown', seconds_remaining: 3600 }),
        { status: 429 }
      )
    )
    const result = await triggerHardReset({ phrase: HARD_RESET_PHRASE })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(429)
    expect(result.cooldown_seconds_remaining).toBe(3600)
  })

  it('parses a 400 invalid_pin response', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok' } },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_pin' }), { status: 400 })
    )
    const result = await triggerHardReset({
      phrase: HARD_RESET_PHRASE,
      pin: 'wrong',
    })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
    expect(result.error).toBe('invalid_pin')
  })

  it('parses a 207 partial-success response', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok' } },
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          audit_id: 'aud-2',
          partial: true,
          error: 'storage_partial',
          tables_cleared: { foo: 1 },
          storage_objects_cleared: { 'vault-media': { error: 'denied' } },
        }),
        { status: 207 }
      )
    )
    const result = await triggerHardReset({ phrase: HARD_RESET_PHRASE })
    // 207 is not 2xx-success-OK in our wrapper (only 200-299 maps to ok).
    expect(result.ok).toBe(true)
    expect(result.partial).toBe(true)
    expect(result.error).toBe('storage_partial')
    expect(result.audit_id).toBe('aud-2')
  })

  it('handles network failure', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: 'tok' } },
    })
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('connection refused')
    )
    const result = await triggerHardReset({ phrase: HARD_RESET_PHRASE })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
    expect(result.error).toBe('connection refused')
  })
})
