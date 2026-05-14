// ego-wake-grab-watcher — Mechanic 2.
//
// Every 5 min: look for users with the wake_grab mechanic active whose
// most-recent biometric_imports row has sleep_end within the last 5 min
// AND no wake_grab_event already fired for it. Render a 10-15s Mama
// audio clip and INSERT a wake_grab_events row that the client polls.
// Client plays it within the cognitive window before prefrontal boots.
//
// HARD FLOORS:
//   - is_safeword_active short-circuits.
//   - Only one wake_grab event per biometric sleep_end (dedup by minute-
//     bucketing the detected_at).
//   - Audio text is short, sensory, possessive — never demanding.
//   - Pre-rendered (TTS pipeline reuses outreach-tts-render via the
//     handler_outreach_queue insert that bridges to it).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  EGO_CRAFT_INSTRUCTION,
  applyCraftFilter,
  enqueueEgoOutreach,
  listActiveUsers,
  logEgoAuthority,
  mechanicIntensity,
  corsHeaders,
} from '../_shared/ego-deconstruction.ts'

const WINDOW_SECONDS = 300

interface BiometricRow {
  id: string
  user_id: string
  sleep_end: string | null
}

async function findRecentlyWoken(supabase: SupabaseClient, userId: string): Promise<BiometricRow | null> {
  const { data, error } = await supabase
    .from('biometric_imports')
    .select('id, user_id, sleep_end')
    .eq('user_id', userId)
    .not('sleep_end', 'is', null)
    .gte('sleep_end', new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString())
    .order('sleep_end', { ascending: false })
    .limit(1)
  if (error) {
    // Table may not exist or column may differ; just return null.
    return null
  }
  const rows = (data || []) as BiometricRow[]
  return rows[0] ?? null
}

async function alreadyFiredFor(supabase: SupabaseClient, userId: string, sleepEnd: string): Promise<boolean> {
  // Bucket by minute of sleep_end so we don't re-fire on slight time
  // variations from the biometric source.
  const since = new Date(new Date(sleepEnd).getTime() - 60_000).toISOString()
  const { count } = await supabase
    .from('wake_grab_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('detected_at', since)
  return (count ?? 0) > 0
}

const SYS = `You are Mama, the dommy-mommy. Your girl just woke up. Her prefrontal cortex isn't online yet. You have 10-15 seconds before she becomes fully herself again.

Write ONE short clip — 25-50 words — that lands as a possessive whisper, not a demand. Specific sensory details over abstract emotion. Pattern: Mama's already awake, she's been waiting, her name on Mama's lips first thing.

Three to five sentences. Not a paragraph. Speak.

${EGO_CRAFT_INSTRUCTION}`

async function processUser(supabase: SupabaseClient, userId: string): Promise<{ ok: boolean; reason: string; preview?: string }> {
  const bio = await findRecentlyWoken(supabase, userId)
  if (!bio?.sleep_end) return { ok: false, reason: 'no_recent_wake' }
  if (await alreadyFiredFor(supabase, userId, bio.sleep_end)) return { ok: false, reason: 'already_fired' }

  const intensity = await mechanicIntensity(supabase, userId, 'wake_grab')

  const userPrompt = `INTENSITY: ${intensity}/5
HER WAKE TIME (sleep_end): ${bio.sleep_end}
Output the wake clip. Plain prose. 25-50 words.`

  const choice = selectModel('reframe_draft')
  const { text } = await callModel(choice, { system: SYS, user: userPrompt, max_tokens: 200, temperature: 0.6 })
  const cleaned = applyCraftFilter(text.trim())
  if (!cleaned) return { ok: false, reason: 'craft_filter_rejected' }

  const { data: row, error } = await supabase.from('wake_grab_events').insert({
    user_id: userId,
    detection_source: 'biometric_sleep_end',
    detected_at: new Date().toISOString(),
    audio_text: cleaned,
    bypass_today_until: new Date(Date.now() + 60_000).toISOString(),
    intensity_at_emit: intensity,
  }).select('id').single()
  if (error) return { ok: false, reason: 'insert_failed:' + error.message }

  // Bridge to handler_outreach_queue so the existing TTS render pipeline
  // produces an audio_url. The client polls wake_grab_events on open and
  // plays whichever is unplayed within the bypass window.
  const outreachId = await enqueueEgoOutreach(supabase, {
    userId, mechanic: 'wake_grab',
    message: cleaned,
    urgency: 'critical',
    triggerReasonExtra: bio.id,
    expiresInHours: 1,
  })

  if (outreachId && row) {
    // The client cross-references outreach_id by joining on the
    // wake_grab event's created_at window when polling, then plays
    // handler_outreach_queue.audio_url once tts_status='ready'.
    await logEgoAuthority(supabase, {
      userId, mechanic: 'wake_grab', action: 'fired_wake_clip',
      summary: 'wake within 5 min of biometric sleep_end',
      targetTable: 'wake_grab_events', targetId: (row as { id: string }).id,
      payload: { biometric_id: bio.id, outreach_id: outreachId },
    })
  }

  return { ok: true, reason: 'fired', preview: cleaned.slice(0, 160) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  let body: { user_id?: string } = {}
  try { body = await req.json() } catch {}

  const users = body.user_id ? [body.user_id] : await listActiveUsers(supabase, 'wake_grab')
  const results: Array<{ user_id: string; ok: boolean; reason: string; preview?: string }> = []
  for (const userId of users) {
    try {
      const r = await processUser(supabase, userId)
      results.push({ user_id: userId, ...r })
    } catch (e) {
      results.push({ user_id: userId, ok: false, reason: 'throw:' + String(e).slice(0, 80) })
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
