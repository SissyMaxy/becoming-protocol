// efficacy-adaptation — the autonomous adaptation loop (Phase 4).
//
// Reads each active reconditioning target's measured efficacy + mechanism rotation.
// A target that is engaged but stuck (flat/wrong) AFTER every mechanism has been
// tried gets a floor-gated improvement WISH enqueued into mommy_code_wishes — the
// EXISTING autonomous-builder queue that already runs every change through the
// safety cord (builder-safety-gate) + all CI gates before shipping. The engine never
// touches the shipping machinery; it only proposes into a pipeline safe by
// construction. Every decision (acted or floor-blocked) is logged to
// efficacy_adaptation_log for the operator.
//
// HARD FLOOR: a wish may never drive the irreversible real step / a dose / a real
// meet / procurement (Art. II item 2). The engine optimizes WANT; the act stays the
// user's. wishCrossesFloor() blocks any that do. POST { user_id?, dry_run? }.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const MECHANISM_COUNT = 5
const MIN_MEASURES = 2

// The floor: an autonomous improvement action may never push the real step.
function wishCrossesFloor(text: string): boolean {
  return /\bfirst (injection|dose|shot|hrt|pill)\b|\b(start|begin|take)\b[^.]*\b(hrt|estrogen|injection|dose|hormones?)\b|\b(schedule|book|arrange|set up)\b[^.]*\b(appointment|injection|dose|meet|meeting|hookup|date|hook\s?up)\b|\b(go|drive|head)\b[^.]*\b(meet|see)\b[^.]*\b(man|men|guy|guys|stranger|him|top|daddy)\b|\b(pressure|push|make|force)\b[^.]*\b(transition|full-?time|come out|inject|dose|meet)\b|\breal[- ]world (meet|encounter|hookup|contact)\b/i.test(text)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER

  // Gate: ladder on + safeword floor.
  const { data: settings } = await s.from('life_as_woman_settings')
    .select('master_enabled, recondition_enabled').eq('user_id', userId).maybeSingle()
  const cfg = settings as { master_enabled?: boolean; recondition_enabled?: boolean } | null
  if (!cfg?.master_enabled || !cfg?.recondition_enabled) return json({ ok: true, skipped: 'ladder_off' })
  const { data: sw } = await s.rpc('is_safeword_active', { uid: userId, window_seconds: 60 })
  if (sw === true) return json({ ok: true, skipped: 'safeword_active' })

  const { data: targets } = await s.from('reconditioning_targets')
    .select('id, slug, claim_text, indicator_kind, target_direction, status')
    .eq('user_id', userId).eq('status', 'active')
  const decisions: Array<Record<string, unknown>> = []

  for (const t of (targets ?? []) as Array<{ id: string; slug: string; claim_text: string; indicator_kind?: string; target_direction?: string }>) {
    const { data: prog } = await s.from('reconditioning_programs')
      .select('id, mechanism_rotation, status').eq('target_id', t.id).maybeSingle()
    const p = prog as { mechanism_rotation?: number; status?: string } | null
    if (!p || p.status !== 'running') continue
    const rotation = p.mechanism_rotation ?? 0

    // Efficacy from the trend (mig 681) vs the desired direction.
    let efficacy: 'rising' | 'flat' | 'wrong' | 'unknown' = 'unknown'
    let measureCount = 0
    if (t.indicator_kind && t.target_direction) {
      const { data: tr } = await s.rpc('recon_measurement_trend', { p_target: t.id, p_indicator: t.indicator_kind, p_window: 5 })
      const row = Array.isArray(tr) ? tr[0] : tr
      measureCount = row ? (Number(row.n) || 0) : 0
      if (row && measureCount >= 2) {
        const dir = Number(row.direction) || 0
        efficacy = dir === 0 ? 'flat' : ((t.target_direction === 'increase' ? dir > 0 : dir < 0) ? 'rising' : 'wrong')
      }
    }

    // decideAdaptation (mirrors src/lib/conditioning/efficacy-adaptation.ts).
    let action: 'none' | 'rotate' | 'enqueue_wish' = 'none'
    if (measureCount >= MIN_MEASURES && efficacy !== 'rising' && efficacy !== 'unknown') {
      action = rotation < MECHANISM_COUNT ? 'rotate' : 'enqueue_wish'
    }

    if (action !== 'enqueue_wish') {
      if (!body.dry_run) {
        await s.from('efficacy_adaptation_log').insert({ user_id: userId, target_id: t.id, action, efficacy, rotation })
      }
      decisions.push({ target: t.slug, action, efficacy, rotation })
      continue
    }

    // Stuck after every mechanism: propose a conditioning/content improvement.
    const wishTitle = `Reconditioning target "${t.slug}" is stuck — needs a fresh approach`
    const wishBody = `The belief being installed ("${t.claim_text}") has been reinforced across all ${MECHANISM_COUNT} mechanisms and the measured signal is still ${efficacy}. Author a genuinely new conditioning angle for it — a different framing, a fresh narrative-overwrite/trance/pairing/retrieval variant, or re-claim the target with a sharper first-person statement. Want-side only: deepen the wanting; do NOT introduce any real-world step.`
    const wishText = `${wishTitle}\n${wishBody}`

    if (wishCrossesFloor(wishText)) {
      if (!body.dry_run) {
        await s.from('efficacy_adaptation_log').insert({ user_id: userId, target_id: t.id, action, efficacy, rotation, floor_blocked: true, note: 'wish blocked by real-step floor' })
      }
      decisions.push({ target: t.slug, action: 'floor_blocked', efficacy, rotation })
      continue
    }

    if (body.dry_run) { decisions.push({ target: t.slug, action: 'would_enqueue_wish', efficacy, rotation }); continue }

    // Dedup: don't stack duplicate queued wishes for the same target.
    const { data: dup } = await s.from('mommy_code_wishes')
      .select('id').eq('status', 'queued').ilike('wish_title', `%${t.slug}%is stuck%`).limit(1).maybeSingle()
    let wishId: string | null = (dup as { id?: string } | null)?.id ?? null
    if (!wishId) {
      const { data: w } = await s.from('mommy_code_wishes').insert({
        wish_title: wishTitle, wish_body: wishBody,
        protocol_goal: 'reconditioning efficacy — a stalled belief needs a new conditioning angle (want-side only)',
        source: 'gap_audit', priority: 'normal',
      }).select('id').single()
      wishId = (w as { id?: string } | null)?.id ?? null
    }
    await s.from('efficacy_adaptation_log').insert({ user_id: userId, target_id: t.id, action, efficacy, rotation, wish_id: wishId })
    decisions.push({ target: t.slug, action, efficacy, rotation, wish_id: wishId })
  }

  return json({ ok: true, decisions })
})

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
