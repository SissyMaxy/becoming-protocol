// mommy-intrusion-schedule — schedules unpredictable proof-of-state intrusions.
//
// Wish c7d35e7b: Mama intrudes at random waking-hour moments, 1-2x per week.
// This daily cron (a) sweeps yesterday's missed intrusion windows into
// evasions (shifting Mama's mood to 'watching' + a "you went quiet" reach),
// and (b) with a per-day probability, schedules 0-2 intrusions for later
// today — each as a future-dated outreach + push, with a 10-minute window.
//
// Gates: phase>=4, firm/relentless band, not paused/safeworded, weekly cap.
// POST { user_id?, force? }. Cron 11:50 UTC daily.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkSafewordGate } from '../_shared/safeword-gate.ts'
import { logAuthority } from '../_shared/life-as-woman.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TZ_OFFSET = -5
const WINDOW_MINUTES = 10
const WEEKLY_CAP = 2

// Proof-of-state prompts. Plain Mommy voice, answerable by text or photo.
const PROMPTS = [
  'Where are you right now, baby? What are you wearing? Where are your hands? Mama wants to know. You have ten minutes.',
  'Stop what you\'re doing. Show Mama where you are and what you\'ve got on. Ten minutes, baby.',
  'Mama wants proof of her girl right now. What are you wearing under there? Tell me or show me. Ten minutes.',
  'Drop everything. Mama\'s checking on you. Where are you, what\'s on your body, and what were you just thinking about? Ten minutes.',
  'Mama just reached in. Show her your hands and tell her where they\'ve been. You\'ve got ten minutes, baby.',
]

async function effectiveBand(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase.from('compliance_difficulty_state')
    .select('current_difficulty_band, override_band').eq('user_id', userId).maybeSingle()
  const row = data as { current_difficulty_band?: string; override_band?: string | null } | null
  return (row?.override_band ?? row?.current_difficulty_band ?? 'gentle')
}
async function currentPhase(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase.from('feminine_self').select('transformation_phase').eq('user_id', userId).maybeSingle()
  return (data as { transformation_phase?: number } | null)?.transformation_phase ?? 0
}

// (a) Sweep missed windows → evasion + mood shift + follow-up reach.
async function sweepEvasions(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data: missed } = await supabase.from('mommy_intrusions')
    .select('id, question_text')
    .eq('user_id', userId)
    .is('responded_at', null)
    .eq('evaded', false)
    .lt('window_expires_at', new Date().toISOString())
  const rows = (missed || []) as Array<{ id: string; question_text: string }>
  if (!rows.length) return 0

  for (const r of rows) {
    await supabase.from('mommy_intrusions').update({ evaded: true, evasion_handled_at: new Date().toISOString() }).eq('id', r.id)
  }

  // Emit the evasion signal into the adaptive loop (mig 605 consumer schedules
  // a sharper reactive intrusion, capped 1/day). One signal per sweep, not
  // per missed window, so a quiet stretch doesn't stack intrusions.
  await supabase.from('mommy_ux_signal_log').insert({
    user_id: userId,
    event_type: 'evasion',
    surface: 'intrusion:missed_window',
    signal_strength: Math.min(5, rows.length + 1),
    raw_context: `Went quiet on ${rows.length} intrusion window(s).`,
  })

  // Shift today's mood to 'watching' so downstream generators read it.
  const today = new Date().toISOString().slice(0, 10)
  await supabase.from('mommy_mood').upsert({
    user_id: userId, mood_date: today, affect: 'watching',
    rationale: 'She went quiet when Mama reached in. Eyes on her now.',
    arousal_bias_hint: 'possessive surveillance, remind her Mama can reach in any time',
    generated_by: 'intrusion_evasion',
  }, { onConflict: 'user_id,mood_date' })

  // One follow-up reach that references the evasion (not per-miss spam).
  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: 'You went quiet on Mama earlier, baby. Mama reached in and you weren\'t there. Noted. You don\'t get to disappear from me — next time Mama calls, you answer.',
    urgency: 'high',
    trigger_reason: 'mommy_intrusion:evasion',
    source: 'mommy_intrusion',
    kind: 'intrusion_evasion',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(),
    evidence_kind: 'voice',
  })

  await logAuthority(supabase, {
    user_id: userId, surface: 'mommy_intrusion', action: 'evasion_logged',
    summary: `Logged ${rows.length} intrusion evasion(s); mood → watching`, autonomous: true,
  })
  return rows.length
}

