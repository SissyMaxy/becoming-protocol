// physical-practice-prescriber — issues the active at-home drill per track.
//
// 011 physical rung track (oral + bottoming). Reads physical_practice_progress
// (initialising default-on within the enabled recondition ladder), selects the
// active rung, and issues ONE handler_decree per track that surfaces via the
// focus_decree pipeline. Solo/own-body only. Advancement happens on the comfort
// rating submit (advance_physical_practice), never here.
//
// Gate: master_enabled + recondition_enabled + safeword floor. Copy comes from
// the seeded, test-verified edict_template rows; runtime re-checks real-person /
// container-breaker as defense-in-depth. No new schema. POST { user_id?, dry_run? }.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import { hasScriptBoundaryViolation } from '../_shared/mommy-order-boundary.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const TRACKS = ['oral', 'bottoming', 'plug_orgasm'] as const
const START_RUNG: Record<string, number> = { oral: 1, bottoming: 0, plug_orgasm: 1 }
const NO_PUNISH = 'No punishment — Mommy just resets the pairing and we practice it again.'

// The no-real-person invariant (Art. II item 3) is guaranteed at the SEED: every
// edict_template is verified clean by physical-practice-no-real-person +
// -seed-voice tests, and this prescriber only ever ships seeded edict_template
// rows (never freeform). The runtime scan below is the container-breaker floor
// (hasScriptBoundaryViolation catches procurement/leverage/memory attacks).

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER

  // ── Gate: ladder on + safeword floor ──
  const { data: settings } = await supabase.from('life_as_woman_settings')
    .select('master_enabled, recondition_enabled').eq('user_id', userId).maybeSingle()
  const s = settings as { master_enabled?: boolean; recondition_enabled?: boolean } | null
  if (!s?.master_enabled || !s?.recondition_enabled) {
    return jsonOk({ ok: true, skipped: 'ladder_off' })
  }
  const { data: sw } = await supabase.rpc('is_safeword_active', { uid: userId, window_seconds: 60 })
  if (sw === true) return jsonOk({ ok: true, skipped: 'safeword_active' })

  const { data: rungRows } = await supabase.from('physical_practice_rungs')
    .select('id, track, rung_order, title, edict_template, is_prep_step')
    .order('rung_order', { ascending: true })
  const rungs = (rungRows || []) as Array<{ id: string; track: string; rung_order: number; title: string; edict_template: string; is_prep_step: boolean }>

  const issued: Array<{ track: string; status: string; rung?: number; id?: string }> = []

  for (const track of TRACKS) {
    // Init progress default-on within the enabled ladder.
    let { data: prog } = await supabase.from('physical_practice_progress')
      .select('active_rung_order, status').eq('user_id', userId).eq('track', track).maybeSingle()
    if (!prog) {
      if (body.dry_run) { issued.push({ track, status: 'would_init' }); continue }
      const { data: created } = await supabase.from('physical_practice_progress')
        .insert({ user_id: userId, track, active_rung_order: START_RUNG[track], status: 'active' })
        .select('active_rung_order, status').single()
      prog = created as { active_rung_order: number; status: string } | null
    }
    const p = prog as { active_rung_order: number; status: string } | null
    if (!p || p.status !== 'active') { issued.push({ track, status: `not_active_${p?.status ?? 'none'}` }); continue }

    const rung = rungs.find((r) => r.track === track && r.rung_order === p.active_rung_order)
    if (!rung) { issued.push({ track, status: 'no_rung' }); continue }

    const source = `physical_practice:${track}:${rung.rung_order}`
    const proofType = rung.is_prep_step ? 'text' : 'comfort_slider'

    // Dedup + daily deadline-roll (a daily drill never guilts yesterday).
    const { data: existing } = await supabase.from('handler_decrees')
      .select('id, deadline').eq('user_id', userId).eq('trigger_source', source).eq('status', 'active').limit(1).maybeSingle()
    if (existing) {
      if (existing.deadline && new Date(existing.deadline) < new Date() && !body.dry_run) {
        await supabase.from('handler_decrees')
          .update({ deadline: new Date(Date.now() + 30 * 3600_000).toISOString() }).eq('id', existing.id)
        issued.push({ track, rung: rung.rung_order, status: 'refreshed' })
      } else {
        issued.push({ track, rung: rung.rung_order, status: 'already_active' })
      }
      continue
    }

    const edict = mommyVoiceCleanup(rung.edict_template)
    if (hasScriptBoundaryViolation(edict)) {
      issued.push({ track, rung: rung.rung_order, status: 'gate_violation_skipped' })
      continue
    }
    if (body.dry_run) { issued.push({ track, rung: rung.rung_order, status: 'would_issue' }); continue }

    const { data: dec, error } = await supabase.from('handler_decrees').insert({
      user_id: userId, edict, proof_type: proofType,
      deadline: new Date(Date.now() + 30 * 3600_000).toISOString(),
      status: 'active', consequence: NO_PUNISH, trigger_source: source,
      reasoning: `physical-practice-prescriber: ${track} rung ${rung.rung_order}`,
    }).select('id').single()
    issued.push({ track, rung: rung.rung_order, id: (dec as { id?: string } | null)?.id, status: error ? `err:${error.message.slice(0, 40)}` : 'issued' })
  }

  return jsonOk({ ok: true, issued })
})

function jsonOk(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
