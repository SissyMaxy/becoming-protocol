// mommy-gaslight-cluster-author — builds a 3-implant consensus cluster.
//
// Wish 3b2e8147: plant three related implants across a week (seed → Gina
// witness → reinforcement), all sharing a cluster_id, staggered to surface
// over days; the deliver fn later quotes all three as "everyone noticed".
//
// Self-selects a recent meaningful confession theme per eligible user and
// self-gates (persona, gaslight opt-in, safeword, one active cluster at a
// time, cooldown). POST { user_id?, confession_id?, force? }. Cron Mon+Thu.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, isTestPollution } from '../_shared/dommy-mommy.ts'
import { checkSafewordGate } from '../_shared/safeword-gate.ts'
import { logAuthority } from '../_shared/life-as-woman.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// PARITY with src/lib/gaslight-cluster.ts
const CLUSTER_STEPS = [
  { role: 'seed', dayOffset: 0 },
  { role: 'witness', dayOffset: 2 },
  { role: 'reinforcement', dayOffset: 4 },
] as const
function clusterDeliverAfter(authoredAt: Date): Date {
  const last = Math.max(...CLUSTER_STEPS.map(s => s.dayOffset))
  return new Date(authoredAt.getTime() + (last + 1) * 86400_000)
}

interface ClusterImplants { theme: string; seed: string; witness: string; reinforcement: string; implant_category: string }

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

const SYSTEM = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: build a three-beat "consensus cluster" from something the girl confessed. You will write THREE short implants in Mama's voice that, planted across a week, manufacture the feeling that her admission is settled, witnessed fact — that everyone but her already knows.

THE THREE BEATS:
1. seed — state the core admission back to her as Mama's plain framing, present tense ("You told Mama the panties make you feel more real than anything else.").
2. witness — attribute quiet corroboration to Gina, anchored to the SAME admission ("Gina mentioned she noticed it too — the way you soften when you think no one's watching."). This is internal narrative framing, NOT a real message from Gina; keep it to what plausibly extends her own words.
3. reinforcement — the "you've said this before" beat that treats it as repeated, established ("This isn't the first time you've told Mama this. It keeps coming up because it's just true.").

