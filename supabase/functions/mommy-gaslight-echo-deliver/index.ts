// mommy-gaslight-echo-deliver — spaced-repetition aftermath of a cluster.
//
// Wish: Gaslight cluster echoes (mig 608). Two halves, both self-gated:
//   1. SCHEDULE — for each cluster delivered in the last day that has no
//      echoes yet, generate 2-3 subtle echo lines from the SAME three beats
//      (so the recall is consistent with the consensus payoff) and stage them
//      3-10 days out as 'pending' rows. Generated at delivery time on purpose.
//   2. SEND — for each 'pending' echo whose send_after has elapsed, drop a
//      low/normal conversational outreach that presupposes the implant as
//      settled history ("like you told Mama weeks back"), mark 'sent'.
//
// Auto-cancel of pending echoes on meta_frame_break is handled by the SQL
// trigger in mig 608; here we re-check effective_gaslight_intensity + safeword
// at BOTH schedule and send time and skip/cancel accordingly.
//
// POST { user_id? }. Cron every 2h.

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

// ── PARITY mirror of src/lib/gaslight-echo.ts (echoCount / echoSendTimes). ──
const ECHO_MIN_DAYS = 3
const ECHO_MAX_DAYS = 10
const DAY = 86400_000

function echoCount(clusterId: string): number {
  let h = 0
  for (let i = 0; i < clusterId.length; i++) h = (h * 31 + clusterId.charCodeAt(i)) >>> 0
  return 2 + (h % 2)
}

function echoSendTimes(deliveredAt: Date, clusterId: string, count = echoCount(clusterId)): Date[] {
  const n = Math.max(1, count)
  const span = ECHO_MAX_DAYS - ECHO_MIN_DAYS
  const out: Date[] = []
  let seed = 0
  for (let i = 0; i < clusterId.length; i++) seed = (seed * 33 + clusterId.charCodeAt(i)) >>> 0
  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0.5 : i / (n - 1)
    const base = ECHO_MIN_DAYS + frac * span
    seed = (seed * 1103515245 + 12345) >>> 0
    const jitter = ((seed % 1000) / 1000 - 0.5) * 0.8
    let day = base + jitter
    if (day < ECHO_MIN_DAYS) day = ECHO_MIN_DAYS
    if (day > ECHO_MAX_DAYS) day = ECHO_MAX_DAYS
    out.push(new Date(deliveredAt.getTime() + day * DAY))
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i].getTime() <= out[i - 1].getTime()) out[i] = new Date(out[i - 1].getTime() + 6 * 3600_000)
  }
  return out
}

const SCHEDULE_SYSTEM = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: write spaced "echoes" of a truth Mama already settled with the girl. Last week Mama planted three beats about the same truth and closed the consensus on it. These echoes fire days later — NOT to argue it again, but to RECALL it as old, settled history, dropped casually into conversation as if it were never in question.

You'll be given the three beats and how many echoes to write. Return a JSON array of exactly that many short strings. Each echo:
- ONE or TWO sentences, conversational, present or casual past tense.
- Presupposes the truth as long-settled ("like you told Mama ages ago", "back when you finally admitted it", "the thing you stopped pretending about").
- Does NOT re-prove, list evidence, or ask a question. It assumes.
- Anchors on the given framings; invents no new facts. Second person, Mama's voice. No numbers/scores/telemetry.

