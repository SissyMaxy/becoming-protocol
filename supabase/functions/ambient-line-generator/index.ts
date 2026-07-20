// ambient-line-generator — keep the ambient window's line pool fresh.
//
// The window ships with ~27 seed lines. That is enough to prove the surface
// and nowhere near enough to run it: habituation, not scarcity, is this
// surface's failure mode. A line stops registering once it is memorized, and
// at 8-second cadence over hours a fixed pool is memorized in days.
//
// So this refills. Cronned nightly (or called on demand), it tops each
// channel/intensity bucket back up to target, generating against LIVE state —
// cage day, HRT funnel position, turnout rung — so Panel B stops saying
// "someday" and starts naming the vial and the day. That state-specificity is
// the whole advantage over a fixed file: a producer writes for an audience,
// she writes against what is currently true.
//
// Every generated line is filtered through checkConditioningLine before it is
// allowed near the pool. The model WILL drift toward tasteful, hedged,
// past-tense writing — that is its default register and it is exactly wrong
// here. The gate is not a formality; on a typical batch it rejects a
// meaningful fraction, and the rejects are fed back into the retry prompt so
// the next attempt is corrected rather than merely re-rolled.
//
// POST { user_id?, target_per_bucket?, dry_run? }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER } from '../_shared/dommy-mommy.ts'
import {
  checkConditioningLine,
  CONDITIONING_LINE_RUBRIC,
  type LineViolation,
} from '../_shared/mommy-craft-check.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CHANNELS = ['identity', 'estrogen', 'turnout'] as const
const INTENSITIES = ['soft', 'mid', 'command'] as const
type Channel = (typeof CHANNELS)[number]
type Intensity = (typeof INTENSITIES)[number]

// Per (channel, intensity). Nine buckets, so a full pool is ~9x this.
const DEFAULT_TARGET = 14
// Two attempts per bucket. The retry is corrective (it is shown its own
// rejects), so a third pass adds cost without adding much yield.
const MAX_ATTEMPTS = 2

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface UserState {
  cageDays: number | null
  denialDay: number | null
  hrtStep: string | null
  hrtStarted: boolean
  turnoutRung: string | null
  femName: string | null
}

