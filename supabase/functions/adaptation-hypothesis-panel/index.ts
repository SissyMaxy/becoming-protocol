// adaptation-hypothesis-panel — the SAFE slice of the adaptive loop.
//
// Wish: for an unhandled mommy_ux_signal_log signal, an LLM panel
// (anthropic + openai, judge picks) proposes 2-3 alternative designs, ranks
// them, and RECORDS the hypotheses + selected into mommy_adaptation_log
// (mig 599). For in-scope ideas it files a mommy_code_wishes row
// (source = panel_ideation) at priority normal/high. For large / cross-cutting
// ideas it files a queued wish carrying a needs-review note in the body.
//
// DEFERRED — NOT built here (human-gated): auto-ship-to-mommy-builder. This
// panel proposes/records/files only. Nothing it does mutates the builder
// pipeline or ships code. A human/Claude session actions the wishes.
//
// POST { dry_run?, limit?, signal_id? }. Cron-driven (mig 609).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  normalizeHypotheses,
  pickSelected,
  scopeToWish,
  type Hypothesis,
} from './adaptation-panel.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Signal {
  id: string
  user_id: string | null
  event_type: string
  surface: string | null
  signal_strength: number
  raw_context: string | null
  fix_wish_id: string | null
  detected_at: string
}

const SYSTEM_PROMPT = `You are the adaptive-loop hypothesis panel for a self-improving product.
A user-experience friction signal was captured. Propose 2-3 distinct alternative DESIGNS that would resolve the friction, rank them, and judge each one's scope.

Rules:
- Each hypothesis is a concrete product change a single engineer could action, NOT a vague aspiration.
- "scope" is one of: "in_scope" (a focused UI/copy/flow/logic fix), "large" (multi-surface feature), "cross_cutting" (touches shared infra/architecture or many systems).
- "score" is 0-100: how confident you are this cleanly resolves the signal.
- Do NOT propose anything that ships code automatically; you only propose.

Return ONLY JSON: {"hypotheses":[{"design":"...","rationale":"...","scope":"in_scope|large|cross_cutting","score":0-100}, ...]}`

