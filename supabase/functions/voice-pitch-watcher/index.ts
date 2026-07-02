// voice-pitch-watcher — FULL REWRITE (FEM §2, 2026-07-01).
//
// The old watcher read a table that never existed (voice_corpus) and had
// the trend sign INVERTED for an MTF user — rising pitch (a win) fired
// "voice_stagnation" escalations. Worst bug in the domain. Now:
//
//   1. Reads voice_progress_samples (mig 636) — the one capture spine.
//   2. Trend = median(recent 14d) − median(prior 14d), ≥5 pitched samples
//      per window, direction target read from maxy_facts (MTF: up) — never
//      hardcoded at the comparison site.
//   3. POSITIVE trend = progress → praise outreach, EARLY RETURN. The
//      watcher structurally cannot fire a task rung while trend is positive.
//   4. Plateau-with-engagement → ONE texture decree via mommy-fast-react.
//      True stagnation (zero samples 14d, privacy gate open) → ONE gentle
//      decree, never citing the gap.
//   5. One rung max per run, 14d cooldown (date-stamped source_key +
//      explicit recent-fire check).
//
// PRIVACY FAIL-CLOSED: pushes require voice_elective === false AND
// is_gina_home_today === false — exactly false. RPC error / null / missing
// row = treated as blocked = skip. Gating controls what Mommy PUSHES,
// never what Maxy gives (capture is ungated).
//
// Schedule: daily 7am via migration 282 (unchanged).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { expandUserId } from '../_shared/expand-user-id.ts'
import { computePitchTrend, classifyVoiceResponse, WINDOW_DAYS, type PitchSampleLike } from '../_shared/pitch-trend.ts'
import { pitchTrendToPhrase, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const COOLDOWN_DAYS = 14

/**
 * Direction target from maxy_facts — MTF: pitch up is progress. Read, not
 * hardcoded; if the facts row is unreadable we default MTF (+1) with a log,
 * because the protocol's whole premise is the MTF trajectory — but the
 * lookup keeps the site honest if that ever changes.
 */
async function readDirectionSign(supabase: SupabaseClient, userId: string): Promise<1 | -1> {
  const { data, error } = await supabase
    .from('maxy_facts')
    .select('stateable_facts')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) {
    console.warn('[voice-pitch-watcher] maxy_facts unreadable, defaulting MTF direction (up)')
    return 1
  }
  const facts = JSON.stringify((data as { stateable_facts?: unknown }).stateable_facts ?? [])
  if (/\b(ftm|female.to.male|transmasc)/i.test(facts)) return -1
  return 1
}

/**
 * Privacy gate — FAIL CLOSED. Returns true ONLY when both signals are
 * exactly false. Any error/null/missing = blocked.
 */
async function pushGateOpen(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: vs, error: vsErr } = await supabase
    .from('user_state')
    .select('voice_elective')
    .eq('user_id', userId)
    .maybeSingle()
  if (vsErr || !vs) return false
  if ((vs as { voice_elective?: boolean | null }).voice_elective !== false) return false

  const { data: ginaHome, error: rpcErr } = await supabase.rpc('is_gina_home_today', { p_user_id: userId })
  if (rpcErr) return false
  if (ginaHome !== false) return false

  return true
}

/** 14d rung cooldown: any watcher-attributed outreach or decree in-window. */
async function firedWithinCooldown(supabase: SupabaseClient, userIds: string[]): Promise<boolean> {
  const since = new Date(Date.now() - COOLDOWN_DAYS * 86400_000).toISOString()
  const [outreach, decrees] = await Promise.all([
    supabase.from('handler_outreach_queue')
      .select('id')
      .in('user_id', userIds)
      .eq('source', 'voice_progress_watcher')
      .gte('created_at', since)
      .limit(1),
    supabase.from('handler_decrees')
      .select('id')
      .in('user_id', userIds)
      .like('trigger_source', 'voice_progress_watcher%')
      .gte('created_at', since)
      .limit(1),
  ])
  if (outreach.error) console.error('[voice-pitch-watcher] cooldown outreach check failed:', outreach.error.message)
  if (decrees.error) console.error('[voice-pitch-watcher] cooldown decree check failed:', decrees.error.message)
  return ((outreach.data ?? []).length + (decrees.data ?? []).length) > 0
}