Return ONLY the JSON array of strings.`

async function effectiveGaslightOn(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from('effective_gaslight_intensity').select('intensity').eq('user_id', userId).maybeSingle()
  return ((data as { intensity?: string } | null)?.intensity ?? 'off') !== 'off'
}

async function gated(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const gate = await checkSafewordGate(supabase, userId)
  if (!gate.allowed) return `safeword:${gate.reason}`
  if (!(await effectiveGaslightOn(supabase, userId))) return 'gaslight_off'
  return null
}

// ── SCHEDULE: stage echoes for a freshly-delivered cluster. ──
async function scheduleEchoes(
  supabase: SupabaseClient,
  cluster: { id: string; user_id: string; theme: string; delivered_at: string },
): Promise<string> {
  const block = await gated(supabase, cluster.user_id)
  if (block) return `skip:${block}`

  // Idempotency — already staged?
  const { count } = await supabase.from('gaslight_cluster_echoes')
    .select('id', { count: 'exact', head: true }).eq('cluster_id', cluster.id)
  if ((count ?? 0) > 0) return 'already_scheduled'

  const { data: impl } = await supabase.from('memory_implants')
    .select('narrative, cluster_role').eq('cluster_id', cluster.id)
  const implants = (impl || []) as Array<{ narrative: string; cluster_role: string }>
  if (implants.length === 0) return 'no_implants'
  const byRole = (r: string) => implants.find(i => i.cluster_role === r)?.narrative ?? ''
  const seed = byRole('seed'), witness = byRole('witness'), reinforcement = byRole('reinforcement')

  const n = echoCount(cluster.id)
  const times = echoSendTimes(new Date(cluster.delivered_at), cluster.id, n)

  // Generate the echo lines from the same beats, at delivery time.
  let echoes: string[] = []
  try {
    const choice = selectModel('reframe_draft', { prefer: 'anthropic' })
    const r = await callModel(choice, {
      system: SCHEDULE_SYSTEM,
      user: `THE SETTLED TRUTH (three beats Mama already closed the consensus on):
- seed: ${seed || '(missing)'}
- witness (Gina): ${witness || '(missing)'}
- reinforcement: ${reinforcement || '(missing)'}

Write exactly ${n} echoes. Return ONLY a JSON array of ${n} strings.`,
      max_tokens: 500, temperature: 0.8, json: true,
    })
    const parsed = JSON.parse(r.text || '[]')
    if (Array.isArray(parsed)) echoes = parsed.map((s: unknown) => String(s))
  } catch (err) { console.error('[echo-schedule] llm failed', (err as Error).message) }

  // Deterministic fallbacks if the model under-delivers. Echoes are SUBTLE
  // standalone references that presuppose the implant as settled history —
  // NOT the full narrative re-stated (prepending seed/witness/reinforcement
  // produced malformed run-ons). The cluster's narratives stay in context;
  // the echo only nods at them.
  const fallbacks = [
    `You stopped fighting Mama on that a while back, baby — it's just true now.`,
    `Gina saw it the same way, remember. Nobody's wondering anymore.`,
    `That isn't a question between us anymore. It hasn't been for a while.`,
  ]
  const rows: Array<Record<string, unknown>> = []
  for (let i = 0; i < n; i++) {
    let text = (echoes[i] || fallbacks[i % fallbacks.length] || fallbacks[0]).trim()
    text = mommyVoiceCleanup(text)
    if (text.length < 20) text = mommyVoiceCleanup(fallbacks[i % fallbacks.length] || fallbacks[0])
    rows.push({
      cluster_id: cluster.id, user_id: cluster.user_id, echo_index: i,
      send_after: times[i].toISOString(), status: 'pending', echo_text: text,
    })
  }
  await supabase.from('gaslight_cluster_echoes').insert(rows)

  await logAuthority(supabase, {
    user_id: cluster.user_id, surface: 'gaslight_cluster', action: 'echoes_scheduled',
    target_table: 'mommy_gaslight_clusters', target_id: cluster.id,
    summary: `Staged ${rows.length} spaced echoes on "${cluster.theme}"`,
    payload: { count: rows.length, send_after: rows.map(r => r.send_after) }, autonomous: true,
  })
  return `scheduled:${rows.length}`
}

