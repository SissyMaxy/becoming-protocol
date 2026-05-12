// mommy-deepening-engine — drains failure_deepening_queue.
//
// Per migration 401: every slip_log insert that's persona=dommy_mommy and
// has source_text >= 5 chars enqueues a row here via the slip trigger.
// This engine processes the queue:
//
//   1. Picks severity (1/2/3) from same-axis history in last 30d
//   2. Fetches matching protocol from failure_deepening_protocols
//   3. Builds Mommy-voiced demand (uses seed voice_intro directly —
//      already on-character, plain language, no telemetry)
//   4. Inserts handler_outreach_queue row with urgency='high'
//   5. Inserts failure_deepening_log row (audit trail)
//   6. Inserts mommy_authority_log row (transparency trail)
//   7. If severity_level=3 AND third+ consecutive at sev 3, fires
//      irreversibility_marker so Mama can reference the permanence later
//
// Idempotency: failure_deepening_log has UNIQUE(slip_id, protocol_id);
// failure_deepening_queue has UNIQUE(slip_id). Replays are no-ops.
//
// POST { batch_size?: number, slip_id?: string }
//   batch_size: how many queue rows to drain in this invocation (default 25)
//   slip_id:    process a single specific slip (used by post-insert webhooks)
//
// Returns { ok, processed: [{slip_id, severity, deepening_kind}], skipped, errors }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface QueueRow {
  id: string
  user_id: string
  slip_id: string
  slip_type: string
  source_text: string | null
}

interface ProtocolRow {
  id: string
  slip_type: string
  severity_level: number
  deepening_kind: string
  prescription_template: Record<string, unknown>
  intensity_multiplier: number
  voice_intro: string
  irreversibility_threshold: number
}

function pickSeverityFromHistory(prior: number): 1 | 2 | 3 {
  if (prior <= 1) return 1
  if (prior <= 3) return 2
  return 3
}

