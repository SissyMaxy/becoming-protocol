// sniffies-ghost-detector — turns a confirmed ghosting outcome on a
// Sniffies contact into a slip_log row.
//
// Trigger conditions:
//   - sniffies_settings.slip_use_enabled = TRUE
//   - sniffies_contacts.outcomes contains 'ghosted' OR 'met_then_ghosted'
//   - The contact is NOT excluded_from_persona
//   - No slip_log row already exists for this contact within 30 days
//
// Side effects: insert slip_log row with slip_type='task_avoided',
// metadata referencing the contact + outcome. Does NOT auto-trigger
// punishment — the existing slip → punishment pipeline handles that.
//
// POST { user_id?: string }. Cron daily.

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
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Gate.
  const { data: settings } = await supabase
    .from('sniffies_settings')
    .select('sniffies_integration_enabled, slip_use_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  const s = settings as { sniffies_integration_enabled?: boolean; slip_use_enabled?: boolean } | null
  if (!s?.sniffies_integration_enabled || !s.slip_use_enabled) {
    return new Response(JSON.stringify({ ok: true, skipped: 'gate_off' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Pull contacts that ghosted.
  const { data: contacts, error: cErr } = await supabase
    .from('sniffies_contacts')
    .select('id, display_name, outcomes, last_seen_at, excluded_from_persona')
    .eq('user_id', userId)
    .eq('excluded_from_persona', false)
  if (cErr) {
    return new Response(JSON.stringify({ ok: false, error: cErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const ghosters = ((contacts ?? []) as Array<{
    id: string
    display_name: string
    outcomes: string[]
    last_seen_at: string | null
    excluded_from_persona: boolean
  }>).filter(c =>
    c.outcomes.includes('ghosted') || c.outcomes.includes('met_then_ghosted'),
  )

  if (ghosters.length === 0) {
    return new Response(JSON.stringify({ ok: true, fired: 0, eligible: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Avoid double-counting: skip a contact whose slip we already wrote in
  // the last 30 days.
  const since30d = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
  const { data: recentSlips } = await supabase
    .from('slip_log')
    .select('source_id')
    .eq('user_id', userId)
    .eq('source_table', 'sniffies_contacts')
    .gte('detected_at', since30d)
  const recentContactIds = new Set(((recentSlips ?? []) as Array<{ source_id: string }>).map(r => r.source_id))

  const newSlips = ghosters
    .filter(c => !recentContactIds.has(c.id))
    .map(c => ({
      user_id: userId,
      slip_type: 'task_avoided' as const,
      slip_points: c.outcomes.includes('met_then_ghosted') ? 4 : 3,
      source_text: `ghosted ${c.display_name}`,
      source_table: 'sniffies_contacts',
      source_id: c.id,
      metadata: {
        contact_id: c.id,
        contact_display_name: c.display_name,
        outcomes: c.outcomes,
        // last_seen lets the slip card render context without needing
        // to re-read the contact row.
        last_seen_at: c.last_seen_at,
        // Source label so the slip → outreach pipeline can render
        // sniffies-flavored copy if it wants.
        slip_source: 'sniffies_ghost',
      },
      triggered_hard_mode: false,
      handler_acknowledged: false,
    }))

  if (newSlips.length === 0) {
    return new Response(JSON.stringify({ ok: true, fired: 0, eligible: ghosters.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { error: insErr } = await supabase.from('slip_log').insert(newSlips)
  if (insErr) {
    console.error('[sniffies-ghost-detector] slip_log insert failed:', insErr)
    return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    ok: true,
    fired: newSlips.length,
    eligible: ghosters.length,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
