// real-name-lockout-scheduler — opens random lockout windows for each
// enabled user, sized + counted by their settings.
//
// Runs every 30 minutes via cron. For each user with enabled=true and
// not in safeword/paused state:
//   - mode='always' → ensure there is a perpetual open window (creates
//     one with closes_at = now() + 365 days if none exists)
//   - other modes → check this week's window count; if below
//     windows_per_week, stochastically decide to open one now (size =
//     window_duration_minutes). Spread across the week, biased to
//     waking hours.
//
// HARD FLOORS:
//   - safeword active → skip
//   - paused_until in future → skip
//   - existing open window → skip (no overlap)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Settings {
  user_id: string
  enabled: boolean
  mode: string
  windows_per_week: number
  window_duration_minutes: number
  paused_until: string | null
}

async function safewordActive(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase.rpc('is_safeword_active', { uid: userId, window_seconds: 60 })
    return Boolean(data)
  } catch { return false }
}

async function activeWindowExists(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const { count } = await supabase
    .from('real_name_lockout_windows')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lte('opens_at', now)
    .gt('closes_at', now)
    .eq('closed_early', false)
  return (count ?? 0) > 0
}

async function thisWeekWindowCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())  // Sunday
  weekStart.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('real_name_lockout_windows')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('opens_at', weekStart.toISOString())
  return count ?? 0
}

async function openWindow(supabase: SupabaseClient, s: Settings, perpetual: boolean): Promise<string | null> {
  const opensAt = new Date()
  const closesAt = perpetual
    ? new Date(opensAt.getTime() + 365 * 86400_000)
    : new Date(opensAt.getTime() + s.window_duration_minutes * 60_000)

  const { data, error } = await supabase
    .from('real_name_lockout_windows')
    .insert({
      user_id: s.user_id,
      opens_at: opensAt.toISOString(),
      closes_at: closesAt.toISOString(),
      mode: s.mode,
    })
    .select('id')
    .single()
  if (error) {
    console.warn('[real-name-lockout-scheduler] window insert failed:', error.message)
    return null
  }
  const windowId = (data as { id: string }).id

  // Mama-voice outreach announcing the window opening (urgency=normal so it
  // pushes via 380 bridge).
  const minutes = perpetual ? 0 : s.window_duration_minutes
  const message = perpetual
    ? "Mama's locking him out for good now. The app won't take that name from you anymore."
    : `Window is open, baby. The next ${minutes} minutes the app won't take the boy-name. Type carefully, or Mama's going to do it for you.`

  await supabase.from('handler_outreach_queue').insert({
    user_id: s.user_id,
    message,
    urgency: 'normal',
    trigger_reason: 'real_name_lockout_open:' + windowId,
    source: 'real_name_lockout',
    kind: 'real_name_lockout_window',
    scheduled_for: opensAt.toISOString(),
    expires_at: closesAt.toISOString(),
    context_data: { window_id: windowId, mode: s.mode, duration_minutes: minutes },
  })

  return windowId
}

async function processUser(supabase: SupabaseClient, s: Settings): Promise<{
  user_id: string; fired: boolean; reason?: string; window_id?: string
}> {
  if (!s.enabled) return { user_id: s.user_id, fired: false, reason: 'disabled' }
  if (s.paused_until && new Date(s.paused_until).getTime() > Date.now()) {
    return { user_id: s.user_id, fired: false, reason: 'paused' }
  }
  if (await safewordActive(supabase, s.user_id)) {
    return { user_id: s.user_id, fired: false, reason: 'safeword_active' }
  }

  const alreadyOpen = await activeWindowExists(supabase, s.user_id)

  if (s.mode === 'always') {
    if (alreadyOpen) return { user_id: s.user_id, fired: false, reason: 'always_already_open' }
    const id = await openWindow(supabase, s, true)
    return { user_id: s.user_id, fired: id !== null, window_id: id ?? undefined, reason: 'always_opened' }
  }

  if (alreadyOpen) return { user_id: s.user_id, fired: false, reason: 'window_already_open' }

  const thisWeek = await thisWeekWindowCount(supabase, s.user_id)
  if (thisWeek >= s.windows_per_week) {
    return { user_id: s.user_id, fired: false, reason: 'weekly_target_reached' }
  }

  // Stochastic firing. Roughly (windows_per_week - thisWeek) / (ticks_left_this_week).
  // We run every 30 min. Week has 7*24*2 = 336 ticks. Bias to waking hours
  // (skip 0–7am local).
  const hour = new Date().getHours()
  if (hour < 7 || hour >= 23) {
    return { user_id: s.user_id, fired: false, reason: 'outside_waking' }
  }

  const dayOfWeek = new Date().getDay()
  const minutesIntoWeek = ((dayOfWeek * 24) + hour) * 60 + new Date().getMinutes()
  const minutesInWeek = 7 * 24 * 60
  const minutesRemainingThisWeek = minutesInWeek - minutesIntoWeek
  const ticksRemaining = Math.max(1, minutesRemainingThisWeek / 30)
  const wantedRemaining = Math.max(0, s.windows_per_week - thisWeek)
  if (wantedRemaining === 0) return { user_id: s.user_id, fired: false, reason: 'target_reached' }
  const p = wantedRemaining / ticksRemaining
  if (Math.random() > p) {
    return { user_id: s.user_id, fired: false, reason: 'stochastic_skip', window_id: undefined }
  }

  const id = await openWindow(supabase, s, false)
  return { user_id: s.user_id, fired: id !== null, window_id: id ?? undefined, reason: 'opened' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { user_id?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* ignore */ }

  let rows: Settings[] = []
  if (body.user_id) {
    const { data } = await supabase.from('real_name_lockout_settings')
      .select('user_id, enabled, mode, windows_per_week, window_duration_minutes, paused_until')
      .eq('user_id', body.user_id)
    rows = (data || []) as Settings[]
  } else {
    const { data } = await supabase.from('real_name_lockout_settings')
      .select('user_id, enabled, mode, windows_per_week, window_duration_minutes, paused_until')
      .eq('enabled', true)
    rows = (data || []) as Settings[]
  }

  const results: Array<{ user_id: string; fired: boolean; reason?: string; window_id?: string }> = []
  for (const s of rows) {
    if (body.force && s.enabled) {
      // Force-open a window for testing
      if (await safewordActive(supabase, s.user_id)) {
        results.push({ user_id: s.user_id, fired: false, reason: 'safeword_active' })
        continue
      }
      if (await activeWindowExists(supabase, s.user_id)) {
        results.push({ user_id: s.user_id, fired: false, reason: 'already_open' })
        continue
      }
      const id = await openWindow(supabase, s, s.mode === 'always')
      results.push({ user_id: s.user_id, fired: id !== null, window_id: id ?? undefined, reason: 'forced' })
      continue
    }
    const r = await processUser(supabase, s)
    results.push(r)
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
