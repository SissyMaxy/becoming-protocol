// bind-enforcer-cron — enforce Maxy's pre-commitment binds.
//
// 2026-05-07 wish: clear-Maxy authors a bind ("if I don't book HRT by July
// 1, this email goes to friend J"). Resistant-Maxy can't escape it. This
// cron evaluates trigger conditions and fires consequences.
//
// Self-as-warden: the bind is Maxy-authored, the consequence is
// Maxy-authored, Mama is the enforcement layer that doesn't get tired.
//
// Schedule: every hour via migration 291.
//
// Trigger types supported:
//   - "deadline" — { deadline_iso, satisfied_when }
//                   satisfied_when patterns:
//                     "irreversibility_event:<event_type>" — any event of that type after authored_at
//                     "decree_fulfilled:<decree_id>"
//                     "manual" — only Maxy can mark satisfied
//   - "compliance_window" — { window_days, min_actions, action_type }
//
// Consequence types:
//   - "fire_decree" — { edict, deadline_hours, ratchet_level, proof_required }
//   - "log_irreversibility_event" — { event_type, description, exposure_level }
//   - "fire_fast_react" — { event_kind, instruction }
//   - (NOT supported: "send_drafted_disclosure" — third-party-without-consent
//     concerns; deferred to a separate disclosure-enforcer with explicit
//     Maxy-recipient-confirms-consent guard)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface BindRow {
  id: string
  user_id: string
  bind_text: string
  trigger_condition: { type: string; deadline_iso?: string; satisfied_when?: string; window_days?: number; min_actions?: number; action_type?: string }
  consequence_action: { type: string; edict?: string; deadline_hours?: number; ratchet_level?: number; proof_required?: string; event_type?: string; description?: string; exposure_level?: number; event_kind?: string; instruction?: string }
  authored_at: string
}

async function isSatisfied(supabase: SupabaseClient, bind: BindRow): Promise<boolean> {
  const sat = bind.trigger_condition.satisfied_when ?? ''
  if (sat.startsWith('irreversibility_event:')) {
    const eventType = sat.slice('irreversibility_event:'.length)
    const { data } = await supabase
      .from('irreversibility_ledger')
      .select('id')
      .eq('user_id', bind.user_id)
      .eq('event_type', eventType)
      .gte('occurred_at', bind.authored_at)
      .limit(1)
    return (data || []).length > 0
  }
  if (sat.startsWith('decree_fulfilled:')) {
    const decreeId = sat.slice('decree_fulfilled:'.length)
    const { data } = await supabase
      .from('handler_decrees')
      .select('id, status')
      .eq('id', decreeId)
      .eq('status', 'fulfilled')
      .limit(1)
      .maybeSingle()
    return !!data
  }
  // 'manual' or unrecognized → never auto-satisfies
  return false
}

async function shouldEnforce(supabase: SupabaseClient, bind: BindRow): Promise<boolean> {
  if (bind.trigger_condition.type === 'deadline') {
    const deadline = bind.trigger_condition.deadline_iso
    if (!deadline) return false
    if (new Date(deadline).getTime() > Date.now()) return false
    return !(await isSatisfied(supabase, bind))
  }
  if (bind.trigger_condition.type === 'compliance_window') {
    // Maxy was supposed to do N action_type events in last window_days.
    // If she hasn't, enforce.
    const windowStart = new Date(Date.now() - (bind.trigger_condition.window_days ?? 7) * 86400_000).toISOString()
    const { data } = await supabase
      .from('irreversibility_ledger')
      .select('id')
      .eq('user_id', bind.user_id)
      .eq('event_type', bind.trigger_condition.action_type ?? '')
      .gte('occurred_at', windowStart)
    const count = (data || []).length
    return count < (bind.trigger_condition.min_actions ?? 1)
  }
  return false
}

