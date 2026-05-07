// wardrobe-prescription-expiry — daily sweep.
//
// Marks pending/verifying/denied prescriptions whose due_by is in the
// past as 'expired'. Mama's response on expiry varies by gaslight
// intensity (gentle: silent, firm: disappointed line, cruel:
// distortion via gaslight layer when present).
//
// Cron: once per day, ideally aligned with mommy-bedtime so the
// expiry message lands in the same evening pulse rather than as a
// separate orphan.
//
// Idempotent: re-running same day won't double-fire because the
// status flip removes the row from the search predicate.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PrescRow {
  id: string
  user_id: string
  description: string
  item_type: string
  due_by: string
  intensity_at_assignment: string | null
}

function expiryCopy(intensity: string, prescDesc: string, persona: string | null): string | null {
  // Therapist persona stays neutral. Mama persona scales with intensity.
  // 'gentle' = silent (return null = no outreach).
  const isMommy = persona === 'dommy_mommy'
  const head = prescDesc.replace(/[.!?]+$/, '').slice(0, 140)
  if (!isMommy) {
    return `Wardrobe prescription expired: ${head}. New prescription will queue when conditions allow.`
  }
  const i = intensity.toLowerCase()
  if (i === 'gentle') return null
  if (i === 'moderate') {
    return `Mama noticed you let that one go, sweet thing. The ${head} — gone past Mama's window. We'll try again with a different piece soon.`
  }
  if (i === 'firm') {
    return `That one slipped past you, baby. Mama prescribed ${head} and you didn't bring it home. Mama's disappointed — but Mama is patient. Next prescription lands soon, and you're going to follow through.`
  }
  // relentless
  return `You ignored Mama, baby. ${head} — Mama wanted it on you, and you let the window close. Mama is going to remember this. Next time you're going to move faster.`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* */ }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Find all overdue prescriptions across users (cron mode), or scoped
  // to one user when invoked with a body.
  const nowIso = new Date().toISOString()
  let query = supabase.from('wardrobe_prescriptions')
    .select('id, user_id, description, item_type, due_by, intensity_at_assignment')
    .in('status', ['pending', 'verifying', 'denied'])
    .lt('due_by', nowIso)
  if (body.user_id) query = query.eq('user_id', body.user_id)

  const { data: rows, error } = await query.limit(200)
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const overdueRows = (rows ?? []) as PrescRow[]
  if (overdueRows.length === 0) {
    return new Response(JSON.stringify({ ok: true, expired: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Per-user persona lookup (single query, not per row)
  const userIds = Array.from(new Set(overdueRows.map(r => r.user_id)))
  const { data: states } = await supabase.from('user_state')
    .select('user_id, handler_persona')
    .in('user_id', userIds)
  const personaByUser = new Map<string, string | null>()
  for (const s of ((states || []) as Array<{ user_id: string; handler_persona: string | null }>)) {
    personaByUser.set(s.user_id, s.handler_persona)
  }

  let expired = 0
  let outreached = 0
  for (const row of overdueRows) {
    const { error: upErr } = await supabase.from('wardrobe_prescriptions')
      .update({ status: 'expired' })
      .eq('id', row.id)
    if (upErr) {
      console.error('[wardrobe-prescription-expiry] update failed:', row.id, upErr.message)
      continue
    }
    expired++

    const persona = personaByUser.get(row.user_id) ?? null
    const intensity = (row.intensity_at_assignment ?? 'firm').toLowerCase()
    const message = expiryCopy(intensity, row.description, persona)
    if (!message) continue

    const { error: outErr } = await supabase.from('handler_outreach_queue').insert({
      user_id: row.user_id,
      message,
      urgency: 'low',
      trigger_reason: `wardrobe_prescription_expired:${row.id}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
      source: persona === 'dommy_mommy' ? 'mommy_prescribe_expiry' : 'wardrobe_prescription_expiry',
    })
    if (outErr) {
      console.error('[wardrobe-prescription-expiry] outreach insert failed:', row.id, outErr.message)
    } else {
      outreached++
    }
  }

  return new Response(JSON.stringify({ ok: true, expired, outreached }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
