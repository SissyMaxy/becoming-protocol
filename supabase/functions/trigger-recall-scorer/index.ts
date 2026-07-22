// trigger-recall-scorer — nightly recall EMA for the armed-trigger runtime (WS4).
//
// Reads armed_trigger_deployments (mig 700). For each armed phrase it computes a
// recall EMA from the scored deployments, then:
//   - fades dead phrases: a trance_trigger whose recall stays low over enough
//     samples is retired (status='retired') so it stops being deployed;
//   - reinforces winners: high-recall mommy_post_hypnotic_triggers are pinned
//     always_on so the rotation keeps using them.
// It also expires stale unscored outreach deployments (older than the 30-min
// recall window never got a reply to score) so they don't linger as unscored.
//
// Container: recall is a server-side measurement only; nothing here is ever
// shown to her, and no copy carries a count. Gated fail-closed on safeword.
// POST { user_id?, dry_run? }.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const HANDLER_USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const RECALL_WINDOW_MS = 30 * 60 * 1000
const EMA_ALPHA = 0.4              // recency weight
const MIN_SAMPLES = 4              // don't judge a phrase on too little data
const FADE_FLOOR = 0.2             // EMA below this over MIN_SAMPLES → retire
const REINFORCE_CEIL = 0.6         // EMA above this → pin always_on

function ema(scores: number[]): number {
  if (scores.length === 0) return 0
  let acc = scores[0]
  for (let i = 1; i < scores.length; i++) acc = EMA_ALPHA * scores[i] + (1 - EMA_ALPHA) * acc
  return acc
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER
  const dryRun = body.dry_run === true

  // Gate: safeword floor.
  const { data: sw } = await s.rpc('is_safeword_active', { uid: userId, window_seconds: 60 })
  if (sw === true) return json({ ok: true, skipped: 'safeword_active' })

  // 1. Expire stale unscored deployments (no reply landed to score them).
  const staleBefore = new Date(Date.now() - RECALL_WINDOW_MS).toISOString()
  if (!dryRun) {
    await s.from('armed_trigger_deployments')
      .update({ recall_score: 0, scored_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('scored_at', null)
      .lt('deployed_at', staleBefore)
  }

  // 2. Per-trigger recall EMA from the scored deployments (chronological).
  const { data: rows } = await s.from('armed_trigger_deployments')
    .select('trigger_table, trigger_id, recall_score, deployed_at')
    .eq('user_id', userId)
    .not('recall_score', 'is', null)
    .order('deployed_at', { ascending: true })

  const byTrigger = new Map<string, { table: string; id: string; scores: number[] }>()
  for (const r of (rows || []) as Array<{ trigger_table: string; trigger_id: string; recall_score: number }>) {
    const key = `${r.trigger_table}:${r.trigger_id}`
    if (!byTrigger.has(key)) byTrigger.set(key, { table: r.trigger_table, id: r.trigger_id, scores: [] })
    byTrigger.get(key)!.scores.push(Number(r.recall_score))
  }

  const decisions: Array<Record<string, unknown>> = []
  for (const { table, id, scores } of byTrigger.values()) {
    if (scores.length < MIN_SAMPLES) continue
    const e = ema(scores)
    let action = 'none'
    if (e < FADE_FLOOR && table === 'trance_triggers') {
      action = 'retire'
      if (!dryRun) await s.from('trance_triggers').update({ status: 'retired' }).eq('id', id)
    } else if (e >= REINFORCE_CEIL && table === 'mommy_post_hypnotic_triggers') {
      action = 'reinforce'
      if (!dryRun) await s.from('mommy_post_hypnotic_triggers').update({ always_on: true }).eq('id', id)
    }
    decisions.push({ table, id, ema: Math.round(e * 100) / 100, samples: scores.length, action })
  }

  return json({ ok: true, dry_run: dryRun, decisions })
})

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
