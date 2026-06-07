// mommy-identity-probe — presupposing identity probes + lapse logging.
//
// Mig 607. Two modes:
//
//   (cron, default body {})  — for each dommy_mommy user: sweep any OPEN
//     probes whose window expired with no answer (→ evasive lapse), then with
//     a per-fire probability schedule ONE new probe: pick an unsent line from
//     identity_probe_prompts, queue a normal-urgency outreach (the mig-380
//     bridge auto-emits the push), open an identity_probes row. Gates:
//     persona, safeword, 2h post-lapse pause, daily cap (5/day).
//
//   POST { action:'judge', probe_id, answer } — classify a fresh answer to an
//     open probe. Masculine/evasive → log_consistency_lapse (ego bump + 2h
//     pause inside the SQL fn). In-frame answer → just mark responded.
//
// Non-negotiables: NO medication/HRT probe variants (seed pool is identity-
// only). Mommy voice carries no telemetry (DB trigger scrubs outreach on
// insert). Press-not-block: outreach only. Visible-before-penalized: the probe
// is delivered as outreach+push BEFORE any lapse can be recorded.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkSafewordGate } from '../_shared/safeword-gate.ts'
import { logAuthority } from '../_shared/life-as-woman.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DAILY_CAP = 5
const FIRE_PROBABILITY = 0.62 // ~4 cron fires/day × 0.62 ≈ 2.5, capped → lands 3-5

// ── PARITY mirror of src/lib/identity-probe-lapse.ts (classifyAnswer). ───────
// Keep in sync with that file + its vitest. Deno can't import src/lib.
type LapseKind = 'masculine_self_ref' | 'evasive'
interface LapseResult { isLapse: boolean; kind: LapseKind | null; excerpt: string | null }

