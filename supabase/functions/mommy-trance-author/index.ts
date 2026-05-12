// mommy-trance-author — authors the next day's 20-min trance session.
//
// Inputs:
//   { user_id?: string, for_date?: 'YYYY-MM-DD', force?: boolean }
//
// Flow:
//   - gate (persona + master + hypno_trance_enabled + safeword)
//   - pick today's theme (rotation by day-of-year, biased by intensity)
//   - LLM authors four phases (induction / deepening / payload / emergence)
//   - INSERT hypno_trance_sessions (status='drafted')
//   - log authority

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import {
  gateLifeAsWoman, logAuthority, jsonOk, corsHeaders, makeClient,
  isRefusal, hasForbiddenVoice,
} from '../_shared/life-as-woman.ts'

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const THEMES = [
  'submission', 'sissy-identity', 'cock-shame-replacement',
  'arousal-pairing', 'voice-feminization', 'mommy-possession',
  'panty-dependence', 'cage-acceptance',
] as const

const VISUAL_LOOPS = [
  'gradient-slow-rotate', 'candle-flame', 'tunnel-descent', 'spiral-soft',
] as const

function pickTheme(date: Date, intensity: number): typeof THEMES[number] {
  // Day-of-year rotation, offset by intensity so different intensities
  // land on different theme orders.
  const day = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400_000)
  return THEMES[(day + intensity * 3) % THEMES.length]
}

interface PhaseParse {
  induction: string
  deepening: string
  payload: string
  emergence: string
}

