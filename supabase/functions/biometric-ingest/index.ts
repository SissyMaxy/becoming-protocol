// biometric-ingest — accepts external biometric + calendar data, threshold-checks,
// and (optionally) fires mommy-fast-react when a registered threshold trips.
//
// Per migration 404: data sources include Apple Health, Google Fit, screen time,
// and calendar events. The thin client (PWA + HealthKit, browser API for calendar)
// posts samples here. This function:
//
//   1. Validates the source is connected for the user (external_biometric_sources)
//   2. Inserts to external_biometric_imports (or external_calendar_events) with
//      idempotency on (user, source, metric_kind, captured_at)
//   3. Looks up the metric in biometric_thresholds; if a registered trigger fires,
//      POSTs to mommy-fast-react with event_kind = threshold's fast_react_event_kind
//   4. Logs to mommy_authority_log
//
// POST { user_id, source, samples: [{metric_kind, value_numeric|value_text, unit, captured_at, context, raw}] }
//
// Calendar variant — POST { user_id, source: 'calendar_*', events: [{external_id, title, starts_at, ends_at, attendee_labels, raw}] }
//
// Returns { ok, ingested_count, threshold_hits, fast_react_dispatched }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface BiometricSample {
  metric_kind: string
  value_numeric?: number
  value_text?: string
  unit?: string
  captured_at: string
  context?: Record<string, unknown>
  raw?: Record<string, unknown>
}

interface CalendarEvent {
  external_id: string
  title: string
  starts_at: string
  ends_at?: string
  attendee_labels?: string[]
  raw?: Record<string, unknown>
}

interface ThresholdRow {
  id: string
  metric_kind: string
  trigger_kind: 'spike_above' | 'drop_below' | 'sustained_above' | 'sustained_below' | 'event_match'
  threshold_value: number | null
  window_minutes: number | null
  voice_template: string
  fast_react_event_kind: string
  active: boolean
}

const RELEVANT_TARGET_LABELS = ['gina', 'marisol', 'date', 'lunch with']
function isRelevantCalendarEvent(title: string): { relevant: boolean; reason: string; target?: string } {
  const lower = title.toLowerCase()
  for (const label of RELEVANT_TARGET_LABELS) {
    if (lower.includes(label)) return { relevant: true, reason: `target_keyword:${label}`, target: label }
  }
  return { relevant: false, reason: 'no_target_match' }
}

async function checkThresholdAndFire(
  supabase: SupabaseClient,
  userId: string,
  sample: BiometricSample,
  importId: string,
): Promise<{ tripped: boolean; event_kind?: string; voice?: string }> {
  const { data: thresholds } = await supabase
    .from('biometric_thresholds')
    .select('*')
    .eq('metric_kind', sample.metric_kind)
    .eq('active', true)
  const t = (thresholds?.[0] as ThresholdRow | undefined)
  if (!t) return { tripped: false }

  const v = sample.value_numeric
  let tripped = false
  if (v == null) {
    tripped = false
  } else if (t.trigger_kind === 'spike_above' || t.trigger_kind === 'sustained_above') {
    tripped = t.threshold_value != null && v > t.threshold_value
  } else if (t.trigger_kind === 'drop_below' || t.trigger_kind === 'sustained_below') {
    tripped = t.threshold_value != null && v < t.threshold_value
  }
  if (!tripped) return { tripped: false }

  const captured = new Date(sample.captured_at)
  const timeLocal = captured.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const voice = t.voice_template.replace('{{time_local}}', timeLocal)

  // Fire mommy-fast-react (best effort — don't block ingest on it)
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const sourceKey = `biometric:${importId}`
  try {
    await fetch(`${supabaseUrl}/functions/v1/mommy-fast-react`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        user_id: userId,
        event_kind: t.fast_react_event_kind,
        source_key: sourceKey,
        context: {
          metric_kind: sample.metric_kind,
          value: sample.value_numeric,
          unit: sample.unit,
          captured_at: sample.captured_at,
          biometric_voice_seed: voice,
          mama_sample_context: sample.context ?? null,
        },
      }),
    })
    await supabase.from('external_biometric_imports')
      .update({ fast_react_event_id: sourceKey, reacted_at: new Date().toISOString() })
      .eq('id', importId)
  } catch (err) {
    // Don't fail the ingest if fast-react errors
    console.error('fast-react dispatch failed', err)
  }

  return { tripped: true, event_kind: t.fast_react_event_kind, voice }
}

async function ingestSamples(
  supabase: SupabaseClient,
  userId: string,
  source: string,
  samples: BiometricSample[],
): Promise<{ ingested: number; threshold_hits: Array<{ metric_kind: string; voice: string }>; errors: string[] }> {
  let ingested = 0
  const hits: Array<{ metric_kind: string; voice: string }> = []
  const errors: string[] = []

  for (const sample of samples) {
    if (!sample.metric_kind || !sample.captured_at) {
      errors.push('missing metric_kind or captured_at')
      continue
    }

    const { data, error } = await supabase
      .from('external_biometric_imports')
      .upsert({
        user_id: userId,
        source,
        metric_kind: sample.metric_kind,
        value_numeric: sample.value_numeric ?? null,
        value_text: sample.value_text ?? null,
        unit: sample.unit ?? null,
        captured_at: sample.captured_at,
        context: sample.context ?? {},
        raw: sample.raw ?? null,
      }, { onConflict: 'user_id,source,metric_kind,captured_at' })
      .select('id')
      .single()
    if (error) {
      errors.push(`${sample.metric_kind}: ${error.message}`)
      continue
    }
    ingested += 1
    const importId = (data as { id: string }).id

    const tripResult = await checkThresholdAndFire(supabase, userId, sample, importId)
    if (tripResult.tripped) {
      hits.push({ metric_kind: sample.metric_kind, voice: tripResult.voice ?? '' })
    }
  }

  return { ingested, threshold_hits: hits, errors }
}