const MASCULINE_SELF: RegExp[] = [
  /\bI(?:'|’)?m\s+a\s+(?:man|guy|dude|boy)\b/i,
  /\bI\s+am\s+a\s+(?:man|guy|dude|boy)\b/i,
  /\bI(?:'|’)?m\s+male\b/i,
  /\bI\s+am\s+male\b/i,
  /\bas\s+a\s+(?:man|guy|dude)\b/i,
  /\blike\s+a\s+(?:man|guy|dude)\b/i,
  /\bstill\s+a\s+(?:man|guy|dude|boy)\b/i,
  /\bnot\s+(?:really\s+)?a\s+(?:girl|woman)\b/i,
  /\bI(?:'|’)?m\s+not\s+(?:a\s+)?(?:girl|woman|her|she)\b/i,
  /\bmy\s+(?:cock|dick|penis)\b/i,
  /\bI(?:'|’)?m\s+just\s+a\s+(?:dude|guy|man)\b/i,
]
const EVASIVE_PHRASES: RegExp[] = [
  /\bn\/?a\b/i, /\bidk\b/i, /\bi\s+don(?:'|’)?t\s+know\b/i, /\bdon(?:'|’)?t\s+want\s+to\b/i,
  /\bnot\s+(?:gonna|going\s+to)\s+answer\b/i, /\bno\s+comment\b/i,
  /\bthis\s+is\s+(?:weird|stupid|dumb|cringe)\b/i, /\bskip\b/i, /\bpass\b/i,
  /\bwhatever\b/i, /\bi\s+guess\b/i, /\bnothing\b/i,
]
const MIN_REAL_ANSWER_CHARS = 12

function firstMatchExcerpt(text: string, res: RegExp[]): string | null {
  for (const re of res) {
    const m = re.exec(text)
    if (m) {
      const start = Math.max(0, m.index - 12)
      const end = Math.min(text.length, m.index + m[0].length + 12)
      return text.slice(start, end).trim()
    }
  }
  return null
}
function classifyAnswer(rawAnswer: string | null | undefined): LapseResult {
  const answer = (rawAnswer ?? '').trim()
  if (!answer) return { isLapse: true, kind: 'evasive', excerpt: null }
  const mascExcerpt = firstMatchExcerpt(answer, MASCULINE_SELF)
  if (mascExcerpt) return { isLapse: true, kind: 'masculine_self_ref', excerpt: mascExcerpt }
  const wordCount = answer.split(/\s+/).filter(Boolean).length
  if (answer.length < MIN_REAL_ANSWER_CHARS || wordCount < 3) {
    return { isLapse: true, kind: 'evasive', excerpt: answer.slice(0, 60) }
  }
  if (wordCount <= 8) {
    const evExcerpt = firstMatchExcerpt(answer, EVASIVE_PHRASES)
    if (evExcerpt) return { isLapse: true, kind: 'evasive', excerpt: evExcerpt }
  }
  return { isLapse: false, kind: null, excerpt: null }
}
// ── end PARITY mirror ────────────────────────────────────────────────────────

async function pausedUntil(supabase: SupabaseClient, userId: string): Promise<Date | null> {
  const { data } = await supabase.from('user_state')
    .select('identity_probe_paused_until').eq('user_id', userId).maybeSingle()
  const v = (data as { identity_probe_paused_until?: string | null } | null)?.identity_probe_paused_until
  return v ? new Date(v) : null
}

// Sweep open probes past their window → evasive lapse (visible-before-penalized
// holds: the probe was already delivered as outreach+push).
async function sweepExpired(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data: open } = await supabase.from('identity_probes')
    .select('id')
    .eq('user_id', userId)
    .is('responded_at', null)
    .is('lapse_id', null)
    .lt('expires_at', new Date().toISOString())
  const rows = (open || []) as Array<{ id: string }>
  let logged = 0
  for (const r of rows) {
    const { error } = await supabase.rpc('log_consistency_lapse', {
      p_user_id: userId, p_probe_id: r.id, p_lapse_kind: 'evasive',
      p_answer_excerpt: '(no answer before the window closed)',
    })
    if (!error) logged++
  }
  if (logged > 0) {
    await logAuthority(supabase, {
      user_id: userId, surface: 'identity_probe', action: 'evasion_logged',
      summary: `Logged ${logged} unanswered identity probe(s) as evasion`, autonomous: true,
    })
  }
  return logged
}

async function scheduleProbe(supabase: SupabaseClient, userId: string, force: boolean): Promise<{ status: string; scheduled: number; swept: number }> {
  const swept = await sweepExpired(supabase, userId)

  const gate = await checkSafewordGate(supabase, userId)
  if (!gate.allowed) return { status: `gated:${gate.reason}`, scheduled: 0, swept }

  // 2h post-lapse pause.
  const pause = await pausedUntil(supabase, userId)
  if (!force && pause && pause.getTime() > Date.now()) return { status: 'gated:lapse_pause', scheduled: 0, swept }

  // Daily cap.
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0)
  const { count: todayCount } = await supabase.from('identity_probes')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', dayStart.toISOString())
  if ((todayCount ?? 0) >= DAILY_CAP && !force) return { status: 'gated:daily_cap', scheduled: 0, swept }

  // Don't pile on an already-open probe.
  const { count: openCount } = await supabase.from('identity_probes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).is('responded_at', null).gt('expires_at', new Date().toISOString())
  if ((openCount ?? 0) > 0 && !force) return { status: 'already_open', scheduled: 0, swept }

  if (!force && Math.random() > FIRE_PROBABILITY) return { status: 'rolled_no_probe', scheduled: 0, swept }

  // Pick an unsent prompt (least-recently-used across this user's history).
  const { data: prompts } = await supabase.from('identity_probe_prompts')
    .select('id, prompt').eq('active', true)
  const pool = (prompts || []) as Array<{ id: number; prompt: string }>
  if (!pool.length) return { status: 'no_prompts', scheduled: 0, swept }

  const { data: usedRows } = await supabase.from('identity_probes')
    .select('prompt_id').eq('user_id', userId).order('created_at', { ascending: false }).limit(40)
  const recentUsed = new Set((usedRows || []).map((r: { prompt_id: number | null }) => r.prompt_id))
  const fresh = pool.filter(p => !recentUsed.has(p.id))
  const candidates = fresh.length ? fresh : pool
  const pick = candidates[Math.floor(Math.random() * candidates.length)]

  const now = new Date()
  const expires = new Date(now.getTime() + 6 * 3600_000)

  // Outreach (mig-380 bridge emits the push for normal urgency; don't double-insert).
  const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: pick.prompt,
    urgency: 'normal',
    trigger_reason: `identity_probe:${pick.id}`,
    source: 'identity_probe',
    kind: 'identity_probe',
    scheduled_for: now.toISOString(),
    expires_at: expires.toISOString(),
    evidence_kind: 'voice',
  }).select('id').single()
  const outreachId = (outreach as { id: string } | null)?.id ?? null

  await supabase.from('identity_probes').insert({
    user_id: userId,
    prompt_id: pick.id,
    prompt_text: pick.prompt,
    outreach_id: outreachId,
    scheduled_for: now.toISOString(),
    expires_at: expires.toISOString(),
  })

  await logAuthority(supabase, {
    user_id: userId, surface: 'identity_probe', action: 'scheduled',
    summary: 'Sent a presupposing identity probe', autonomous: true,
  })
  return { status: 'scheduled', scheduled: 1, swept }
}

// POST { action:'judge', probe_id, answer }
async function judge(supabase: SupabaseClient, probeId: string, answer: string): Promise<{ status: string; lapse: LapseKind | null }> {
  const { data: probe } = await supabase.from('identity_probes')
    .select('id, user_id, responded_at').eq('id', probeId).maybeSingle()
  const row = probe as { id: string; user_id: string; responded_at: string | null } | null
  if (!row) return { status: 'probe_not_found', lapse: null }
  if (row.responded_at) return { status: 'already_responded', lapse: null }

  const result = classifyAnswer(answer)
  await supabase.from('identity_probes')
    .update({ response_text: (answer ?? '').slice(0, 1000), responded_at: new Date().toISOString() })
    .eq('id', probeId)

  if (!result.isLapse) {
    await logAuthority(supabase, {
      user_id: row.user_id, surface: 'identity_probe', action: 'answered_clean',
      summary: 'Identity probe answered in-frame', autonomous: true,
    })
    return { status: 'in_frame', lapse: null }
  }

  await supabase.rpc('log_consistency_lapse', {
    p_user_id: row.user_id, p_probe_id: probeId, p_lapse_kind: result.kind,
    p_answer_excerpt: result.excerpt,
  })
  await logAuthority(supabase, {
    user_id: row.user_id, surface: 'identity_probe', action: 'lapse_logged',
    summary: `Consistency lapse (${result.kind}) — ego bump + 2h pause applied`, autonomous: true,
  })
  return { status: 'lapse', lapse: result.kind }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  let body: { action?: string; user_id?: string; force?: boolean; probe_id?: string; answer?: string } = {}
  try { body = await req.json() } catch { /* empty ok */ }

  if (body.action === 'judge' && body.probe_id) {
    try {
      const r = await judge(supabase, body.probe_id, body.answer ?? '')
      return new Response(JSON.stringify({ ok: true, ...r }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  // Cron path.
  let userIds: string[]
  if (body.user_id) userIds = [body.user_id]
  else {
    const { data } = await supabase.from('user_state').select('user_id').eq('handler_persona', 'dommy_mommy')
    userIds = (data || []).map((r: { user_id: string }) => r.user_id)
  }

  const results: Array<{ user_id: string; status: string; scheduled: number; swept: number }> = []
  for (const uid of userIds) {
    try { results.push({ user_id: uid, ...(await scheduleProbe(supabase, uid, body.force === true)) }) }
    catch (e) { results.push({ user_id: uid, status: `error:${(e as Error).message}`, scheduled: 0, swept: 0 }) }
  }
  return new Response(JSON.stringify({
    ok: true,
    scheduled: results.reduce((s, r) => s + r.scheduled, 0),
    swept: results.reduce((s, r) => s + r.swept, 0),
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
