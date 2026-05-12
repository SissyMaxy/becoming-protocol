// mommy-mantra-drill-submit — log a mantra rep batch from the client.
//
// Body: { user_id, mantra_text, mantra_id?, target_rep_count, voice_reps,
//         typed_reps, paired_with_arousal?, intensity_band?, audio_paths? }
//
// Flow:
//   1. Persona gate (dommy_mommy only). Non-persona users get a 200 skip.
//   2. Insert mantra_drill_sessions row with weighted total computed
//      server-side (voice 1.0x, typed 0.5x, arousal-pair × 3).
//   3. Bump user_state.mantra_lifetime_reps by the weighted total.
//   4. Detect milestone crossing (1k / 10k / 100k); if crossed AND not
//      already fired at that tier, queue a high-urgency outreach with the
//      milestone Mommy-voice line and update mantra_milestone_last_fired.
//   5. Log to mommy_authority_log.
//
// Idempotency: caller passes a client-generated session_uuid that's used
// as the row id. Resubmission with the same id is a no-op insert (ON CONFLICT).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { weightedReps, milestoneCrossed } from '../_shared/mantra-milestone.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

interface SubmitBody {
  user_id?: string
  session_id?: string                  // client-generated uuid for idempotency
  mantra_text: string
  mantra_id?: string | null
  target_rep_count: number
  voice_reps: number
  typed_reps: number
  paired_with_arousal?: boolean
  intensity_band?: 'gentle' | 'firm' | 'cruel'
  audio_paths?: string[]
  evidence_summary?: string
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  let body: SubmitBody
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad_json' }, 400) }

  const userId = body.user_id || HANDLER_USER_ID
  if (!body.mantra_text || typeof body.mantra_text !== 'string') {
    return json({ ok: false, error: 'mantra_text_required' }, 400)
  }
  const targetReps = Number(body.target_rep_count) || 100
  const voiceReps = Math.max(0, Number(body.voice_reps) || 0)
  const typedReps = Math.max(0, Number(body.typed_reps) || 0)
  if (voiceReps + typedReps <= 0) return json({ ok: false, error: 'no_reps' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Persona gate
  const { data: us } = await supabase.from('user_state')
    .select('handler_persona, mantra_lifetime_reps, mantra_milestone_last_fired')
    .eq('user_id', userId)
    .maybeSingle()
  const state = us as {
    handler_persona?: string
    mantra_lifetime_reps?: string | number | null
    mantra_milestone_last_fired?: number | null
  } | null
  if (state?.handler_persona !== 'dommy_mommy') {
    return json({ ok: true, skipped: 'persona_not_dommy_mommy' })
  }

  const completed = voiceReps + typedReps
  const weighted = weightedReps({
    voiceReps,
    typedReps,
    pairedWithArousal: !!body.paired_with_arousal,
  })

  // Insert the drill session. session_id allows idempotent resubmits.
  const sessionId = body.session_id ?? crypto.randomUUID()
  const insertRes = await supabase.from('mantra_drill_sessions').upsert({
    id: sessionId,
    user_id: userId,
    mantra_text: body.mantra_text,
    mantra_id: body.mantra_id ?? null,
    target_rep_count: targetReps,
    completed_rep_count: completed,
    voice_rep_count: voiceReps,
    typed_rep_count: typedReps,
    weighted_rep_count: weighted,
    paired_with_arousal: !!body.paired_with_arousal,
    intensity_band: body.intensity_band ?? null,
    audio_storage_paths: body.audio_paths ?? null,
    evidence_summary: body.evidence_summary ?? null,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select('id').single()

  if (insertRes.error) {
    console.error('[mantra-drill-submit] insert failed:', insertRes.error)
    return json({ ok: false, error: 'insert_failed', detail: insertRes.error.message }, 500)
  }

  const prevLifetime = Number(state?.mantra_lifetime_reps ?? 0)
  const newLifetime = prevLifetime + weighted

  const { error: stateErr } = await supabase.from('user_state')
    .update({ mantra_lifetime_reps: newLifetime })
    .eq('user_id', userId)
  if (stateErr) {
    console.error('[mantra-drill-submit] user_state bump failed:', stateErr)
  }

  // Authority log — always fires
  await supabase.from('mommy_authority_log').insert({
    user_id: userId,
    action: 'mantra_drill_logged',
    surface: 'mantra',
    ref_table: 'mantra_drill_sessions',
    ref_id: sessionId,
    meta: {
      voice_reps: voiceReps,
      typed_reps: typedReps,
      weighted,
      paired_with_arousal: !!body.paired_with_arousal,
      lifetime_before: prevLifetime,
      lifetime_after: newLifetime,
    },
  })

  // Milestone surfacing
  const lastFired = state?.mantra_milestone_last_fired ?? 0
  const crossed = milestoneCrossed(prevLifetime, newLifetime)
  let milestoneOutreachId: string | null = null
  if (crossed && crossed.threshold > lastFired) {
    const outreachRes = await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: crossed.line,
      urgency: 'high',
      trigger_reason: `mantra_milestone:${crossed.threshold}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
      source: 'mommy_mantra_milestone',
    }).select('id').single()

    milestoneOutreachId = (outreachRes.data as { id?: string } | null)?.id ?? null

    await supabase.from('user_state')
      .update({ mantra_milestone_last_fired: crossed.threshold })
      .eq('user_id', userId)

    await supabase.from('mommy_authority_log').insert({
      user_id: userId,
      action: 'mantra_milestone_reached',
      surface: 'mantra',
      ref_table: 'mantra_drill_sessions',
      ref_id: sessionId,
      meta: {
        threshold: crossed.threshold,
        line: crossed.line,
        outreach_id: milestoneOutreachId,
      },
    })
  }

  return json({
    ok: true,
    session_id: sessionId,
    weighted_reps: weighted,
    lifetime_reps: newLifetime,
    milestone: crossed ? { threshold: crossed.threshold, fired: !!milestoneOutreachId } : null,
  })
})
