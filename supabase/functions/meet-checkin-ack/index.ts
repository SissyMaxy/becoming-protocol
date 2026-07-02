// meet-checkin-ack — the user answers a meet safety check-in.
//
// POST { checkin_id, response: 'ok' | 'extend' | 'help' | 'duress', text? }
//   ok     — checked in; cancels pending escalation; home_safe completes plan
//   extend — home_safe +1h (max 3)
//   help   — "get me out": instant stage 3
//   duress — instant stage 3 with NO visible state change; the API response
//            and every user-facing read look exactly like a normal check-in.
//   text   — optional free text; if it matches the plan's duress word the
//            response is treated as duress regardless of the tapped button.
//
// Auth: the caller's JWT (getUser) — the user acks their own check-ins.
// The one-tap lock-screen path doesn't come here at all: the watcher's pushes
// are kind='meet_checkin' plain actions whose "Mark done" hits
// /api/outreach/complete, and the mig 626 trigger converts that completed_at
// stamp into ack_meet_checkin(..., 'ok', 'push_action'). This function is the
// in-app surface where richer responses (extend/help/duress) live.
//
// All state logic lives in the SQL fn ack_meet_checkin (single source).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Authenticate the caller.
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json(401, { error: 'not authenticated' })
  const { data: userData, error: authErr } = await service.auth.getUser(jwt)
  if (authErr || !userData?.user) return json(401, { error: 'not authenticated' })
  const userId = userData.user.id

  let body: { checkin_id?: string; response?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid json body' })
  }
  const checkinId = body.checkin_id
  let response = (body.response ?? '').trim()
  const text = (body.text ?? '').trim()
  if (!checkinId) return json(400, { error: 'checkin_id required' })

  // Ownership + duress-word check.
  const { data: checkin, error: cErr } = await service
    .from('meet_checkins')
    .select('id, user_id, plan_id')
    .eq('id', checkinId)
    .maybeSingle()
  if (cErr) return json(500, { error: cErr.message })
  if (!checkin || checkin.user_id !== userId) return json(404, { error: 'check-in not found' })

  if (text) {
    const { data: plan, error: pErr } = await service
      .from('meet_safety_plans')
      .select('duress_word')
      .eq('id', checkin.plan_id)
      .maybeSingle()
    if (pErr) return json(500, { error: pErr.message })
    const duressWord = (plan?.duress_word ?? '').trim().toLowerCase()
    if (duressWord && text.toLowerCase().includes(duressWord)) {
      response = 'duress'
    }
  }
  if (!response) response = 'ok'
  if (!['ok', 'extend', 'help', 'duress'].includes(response)) {
    return json(400, { error: 'response must be one of ok, extend, help, duress' })
  }

  const { data: result, error: ackErr } = await service.rpc('ack_meet_checkin', {
    p_checkin: checkinId,
    p_response: response,
    p_via: 'app',
  })
  if (ackErr) return json(400, { error: ackErr.message })

  if (response === 'duress' || response === 'ok') {
    // Identical body for ok and duress — a duress ack must be byte-for-byte
    // indistinguishable from a normal check-in to anyone watching the screen
    // or the wire.
    return json(200, { ok: true, checked_in: true })
  }
  return json(200, (result ?? { ok: true }) as Record<string, unknown>)
})
