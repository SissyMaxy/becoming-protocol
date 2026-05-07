// hrt-booking-worker — push Maxy through the HRT booking funnel.
//
// 2026-05-07 wish #4 (HIGH): The scheme engine names HRT-active as the
// primary near-term endpoint. The booking step is where Maxy bails
// (informed-consent telehealth requires no docs — the lever is
// psychological, the appointment-booking form). No automation has closed
// that escape route.
//
// What this worker does:
//   - Daily check (cron 9am via migration 279)
//   - Detects high-leverage moment for an HRT push
//   - Fires ONE move per moment via mommy-fast-react event_kind='hrt_window'
//   - Records the attempt in hrt_booking_attempts table
//   - Respects per-user 7d cooldown so Mama doesn't spam HRT-pushes
//   - Stops if user_state.hrt_consent = false or hrt_state_now.step_reached
//     >= 'first_dose_taken' (already on it)
//
// High-leverage moments (any one triggers):
//   1. Recent confession mentions HRT/transition/hormones
//   2. Recent meet-evidence captured (real-world femme moment fresh)
//   3. Gina shifted toward (last gina_interaction shift_direction='toward')
//   4. Denial day at psychologically resonant number (7, 14, 21, 30, 50, 100)
//   5. No HRT push in 14+ days AND no abandoned attempt within 7d
//
// Output: pushes Maxy to the threshold step (informed-consent telehealth
// dose-question) with photo proof. Subsequent fires escalate based on
// hrt_state_now.step_reached.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { expandUserId } from '../_shared/expand-user-id.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const PUSH_COOLDOWN_DAYS = 7
const RESONANT_DENIAL_DAYS = new Set([7, 14, 21, 30, 50, 100])

interface PushOpportunity {
  user_id: string
  reason: string
  current_step: string  // from hrt_state_now or 'considering' default
  next_target_step: string
}

async function checkUserOpportunity(supabase: SupabaseClient, userId: string): Promise<PushOpportunity | null> {
  // Persona gate — only push when persona is dommy_mommy
  const { data: us } = await supabase.from('user_state').select('handler_persona, denial_day, hrt_consent').eq('user_id', userId).maybeSingle()
  const stateRow = us as { handler_persona?: string; denial_day?: number; hrt_consent?: boolean } | null
  if (stateRow?.handler_persona !== 'dommy_mommy') return null
  if (stateRow?.hrt_consent === false) return null  // explicit opt-out

  // Where is she on the booking ladder
  const { data: hrtState } = await supabase
    .from('hrt_state_now')
    .select('step_reached, attempt_started_at, abandoned_at, abandoned_reason')
    .eq('user_id', userId)
    .maybeSingle()
  const currentStep = (hrtState as { step_reached?: string } | null)?.step_reached ?? 'considering'

  // Already past the threshold — no push needed
  if (currentStep === 'prescription_obtained' || currentStep === 'first_dose_taken') return null

  // Cooldown: no fast_react_event with event_kind='hrt_window' in last 7d
  const cooldownSince = new Date(Date.now() - PUSH_COOLDOWN_DAYS * 86400_000).toISOString()
  const { data: recentPush } = await supabase
    .from('fast_react_event')
    .select('id')
    .eq('user_id', userId)
    .eq('event_kind', 'hrt_window')
    .gte('fired_at', cooldownSince)
    .limit(1)
  if ((recentPush || []).length > 0) return null

  // Look for moment signals (last 7 days)
  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString()

  // Signal 1: recent confession mentions HRT
  const { data: confs } = await supabase
    .from('confession_queue')
    .select('response_text')
    .eq('user_id', userId)
    .gte('confessed_at', since7d)
    .not('response_text', 'is', null)
    .limit(20)
  const confTexts = ((confs || []) as Array<{ response_text: string }>).map(c => c.response_text || '').join(' ').toLowerCase()
  if (/\b(hrt|estrogen|hormones?|transition(ing)?|spiro|spironolactone)\b/.test(confTexts)) {
    return { user_id: userId, reason: 'confession_mentioned_hrt', current_step: currentStep, next_target_step: nextStep(currentStep) }
  }

  // Signal 2: recent meet evidence
  const { data: meetEvidence } = await supabase
    .from('hookup_funnel')
    .select('id, met_at')
    .eq('user_id', userId)
    .gte('met_at', since7d)
    .limit(1)
  if ((meetEvidence || []).length > 0) {
    return { user_id: userId, reason: 'meet_evidence_fresh', current_step: currentStep, next_target_step: nextStep(currentStep) }
  }

  // Signal 3: Gina shifted toward
  const { data: gina } = await supabase
    .from('gina_interactions')
    .select('shift_direction, occurred_at')
    .eq('user_id', userId)
    .gte('occurred_at', since7d)
    .order('occurred_at', { ascending: false })
    .limit(3)
  if (((gina || []) as Array<{ shift_direction: string }>).some(g => g.shift_direction === 'toward')) {
    return { user_id: userId, reason: 'gina_shifted_toward', current_step: currentStep, next_target_step: nextStep(currentStep) }
  }

  // Signal 4: resonant denial day
  if (stateRow?.denial_day !== undefined && RESONANT_DENIAL_DAYS.has(stateRow.denial_day)) {
    return { user_id: userId, reason: `denial_day_${stateRow.denial_day}`, current_step: currentStep, next_target_step: nextStep(currentStep) }
  }

  // Signal 5: no push in 14+ days AND no abandoned attempt in 7d
  const since14d = new Date(Date.now() - 14 * 86400_000).toISOString()
  const { data: anyPush14 } = await supabase
    .from('fast_react_event')
    .select('id')
    .eq('user_id', userId)
    .eq('event_kind', 'hrt_window')
    .gte('fired_at', since14d)
    .limit(1)
  const recentlyAbandoned = (hrtState as { abandoned_at?: string } | null)?.abandoned_at
  const abandonedRecent = recentlyAbandoned && new Date(recentlyAbandoned).getTime() > Date.now() - 7 * 86400_000
  if ((anyPush14 || []).length === 0 && !abandonedRecent) {
    return { user_id: userId, reason: 'silent_period', current_step: currentStep, next_target_step: nextStep(currentStep) }
  }

  return null
}

