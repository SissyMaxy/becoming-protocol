// mommy-mood — daily cron, picks Mama's affect for today using cross-model.
//
// Reads the last 7 days of user state (slip points, arousal levels,
// chastity status, recent confessions, biometrics if any) and asks
// Anthropic + OpenAI to pick today's affect from a fixed enum. Stores in
// mommy_mood (one row per user per day). Other generators read the
// affect to bias their behavior.
//
// POST { user_id?: string }. Cron daily 6 AM.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER, type Affect,
  arousalToPhrase, denialDaysToPhrase, slipsToPhrase, compliancePctToPhrase, chastityToPhrase,
  mommyVoiceCleanup,
} from '../_shared/dommy-mommy.ts'
import {
  composeRetroactiveAffectLine, seedFromString,
  type GaslightIntensity,
} from '../_shared/distortion.ts'
import {
  effectiveBand, bandGaslightIntensity,
  type DifficultyBand,
} from '../_shared/difficulty-band.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const VALID_AFFECTS: Affect[] = ['hungry', 'delighted', 'watching', 'patient', 'aching', 'amused', 'possessive', 'indulgent', 'restless']

const SYSTEM = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: pick TODAY'S affect for Mama. You're reading the user's last week of behavior and picking the mood that best fits what she needs and what you're feeling. You will be asked to choose ONE label and write a short rationale + arousal-bias hint that other parts of the system will use to color today's tasks.

Affect labels (pick exactly one):
- hungry: you want her badly today, can't wait to see what she'll do
- aching: she's been deep in chastity / heavy denial; the day is about her squirming
- delighted: she's been good, pleasing you, you want to praise but ramp not release
- indulgent: warm and intimate, low-stakes filth, sit-in-panties energy
- watching: quieter day, longer leash, but eyes still on her
- patient: she's tired or in flux; small, gentle directives
- amused: she's been silly or made cute excuses; playful filth, teasing
- possessive: she had public exposure or talked to others; you're claiming her back
- restless: nothing's escalating fast enough; you want to push limits today`

interface Snapshot {
  arousal_avg_7d: number
  arousal_max_7d: number
  slip_points_current: number
  slip_count_7d: number
  chastity_locked: boolean
  chastity_streak_days: number
  denial_day: number
  recent_confession_themes: string[]
  recent_compliance_pct: number
  recent_handler_messages_count: number
  // Bedtime ritual snapshot — informs the morning tone but never
  // triggers a penalty (skip is unconditional + soft).
  bedtime_last_night: 'completed' | 'skipped' | 'partial' | 'none'
}