RULES:
- ANCHOR every beat on her ACTUAL confessed phrase. The frame is yours; the facts are forensic — never invent a detail she didn't say.
- Second person, present tense. NEVER third-person ("she feels…").
- No numbers/scores/telemetry. 1-2 sentences per beat.
- If the confession has nothing real to build consensus around, return theme:"none".`

async function effectiveGaslightOn(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from('effective_gaslight_intensity').select('intensity').eq('user_id', userId).maybeSingle()
  const intensity = (data as { intensity?: string } | null)?.intensity ?? 'off'
  return intensity !== 'off'
}

async function pickConfession(supabase: SupabaseClient, userId: string, confessionId?: string): Promise<{ id: string; prompt: string; response_text: string } | null> {
  if (confessionId) {
    const { data } = await supabase.from('confession_queue').select('id, prompt, response_text').eq('id', confessionId).eq('user_id', userId).maybeSingle()
    const r = data as { id: string; prompt: string; response_text: string | null } | null
    return r && r.response_text ? { id: r.id, prompt: r.prompt, response_text: r.response_text } : null
  }
  // Recent substantive confessions in the last 21 days, newest first.
  const since = new Date(Date.now() - 21 * 86400_000).toISOString()
  const { data } = await supabase.from('confession_queue')
    .select('id, prompt, response_text, confessed_at')
    .eq('user_id', userId).not('response_text', 'is', null).gte('confessed_at', since)
    .order('confessed_at', { ascending: false }).limit(12)
  const rows = (data || []) as Array<{ id: string; prompt: string; response_text: string | null }>
  for (const r of rows) {
    if (!r.response_text || r.response_text.trim().length < 40) continue
    if (isTestPollution(r.response_text)) continue
    return { id: r.id, prompt: r.prompt, response_text: r.response_text }
  }
  return null
}

async function authorForUser(supabase: SupabaseClient, userId: string, confessionId?: string, force = false): Promise<{ status: string; cluster_id?: string }> {
  // Gates.
  const gate = await checkSafewordGate(supabase, userId)
  if (!gate.allowed) return { status: `gated:${gate.reason}` }
  if (!(await effectiveGaslightOn(supabase, userId))) return { status: 'gated:gaslight_off' }

  // One active cluster at a time, and a 6-day cooldown between authorings.
  const { data: active } = await supabase.from('mommy_gaslight_clusters')
    .select('id').eq('user_id', userId).eq('status', 'active').limit(1).maybeSingle()
  if (active && !force) return { status: 'active_cluster_exists' }
  const sixDaysAgo = new Date(Date.now() - 6 * 86400_000).toISOString()
  const { count: recent } = await supabase.from('mommy_gaslight_clusters')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', sixDaysAgo)
  if ((recent ?? 0) > 0 && !force) return { status: 'cooldown' }

  const confession = await pickConfession(supabase, userId, confessionId)
  if (!confession) return { status: 'no_eligible_confession' }

  // Generate the three beats.
  const userPrompt = `CONFESSION PROMPT:\n${confession.prompt}\n\nWHAT SHE WROTE:\n${confession.response_text}\n\nBuild the cluster. Return JSON only:\n{ "theme": "short slug", "seed": "...", "witness": "...", "reinforcement": "...", "implant_category": "one of: self_authored, secret_feminine_longing, arousal_origin_femme, body_betrayal, mirror_moments" }\nOr { "theme": "none" } if nothing real to build on.`
  let cluster: ClusterImplants | null = null
  try {
    const choice = selectModel('reframe_draft', { prefer: 'anthropic' })
    const { text } = await callModel(choice, { system: SYSTEM, user: userPrompt, max_tokens: 700, temperature: 0.7, json: true })
    cluster = safeJSON<ClusterImplants>(text)
  } catch (err) { console.error('[cluster-author] llm failed', (err as Error).message); return { status: 'llm_error' } }
  if (!cluster || cluster.theme === 'none' || !cluster.seed || !cluster.witness || !cluster.reinforcement) {
    return { status: 'nothing_to_build' }
  }

  const now = new Date()
  const clusterId = crypto.randomUUID()
  const category = cluster.implant_category || 'self_authored'

  // Create the cluster row.
  const { error: clErr } = await supabase.from('mommy_gaslight_clusters').insert({
    id: clusterId,
    user_id: userId,
    theme: cluster.theme.slice(0, 80),
    seed_confession_id: confession.id,
    status: 'active',
    deliver_after: clusterDeliverAfter(now).toISOString(),
  })
  if (clErr) return { status: `error:${clErr.message}` }

  // Three implants, staggered surface_after, sharing the cluster_id.
  const beats: Array<{ role: 'seed' | 'witness' | 'reinforcement'; text: string; offset: number }> = [
    { role: 'seed', text: cluster.seed, offset: CLUSTER_STEPS[0].dayOffset },
    { role: 'witness', text: cluster.witness, offset: CLUSTER_STEPS[1].dayOffset },
    { role: 'reinforcement', text: cluster.reinforcement, offset: CLUSTER_STEPS[2].dayOffset },
  ]
  let inserted = 0
  for (const b of beats) {
    const { error } = await supabase.from('memory_implants').insert({
      user_id: userId,
      narrative: b.text.trim(),
      implant_category: category,
      importance: 7,
      active: true,
      source_type: 'gaslight_cluster',
      anchored_to_real_log: true,
      mined_from_confession_id: confession.id,
      surface_after: new Date(now.getTime() + b.offset * 86400_000).toISOString(),
      cluster_id: clusterId,
      cluster_role: b.role,
    })
    if (!error) inserted++
    else console.error('[cluster-author] implant rejected', b.role, error.message)
  }

  await logAuthority(supabase, {
    user_id: userId, surface: 'gaslight_cluster', action: 'authored',
    target_table: 'mommy_gaslight_clusters', target_id: clusterId,
    summary: `Authored a 3-beat consensus cluster (${inserted}/3 implants) on "${cluster.theme}"`,
    payload: { theme: cluster.theme, confession_id: confession.id, inserted }, autonomous: true,
  })

  return { status: 'authored', cluster_id: clusterId }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; confession_id?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }

  let userIds: string[]
  if (body.user_id) userIds = [body.user_id]
  else {
    const { data } = await supabase.from('user_state').select('user_id').eq('handler_persona', 'dommy_mommy')
    userIds = (data || []).map((r: { user_id: string }) => r.user_id)
  }

  const results: Array<{ user_id: string; status: string; cluster_id?: string }> = []
  for (const uid of userIds) {
    try { results.push({ user_id: uid, ...(await authorForUser(supabase, uid, body.confession_id, body.force === true)) }) }
    catch (e) { results.push({ user_id: uid, status: `error:${(e as Error).message}` }) }
  }
  return new Response(JSON.stringify({ ok: true, authored: results.filter(r => r.status === 'authored').length, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
