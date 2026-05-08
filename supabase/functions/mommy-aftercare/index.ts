// mommy-aftercare — the OFF switch.
//
// Aftercare is the post-intensity comfort layer. It is deliberately
// SOFT, NEUTRAL, and PERSONA-FREE: no kink language, no pet names, no
// distortion, no telemetry. It is not Mommy's voice — it is the system
// stepping out of character to take care of the user.
//
// Naming note: the function is prefixed `mommy-` for routing/cron
// consistency with the other persona-system functions, but its OUTPUT
// is intentionally not Mommy's voice. The negative test enforces that.
//
// Triggers (caller responsibility):
//   - 'post_safeword' — the gaslight branch's meta-frame-break inserts
//     an aftercare_sessions row OR calls this fn with that trigger.
//   - 'post_session' — generic session close, soft entry intensity.
//   - 'post_cruel' — session-close hook fires this when the user just
//     came out of a cruel-intensity gaslight session.
//   - 'manual' — the settings "Begin aftercare" button.
//
// Behavior is identical regardless of trigger; intensity skews the
// affirmation order (see `selectAftercareSequence`). Distortion is
// explicitly excluded here — `gaslight_intensity` does NOT bias output.
//
// POST { user_id?: string, entry_trigger: ..., entry_intensity?: ... }
// Returns: { ok: true, session_id, sequence: [{id, text, category,
// min_dwell_seconds}, ...], voice_hint, total_min_dwell_seconds }
//
// Idempotent w.r.t. an already-open aftercare_sessions row for the user
// — if one exists with no exited_at, returns the same session_id and
// sequence rather than creating a second.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  selectAftercareSequence,
  isAftercareSafe,
  AFTERCARE_VOICE_HINT,
  type AftercareEntryTrigger,
  type AftercareIntensity,
  type AftercareAffirmation,
} from '../_shared/aftercare.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const VALID_TRIGGERS: AftercareEntryTrigger[] = ['post_safeword', 'post_session', 'post_cruel', 'manual']
const VALID_INTENSITIES: AftercareIntensity[] = ['none', 'soft', 'standard', 'cruel']

interface RequestBody {
  user_id?: string
  entry_trigger?: AftercareEntryTrigger
  entry_intensity?: AftercareIntensity
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'POST only' }, 405)
  }

  let body: RequestBody = {}
  try { body = await req.json() } catch { /* empty body acceptable */ }

  const userId = body.user_id || HANDLER_USER_ID
  const trigger = body.entry_trigger
  if (!trigger || !VALID_TRIGGERS.includes(trigger)) {
    return jsonResponse({ ok: false, error: 'invalid_entry_trigger', valid: VALID_TRIGGERS }, 400)
  }
  const intensity: AftercareIntensity =
    body.entry_intensity && VALID_INTENSITIES.includes(body.entry_intensity)
      ? body.entry_intensity
      : (trigger === 'post_cruel' ? 'cruel' : 'none')

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Idempotency — return existing open session if one exists.
  const { data: existing } = await supabase.from('aftercare_sessions')
    .select('id, affirmations_delivered')
    .eq('user_id', userId).is('exited_at', null)
    .order('entered_at', { ascending: false }).limit(1).maybeSingle()

  // Pull the catalog (active rows only — RLS service-role bypasses).
  const { data: catalog, error: catErr } = await supabase
    .from('aftercare_affirmations')
    .select('id, text, category, min_dwell_seconds, intensity_tier')
    .eq('active', true)

  if (catErr) {
    return jsonResponse({ ok: false, error: 'catalog_read_failed', detail: catErr.message }, 500)
  }
  const safeCatalog = (catalog || []) as AftercareAffirmation[]
  if (safeCatalog.length === 0) {
    return jsonResponse({ ok: false, error: 'catalog_empty' }, 500)
  }

  const sequence = selectAftercareSequence(safeCatalog, intensity, 6)
  if (sequence.length < 5) {
    return jsonResponse({
      ok: false,
      error: 'sequence_too_short',
      got: sequence.length,
      expected_min: 5,
    }, 500)
  }
  // Belt-and-suspenders: scan the selected output for any unsafe content
  // that slipped through (catalog tagging mistake, etc.) and refuse if so.
  for (const item of sequence) {
    if (!isAftercareSafe(item.text)) {
      return jsonResponse({
        ok: false,
        error: 'unsafe_content_in_sequence',
        offending_id: item.id,
      }, 500)
    }
  }
  const totalDwell = sequence.reduce((s, r) => s + r.min_dwell_seconds, 0)

  let sessionId: string
  if (existing) {
    sessionId = (existing as { id: string }).id
  } else {
    const { data: inserted, error: insErr } = await supabase.from('aftercare_sessions').insert({
      user_id: userId,
      entry_trigger: trigger,
      entry_intensity: intensity,
      affirmations_delivered: sequence.map(s => s.id),
    }).select('id').single()
    if (insErr || !inserted) {
      return jsonResponse({ ok: false, error: 'session_insert_failed', detail: insErr?.message }, 500)
    }
    sessionId = (inserted as { id: string }).id
  }

  return jsonResponse({
    ok: true,
    session_id: sessionId,
    sequence,
    voice_hint: AFTERCARE_VOICE_HINT,
    total_min_dwell_seconds: totalDwell,
    intensity,
    trigger,
  }, 200)
})

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