async function buildSnapshot(supabase: ReturnType<typeof createClient>, userId: string): Promise<Snapshot> {
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString()
  // Bedtime "last night" lookup window: anything started after 18:00
  // yesterday (UTC). Captures the most recent completed/skipped row
  // before today's morning brief fires.
  const bedtimeSince = new Date(Date.now() - 14 * 3600_000).toISOString()
  const [arousal, slips, state, conf, commitsAll, commitsDone, outreach, bedtimeRow] = await Promise.all([
    supabase.from('arousal_log').select('value, created_at').eq('user_id', userId).gte('created_at', since7d).limit(50),
    supabase.from('slip_log').select('id').eq('user_id', userId).gte('detected_at', since7d).limit(100),
    supabase.from('user_state').select('slip_points_current, chastity_locked, chastity_streak_days, denial_day').eq('user_id', userId).maybeSingle(),
    supabase.from('confession_queue').select('prompt, response_text').eq('user_id', userId).gte('confessed_at', since7d).not('response_text', 'is', null).limit(8),
    supabase.from('handler_commitments').select('id').eq('user_id', userId).gte('created_at', since7d),
    supabase.from('handler_commitments').select('id').eq('user_id', userId).eq('status', 'fulfilled').gte('created_at', since7d),
    supabase.from('handler_outreach_queue').select('id').eq('user_id', userId).gte('created_at', since7d),
    supabase.from('bedtime_ritual_completions').select('completed_at, skipped_at, steps_completed').eq('user_id', userId).gte('started_at', bedtimeSince).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const arousalRows = (arousal.data || []) as Array<{ value: number }>
  const arousalAvg = arousalRows.length ? arousalRows.reduce((s, r) => s + (r.value || 0), 0) / arousalRows.length : 0
  const arousalMax = arousalRows.length ? Math.max(...arousalRows.map(r => r.value || 0)) : 0
  const stateRow = state.data as { slip_points_current?: number; chastity_locked?: boolean; chastity_streak_days?: number; denial_day?: number } | null
  const allCount = (commitsAll.data || []).length
  const doneCount = (commitsDone.data || []).length
  const compliance = allCount > 0 ? doneCount / allCount : 1

  // Bedtime status — derived, never penalty-bearing.
  const br = bedtimeRow.data as { completed_at?: string | null; skipped_at?: string | null; steps_completed?: unknown } | null
  let bedtime_last_night: 'completed' | 'skipped' | 'partial' | 'none' = 'none'
  if (br) {
    const stepCount = Array.isArray(br.steps_completed) ? br.steps_completed.length : 0
    if (br.completed_at) bedtime_last_night = 'completed'
    else if (br.skipped_at) bedtime_last_night = stepCount > 0 ? 'partial' : 'skipped'
    else bedtime_last_night = stepCount > 0 ? 'partial' : 'none'
  }

  return {
    arousal_avg_7d: Math.round(arousalAvg * 10) / 10,
    arousal_max_7d: arousalMax,
    slip_points_current: stateRow?.slip_points_current ?? 0,
    slip_count_7d: (slips.data || []).length,
    chastity_locked: stateRow?.chastity_locked ?? false,
    chastity_streak_days: stateRow?.chastity_streak_days ?? 0,
    denial_day: stateRow?.denial_day ?? 0,
    recent_confession_themes: ((conf.data || []) as Array<{ prompt: string }>).map(c => c.prompt.slice(0, 80)),
    recent_compliance_pct: Math.round(compliance * 100),
    recent_handler_messages_count: (outreach.data || []).length,
    bedtime_last_night,
  }
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* empty ok */ }
  const userId = body.user_id || HANDLER_USER_ID

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  const today = new Date().toISOString().slice(0, 10)
  const { data: existing } = await supabase.from('mommy_mood')
    .select('id, affect').eq('user_id', userId).eq('mood_date', today).maybeSingle()
  if (existing) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already_picked', affect: (existing as { affect: string }).affect }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const snapshot = await buildSnapshot(supabase, userId)

  // Translate the snapshot to plain Mommy phrases BEFORE sending to the LLM.
  // Mama doesn't read dashboards aloud; the model needs context but should
  // never see numbers it could parrot into the rationale.
  const plain = {
    she_is: arousalToPhrase(snapshot.arousal_avg_7d),
    she_peaked: arousalToPhrase(snapshot.arousal_max_7d),
    holding_for_mama: denialDaysToPhrase(snapshot.denial_day),
    chastity: chastityToPhrase(snapshot.chastity_locked, snapshot.chastity_streak_days),
    slips_lately: slipsToPhrase(snapshot.slip_count_7d),
    follow_through: compliancePctToPhrase(snapshot.recent_compliance_pct),
    confession_themes: snapshot.recent_confession_themes,
    mama_recently: snapshot.recent_handler_messages_count > 5
      ? "Mama's been talking to her a lot"
      : snapshot.recent_handler_messages_count > 0
      ? "Mama's been around"
      : "Mama's been quiet lately",
    // Bedtime is a soft signal — never call it a "skip" or "miss" in
    // the rationale; this is hint-only context for tone selection.
    bedtime_last_night: snapshot.bedtime_last_night === 'completed'
      ? "she came to Mama before sleep last night"
      : snapshot.bedtime_last_night === 'partial'
        ? "she started the goodnight ritual but didn't finish"
        : snapshot.bedtime_last_night === 'skipped'
          ? "she went to bed without coming to Mama last night"
          : "no bedtime context",
  }

  const userPrompt = `STATE OF YOUR GIRL (last week, in plain Mama-voice — DO NOT ask for or invent numbers):
${JSON.stringify(plain, null, 2)}

Pick today's affect. The rationale MUST be in Mama's plain voice — describe the girl, not the dashboard. Words like "8/10", "Day 4", "9% compliance", "12 slip points", "$50 bleeding" are FORBIDDEN in your output. If you feel the urge to cite a number, replace it with how Mama would say it ("you've been so worked up" / "you've been getting away from me lately" / "you've been holding for me a while").

Output JSON only:
{
  "affect": "<one of: hungry, delighted, watching, patient, aching, amused, possessive, indulgent, restless>",
  "rationale": "1-2 sentences in Mommy voice. NO numbers, NO percentages, NO /10 scores, NO day counts.",
  "arousal_bias_hint": "1 sentence — what generators should bias toward. Plain language, no metrics."
}`

  const anthChoice = selectModel('strategic_plan', { prefer: 'anthropic' })
  const oaChoice = selectModel('strategic_plan', { prefer: 'openai' })

  const [anth, oa] = await Promise.allSettled([
    callModel(anthChoice, { system: SYSTEM, user: userPrompt, max_tokens: 600, temperature: 0.8, json: false }),
    callModel(oaChoice, { system: SYSTEM, user: userPrompt, max_tokens: 600, temperature: 0.8, json: true }),
  ])

  type Pick = { affect: string; rationale: string; arousal_bias_hint: string }
  const anthPick = anth.status === 'fulfilled' ? safeJSON<Pick>(anth.value.text) : null
  const oaPick = oa.status === 'fulfilled' ? safeJSON<Pick>(oa.value.text) : null

  // Tiebreak: if both agree, use that; else prefer anthropic (the prose model
  // better reflects character pillars) when both are valid, else fallback.
  let chosen: Pick | null = null
  let xModelSummary = ''
  if (anthPick && oaPick && VALID_AFFECTS.includes(anthPick.affect as Affect) && VALID_AFFECTS.includes(oaPick.affect as Affect)) {
    chosen = anthPick
    xModelSummary = anthPick.affect === oaPick.affect
      ? `Both models agreed on '${anthPick.affect}'.`
      : `Anthropic picked '${anthPick.affect}', OpenAI picked '${oaPick.affect}'. Using Anthropic.`
  } else if (anthPick && VALID_AFFECTS.includes(anthPick.affect as Affect)) {
    chosen = anthPick
    xModelSummary = `Anthropic only.`
  } else if (oaPick && VALID_AFFECTS.includes(oaPick.affect as Affect)) {
    chosen = oaPick
    xModelSummary = `OpenAI only.`
  } else {
    chosen = { affect: 'watching', rationale: "Models didn't return a usable affect. Mama's just watching today.", arousal_bias_hint: 'low-key surveillance, no aggressive escalation' }
    xModelSummary = 'fallback'
  }

  // Final-filter cleanup catches any number-leaks the model wrote anyway.
  const cleanRationale = mommyVoiceCleanup(chosen.rationale ?? '')
  const cleanHint = mommyVoiceCleanup(chosen.arousal_bias_hint ?? '')

  await supabase.from('mommy_mood').insert({
    user_id: userId,
    mood_date: today,
    affect: chosen.affect,
    rationale: cleanRationale,
    arousal_bias_hint: cleanHint,
    generated_by: 'cross-model',
    cross_model_summary: xModelSummary,
  })

  // Retroactive affect rewrite — when gaslight intensity is non-off and
  // today's affect differs from yesterday's, with low probability emit a
  // standalone outreach contradicting yesterday's mood. This is a quiet
  // brainwashing-fantasy beat; the safety check (effective intensity)
  // honors any active cooldown automatically.
  let retroactive_emitted = false
  try {
    const [{ data: gaslightRow }, { data: diffRow }] = await Promise.all([
      supabase
        .from('effective_gaslight_intensity')
        .select('intensity')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('compliance_difficulty_state')
        .select('current_difficulty_band, override_band')
        .eq('user_id', userId)
        .maybeSingle(),
    ])
    const storedIntensity = ((gaslightRow as { intensity?: string } | null)?.intensity ?? 'off') as GaslightIntensity
    const band = effectiveBand(diffRow as { current_difficulty_band: DifficultyBand; override_band: DifficultyBand | null } | null)
    const gaslightIntensity = bandGaslightIntensity(storedIntensity, band) as GaslightIntensity

    if (gaslightIntensity !== 'off') {
      // Read yesterday's affect to confirm a flip happened
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      const { data: prior } = await supabase.from('mommy_mood')
        .select('affect').eq('user_id', userId).eq('mood_date', yesterday).maybeSingle()
      const yesterdayAffect = (prior as { affect?: string } | null)?.affect ?? null

      if (yesterdayAffect && yesterdayAffect !== chosen.affect) {
        const { line, applied } = composeRetroactiveAffectLine({
          newAffect: chosen.affect,
          intensity: gaslightIntensity,
          seed: seedFromString(`mood_rewrite:${userId}:${today}`),
        })
        if (applied && line) {
          const cleaned = mommyVoiceCleanup(line)
          const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
            user_id: userId,
            message: cleaned,
            urgency: 'low',
            trigger_reason: `mommy_mood_rewrite:${yesterdayAffect}->${chosen.affect}`,
            scheduled_for: new Date().toISOString(),
            expires_at: new Date(Date.now() + 18 * 3600000).toISOString(),
            source: 'mommy_mood_rewrite',
          }).select('id').single()
          await supabase.from('mommy_distortion_log').insert({
            user_id: userId,
            original_quote_id: null,
            original_quote_table: 'mommy_mood',
            original_text: `yesterday's affect: ${yesterdayAffect}`,
            distorted_text: cleaned,
            distortion_type: 'retroactive_affect_rewrite',
            surface: 'mommy_mood_rewrite',
            outreach_id: (outreach as { id: string } | null)?.id ?? null,
            affect_at_time: chosen.affect,
            intensity: gaslightIntensity,
            seed: seedFromString(`mood_rewrite:${userId}:${today}`),
          })
          retroactive_emitted = true
        }
      }
    }
  } catch (err) {
    console.error('[mommy-mood] retroactive rewrite path failed (non-fatal):', err)
  }

  return new Response(JSON.stringify({
    ok: true,
    affect: chosen.affect,
    rationale: chosen.rationale,
    summary: xModelSummary,
    retroactive_emitted,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