async function ingestCalendarEvents(
  supabase: SupabaseClient,
  userId: string,
  source: string,
  events: CalendarEvent[],
): Promise<{ ingested: number; relevant_count: number; errors: string[] }> {
  let ingested = 0
  let relevant = 0
  const errors: string[] = []

  for (const ev of events) {
    if (!ev.external_id || !ev.starts_at || !ev.title) {
      errors.push('missing required calendar field')
      continue
    }
    const { relevant: isRel, reason, target } = isRelevantCalendarEvent(ev.title)
    const { data, error } = await supabase
      .from('external_calendar_events')
      .upsert({
        user_id: userId,
        source,
        external_id: ev.external_id,
        title_full: ev.title,
        title_redacted: isRel ? null : ev.title.slice(0, 40),
        starts_at: ev.starts_at,
        ends_at: ev.ends_at ?? null,
        attendee_labels: ev.attendee_labels ?? null,
        is_relevant: isRel,
        relevance_reason: reason,
        raw: ev.raw ?? null,
      }, { onConflict: 'user_id,source,external_id' })
      .select('id')
      .single()
    if (error) {
      errors.push(`${ev.external_id}: ${error.message}`)
      continue
    }
    ingested += 1
    if (isRel) relevant += 1

    if (isRel) {
      // Fire fast-react now if event starts within 4h
      const minsUntil = (new Date(ev.starts_at).getTime() - Date.now()) / 60_000
      if (minsUntil > 30 && minsUntil < 240) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        try {
          await fetch(`${supabaseUrl}/functions/v1/mommy-fast-react`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
            body: JSON.stringify({
              user_id: userId,
              event_kind: 'calendar_event_relevant',
              source_key: `calendar:${(data as { id: string }).id}:prep`,
              context: { event_title: ev.title, target_label: target, starts_at: ev.starts_at, kind: 'prep' },
            }),
          })
          await supabase.from('external_calendar_events')
            .update({ prep_outreach_id: (data as { id: string }).id })
            .eq('id', (data as { id: string }).id)
        } catch { /* */ }
      }
    }
  }

  return { ingested, relevant_count: relevant, errors }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: {
    user_id: string
    source: string
    samples?: BiometricSample[]
    events?: CalendarEvent[]
  }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!body.user_id || !body.source) {
    return new Response(JSON.stringify({ ok: false, error: 'user_id and source required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Verify source is connected for this user (or allow if pending — first ingest connects)
  const { data: src } = await supabase
    .from('external_biometric_sources')
    .select('id, status')
    .eq('user_id', body.user_id)
    .eq('source', body.source)
    .maybeSingle()
  if (src && (src as { status: string }).status === 'revoked') {
    return new Response(JSON.stringify({ ok: false, error: 'source_revoked' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!src) {
    // Auto-connect on first ingest. User must explicitly revoke later.
    await supabase.from('external_biometric_sources').insert({
      user_id: body.user_id,
      source: body.source,
      status: 'connected',
      connected_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
  } else {
    await supabase.from('external_biometric_sources')
      .update({ last_seen_at: new Date().toISOString(), status: 'connected' })
      .eq('id', (src as { id: string }).id)
  }

  // Branch on payload kind
  if (Array.isArray(body.events)) {
    const r = await ingestCalendarEvents(supabase, body.user_id, body.source, body.events)
    if (r.ingested > 0) {
      await supabase.rpc('log_mommy_authority', {
        p_user_id: body.user_id,
        p_action_kind: 'biometric_ingest_calendar',
        p_source_system: 'biometric-ingest',
        p_action_summary: `Ingested ${r.ingested} calendar event${r.ingested === 1 ? '' : 's'}, ${r.relevant_count} flagged relevant`,
        p_voice_excerpt: null,
        p_action_payload: { source: body.source, ingested: r.ingested, relevant: r.relevant_count },
      })
    }
    return new Response(JSON.stringify({
      ok: true,
      ingested_count: r.ingested,
      relevant_count: r.relevant_count,
      errors: r.errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  if (!Array.isArray(body.samples) || body.samples.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'samples or events array required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const r = await ingestSamples(supabase, body.user_id, body.source, body.samples)
  if (r.ingested > 0) {
    await supabase.rpc('log_mommy_authority', {
      p_user_id: body.user_id,
      p_action_kind: 'biometric_ingest',
      p_source_system: 'biometric-ingest',
      p_action_summary: `Ingested ${r.ingested} sample${r.ingested === 1 ? '' : 's'} from ${body.source}, ${r.threshold_hits.length} threshold trigger${r.threshold_hits.length === 1 ? '' : 's'}`,
      p_voice_excerpt: r.threshold_hits[0]?.voice ?? null,
      p_action_payload: { source: body.source, ingested: r.ingested, threshold_hits: r.threshold_hits },
    })
  }
  return new Response(JSON.stringify({
    ok: true,
    ingested_count: r.ingested,
    threshold_hits: r.threshold_hits,
    fast_react_dispatched: r.threshold_hits.length,
    errors: r.errors,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
