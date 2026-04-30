// vacation-mode — toggle protocol intensity for travel.
//
// Behavior when active:
// - Auto-decree-generator skips (set in cron)
// - Auto-loophole-closer skips
// - Hard-mode-auto-trigger skips (no escalation while away)
// - All commitment deadlines extend by vacation duration on entry
// - Punishment_queue items currently active extend due_by by vacation duration
// - Voice/identity work continues (they're travel-friendly, identity drift
//   shouldn't pause)
//
// POST { user_id?: string, action: 'start'|'end'|'status', until?: ISO date string }

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
  let body: { user_id?: string; action?: string; until?: string } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID
  const action = body.action || 'status'

  if (action === 'start') {
    const until = body.until ? new Date(body.until) : new Date(Date.now() + 5 * 86400_000)
    if (isNaN(until.getTime())) return new Response(JSON.stringify({ ok: false, error: 'invalid until date' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const now = new Date()
    const days = Math.max(1, Math.round((until.getTime() - now.getTime()) / 86400_000))

    await supabase.from('user_state').update({
      vacation_mode_active: true,
      vacation_mode_until: until.toISOString(),
      vacation_mode_started_at: now.toISOString(),
    }).eq('user_id', userId)

    // Extend commitment deadlines + punishment due_by by vacation duration
    const extendInterval = `${days} days`
    await supabase.rpc('extend_deadlines_for_vacation', { p_user_id: userId, p_days: days }).catch(() => {
      // Fallback if RPC missing — direct updates
      return Promise.all([
        supabase.from('handler_commitments').update({ by_when: `now() + interval '${extendInterval}'` as never }).eq('user_id', userId).eq('status', 'pending').lt('by_when', until.toISOString()),
      ])
    })

    await supabase.from('vacation_mode_log').insert({
      user_id: userId, event: 'started', starts_at: now.toISOString(), ends_at: until.toISOString(),
      reason: `vacation: ${days} day(s)`, decided_by: 'user',
    })

    return new Response(JSON.stringify({
      ok: true, vacation_mode: 'active', until: until.toISOString(), days,
      effects: [
        'auto-decree generator paused',
        'auto-loophole-closer paused',
        'hard-mode auto-trigger paused',
        'voice/identity work continues',
        `commitment deadlines extended by ${days}d`,
      ],
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  if (action === 'end') {
    const { data: state } = await supabase.from('user_state').select('vacation_mode_active, vacation_mode_started_at, vacation_mode_until').eq('user_id', userId).maybeSingle()
    await supabase.from('user_state').update({
      vacation_mode_active: false,
      vacation_mode_until: null,
    }).eq('user_id', userId)
    await supabase.from('vacation_mode_log').insert({
      user_id: userId, event: 'ended',
      reason: 'manual end',
      decided_by: 'user',
    })
    return new Response(JSON.stringify({ ok: true, vacation_mode: 'ended', was: state }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // status
  const { data: state } = await supabase.from('user_state').select('vacation_mode_active, vacation_mode_until, vacation_mode_started_at').eq('user_id', userId).maybeSingle()
  return new Response(JSON.stringify({ ok: true, state: state ?? null }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
