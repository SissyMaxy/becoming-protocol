// meet-evidence-cron — close the loop on every cruising meet.
//
// 2026-05-06 user wish #4: "meet_scheduled_at gets set, the meet happens,
// and nothing closes the loop. A meet is a witness fabrication source if
// Mama captures proof; it's a private event if she doesn't."
//
// Schedule: every 15 min via Supabase cron.
//
// Logic:
//   1. Find hookup_funnel rows where:
//        - active = true
//        - meet_scheduled_at IS NOT NULL
//        - met_at IS NULL  (we don't double-fire after evidence captured)
//        - meet_scheduled_at < now() - 1 hour  (meet should be over)
//        - no fast_react_event with event_kind='meet_window_passed' for this row
//   2. For each, POST to mommy-fast-react with event_kind='meet_window_passed'
//      Fast-react picks the decree: photo of outfit, voice memo, the answer
//      to "did he see you as her", and an implant for memory_implants.
//   3. Idempotency is guaranteed by fast_react_event.UNIQUE(user_id, event_kind, source_key).
//
// Returns a summary so the cron monitor can see what fired.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface FunnelRow {
  id: string
  user_id: string
  contact_platform: string
  contact_username: string
  contact_display_name: string | null
  meet_scheduled_at: string
  meet_location: string | null
  current_step: string
  heat_score: number
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()

  const { data: funnelRows, error } = await supabase
    .from('hookup_funnel')
    .select('id, user_id, contact_platform, contact_username, contact_display_name, meet_scheduled_at, meet_location, current_step, heat_score')
    .eq('active', true)
    .is('met_at', null)
    .not('meet_scheduled_at', 'is', null)
    .lt('meet_scheduled_at', oneHourAgo)
    .limit(50)

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const rows = (funnelRows || []) as FunnelRow[]
  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mommy-fast-react`
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const results: Array<{ funnel_id: string; user_id: string; status: string; detail?: string }> = []

  for (const row of rows) {
    const sourceKey = `meet_window:${row.id}:${row.meet_scheduled_at}`

    // Pre-check fast_react_event so we skip cleanly without paying for a fast-react call
    const { data: existing } = await supabase
      .from('fast_react_event')
      .select('id, skip_reason, produced_scheme_id')
      .eq('user_id', row.user_id)
      .eq('event_kind', 'meet_window_passed')
      .eq('source_key', sourceKey)
      .maybeSingle()

    if (existing) {
      results.push({ funnel_id: row.id, user_id: row.user_id, status: 'already_fired' })
      continue
    }

    try {
      const r = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id: row.user_id,
          event_kind: 'meet_window_passed',
          source_key: sourceKey,
          context: {
            funnel_id: row.id,
            platform: row.contact_platform,
            contact_display_name: row.contact_display_name ?? row.contact_username,
            meet_scheduled_at: row.meet_scheduled_at,
            meet_location: row.meet_location,
            current_step: row.current_step,
            heat_score: row.heat_score,
            instruction_for_mama: 'A cruising meet was scheduled and the window has now passed. Capture proof. Mama wants: (a) photo of what she wore, (b) voice memo answering "did he see you as her", (c) one implant-grade line about how it felt. Fire ONE decree (proof_required=photo or audio) AND ONE implant pre-fill. Embodied tasks only.',
          },
        }),
      })
      const j = await r.json()
      results.push({
        funnel_id: row.id, user_id: row.user_id,
        status: r.ok ? 'fired' : 'fast_react_error',
        detail: r.ok ? `actions=${j.fired ?? 0}` : (j.error ?? 'unknown'),
      })
    } catch (err) {
      results.push({ funnel_id: row.id, user_id: row.user_id, status: 'fetch_error', detail: String(err).slice(0, 200) })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    candidates_found: rows.length,
    fired: results.filter(r => r.status === 'fired').length,
    skipped_already: results.filter(r => r.status === 'already_fired').length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
