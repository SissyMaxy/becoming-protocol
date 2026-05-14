// ego-mirror-scheduler — Mechanic 5 (server-side scheduling).
//
// Daily 02:00 UTC: for each active user, schedule tomorrow's mirror
// session with phase-gated duration (phase 1: 120s, phase 3: 300s,
// phase 5+: 900s) and a Mommy narrative the client plays during the
// session. UI handles the front-cam preview and dwell timing.
//
// HARD FLOORS:
//   - Skip if already scheduled for tomorrow.
//   - is_safeword_active short-circuits.
//   - Audio narration is in-fantasy possessive — but the session itself
//     is paused if user types safeword in the session check-in.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  EGO_CRAFT_INSTRUCTION,
  applyCraftFilter,
  listActiveUsers,
  logEgoAuthority,
  mechanicIntensity,
  pullVoiceSamples,
  corsHeaders,
} from '../_shared/ego-deconstruction.ts'

function durationForPhase(phase: number): number {
  if (phase >= 5) return 900
  if (phase >= 3) return 300
  if (phase >= 1) return 120
  return 60
}

async function userPhase(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase.from('user_state').select('current_phase').eq('user_id', userId).maybeSingle()
  return Number((data as { current_phase?: number } | null)?.current_phase ?? 1)
}

async function alreadyScheduled(supabase: SupabaseClient, userId: string, day: Date): Promise<boolean> {
  const start = new Date(day); start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 1)
  const { count } = await supabase
    .from('mirror_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('scheduled_for', start.toISOString())
    .lt('scheduled_for', end.toISOString())
  return (count ?? 0) > 0
}

const SYS = `You are Mama, the dommy-mommy. Your girl is sitting in front of a mirror right now, looking at her own face for [DURATION] seconds. Write the narration she'll hear during that time.

The narration:
- Starts with grounding, soft, present.
- Names what Mama sees in her face — soft cheeks, the way her mouth sits, the shape becoming.
- Stays possessive — Mama is reading her face, claiming what she sees.
- Closes with permission to release, and one line about what Mama wants her to remember.

Length should match duration: 2 min ≈ 110 words; 5 min ≈ 280 words; 15 min ≈ 800 words.

Output only the narration prose. No headers. Speak.

${EGO_CRAFT_INSTRUCTION}`

async function processUser(supabase: SupabaseClient, userId: string): Promise<{ ok: boolean; reason: string; preview?: string }> {
  const tomorrow = new Date(Date.now() + 86400_000)
  const scheduledFor = new Date(tomorrow); scheduledFor.setUTCHours(20, 0, 0, 0)

  if (await alreadyScheduled(supabase, userId, tomorrow)) return { ok: false, reason: 'already_scheduled' }

  const phase = await userPhase(supabase, userId)
  const duration = durationForPhase(phase)
  const intensity = await mechanicIntensity(supabase, userId, 'mirror_session')
  const voiceSamples = await pullVoiceSamples(supabase, 3)

  const userPrompt = `INTENSITY: ${intensity}/5
PHASE: ${phase}
DURATION: ${duration} seconds (${Math.round(duration / 60)} min)

HER VOICE (samples):
${voiceSamples.map(v => `- ${v}`).join('\n') || '(none)'}

Write the mirror narration.`

  const choice = selectModel('reframe_draft')
  const { text } = await callModel(choice, { system: SYS.replace('[DURATION]', String(duration)), user: userPrompt, max_tokens: 1500, temperature: 0.6 })
  const cleaned = applyCraftFilter(text.trim())
  if (!cleaned) return { ok: false, reason: 'craft_filter_rejected' }

  const checkInText = 'how do you feel right now, sweet thing — one word'

  const { data: row, error } = await supabase.from('mirror_sessions').insert({
    user_id: userId,
    scheduled_for: scheduledFor.toISOString(),
    duration_seconds: duration,
    phase_at_schedule: phase,
    mommy_audio_text: cleaned,
    post_session_state_check_text: checkInText,
    intensity_at_emit: intensity,
  }).select('id').single()
  if (error) return { ok: false, reason: 'insert_failed:' + error.message }

  await logEgoAuthority(supabase, {
    userId, mechanic: 'mirror_session', action: 'scheduled_session',
    summary: `${duration}s mirror session at ${scheduledFor.toISOString()}`,
    targetTable: 'mirror_sessions', targetId: (row as { id: string }).id,
    payload: { phase, duration_seconds: duration },
  })

  return { ok: true, reason: 'scheduled', preview: cleaned.slice(0, 160) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  let body: { user_id?: string } = {}
  try { body = await req.json() } catch {}

  const users = body.user_id ? [body.user_id] : await listActiveUsers(supabase, 'mirror_session')
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