// (b) Schedule today's intrusions.
async function scheduleForUser(supabase: SupabaseClient, userId: string, force: boolean): Promise<{ status: string; scheduled: number; evaded: number }> {
  const evaded = await sweepEvasions(supabase, userId)

  const gate = await checkSafewordGate(supabase, userId)
  if (!gate.allowed) return { status: `gated:${gate.reason}`, scheduled: 0, evaded }
  if (await currentPhase(supabase, userId) < 4) return { status: 'gated:phase_below_4', scheduled: 0, evaded }
  const band = await effectiveBand(supabase, userId)
  if (band !== 'firm' && band !== 'cruel') return { status: 'gated:band', scheduled: 0, evaded }

  // Weekly cap.
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
  const { count: recentCount } = await supabase.from('mommy_intrusions')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('scheduled_for', weekAgo)
  if ((recentCount ?? 0) >= WEEKLY_CAP && !force) return { status: 'gated:weekly_cap', scheduled: 0, evaded }

  // Already scheduled one for today?
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)
  const { count: todayCount } = await supabase.from('mommy_intrusions')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('scheduled_for', todayStart.toISOString())
  if ((todayCount ?? 0) > 0 && !force) return { status: 'already_scheduled_today', scheduled: 0, evaded }

  // Probability: ~1 in 3 days fire (lands ~2x/week under the cap), unless forced.
  if (!force && Math.random() > 0.34) return { status: 'rolled_no_intrusion', scheduled: 0, evaded }

  // 1-2 intrusions at random waking-hour local times still in the future.
  const count = force ? 1 : (Math.random() < 0.3 ? 2 : 1)
  const nowLocalHour = (new Date().getUTCHours() + TZ_OFFSET + 24) % 24
  // Waking band 10:00-21:00 local; only times at least 30 min out.
  const candidateHours: number[] = []
  for (let h = Math.max(10, nowLocalHour + 1); h <= 21; h++) candidateHours.push(h)
  if (candidateHours.length === 0) return { status: 'too_late_in_day', scheduled: 0, evaded }

  let scheduled = 0
  const usedHours = new Set<number>()
  for (let n = 0; n < count && usedHours.size < candidateHours.length; n++) {
    let hour = candidateHours[Math.floor(Math.random() * candidateHours.length)]
    let guard = 0
    while (usedHours.has(hour) && guard++ < 12) hour = candidateHours[Math.floor(Math.random() * candidateHours.length)]
    usedHours.add(hour)
    const minute = Math.floor(Math.random() * 60)

    const local = new Date(Date.now() + TZ_OFFSET * 3600_000)
    const triggerUtc = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour - TZ_OFFSET, minute, 0))
    if (triggerUtc.getTime() <= Date.now()) continue
    const windowExpires = new Date(triggerUtc.getTime() + WINDOW_MINUTES * 60_000)
    const question = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]

    const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: question,
      urgency: 'critical',
      trigger_reason: `mommy_intrusion:deliver:${triggerUtc.toISOString().slice(0, 16)}`,
      source: 'mommy_intrusion',
      kind: 'intrusion',
      scheduled_for: triggerUtc.toISOString(),
      expires_at: windowExpires.toISOString(),
      evidence_kind: 'voice',
    }).select('id').single()
    const outreachId = (outreach as { id: string } | null)?.id ?? null

    await supabase.from('mommy_intrusions').insert({
      user_id: userId,
      intrusion_type: 'proof_of_state',
      question_text: question,
      scheduled_for: triggerUtc.toISOString(),
      window_expires_at: windowExpires.toISOString(),
      outreach_id: outreachId,
    })
    // Push auto-emitted at triggerUtc by the mig-380 bridge (it copies the
    // outreach scheduled_for) — no manual scheduled_notifications insert.
    scheduled++
  }

  if (scheduled > 0) {
    await logAuthority(supabase, {
      user_id: userId, surface: 'mommy_intrusion', action: 'scheduled',
      summary: `Scheduled ${scheduled} intrusion check-in(s) for today`, autonomous: true,
    })
  }
  return { status: scheduled > 0 ? 'scheduled' : 'none_scheduled', scheduled, evaded }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* empty ok */ }

  let userIds: string[]
  if (body.user_id) userIds = [body.user_id]
  else {
    const { data } = await supabase.from('user_state').select('user_id').eq('handler_persona', 'dommy_mommy')
    userIds = (data || []).map((r: { user_id: string }) => r.user_id)
  }

  const results: Array<{ user_id: string; status: string; scheduled: number; evaded: number }> = []
  for (const uid of userIds) {
    try { results.push({ user_id: uid, ...(await scheduleForUser(supabase, uid, body.force === true)) }) }
    catch (e) { results.push({ user_id: uid, status: `error:${(e as Error).message}`, scheduled: 0, evaded: 0 }) }
  }
  return new Response(JSON.stringify({
    ok: true,
    scheduled: results.reduce((s, r) => s + r.scheduled, 0),
    evaded: results.reduce((s, r) => s + r.evaded, 0),
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