async function runPanel(signal: Signal): Promise<{ hyps: Hypothesis[]; judgeNote: string }> {
  const userPrompt = [
    `Friction signal:`,
    `- type: ${signal.event_type}`,
    `- surface: ${signal.surface ?? '(unknown)'}`,
    `- strength: ${signal.signal_strength}`,
    `- what was observed: ${signal.raw_context ?? '(no detail captured)'}`,
    ``,
    `Propose 2-3 alternative designs, rank them, judge scope. JSON only.`,
  ].join('\n')

  // Two providers; judge keeps the union (dedup + score-sort happen in the
  // pure helper). anthropic preferred, openai as the cross-lens.
  const anth = selectModel('strategic_plan', { prefer: 'anthropic' })
  const oai = selectModel('strategic_plan', { prefer: 'openai' })

  const results = await Promise.allSettled([
    callModel(anth, { system: SYSTEM_PROMPT, user: userPrompt, json: true, max_tokens: 1200, temperature: 0.6 }),
    callModel(oai, { system: SYSTEM_PROMPT, user: userPrompt, json: true, max_tokens: 1200, temperature: 0.6 }),
  ])

  const merged: unknown[] = []
  const notes: string[] = []
  for (const [i, r] of results.entries()) {
    const tag = i === 0 ? 'anthropic' : 'openai'
    if (r.status === 'fulfilled') {
      notes.push(`${tag}:ok`)
      try {
        const parsed = JSON.parse(r.value.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())
        const list = Array.isArray(parsed) ? parsed : (parsed?.hypotheses ?? [])
        if (Array.isArray(list)) merged.push(...list)
      } catch { notes.push(`${tag}:parse_fail`) }
    } else {
      notes.push(`${tag}:err`)
    }
  }

  // The pure helper dedupes on design, sorts by score, caps at 3.
  const hyps = normalizeHypotheses(merged)
  return { hyps, judgeNote: notes.join(' ') }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  let body: { dry_run?: boolean; limit?: number; signal_id?: string } = {}
  try { body = await req.json() } catch { /* */ }
  const limit = Math.max(1, Math.min(body.limit ?? 5, 20))

  // "Unhandled" = a UX signal with no adaptation logged yet (and no fix wish
  // already attached). Optionally target a single signal_id.
  let q = supabase.from('mommy_ux_signal_log')
    .select('id, user_id, event_type, surface, signal_strength, raw_context, fix_wish_id, detected_at')
    .order('detected_at', { ascending: false })
    .limit(limit * 4)
  if (body.signal_id) q = q.eq('id', body.signal_id)
  const { data: sigRows } = await q
  const signals = (sigRows ?? []) as Signal[]

  // Which signals already have an adaptation row? Skip those.
  const ids = signals.map(s => s.id)
  const handled = new Set<string>()
  if (ids.length) {
    const { data: adapted } = await supabase.from('mommy_adaptation_log')
      .select('signal_id').in('signal_id', ids)
    for (const a of (adapted ?? []) as Array<{ signal_id: string | null }>) {
      if (a.signal_id) handled.add(a.signal_id)
    }
  }

  const candidates = signals.filter(s => !handled.has(s.id)).slice(0, limit)
  const actions: Array<Record<string, unknown>> = []

  for (const signal of candidates) {
    const { hyps, judgeNote } = await runPanel(signal)
    const selected = pickSelected(hyps)

    if (body.dry_run) {
      actions.push({ signal_id: signal.id, hypotheses: hyps.length, selected: selected?.design ?? null, scope: selected?.scope ?? null, status: 'dry_run', judge: judgeNote })
      continue
    }

    if (!hyps.length || !selected) {
      // Record the no-op so we don't re-run the panel against a signal that
      // yields nothing (both providers down / unparseable).
      await supabase.from('mommy_adaptation_log').insert({
        signal_id: signal.id,
        hypotheses: [],
        selected_hypothesis: null,
        outcome: 'no_op',
      })
      actions.push({ signal_id: signal.id, hypotheses: 0, status: 'no_op', judge: judgeNote })
      continue
    }

    const disp = scopeToWish(selected)
    let wishId: string | null = null

    if (disp.file) {
      const reviewBlock = disp.needsReview ? `${disp.reviewNote}\n\n` : ''
      const bodyText =
        `${reviewBlock}The adaptive-loop hypothesis panel proposed designs for a UX friction signal ` +
        `(${signal.event_type} @ ${signal.surface ?? 'unknown'}).\n\n` +
        `Observed: "${(signal.raw_context ?? '').slice(0, 280)}"\n\n` +
        `Selected design (rank 1 of ${hyps.length}, score ${selected.score}, scope ${selected.scope}):\n` +
        `${selected.design}\n\nWhy: ${selected.rationale || '(none given)'}\n\n` +
        (hyps.length > 1
          ? `Alternatives considered:\n` + hyps.slice(1).map((h, i) => `  ${i + 2}. (${h.score}) ${h.design}`).join('\n') + '\n\n'
          : '') +
        `Action: implement the selected design (or a better one informed by the alternatives). This is the "Mommy adapts to lived UX friction" loop — resolve it without manual routing. NOTE: the panel does NOT auto-ship; a session must action this.`

      const { data: wish } = await supabase.from('mommy_code_wishes').insert({
        wish_title: `Adapt: ${selected.design.slice(0, 64)}`,
        wish_body: bodyText,
        protocol_goal: 'Self-improving product — turn lived UX friction into a ranked, scoped design proposal instead of waiting for manual routing.',
        source: 'panel_ideation',
        affected_surfaces: { signal_id: signal.id, surface: signal.surface, scope: selected.scope, needs_review: disp.needsReview, panel: 'adaptation_hypothesis' },
        priority: disp.priority,
        status: 'queued',
      }).select('id').single()
      wishId = (wish as { id: string } | null)?.id ?? null
    }

    await supabase.from('mommy_adaptation_log').insert({
      signal_id: signal.id,
      hypotheses: hyps,
      selected_hypothesis: { ...selected, needs_review: disp.needsReview },
      fix_wish_id: wishId,
      outcome: null, // pending — outcome tracked when/if the fix ships
    })

    // Backlink the wish onto the source signal for visibility (mirrors the
    // friction trigger's fix_wish_id convention).
    if (wishId && !signal.fix_wish_id) {
      await supabase.from('mommy_ux_signal_log').update({ fix_wish_id: wishId }).eq('id', signal.id)
    }

    // Surface to the supervisor sink (pulse panel visibility).
    await supabase.from('mommy_supervisor_log').insert({
      component: 'adaptation_hypothesis_panel',
      severity: disp.needsReview ? 'warning' : 'info',
      event_kind: 'adaptation_proposed',
      message: `signal ${signal.event_type}@${signal.surface ?? '?'} → ${hyps.length} hyps → ${selected.scope}${disp.needsReview ? ' (needs review)' : ''}${wishId ? ' → wish filed' : ''}`,
      context_data: { signal_id: signal.id, scope: selected.scope, priority: disp.priority, wish_id: wishId, needs_review: disp.needsReview },
    })

    actions.push({ signal_id: signal.id, hypotheses: hyps.length, selected: selected.design, scope: selected.scope, priority: disp.priority, needs_review: disp.needsReview, wish_id: wishId, status: wishId ? 'wish_filed' : 'recorded_only', judge: judgeNote })
  }

  return new Response(JSON.stringify({
    ok: true,
    candidates: candidates.length,
    proposed: actions.filter(a => a.status === 'wish_filed' || a.status === 'recorded_only').length,
    wishes_filed: actions.filter(a => a.status === 'wish_filed').length,
    actions,
    deferred: 'auto-ship-to-mommy-builder is intentionally NOT wired (human-gated).',
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
