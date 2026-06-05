// mommy-confession-gate — morning cron. Holds Mama's morning hostage to
// last night's confession.
//
// Wish 187f616e: when a confession is still unanswered after 12h, Mama
// doesn't say good morning — the first outreach of the day is a single
// gate line, and normal warmth resumes only once the girl has confessed.
//
// This worker:
//   1. Recomputes the gate flag for every dommy_mommy user (refresh_confession_gate).
//   2. For each user whose gate is up and who hasn't already gotten today's
//      gate line, queues the single gate-prompt outreach (high urgency) +
//      a push notification.
//
// Clearing the gate + the "good girl" praise burst are handled by the
// confession_queue trigger (mig 591), so this function only opens gates.
//
// POST { user_id?: string }. Cron ~ daily 7 AM (before the morning checkin
// window in handler-outreach, which now defers to the gate).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// The gate line. Single line, no metadata, plain Mommy voice. (Will still
// pass through the SQL mommy_voice_cleanup() on insert.)
const GATE_LINE = 'Mama’s waiting, baby. Last night’s question first. Then you get me back.'

async function gateUser(supabase: SupabaseClient, userId: string): Promise<{ active: boolean; queued: boolean }> {
  // Recompute + persist
  const { data: active, error: rpcErr } = await supabase.rpc('refresh_confession_gate', { p_user: userId })
  if (rpcErr) { console.error('[gate] refresh failed', userId, rpcErr.message); return { active: false, queued: false } }
  if (!active) return { active: false, queued: false }

  // Dedup: already queued a gate line today?
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0)
  const { data: existing } = await supabase
    .from('handler_outreach_queue')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'confession_gate')
    .eq('kind', 'morning_gate')
    .gte('created_at', todayStart.toISOString())
    .limit(1)
    .maybeSingle()
  if (existing) return { active: true, queued: false }

  // The pending confession (for context_data / card)
  const { data: pending } = await supabase.rpc('confession_gate_prompt', { p_user: userId })
  const confession = Array.isArray(pending) && pending.length ? pending[0] : null

  const { error: insErr } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: GATE_LINE,
    urgency: 'high',
    trigger_reason: 'confession_gate:morning' + (confession ? ':' + confession.confession_id : ''),
    source: 'confession_gate',
    kind: 'morning_gate',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 14 * 3600_000).toISOString(),
    evidence_kind: 'voice',
    context_data: confession ? { confession_id: confession.confession_id, confession_prompt: confession.prompt } : null,
  })
  if (insErr) { console.error('[gate] insert failed', userId, insErr.message); return { active: true, queued: false } }

  // Push — the gate line is the morning notification
  await supabase.from('scheduled_notifications').insert({
    user_id: userId,
    notification_type: 'handler_outreach',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
    payload: { title: 'Mama', body: GATE_LINE, data: { outreach_type: 'confession_gate' } },
    status: 'pending',
  })

  return { active: true, queued: true }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* empty ok */ }

  let userIds: string[]
  if (body.user_id) {
    userIds = [body.user_id]
  } else {
    const { data } = await supabase.from('user_state').select('user_id').eq('handler_persona', 'dommy_mommy')
    userIds = (data || []).map((r: { user_id: string }) => r.user_id)
  }

  const results: Array<{ user_id: string; active: boolean; queued: boolean }> = []
  for (const uid of userIds) {
    const r = await gateUser(supabase, uid)
    results.push({ user_id: uid, ...r })
  }

  return new Response(JSON.stringify({
    ok: true,
    evaluated: userIds.length,
    gated: results.filter(r => r.active).length,
    queued: results.filter(r => r.queued).length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