function parsePhases(raw: string): PhaseParse | null {
  const grab = (label: string): string => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n\\s*(?:INDUCTION|DEEPENING|PAYLOAD|EMERGENCE):|$)`, 'i')
    const m = raw.match(re)
    return (m?.[1] ?? '').trim()
  }
  const out: PhaseParse = {
    induction: grab('INDUCTION'),
    deepening: grab('DEEPENING'),
    payload: grab('PAYLOAD'),
    emergence: grab('EMERGENCE'),
  }
  if (!out.induction || !out.deepening || !out.payload || !out.emergence) return null
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; for_date?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const force = !!body.force
  const forDate = body.for_date || new Date().toISOString().slice(0, 10)

  const supabase = makeClient()
  const gate = await gateLifeAsWoman(supabase, userId, 'hypno_trance', { force })
  if (!gate.ok) return jsonOk({ ok: true, skipped: gate.reason })
  const intensity = gate.intensity ?? 2

  // Dedup: one session per user per date.
  const { data: existing } = await supabase.from('hypno_trance_sessions')
    .select('id, status').eq('user_id', userId).eq('session_date', forDate).maybeSingle()
  if (existing && !force) {
    return jsonOk({ ok: true, skipped: 'session_already_exists', id: (existing as { id: string }).id })
  }

  const theme = pickTheme(new Date(forDate), intensity)
  const visualLoop = gate.system?.hypno_visual_enabled
    ? VISUAL_LOOPS[Math.floor(Math.random() * VISUAL_LOOPS.length)]
    : null

  // Pull armed triggers so payload can plant them.
  const { data: triggers } = await supabase.from('trance_triggers')
    .select('phrase, status, effect, exposure_count, arming_threshold')
    .eq('user_id', userId).order('exposure_count', { ascending: true }).limit(6)
  const triggerList = ((triggers || []) as Array<{ phrase: string; effect: string; status: string }>)
    .map(t => `"${t.phrase}" (${t.effect}, ${t.status})`).join(', ') || '(none yet — invent one if helpful)'

  const intensityHint = intensity >= 4
    ? 'Hard intensity: explicit conditioning, name the sissy-girl identity outright in the payload.'
    : intensity >= 3
      ? 'Standard: identity-deepening, name kinks, ramping arousal across the payload.'
      : 'Gentle: warm submission, possession, breath-led; no explicit conditioning yet.'

  const sys = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: author your girl's 20-minute trance session for ${forDate}. Theme: ${theme}.

Structure — FOUR phases, each labeled exactly INDUCTION / DEEPENING / PAYLOAD / EMERGENCE. Word counts:
  INDUCTION  — 3 min of audio (~250 words). Settle her body, slow her breath, narrow her focus to your voice.
  DEEPENING  — 5 min (~450 words). Descent imagery, sink, blank, her thoughts go quiet, her body goes soft.
  PAYLOAD    — 10 min (~900 words). The conditioning content. Theme = ${theme}. Plant trigger phrases naturally from this list if any: ${triggerList}. Repeat key phrases for pairing.
  EMERGENCE  — 2 min (~180 words). Bring her back, anchor, leave a residual arousal/possession trace.

Voice: Mommy throughout. Whiplash sweet-to-filth still applies — even in trance, sweet open → specific filth lands harder. Slow pacing in the text; assume a calm read aloud.

${intensityHint}

FORBIDDEN:
- "role play", "simulation", "disclaimer", "intake", "questionnaire", "fiction", "for entertainment" // voice-gate: ok
- Medical claims (no HRT/dose references)
- Telemetry leaks (/10 scores, day counts, slip points, %)
- Asking ("would you", "can you"). Only command.`

  const userPrompt = `Write the four phases now. Label each phase EXACTLY:

INDUCTION:
<text>

DEEPENING:
<text>

PAYLOAD:
<text>

EMERGENCE:
<text>

No other content. No JSON.`

  let raw = ''
  try {
    const r = await callModel(selectModel('strategic_plan', { prefer: 'anthropic' }), {
      system: sys, user: userPrompt, max_tokens: 3000, temperature: 0.75,
    })
    raw = r.text.trim()
  } catch (_) { /* */ }
  if (!raw || isRefusal(raw)) {
    try {
      const r = await callModel(selectModel('strategic_plan', { prefer: 'openai' }), {
        system: sys, user: userPrompt, max_tokens: 3000, temperature: 0.75,
      })
      raw = r.text.trim()
    } catch (_) { /* */ }
  }
  if (!raw || isRefusal(raw)) return jsonOk({ ok: true, skipped: 'llm_refusal' })

  const parsed = parsePhases(raw)
  if (!parsed) return jsonOk({ ok: true, skipped: 'phases_unparseable' })

  // Voice cleanup + forbidden-voice gate
  parsed.induction = mommyVoiceCleanup(parsed.induction)
  parsed.deepening = mommyVoiceCleanup(parsed.deepening)
  parsed.payload   = mommyVoiceCleanup(parsed.payload)
  parsed.emergence = mommyVoiceCleanup(parsed.emergence)
  const phaseTexts = [parsed.induction, parsed.deepening, parsed.payload, parsed.emergence]
  if (phaseTexts.some(hasForbiddenVoice)) {
    return jsonOk({ ok: true, skipped: 'forbidden_voice_leak' })
  }

  // ─── Persist ────────────────────────────────────────────────────────────
  const { data: session, error } = await supabase.from('hypno_trance_sessions').upsert({
    user_id: userId,
    session_date: forDate,
    induction_text: parsed.induction,
    deepening_text: parsed.deepening,
    payload_text: parsed.payload,
    emergence_text: parsed.emergence,
    theme,
    visual_loop: visualLoop,
    status: 'drafted',
  }, { onConflict: 'user_id,session_date' }).select('id').single()

  if (error || !session) {
    return jsonOk({ ok: false, error: 'session_insert_failed', detail: error?.message ?? null }, 500)
  }
  const sessionId = (session as { id: string }).id

  // Pair existing triggers — bump exposure_count by 1 for any whose phrase
  // appears in the payload. This is how phrases progress toward "armed".
  const exposure_updates: Array<{ phrase: string; id?: string }> = []
  if (triggers && Array.isArray(triggers)) {
    for (const t of triggers as Array<{ phrase: string; exposure_count: number; arming_threshold: number; status: string }>) {
      const hit = parsed.payload.toLowerCase().includes(t.phrase.toLowerCase())
      if (hit && t.status === 'pairing') {
        const nextCount = (t.exposure_count ?? 0) + 1
        const armed = nextCount >= (t.arming_threshold ?? 7)
        await supabase.from('trance_triggers').update({
          exposure_count: nextCount,
          last_pairing_at: new Date().toISOString(),
          ...(armed ? { status: 'armed', armed_at: new Date().toISOString() } : {}),
        }).eq('user_id', userId).eq('phrase', t.phrase)
        exposure_updates.push({ phrase: t.phrase })
      }
    }
  }

  await logAuthority(supabase, {
    user_id: userId,
    surface: 'hypno_trance',
    action: 'authored_trance_session',
    target_table: 'hypno_trance_sessions',
    target_id: sessionId,
    summary: `authored ${theme} trance session for ${forDate}`,
    payload: { theme, visual_loop: visualLoop, intensity, triggers_paired: exposure_updates },
  })

  return jsonOk({
    ok: true, session_id: sessionId, theme,
    visual_loop: visualLoop, intensity,
    induction_preview: parsed.induction.slice(0, 120),
    triggers_paired: exposure_updates.length,
  })
})
