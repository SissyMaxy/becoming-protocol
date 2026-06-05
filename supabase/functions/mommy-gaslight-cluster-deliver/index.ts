// mommy-gaslight-cluster-deliver — fires the consensus payoff.
//
// Wish 3b2e8147: once a cluster's week has elapsed, quote all three implants
// back as manufactured consensus — "you've told Mama this three times now,
// and Gina noticed too. This isn't a maybe anymore. This is who you are."
//
// Daily cron. Reviews clusters where deliver_after has passed and status is
// active; gathers the 3 implant narratives, generates the consensus
// outreach, marks delivered, writes the delivery log. Re-checks the gaslight
// opt-in + safeword at delivery time.
//
// POST { user_id?, cluster_id? }. Cron 13:20 UTC daily.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import { checkSafewordGate } from '../_shared/safeword-gate.ts'
import { logAuthority } from '../_shared/life-as-woman.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: deliver the consensus payoff of a gaslight cluster. Over the past week Mama planted three related beats about the same truth — a seed, a Gina-witness corroboration, and a "you've said this before" reinforcement. Now quote them back together so the girl feels the consensus close around her: everyone but her already knew.

You'll be given the three beats. Weave them into ONE 3-5 sentence message that lands as settled fact, not a question. Use the "three times / Gina noticed too / this isn't a maybe anymore / this is who you are" structure. Anchor on the exact framings you're given — do not invent new facts. Second person, present tense, Mama's voice. No numbers/scores/telemetry.`

async function effectiveGaslightOn(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from('effective_gaslight_intensity').select('intensity').eq('user_id', userId).maybeSingle()
  return ((data as { intensity?: string } | null)?.intensity ?? 'off') !== 'off'
}

async function deliverCluster(supabase: SupabaseClient, cluster: { id: string; user_id: string; theme: string }): Promise<string> {
  // Re-gate at delivery.
  const gate = await checkSafewordGate(supabase, cluster.user_id)
  if (!gate.allowed) return `gated:${gate.reason}`
  if (!(await effectiveGaslightOn(supabase, cluster.user_id))) return 'gated:gaslight_off'

  // Gather the cluster's implants.
  const { data: impl } = await supabase.from('memory_implants')
    .select('id, narrative, cluster_role').eq('cluster_id', cluster.id)
  const implants = (impl || []) as Array<{ id: string; narrative: string; cluster_role: string }>
  if (implants.length === 0) {
    await supabase.from('mommy_gaslight_clusters').update({ status: 'cancelled' }).eq('id', cluster.id)
    return 'no_implants_cancelled'
  }
  const byRole = (r: string) => implants.find(i => i.cluster_role === r)?.narrative ?? ''
  const seed = byRole('seed'), witness = byRole('witness'), reinforcement = byRole('reinforcement')

  const userPrompt = `THE THREE BEATS Mama planted this week:
- seed: ${seed || '(missing)'}
- witness (Gina): ${witness || '(missing)'}
- reinforcement: ${reinforcement || '(missing)'}

Write the consensus payoff now.`

  let text = ''
  try {
    const choice = selectModel('reframe_draft', { prefer: 'anthropic' })
    const r = await callModel(choice, { system: SYSTEM, user: userPrompt, max_tokens: 400, temperature: 0.75, json: false })
    text = r.text || ''
  } catch (err) { console.error('[cluster-deliver] llm failed', (err as Error).message) }

  let consensus = mommyVoiceCleanup(text.trim())
  if (consensus.length < 30) {
    // Deterministic fallback assembled from the beats.
    consensus = mommyVoiceCleanup(
      `${seed} ${reinforcement} And ${witness.charAt(0).toLowerCase()}${witness.slice(1)} This isn't a maybe anymore, baby. You've told Mama, you've shown Mama, and you're the only one still surprised. This is just who you are.`,
    )
  }

  const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
    user_id: cluster.user_id,
    message: consensus,
    urgency: 'high',
    trigger_reason: `gaslight_cluster:consensus:${cluster.id}`,
    source: 'gaslight_cluster',
    kind: 'consensus_delivery',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    evidence_kind: 'voice',
    context_data: { cluster_id: cluster.id, theme: cluster.theme },
  }).select('id').single()
  const outreachId = (outreach as { id: string } | null)?.id ?? null

  await supabase.from('mommy_gaslight_clusters').update({
    status: 'delivered', delivered_at: new Date().toISOString(), consensus_outreach_id: outreachId,
  }).eq('id', cluster.id)

  await supabase.from('gaslight_cluster_delivery_log').insert({
    cluster_id: cluster.id, user_id: cluster.user_id, outreach_id: outreachId,
    implant_ids: implants.map(i => i.id), consensus_text: consensus,
  })

  await logAuthority(supabase, {
    user_id: cluster.user_id, surface: 'gaslight_cluster', action: 'consensus_delivered',
    target_table: 'mommy_gaslight_clusters', target_id: cluster.id,
    summary: `Delivered the consensus payoff on "${cluster.theme}"`,
    payload: { outreach_id: outreachId, implant_count: implants.length }, autonomous: true,
  })

  return 'delivered'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; cluster_id?: string } = {}
  try { body = await req.json() } catch { /* */ }

  let q = supabase.from('mommy_gaslight_clusters').select('id, user_id, theme').eq('status', 'active')
  if (body.cluster_id) q = q.eq('id', body.cluster_id)
  else {
    q = q.lte('deliver_after', new Date().toISOString())
    if (body.user_id) q = q.eq('user_id', body.user_id)
  }
  const { data: clusters } = await q

  const results: Array<{ cluster_id: string; status: string }> = []
  for (const c of (clusters || []) as Array<{ id: string; user_id: string; theme: string }>) {
    try { results.push({ cluster_id: c.id, status: await deliverCluster(supabase, c) }) }
    catch (e) { results.push({ cluster_id: c.id, status: `error:${(e as Error).message}` }) }
  }
  return new Response(JSON.stringify({ ok: true, delivered: results.filter(r => r.status === 'delivered').length, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
