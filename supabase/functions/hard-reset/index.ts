// Hard Reset / Emergency Wipe — Edge Function
//
// Single user-initiated nuke. Wipes every public.* table that holds the user's
// kink/personal data, deletes storage objects under the user's prefix,
// best-effort revokes calendar credentials, and resets user_state to defaults.
//
// Auth account is NOT deleted — the user can sign in again to start over.
// hard_reset_audit row is inserted BEFORE the wipe and updated after; it is
// the only persistent trace.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-user-token',
}

const CONFIRMATION_PHRASE = 'delete my mommy'

const STORAGE_BUCKETS = [
  'verification-photos',
  'vault-media',
  'gina-sessions',
  // Spec lists `evidence` and `voice-recordings` as buckets the wipe should cover.
  // They don't exist in main yet — the storage delete loop tolerates 404 buckets.
  'evidence',
  'voice-recordings',
]

type TriggerVia = 'settings_button' | 'panic_gesture' | 'scheduled'
type ConfirmedVia = 'typed_phrase' | 'pin' | 'both'

interface HardResetRequest {
  phrase?: string
  pin?: string
  via?: TriggerVia
}

interface HardResetSummary {
  audit_id: string
  tables_cleared: Record<string, number | { error: string }>
  storage_objects_cleared: Record<string, number | { error: string }>
  calendar_revoked: boolean | { error: string }
  user_state_reset: boolean
  cooldown_seconds_remaining: number | null
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizePhrase(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

async function clearStorageBucket(
  admin: SupabaseClient,
  bucket: string,
  userId: string
): Promise<number | { error: string }> {
  try {
    // Storage convention across buckets: object key starts with `<user_id>/...`.
    const { data: objects, error: listErr } = await admin.storage
      .from(bucket)
      .list(userId, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })

    if (listErr) {
      // Bucket missing is benign here.
      const msg = listErr.message ?? String(listErr)
      if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('does not exist')) {
        return 0
      }
      return { error: msg }
    }

    if (!objects || objects.length === 0) {
      return 0
    }

    const paths = objects.map(o => `${userId}/${o.name}`)
    const { error: rmErr } = await admin.storage.from(bucket).remove(paths)
    if (rmErr) {
      return { error: rmErr.message ?? String(rmErr) }
    }
    return paths.length
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

async function revokeCalendarCredentials(
  admin: SupabaseClient,
  userId: string
): Promise<boolean | { error: string }> {
  try {
    // Best-effort: only fire if the table exists.
    const { data: rows, error } = await admin
      .from('calendar_credentials')
      .select('user_id')
      .eq('user_id', userId)
      .limit(1)

    if (error) {
      // Table missing — treat as no-op.
      const msg = error.message ?? ''
      if (
        msg.toLowerCase().includes('does not exist') ||
        msg.toLowerCase().includes('relation') ||
        error.code === 'PGRST205' ||
        error.code === '42P01'
      ) {
        return false
      }
      return { error: msg }
    }

    if (!rows || rows.length === 0) {
      return false
    }

    // Try to invoke calendar-revoke best-effort; failure does not block the wipe.
    try {
      await admin.functions.invoke('calendar-revoke', { body: { user_id: userId } })
    } catch (_invokeErr) {
      // Swallow: the row delete below is the durable revoke from our side.
    }

    await admin.from('calendar_credentials').delete().eq('user_id', userId)
    return true
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  // -------- Auth: resolve user from token --------
  const authHeader = req.headers.get('Authorization') ?? ''
  const userToken = req.headers.get('x-user-token') ?? authHeader.replace('Bearer ', '')
  if (!userToken || userToken.length < 10) {
    return jsonResponse({ error: 'unauthorized', details: 'no_token' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return jsonResponse({ error: 'server_misconfigured' }, 500)
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  })
  const admin: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey)

  const { data: userRes, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userRes?.user) {
    return jsonResponse({ error: 'unauthorized', details: 'bad_token' }, 401)
  }
  const userId = userRes.user.id

  // -------- Parse body --------
  let body: HardResetRequest = {}
  try {
    body = (await req.json()) as HardResetRequest
  } catch {
    body = {}
  }

  const triggeredVia: TriggerVia = body.via === 'panic_gesture' ? 'panic_gesture' : 'settings_button'

  // -------- Phrase validation (panic gesture skips per spec) --------
  let phraseValid = false
  if (triggeredVia === 'panic_gesture') {
    phraseValid = true
  } else {
    phraseValid = normalizePhrase(body.phrase) === CONFIRMATION_PHRASE
  }
  if (!phraseValid) {
    return jsonResponse({ error: 'invalid_phrase' }, 400)
  }

  // -------- PIN validation (when stealth pin lock is enabled) --------
  // The stealth PIN model is not yet merged in main. We check user_state for
  // optional columns; absence is treated as "no PIN required."
  let pinRequired = false
  let pinValid = true
  let confirmedVia: ConfirmedVia = 'typed_phrase'

  try {
    const { data: state } = await admin
      .from('user_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    const stealthPin =
      (state as Record<string, unknown> | null)?.stealth_pin_hash ??
      (state as Record<string, unknown> | null)?.pin_hash ??
      null
    const pinLockEnabled =
      Boolean((state as Record<string, unknown> | null)?.pin_lock_enabled) &&
      Boolean(stealthPin)

    if (pinLockEnabled) {
      pinRequired = true
      // Naive equality check: the stealth PIN feature, when it lands, may swap
      // this for a hashed compare. Until then, equal-string is the contract.
      pinValid = typeof body.pin === 'string' && body.pin === stealthPin
      if (triggeredVia === 'panic_gesture') {
        confirmedVia = 'pin'
      } else {
        confirmedVia = 'both'
      }
    } else if (triggeredVia === 'panic_gesture') {
      // Panic with no PIN configured → require nothing else; phrase was skipped.
      // Spec says PIN is still required if set; if not set, the gesture alone is enough.
      confirmedVia = 'typed_phrase'
    }
  } catch {
    // user_state read errors aren't fatal; default to no-PIN path.
  }

  if (pinRequired && !pinValid) {
    return jsonResponse({ error: 'invalid_pin' }, 400)
  }

  // -------- Cooldown check (server-side, can't be bypassed by client) --------
  const { data: cooldownRow } = await admin.rpc('hard_reset_check_cooldown', {
    p_user_id: userId,
  })
  const cooldownSeconds = typeof cooldownRow === 'number' ? cooldownRow : null
  if (cooldownSeconds && cooldownSeconds > 0) {
    return jsonResponse(
      { error: 'cooldown', seconds_remaining: cooldownSeconds },
      429
    )
  }

  // -------- Insert audit row BEFORE the wipe --------
  const { data: auditRow, error: auditErr } = await admin
    .from('hard_reset_audit')
    .insert({
      user_id: userId,
      triggered_via: triggeredVia,
      confirmed_via: confirmedVia,
      tables_cleared: {},
      storage_objects_cleared: {},
    })
    .select('id')
    .single()

  if (auditErr || !auditRow) {
    return jsonResponse(
      { error: 'audit_failed', details: auditErr?.message ?? 'unknown' },
      500
    )
  }
  const auditId = auditRow.id as string

  // -------- The wipe --------
  let tablesCleared: Record<string, number | { error: string }> = {}
  let storageCleared: Record<string, number | { error: string }> = {}
  let calendarRevoked: boolean | { error: string } = false
  let userStateReset = false
  let fatalError: string | null = null

  try {
    // 1. Calendar revoke (best-effort, before deleting credential row).
    calendarRevoked = await revokeCalendarCredentials(admin, userId)

    // 2. Storage objects under user's prefix in each bucket.
    for (const bucket of STORAGE_BUCKETS) {
      storageCleared[bucket] = await clearStorageBucket(admin, bucket, userId)
    }

    // 3. Wipe every public.* table with a user_id column (RPC).
    const { data: cleared, error: rpcErr } = await admin.rpc('hard_reset_user_data', {
      p_user_id: userId,
    })
    if (rpcErr) {
      fatalError = `wipe_rpc_failed: ${rpcErr.message}`
    } else {
      tablesCleared = (cleared as Record<string, number | { error: string }>) ?? {}
    }

    // 4. Reset user_state to defaults (preserves last_hard_reset_at = NOW()).
    const { error: stateErr } = await admin.rpc('hard_reset_user_state', {
      p_user_id: userId,
    })
    if (stateErr) {
      fatalError = (fatalError ? fatalError + '; ' : '') + `state_reset_failed: ${stateErr.message}`
    } else {
      userStateReset = true
    }
  } catch (e) {
    fatalError = e instanceof Error ? e.message : String(e)
  }

  // -------- Update audit row with completed_at + summary --------
  await admin
    .from('hard_reset_audit')
    .update({
      tables_cleared: tablesCleared,
      storage_objects_cleared: storageCleared,
      completed_at: new Date().toISOString(),
      error: fatalError,
    })
    .eq('id', auditId)

  const summary: HardResetSummary = {
    audit_id: auditId,
    tables_cleared: tablesCleared,
    storage_objects_cleared: storageCleared,
    calendar_revoked: calendarRevoked,
    user_state_reset: userStateReset,
    cooldown_seconds_remaining: 24 * 60 * 60,
  }

  if (fatalError) {
    return jsonResponse({ ...summary, error: fatalError, partial: true }, 207)
  }
  return jsonResponse(summary, 200)
})