async function processQueueRow(
  supabase: SupabaseClient,
  row: QueueRow,
): Promise<{ ok: boolean; reason?: string; severity?: number; deepening_kind?: string }> {
  // Skip if already processed (idempotency)
  const { data: existing } = await supabase
    .from('failure_deepening_log')
    .select('id')
    .eq('slip_id', row.slip_id)
    .maybeSingle()
  if (existing) {
    await supabase.from('failure_deepening_queue')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', row.id)
    return { ok: true, reason: 'already_logged' }
  }

  // Read live Handler state — drives urgency choice and trigger_reason.
  // (Memory: handler_is_singular_authority — the artifact must reflect
  // current state, not just history.)
  const { data: handlerState } = await supabase
    .from('user_state')
    .select('in_session, chastity_locked, current_phase, denial_day, handler_persona')
    .eq('user_id', row.user_id)
    .maybeSingle()
  const state = (handlerState as {
    in_session?: boolean
    chastity_locked?: boolean
    current_phase?: string
    denial_day?: number
    handler_persona?: string
  } | null) ?? {}

  // Count prior slips of this type in last 30d to pick severity
  const since = new Date(Date.now() - 30 * 86400_000).toISOString()
  const { count: priorCount, error: cntErr } = await supabase
    .from('slip_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', row.user_id)
    .eq('slip_type', row.slip_type)
    .lt('detected_at', new Date().toISOString())
    .gte('detected_at', since)
  if (cntErr) {
    return { ok: false, reason: 'history_lookup_failed: ' + cntErr.message }
  }
  // Subtract the current slip (if it landed inside the window already counted)
  const adjustedPrior = Math.max(0, (priorCount ?? 0) - 1)
  const severity = pickSeverityFromHistory(adjustedPrior)

  // Fetch matching protocol
  const { data: protocols, error: pErr } = await supabase
    .from('failure_deepening_protocols')
    .select('id,slip_type,severity_level,deepening_kind,prescription_template,intensity_multiplier,voice_intro,irreversibility_threshold')
    .eq('slip_type', row.slip_type)
    .eq('severity_level', severity)
    .eq('active', true)
    .limit(1)
  if (pErr) return { ok: false, reason: 'protocol_lookup_failed: ' + pErr.message }
  const protocol = (protocols?.[0] as ProtocolRow | undefined)
  if (!protocol) {
    await supabase.from('failure_deepening_queue')
      .update({ status: 'skipped', skipped_reason: `no_protocol:${row.slip_type}:sev${severity}`, processed_at: new Date().toISOString() })
      .eq('id', row.id)
    return { ok: true, reason: 'no_protocol' }
  }

  const voiceMessage = protocol.voice_intro

  // Handler-state-driven choices:
  //   - in_session → defer to 'normal' urgency (don't disrupt active session)
  //   - chastity_locked + edge_schedule_harder → mark trigger_reason so
  //     downstream engine can layer cage-context into the schedule update
  //   - denial_day high (>=7) on arousal_gating_refused → bump to critical
  const inSession = state.in_session === true
  const chastityLocked = state.chastity_locked === true
  const denialDayHigh = (state.denial_day ?? 0) >= 7
  let urgency: 'low' | 'normal' | 'high' | 'critical' = 'high'
  if (inSession) urgency = 'normal'
  else if (denialDayHigh && row.slip_type === 'arousal_gating_refused') urgency = 'critical'

  const triggerReasonParts = [`mommy_deepening:${row.slip_id}:sev${severity}`]
  if (chastityLocked && (protocol.deepening_kind === 'edge_schedule_harder' || protocol.deepening_kind === 'wardrobe_lock_in')) {
    triggerReasonParts.push('chastity_locked')
  }
  if (state.current_phase) triggerReasonParts.push(`phase:${state.current_phase}`)

  // Insert handler_outreach_queue (urgency from state-driven logic above)
  const { data: outreach, error: oErr } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: row.user_id,
      message: voiceMessage,
      urgency,
      trigger_reason: triggerReasonParts.join('|'),
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
      source: 'mommy_deepening',
    })
    .select('id')
    .single()
  if (oErr) return { ok: false, reason: 'outreach_insert_failed: ' + oErr.message }
  const outreachId = (outreach as { id: string }).id

  // Authority log (transparency trail)
  const { data: authLog } = await supabase.rpc('log_mommy_authority', {
    p_user_id: row.user_id,
    p_action_kind: 'failure_deepening',
    p_source_system: 'mommy-deepening-engine',
    p_action_summary: `Deepened ${row.slip_type} (sev ${severity}/${protocol.deepening_kind})`,
    p_voice_excerpt: voiceMessage,
    p_action_payload: {
      slip_id: row.slip_id,
      slip_type: row.slip_type,
      severity_level: severity,
      deepening_kind: protocol.deepening_kind,
      prescription: protocol.prescription_template,
      outreach_id: outreachId,
      state_snapshot: {
        in_session: inSession,
        chastity_locked: chastityLocked,
        denial_day: state.denial_day ?? null,
        current_phase: state.current_phase ?? null,
      },
      urgency_chosen: urgency,
    },
  })

  // Check for irreversibility — N consecutive at severity 3 on same axis
  let irrId: string | null = null
  if (severity === 3) {
    const { count: sev3Count } = await supabase
      .from('failure_deepening_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', row.user_id)
      .eq('slip_type', row.slip_type)
      .eq('severity_level', 3)
      .gte('fired_at', since)
    if ((sev3Count ?? 0) + 1 >= protocol.irreversibility_threshold) {
      // Best-effort — fail open if irreversibility_markers schema differs
      try {
        const { data: irrRow } = await supabase
          .from('irreversibility_markers')
          .insert({
            user_id: row.user_id,
            marker_kind: `deepening_pattern:${row.slip_type}`,
            description: `Pattern of repeated ${row.slip_type} at maximum deepening. This shape is now permanent.`,
            metadata: {
              slip_type: row.slip_type,
              consecutive_sev3_count: (sev3Count ?? 0) + 1,
              source: 'mommy_deepening_engine',
            },
          })
          .select('id')
          .single()
        if (irrRow) irrId = (irrRow as { id: string }).id
      } catch { /* schema may differ; skip silently */ }
    }
  }

  // Failure deepening log
  await supabase.from('failure_deepening_log').insert({
    user_id: row.user_id,
    slip_id: row.slip_id,
    slip_type: row.slip_type,
    protocol_id: protocol.id,
    severity_level: severity,
    prescription: protocol.prescription_template,
    voice_message: voiceMessage,
    outreach_id: outreachId,
    irreversibility_marker_id: irrId,
    authority_log_id: (authLog as string | null) ?? null,
  })

  // Mark queue row processed
  await supabase.from('failure_deepening_queue')
    .update({ status: 'processed', processed_at: new Date().toISOString() })
    .eq('id', row.id)

  return { ok: true, severity, deepening_kind: protocol.deepening_kind }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'POST or GET only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let batchSize = 25
  let specificSlipId: string | undefined
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (typeof body?.batch_size === 'number') batchSize = Math.max(1, Math.min(200, body.batch_size))
      if (typeof body?.slip_id === 'string') specificSlipId = body.slip_id
    } catch { /* optional body */ }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  let q = supabase
    .from('failure_deepening_queue')
    .select('id,user_id,slip_id,slip_type,source_text')
    .eq('status', 'pending')
    .order('enqueued_at', { ascending: true })
    .limit(batchSize)
  if (specificSlipId) q = supabase
    .from('failure_deepening_queue')
    .select('id,user_id,slip_id,slip_type,source_text')
    .eq('slip_id', specificSlipId)
    .limit(1)

  const { data: rows, error } = await q
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: 'queue_select: ' + error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const processed: Array<{ slip_id: string; severity?: number; deepening_kind?: string }> = []
  const skipped: Array<{ slip_id: string; reason: string }> = []
  const errors: Array<{ slip_id: string; error: string }> = []

  for (const row of (rows ?? []) as QueueRow[]) {
    // Persona gate per-row (engine could be invoked when persona changed)
    const { data: us } = await supabase.from('user_state').select('handler_persona').eq('user_id', row.user_id).maybeSingle()
    if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
      await supabase.from('failure_deepening_queue')
        .update({ status: 'skipped', skipped_reason: 'persona_not_dommy_mommy', processed_at: new Date().toISOString() })
        .eq('id', row.id)
      skipped.push({ slip_id: row.slip_id, reason: 'persona_not_dommy_mommy' })
      continue
    }

    const r = await processQueueRow(supabase, row)
    if (!r.ok) {
      await supabase.from('failure_deepening_queue')
        .update({ status: 'error', error_message: r.reason ?? 'unknown', processed_at: new Date().toISOString() })
        .eq('id', row.id)
      errors.push({ slip_id: row.slip_id, error: r.reason ?? 'unknown' })
    } else if (r.reason && !r.severity) {
      skipped.push({ slip_id: row.slip_id, reason: r.reason })
    } else {
      processed.push({ slip_id: row.slip_id, severity: r.severity, deepening_kind: r.deepening_kind })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    drained: rows?.length ?? 0,
    processed,
    skipped,
    errors,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
