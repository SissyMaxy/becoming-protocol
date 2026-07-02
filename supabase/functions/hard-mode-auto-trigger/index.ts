// hard-mode-auto-trigger — Enforcement Spine v2 calculus (migs 627-630).
//
// GUTTED 2026-07-01: the old inputs are removed PERMANENTLY —
// handler_reply_grades fail rate (graded the machine, not her), strategist
// plan regression keywords, raw slip_log volume, missed-commitment counts
// not chained to surfaced obligations.
//
// Hard Mode now responds to HER dodging surfaced obligations, nothing else.
// The whole calculus lives in SQL (mig 628): pressure_score() over
// enforcement_escalation_events + hard_mode_recompute(). This function is a thin caller
// kept for the existing cron/critical-loop wiring; the 30-min pg_cron
// recompute (mig 628) is the primary driver.

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

  const { data, error } = await supabase.rpc('hard_mode_recompute', {
    p_user: userId,
    p_reason: 'hard_mode_auto_trigger',
  })
  if (error) {
    // Fail closed: a broken calculus never flips Hard Mode. Loud, not silent.
    const { error: logErr } = await supabase.from('mommy_supervisor_log').insert({
      component: 'hard_mode_auto_trigger',
      severity: 'error',
      event_kind: 'recompute_rpc_failed',
      message: `hard_mode_recompute failed: ${error.message}`,
      context_data: { user_id: userId },
    })
    if (logErr) console.error(`[hard-mode-auto-trigger] supervisor log: ${logErr.message}`)
    return new Response(JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ ok: true, result: data }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