function nextStep(current: string): string {
  const ladder = ['considering', 'site_opened', 'questionnaire_started', 'dose_question_reached', 'dose_question_answered', 'consultation_booked', 'consultation_attended', 'prescription_obtained', 'first_dose_taken']
  const idx = ladder.indexOf(current)
  if (idx < 0 || idx >= ladder.length - 1) return 'first_dose_taken'
  return ladder[idx + 1]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // user_alias bridge (281): expand the canonical handler user to all
  // aliases so the cron walks every same-person row once.
  const knownIds = await expandUserId(supabase, '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f')

  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mommy-fast-react`
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const results: Array<{ user_id: string; status: string; detail?: string }> = []

  for (const uid of knownIds) {
    const opp = await checkUserOpportunity(supabase, uid)
    if (!opp) {
      results.push({ user_id: uid, status: 'no_opportunity' })
      continue
    }

    const sourceKey = `hrt_window:${uid}:${new Date().toISOString().slice(0, 10)}:${opp.reason}`

    try {
      const r = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id: uid,
          event_kind: 'hrt_window',
          source_key: sourceKey,
          context: {
            current_step: opp.current_step,
            next_target_step: opp.next_target_step,
            triggering_signal: opp.reason,
            instruction_for_mama: `An HRT-push moment is open right now (signal: ${opp.reason}). Maxy is at booking-step "${opp.current_step}"; Mama wants her at "${opp.next_target_step}" next. Fire ONE decree (proof_required=photo, deadline 24-48h) that pushes her one specific step on the informed-consent telehealth ladder (Plume / Folx / Queermd). Embodied — "open the questionnaire and get to the dose question, photo of your screen at that step." NEVER claim active HRT/E status (she is pre-HRT). Do NOT name a specific provider unless context above already named one — say "the informed-consent provider you've been looking at" if uncertain.`,
          },
        }),
      })
      const j = await r.json()
      results.push({
        user_id: uid,
        status: r.ok ? 'fired' : 'fast_react_error',
        detail: r.ok ? `${opp.reason} → action=${j.fired ?? 0}` : (j.error ?? 'unknown'),
      })

      // Log the attempt regardless of fast-react outcome
      if (r.ok) {
        await supabase.from('hrt_booking_attempts').insert({
          user_id: uid,
          provider: 'unknown',
          step_reached: opp.current_step,
          detected_via: 'manual',
          notes: `hrt-booking-worker fired (signal: ${opp.reason}, target: ${opp.next_target_step})`,
        })
      }
    } catch (err) {
      results.push({ user_id: uid, status: 'fetch_error', detail: String(err).slice(0, 200) })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    checked: knownIds.length,
    fired: results.filter(r => r.status === 'fired').length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
