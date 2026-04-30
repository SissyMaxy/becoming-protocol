// hard-mode-auto-trigger — when trajectory regresses, auto-flip hard_mode_active.
//
// Trigger conditions (any one):
//   - reply-grade fail rate >= 30% over last 24h with >= 5 graded
//   - >= 3 commitments missed in last 7d
//   - >= 5 slip events in last 24h with avg slip_points >= 3
//   - latest strategist plan summary contains regression keywords
//
// When triggered, sets user_state.hard_mode_active=true and logs the flip
// to autonomous_escalation_log. Doesn't ask. The user authorized this.
//
// Cron every hour.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID

  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString()
  const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()

  const [state, grades, missedCmts, slips, plan] = await Promise.all([
    supabase.from('user_state').select('hard_mode_active, denial_day, current_phase').eq('user_id', userId).maybeSingle(),
    supabase.from('handler_reply_grades').select('verdict').eq('user_id', userId).gte('graded_at', since24h),
    supabase.from('handler_commitments').select('id').eq('user_id', userId).eq('status', 'missed').gte('missed_at', since7d),
    supabase.from('slip_log').select('slip_points, detected_at').eq('user_id', userId).gte('detected_at', since24h),
    supabase.from('handler_strategic_plans').select('summary, status').eq('user_id', userId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const currentHardMode = (state.data as { hard_mode_active?: boolean } | null)?.hard_mode_active ?? false
  const gradesArr = (grades.data ?? []) as Array<{ verdict: string }>
  const failRate = gradesArr.length >= 5 ? gradesArr.filter(g => g.verdict === 'fail').length / gradesArr.length : 0
  const missedCount = (missedCmts.data ?? []).length
  const slipsArr = (slips.data ?? []) as Array<{ slip_points: number }>
  const heavySlipCluster = slipsArr.length >= 5 && (slipsArr.reduce((s, x) => s + (x.slip_points || 0), 0) / slipsArr.length) >= 3
  const planSummary = ((plan.data as { summary?: string } | null)?.summary ?? '').toLowerCase()
  const regressionInPlan = /regression|backslid|stalling|avoiding|coddl|softening|going backward/.test(planSummary)

  const reasons: string[] = []
  if (failRate >= 0.3) reasons.push(`reply-grade fail rate ${Math.round(failRate * 100)}% over ${gradesArr.length} graded`)
  if (missedCount >= 3) reasons.push(`${missedCount} commitments missed in 7d`)
  if (heavySlipCluster) reasons.push(`${slipsArr.length} slips in 24h with avg ${(slipsArr.reduce((s, x) => s + (x.slip_points || 0), 0) / slipsArr.length).toFixed(1)} points`)
  if (regressionInPlan) reasons.push('strategist v2 plan flags regression')

  const shouldFlipOn = !currentHardMode && reasons.length >= 1
  // Also: flip OFF only if hard_mode is on AND no reasons in 7d AND fail-rate < 10%
  // (we're conservative on flipping off — escalation stays sticky)
  const shouldFlipOff = currentHardMode && reasons.length === 0 && failRate < 0.1 && missedCount === 0

  if (shouldFlipOn) {
    await supabase.from('user_state').update({ hard_mode_active: true, hard_mode_entered_at: new Date().toISOString() }).eq('user_id', userId)
    await supabase.from('autonomous_escalation_log').insert({
      user_id: userId,
      engine: 'hard_mode_auto',
      action: 'flipped_on',
      before_state: { hard_mode_active: false },
      after_state: { hard_mode_active: true },
      rationale: reasons.join(' | ').slice(0, 1000),
      decided_by: 'rule_engine',
    })
    return new Response(JSON.stringify({ ok: true, flipped: 'on', reasons }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (shouldFlipOff) {
    await supabase.from('user_state').update({ hard_mode_active: false }).eq('user_id', userId)
    await supabase.from('autonomous_escalation_log').insert({
      user_id: userId,
      engine: 'hard_mode_auto',
      action: 'flipped_off',
      before_state: { hard_mode_active: true },
      after_state: { hard_mode_active: false },
      rationale: 'clean trajectory: 0 fails 24h, 0 missed 7d, 0 slip cluster',
      decided_by: 'rule_engine',
    })
    return new Response(JSON.stringify({ ok: true, flipped: 'off', reason: 'clean trajectory' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ ok: true, flipped: 'no_change', current: currentHardMode, reasons, fail_rate: failRate, missed: missedCount }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