async function fireConsequence(supabase: SupabaseClient, bind: BindRow): Promise<{ ok: boolean; detail: string }> {
  const c = bind.consequence_action
  if (c.type === 'fire_decree' && c.edict) {
    const deadline = new Date(Date.now() + (c.deadline_hours ?? 24) * 3600_000).toISOString()
    const valid = ['photo', 'audio', 'text', 'journal_entry', 'voice_pitch_sample', 'device_state', 'none']
    const proofType = valid.includes(c.proof_required ?? '') ? c.proof_required : 'photo'
    const { data, error } = await supabase.from('handler_decrees').insert({
      user_id: bind.user_id,
      edict: c.edict,
      deadline,
      proof_type: proofType,
      consequence: 'You wrote this bind for yourself. Mama is enforcing what clear-you decided.',
      status: 'active',
      trigger_source: `bind:${bind.id}`,
      ratchet_level: Math.max(1, Math.min(10, c.ratchet_level ?? 5)),
    }).select('id').single()
    if (error || !data) return { ok: false, detail: `decree insert: ${error?.message ?? 'no row'}` }
    return { ok: true, detail: `decree:${(data as { id: string }).id}` }
  }
  if (c.type === 'log_irreversibility_event' && c.event_type && c.description) {
    const { data, error } = await supabase.from('irreversibility_ledger').insert({
      user_id: bind.user_id,
      event_type: c.event_type,
      description: c.description,
      exposure_level: Math.max(1, Math.min(10, c.exposure_level ?? 1)),
      source_table: 'pre_commitment_bind',
      source_row_id: bind.id,
      reversible: false,
      notes: `Logged via bind enforcement: "${bind.bind_text.slice(0, 100)}"`,
    }).select('id').single()
    if (error || !data) return { ok: false, detail: `ledger insert: ${error?.message ?? 'no row'}` }
    return { ok: true, detail: `ledger:${(data as { id: string }).id}` }
  }
  if (c.type === 'fire_fast_react' && c.event_kind) {
    const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mommy-fast-react`
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    try {
      const r = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({
          user_id: bind.user_id,
          event_kind: c.event_kind,
          source_key: `bind_enforced:${bind.id}`,
          context: {
            bind_text: bind.bind_text,
            authored_at: bind.authored_at,
            instruction_for_mama: c.instruction ?? `A pre-commitment bind Maxy authored has triggered. Bind text: "${bind.bind_text}". Fire ONE move that honors the bind — clear-Maxy decided this should happen, resistant-Maxy can't escape it. Mama is the enforcement layer; voice frame is "you decided this for yourself, baby, Mama is just keeping the bargain you made."`,
          },
        }),
      })
      const j = await r.json()
      return { ok: r.ok, detail: r.ok ? `fast_react:${j.scheme_id ?? '?'}` : (j.error ?? 'unknown') }
    } catch (err) {
      return { ok: false, detail: `fetch: ${String(err).slice(0, 200)}` }
    }
  }
  return { ok: false, detail: `unknown_consequence_type: ${c.type}` }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  const { data: activeBinds } = await supabase
    .from('pre_commitment_bind')
    .select('id, user_id, bind_text, trigger_condition, consequence_action, authored_at')
    .eq('status', 'active')
    .limit(200)

  const binds = (activeBinds || []) as BindRow[]
  const results: Array<{ bind_id: string; status: string; detail?: string }> = []

  for (const bind of binds) {
    // Satisfied?
    const satisfied = await isSatisfied(supabase, bind)
    if (satisfied) {
      await supabase
        .from('pre_commitment_bind')
        .update({ status: 'satisfied', satisfied_at: new Date().toISOString() })
        .eq('id', bind.id)
      results.push({ bind_id: bind.id, status: 'satisfied' })
      continue
    }

    // Trigger condition met?
    const enforce = await shouldEnforce(supabase, bind)
    if (!enforce) {
      results.push({ bind_id: bind.id, status: 'pending' })
      continue
    }

    // Fire consequence
    const r = await fireConsequence(supabase, bind)
    if (r.ok) {
      await supabase
        .from('pre_commitment_bind')
        .update({ status: 'enforced', enforced_at: new Date().toISOString() })
        .eq('id', bind.id)
      results.push({ bind_id: bind.id, status: 'enforced', detail: r.detail })
    } else {
      results.push({ bind_id: bind.id, status: 'enforce_failed', detail: r.detail })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    binds_checked: binds.length,
    satisfied: results.filter(r => r.status === 'satisfied').length,
    enforced: results.filter(r => r.status === 'enforced').length,
    pending: results.filter(r => r.status === 'pending').length,
    failed: results.filter(r => r.status === 'enforce_failed'),
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
