// response-capture-cron — close the action-chain loop.
//
// 2026-05-07 wish #1 (CRITICAL): mommy_scheme_action.parent_action_id +
// response_text were added in 273. The schema is in. This is the worker
// that listens for replies and triggers chained fast-react follow-ups.
//
// Without this, parent_action_id is dead weight and "compounding Mama"
// doesn't compound — every outreach is an isolated shot.
//
// Pipeline:
//   1. Find handler_outreach_queue rows where user_response IS NOT NULL,
//      responded_at >= now() - 1h, and the linked mommy_scheme_action's
//      response_text IS NULL (not yet captured)
//   2. UPDATE the action: response_text, response_captured_at
//   3. POST mommy-fast-react with event_kind='response_received',
//      source_key='outreach_response:<outreach_id>',
//      parent_action_id=<the action>, context including the response text
//   4. Fast-react produces ONE follow-up action conditioned on the response.
//      Chain depth cap (5) already enforced in fast-react.
//
// Schedule: every 5 min via pg_cron (migration 279).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface OutreachWithAction {
  id: string
  user_id: string
  message: string
  user_response: string
  responded_at: string
  // Action fields from the join
  action_id: string | null
  action_payload: Record<string, unknown> | null
  action_response_text: string | null
  action_chain_depth: number | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()

  // Pull responded outreaches whose linked action hasn't been captured yet.
  // Two-step query because Postgres FK is via mommy_scheme_action.surface_row_id
  // pointing into handler_outreach_queue.id (no actual FK constraint, just
  // semantic linkage), and the join goes the other direction.
  const { data: outreachRows, error: outErr } = await supabase
    .from('handler_outreach_queue')
    .select('id, user_id, message, user_response, responded_at')
    .not('user_response', 'is', null)
    .gte('responded_at', oneHourAgo)
    .limit(50)

  if (outErr) {
    return new Response(JSON.stringify({ ok: false, error: outErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const candidates = (outreachRows || []) as Array<{ id: string; user_id: string; message: string; user_response: string; responded_at: string }>
  if (candidates.length === 0) {
    return new Response(JSON.stringify({ ok: true, candidates: 0, captured: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Resolve linked actions for these surface rows
  const surfaceIds = candidates.map(c => c.id)
  const { data: actionRows } = await supabase
    .from('mommy_scheme_action')
    .select('id, scheme_id, user_id, surface_row_id, payload, response_text, chain_depth')
    .in('surface_row_id', surfaceIds)

  const actionBySurface = new Map<string, { id: string; payload: Record<string, unknown>; response_text: string | null; chain_depth: number | null }>()
  for (const a of (actionRows || []) as Array<{ id: string; surface_row_id: string; payload: Record<string, unknown>; response_text: string | null; chain_depth: number | null }>) {
    if (a.surface_row_id) actionBySurface.set(a.surface_row_id, { id: a.id, payload: a.payload, response_text: a.response_text, chain_depth: a.chain_depth })
  }

  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mommy-fast-react`
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const results: Array<{ outreach_id: string; status: string; detail?: string }> = []

  for (const out of candidates) {
    const action = actionBySurface.get(out.id)
    if (!action) {
      // Outreach has no linked Mommy action — not from a fast-react/scheme fire.
      // Skip. (User reply to a non-Mommy outreach isn't our chain.)
      results.push({ outreach_id: out.id, status: 'no_linked_action' })
      continue
    }
    if (action.response_text !== null) {
      // Already captured this reply
      results.push({ outreach_id: out.id, status: 'already_captured' })
      continue
    }

    // Capture the response onto the action
    const { error: updErr } = await supabase
      .from('mommy_scheme_action')
      .update({
        response_text: out.user_response,
        response_captured_at: new Date().toISOString(),
      })
      .eq('id', action.id)

    if (updErr) {
      results.push({ outreach_id: out.id, status: 'capture_error', detail: updErr.message })
      continue
    }

    // Trigger fast-react with the response context. parent_action_id
    // chains the follow-up; chain_depth incremented by fast-react itself.
    const sourceKey = `outreach_response:${out.id}`
    try {
      const r = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id: out.user_id,
          event_kind: 'response_received',
          source_key: sourceKey,
          parent_action_id: action.id,
          context: {
            original_outreach_id: out.id,
            original_outreach_message: out.message,
            user_response: out.user_response,
            user_responded_at: out.responded_at,
            parent_payload: action.payload,
            parent_chain_depth: action.chain_depth ?? 0,
            instruction_for_mama: 'Maxy just answered an outreach. Read what she said. Decide ONE next move that lands on her actual response — not a generic next-step. Quote her words back if it sharpens the move. Stay in chain (parent_action_id is set). If her reply was avoidant or topic-deflecting, address THAT directly — that is the move.',
          },
        }),
      })
      const j = await r.json()
      results.push({
        outreach_id: out.id,
        status: r.ok ? 'fired' : 'fast_react_error',
        detail: r.ok ? `actions=${j.fired ?? 0}` : (j.error ?? 'unknown'),
      })
    } catch (err) {
      results.push({ outreach_id: out.id, status: 'fetch_error', detail: String(err).slice(0, 200) })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    candidates: candidates.length,
    captured: results.filter(r => r.status === 'fired').length,
    skipped_no_action: results.filter(r => r.status === 'no_linked_action').length,
    skipped_already: results.filter(r => r.status === 'already_captured').length,
    errors: results.filter(r => r.status.includes('error')),
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