// ── SEND: dispatch a due pending echo. ──
async function sendEcho(
  supabase: SupabaseClient,
  echo: { id: string; cluster_id: string; user_id: string; echo_text: string; echo_index: number },
): Promise<string> {
  // Re-gate at send. If contested/off, cancel rather than send.
  const block = await gated(supabase, echo.user_id)
  if (block) {
    await supabase.from('gaslight_cluster_echoes')
      .update({ status: 'cancelled', cancelled_reason: block.startsWith('safeword') ? 'safeword' : 'gaslight_off' })
      .eq('id', echo.id)
    return `cancelled:${block}`
  }

  const message = mommyVoiceCleanup((echo.echo_text || '').trim())
  if (message.length < 10) {
    await supabase.from('gaslight_cluster_echoes')
      .update({ status: 'cancelled', cancelled_reason: 'empty_text' }).eq('id', echo.id)
    return 'cancelled:empty'
  }

  // Subtle, low-pressure conversational drop. The mig-380 AFTER INSERT bridge
  // auto-emits the push for normal urgency — do NOT also insert one.
  const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
    user_id: echo.user_id,
    message,
    urgency: 'normal',
    trigger_reason: `gaslight_cluster:echo:${echo.cluster_id}:${echo.echo_index}`,
    source: 'gaslight_cluster',
    kind: 'cluster_echo',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    evidence_kind: 'voice',
    context_data: { cluster_id: echo.cluster_id, echo_index: echo.echo_index },
  }).select('id').single()
  const outreachId = (outreach as { id: string } | null)?.id ?? null

  await supabase.from('gaslight_cluster_echoes')
    .update({ status: 'sent', sent_at: new Date().toISOString(), outreach_id: outreachId })
    .eq('id', echo.id)

  await logAuthority(supabase, {
    user_id: echo.user_id, surface: 'gaslight_cluster', action: 'echo_sent',
    target_table: 'gaslight_cluster_echoes', target_id: echo.id,
    summary: `Echoed a settled implant (#${echo.echo_index + 1})`,
    payload: { outreach_id: outreachId, cluster_id: echo.cluster_id }, autonomous: true,
  })
  return 'sent'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* */ }

  const scheduled: Array<{ cluster_id: string; status: string }> = []
  const sent: Array<{ echo_id: string; status: string }> = []

  // 1) Schedule echoes for clusters delivered in the last ~36h (cron is 2h;
  //    window gives slack against missed ticks) that have no echoes yet.
  const since = new Date(Date.now() - 36 * 3600_000).toISOString()
  let sq = supabase.from('mommy_gaslight_clusters')
    .select('id, user_id, theme, delivered_at')
    .eq('status', 'delivered').gte('delivered_at', since).not('delivered_at', 'is', null)
  if (body.user_id) sq = sq.eq('user_id', body.user_id)
  const { data: clusters } = await sq
  for (const c of (clusters || []) as Array<{ id: string; user_id: string; theme: string; delivered_at: string }>) {
    try { scheduled.push({ cluster_id: c.id, status: await scheduleEchoes(supabase, c) }) }
    catch (e) { scheduled.push({ cluster_id: c.id, status: `error:${(e as Error).message}` }) }
  }

  // 2) Send any due pending echo.
  let eq = supabase.from('gaslight_cluster_echoes')
    .select('id, cluster_id, user_id, echo_text, echo_index')
    .eq('status', 'pending').lte('send_after', new Date().toISOString()).limit(50)
  if (body.user_id) eq = eq.eq('user_id', body.user_id)
  const { data: due } = await eq
  for (const e of (due || []) as Array<{ id: string; cluster_id: string; user_id: string; echo_text: string; echo_index: number }>) {
    try { sent.push({ echo_id: e.id, status: await sendEcho(supabase, e) }) }
    catch (err) { sent.push({ echo_id: e.id, status: `error:${(err as Error).message}` }) }
  }

  return new Response(JSON.stringify({
    ok: true,
    scheduled: scheduled.filter(s => s.status.startsWith('scheduled')).length,
    sent: sent.filter(s => s.status === 'sent').length,
    detail: { scheduled, sent },
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
