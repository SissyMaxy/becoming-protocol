// Client-side helpers for the hard reset flow.
// The edge function does the actual work; this file is auth-token plumbing
// + cooldown lookup + a typed wrapper for callers.

import { supabase } from '../supabase'

export const HARD_RESET_PHRASE = 'delete my mommy'

export const HARD_RESET_TARGET_BUCKETS = [
  'verification-photos',
  'vault-media',
  'gina-sessions',
  'evidence',
  'voice-recordings',
] as const

export type HardResetVia = 'settings_button' | 'panic_gesture'

export interface HardResetResult {
  ok: boolean
  status: number
  audit_id?: string
  tables_cleared?: Record<string, number | { error: string }>
  storage_objects_cleared?: Record<string, number | { error: string }>
  error?: string
  partial?: boolean
  cooldown_seconds_remaining?: number
}

export function normalizePhrase(s: string): string {
  return s.trim().toLowerCase()
}

export function phraseMatches(s: string): boolean {
  return normalizePhrase(s) === HARD_RESET_PHRASE
}

export async function getHardResetCooldownSeconds(): Promise<number | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase.rpc('hard_reset_check_cooldown', {
    p_user_id: user.id,
  })
  if (error) return null
  return typeof data === 'number' && data > 0 ? data : null
}

export async function triggerHardReset(input: {
  phrase?: string
  pin?: string
  via?: HardResetVia
}): Promise<HardResetResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { ok: false, status: 401, error: 'no_session' }
  }

  // Pre-flight phrase check on the client to avoid round-tripping bad input.
  // The edge fn re-validates. Panic gesture skips this entirely (server-side).
  if (input.via !== 'panic_gesture') {
    if (!phraseMatches(input.phrase ?? '')) {
      return { ok: false, status: 400, error: 'invalid_phrase' }
    }
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hard-reset`
  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        'x-user-token': session.access_token,
      },
      body: JSON.stringify({
        phrase: input.phrase,
        pin: input.pin,
        via: input.via ?? 'settings_button',
      }),
    })
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : 'network_error',
    }
  }

  let body: Record<string, unknown> = {}
  try {
    body = await resp.json()
  } catch {
    /* tolerate empty/malformed body */
  }

  return {
    ok: resp.status >= 200 && resp.status < 300,
    status: resp.status,
    audit_id: body.audit_id as string | undefined,
    tables_cleared: body.tables_cleared as Record<string, number | { error: string }> | undefined,
    storage_objects_cleared: body.storage_objects_cleared as
      | Record<string, number | { error: string }>
      | undefined,
    error: body.error as string | undefined,
    partial: body.partial as boolean | undefined,
    cooldown_seconds_remaining: body.seconds_remaining as number | undefined,
  }
}

export function formatCooldown(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${seconds}s`
}