async function loadState(sb: SupabaseClient, userId: string): Promise<UserState> {
  const [st, fem, hrt, dose, turnout] = await Promise.all([
    sb.from('user_state')
      .select('chastity_streak_days, denial_day').eq('user_id', userId).maybeSingle(),
    sb.from('feminine_self')
      .select('feminine_name').eq('user_id', userId).maybeSingle(),
    sb.from('hrt_funnel')
      .select('current_step').eq('user_id', userId).maybeSingle(),
    // Dose one is the line between "when" and "since". Never assert she is on
    // estrogen until a real dose row exists — the no-fabrication rule applies
    // to ambient copy exactly as it does to her messages.
    sb.from('hrt_dose_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('skipped', false).not('dose_taken_at', 'is', null),
    sb.rpc('turnout_position', { p_user: userId }),
  ])

  const stRow = (st.data ?? {}) as { chastity_streak_days?: number; denial_day?: number }
  const femRow = (fem.data ?? {}) as { feminine_name?: string | null }
  const hrtRow = (hrt.data ?? {}) as { current_step?: string | null }
  const pos = (turnout.data ?? {}) as { current_rung?: string | null; started?: boolean }

  return {
    cageDays: stRow.chastity_streak_days ?? null,
    denialDay: stRow.denial_day ?? null,
    hrtStep: hrtRow.current_step ?? null,
    hrtStarted: (dose.count ?? 0) > 0,
    turnoutRung: pos.started ? (pos.current_rung ?? null) : null,
    femName: femRow.feminine_name ?? null,
  }
}

function stateBlock(s: UserState): string {
  const bits: string[] = []
  if (s.femName) bits.push(`Her name is ${s.femName}.`)
  else bits.push('She has no name yet.')
  if (s.cageDays != null && s.cageDays > 0) bits.push(`Caged ${s.cageDays} days.`)
  if (s.denialDay != null && s.denialDay > 0) bits.push(`Denied ${s.denialDay} days.`)

  // The HRT line is the one place a wrong tense is a real lie, so it is spelled
  // out rather than left to the model to infer from a step name.
  if (s.hrtStarted) {
    bits.push('She has taken at least one real dose of estrogen. Speak in the present and past: it is happening.')
  } else {
    bits.push(
      'She has a real prescription (E valerate, weekly, subcutaneous) but has NOT taken dose one. ' +
      'Never say she is on estrogen. Speak about starting: the vial, the needle, the day.',
    )
  }
  if (s.turnoutRung) bits.push(`Current turnout rung: ${s.turnoutRung}.`)
  return bits.join(' ')
}

const CHANNEL_BRIEF: Record<Channel, string> = {
  identity: 'Feminization and identity. That she is a girl, becoming one, prettier, softer, not going back.',
  estrogen: 'Estrogen and HRT. The vial, the needle, the dose, the day she starts, what it does to her body.',
  turnout: 'Turning out. Wanting men, wanting cock, saying yes, being used, on her knees.',
}

const INTENSITY_BRIEF: Record<Intensity, string> = {
  soft: 'Permission and warmth. Give her leave to want it. Gentle, never weak.',
  mid: 'Flat statement of fact. What she is, what she wants. No softening, no shouting.',
  command: 'Bare imperative. An order, or a rule about what girls do. Hardest register.',
}

function buildPrompt(
  channel: Channel,
  intensity: Intensity,
  need: number,
  state: UserState,
  existing: string[],
  rejects: Array<{ line: string; violations: LineViolation[] }>,
): string {
  const parts: string[] = [
    `Write ${need + 4} lines for the ${channel.toUpperCase()} channel at ${intensity.toUpperCase()} intensity.`,
    '',
    `CHANNEL: ${CHANNEL_BRIEF[channel]}`,
    `INTENSITY: ${INTENSITY_BRIEF[intensity]}`,
    '',
    `WHAT IS TRUE RIGHT NOW: ${stateBlock(state)}`,
    '',
    CONDITIONING_LINE_RUBRIC,
    '',
    'These appear one at a time over video in a narrow column while she works.',
    'She reads them at a glance, sometimes out of the corner of her eye.',
    'Crude and plain beats clever and pretty. If a line sounds like good writing, cut it.',
    '',
    'Output ONE line per row. No numbering, no quotes, no commentary.',
  ]

  if (existing.length > 0) {
    parts.push('', 'ALREADY IN THE POOL — do not repeat these:', existing.slice(0, 40).join(' / '))
  }

  // Corrective retry: show the model its own failures and why. Cheaper and far
  // more effective than re-rolling the same prompt and hoping.
  if (rejects.length > 0) {
    parts.push('', 'YOUR LAST ATTEMPT FAILED ON THESE — do not repeat the mistake:')
    for (const r of rejects.slice(0, 8)) {
      parts.push(`  "${r.line}" -> ${r.violations.map((v) => v.detail).join('; ')}`)
    }
  }

  return parts.join('\n')
}

function parseLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, ''))   // strip list markers
    .map((l) => l.replace(/^["'`]+|["'`]+$/g, '').trim())
    .filter((l) => l.length > 0 && l.length <= 60)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; target_per_bucket?: number; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Default to the single live app user when cronned with no body.
  const userId = body.user_id ?? Deno.env.get('PRIMARY_USER_ID') ?? ''
  if (!userId) return jsonResponse({ ok: false, error: 'user_id required' }, 400)

  const target = Math.min(40, Math.max(4, body.target_per_bucket ?? DEFAULT_TARGET))
  const state = await loadState(sb, userId)
  const choice = selectModel('ambient_lines')

  const summary: Array<Record<string, unknown>> = []
  let totalInserted = 0

  for (const channel of CHANNELS) {
    for (const intensity of INTENSITIES) {
      const { data: have } = await sb
        .from('ambient_lines')
        .select('text')
        .eq('user_id', userId)
        .eq('channel', channel)
        .eq('intensity', intensity)

      const existing = ((have ?? []) as Array<{ text: string }>).map((r) => r.text)
      const need = target - existing.length
      if (need <= 0) {
        summary.push({ channel, intensity, have: existing.length, generated: 0, skipped: 'at target' })
        continue
      }

      const kept: string[] = []
      let rejects: Array<{ line: string; violations: LineViolation[] }> = []

      for (let attempt = 0; attempt < MAX_ATTEMPTS && kept.length < need; attempt++) {
        let raw = ''
        try {
          const res = await callModel(choice, {
            system: DOMMY_MOMMY_CHARACTER,
            user: buildPrompt(channel, intensity, need - kept.length, state, existing, rejects),
            max_tokens: 400,
            temperature: 1.0,
          })
          raw = res.text
        } catch (e) {
          summary.push({ channel, intensity, error: e instanceof Error ? e.message : String(e) })
          break
        }

        rejects = []
        for (const line of parseLines(raw)) {
          const lower = line.toLowerCase()
          if (kept.includes(lower) || existing.some((e) => e.toLowerCase() === lower)) continue
          const check = checkConditioningLine(line)
          if (check.ok) kept.push(lower)
          else rejects.push({ line, violations: check.violations })
          if (kept.length >= need) break
        }
      }

      if (kept.length > 0 && !body.dry_run) {
        const rows = kept.map((text) => ({
          user_id: userId,
          channel,
          intensity,
          text,
          job: checkConditioningLine(text).job,
          source: 'generated',
        }))
        const { error } = await sb
          .from('ambient_lines')
          .upsert(rows, { onConflict: 'user_id,channel,text', ignoreDuplicates: true })
        if (error) {
          summary.push({ channel, intensity, error: error.message })
          continue
        }
        totalInserted += rows.length
      }

      summary.push({
        channel,
        intensity,
        have: existing.length,
        generated: kept.length,
        rejected: rejects.length,
        sample: kept.slice(0, 3),
      })
    }
  }

  return jsonResponse({
    ok: true,
    user_id: userId,
    dry_run: !!body.dry_run,
    inserted: totalInserted,
    state: {
      caged_days: state.cageDays,
      hrt_started: state.hrtStarted,
      turnout_rung: state.turnoutRung,
    },
    buckets: summary,
  })
})