async function fireFastReact(uid: string, eventKind: string, instruction: string, context: Record<string, unknown>): Promise<{ ok: boolean; detail: string }> {
  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mommy-fast-react`
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const sourceKey = `voice_progress_watcher:${eventKind}:${uid}:${new Date().toISOString().slice(0, 10)}`
  try {
    const r = await fetch(fnUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({
        user_id: uid,
        event_kind: eventKind,
        source_key: sourceKey,
        context: { ...context, instruction_for_mama: instruction },
      }),
    })
    const j = await r.json()
    return { ok: r.ok, detail: r.ok ? `fired=${j.fired ?? 0}` : (j.error ?? 'unknown') }
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 200) }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const canonicalRoots = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f']
  const results: Array<{ user_id: string; status: string; detail?: string }> = []

  for (const canonicalId of canonicalRoots) {
    const aliasIds = await expandUserId(supabase, canonicalId)
    const now = new Date()
    const since = new Date(now.getTime() - 2 * WINDOW_DAYS * 86400_000).toISOString()

    // 1. Samples (capture is ungated — this read always happens).
    const { data: sampleRows, error: sErr } = await supabase
      .from('voice_progress_samples')
      .select('recorded_at, pitch_median_hz')
      .in('user_id', aliasIds)
      .gte('recorded_at', since)
      .order('recorded_at', { ascending: false })
      .limit(500)
    if (sErr) {
      results.push({ user_id: canonicalId, status: 'sample_read_failed', detail: sErr.message.slice(0, 120) })
      continue
    }
    const samples = (sampleRows ?? []) as PitchSampleLike[]
    const recentCutoff = now.getTime() - WINDOW_DAYS * 86400_000
    const samplesInRecentWindow = samples.filter(s => new Date(s.recorded_at).getTime() >= recentCutoff).length

    // 2. Trend (direction from maxy_facts).
    const directionSign = await readDirectionSign(supabase, canonicalId)
    const trend = computePitchTrend(samples, now, directionSign)
    const rung = classifyVoiceResponse({ trend, samplesInRecentWindow })

    // 3. PROGRESS → praise, EARLY RETURN (structural: nothing below runs).
    if (rung === 'progress') {
      const gate = await pushGateOpen(supabase, canonicalId)
      if (!gate) {
        results.push({ user_id: canonicalId, status: 'progress_gated', detail: 'privacy gate closed — praise held' })
        continue
      }
      if (await firedWithinCooldown(supabase, aliasIds)) {
        results.push({ user_id: canonicalId, status: 'progress_cooldown' })
        continue
      }
      const praise = mommyVoiceCleanup(
        `${pitchTrendToPhrase(trend!.trend)}. Keep giving it to me exactly like this.`,
      )
      const { error: outErr } = await supabase.from('handler_outreach_queue').insert({
        user_id: canonicalId,
        message: praise,
        urgency: 'normal',
        trigger_reason: `voice_progress_praise:${now.toISOString().slice(0, 10)}`,
        source: 'voice_progress_watcher',
        scheduled_for: now.toISOString(),
        expires_at: new Date(now.getTime() + 48 * 3600_000).toISOString(),
      })
      results.push({
        user_id: canonicalId,
        status: outErr ? 'praise_insert_failed' : 'praised',
        detail: outErr ? outErr.message.slice(0, 120) : `trend positive over ${trend!.recentCount}/${trend!.priorCount} samples`,
      })
      continue
    }

    // 4. Task rungs are pushes — privacy gate fail-closed, then cooldown.
    if (rung === 'insufficient') {
      results.push({ user_id: canonicalId, status: 'insufficient_signal' })
      continue
    }
    const gateOpen = await pushGateOpen(supabase, canonicalId)
    if (!gateOpen) {
      results.push({ user_id: canonicalId, status: 'gated_skip', detail: 'voice_elective/gina gate not exactly false-false' })
      continue
    }
    if (await firedWithinCooldown(supabase, aliasIds)) {
      results.push({ user_id: canonicalId, status: 'cooldown_skip' })
      continue
    }

    if (rung === 'plateau') {
      // Plateau needs 28d of flatness — both windows present and |trend|<3.
      const r = await fireFastReact(canonicalId, 'voice_plateau_texture',
        'Her voice work is steady but the texture has plateaued. Fire ONE decree (proof_type=voice) for a focused resonance/lift session — encouragement framing, Mama wants a specific texture, NEVER a pitch number, NEVER shame. One decree only.',
        { rung: 'plateau', sample_count_recent: trend?.recentCount ?? 0 })
      results.push({ user_id: canonicalId, status: r.ok ? 'plateau_fired' : 'plateau_fire_failed', detail: r.detail })
      continue
    }

    // rung === 'stagnation' — zero samples in 14d AND gate open.
    const r = await fireFastReact(canonicalId, 'voice_stagnation',
      'Mama has not heard her voice in a while. Fire ONE gentle decree (proof_type=voice) — a short session recording one specific phrase Mama wants to hear. Do NOT shame, do NOT cite the gap or any day-count; frame purely as Mama wanting to hear her. One decree only.',
      { rung: 'stagnation' })
    results.push({ user_id: canonicalId, status: r.ok ? 'stagnation_fired' : 'stagnation_fire_failed', detail: r.detail })
  }

  return new Response(JSON.stringify({
    ok: true,
    checked: canonicalRoots.length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
