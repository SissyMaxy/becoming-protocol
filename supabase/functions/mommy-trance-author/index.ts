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
  'submission', 'the-becoming', 'cock-worship', 'goon-descent',
  'arousal-pairing', 'mommy-possession', 'caged-want', 'turning-out',
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
  anchor: string
}

function parsePhases(raw: string): PhaseParse | null {
  const grab = (label: string): string => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n\\s*(?:INDUCTION|DEEPENING|PAYLOAD|EMERGENCE|ANCHOR):|$)`, 'i')
    const m = raw.match(re)
    return (m?.[1] ?? '').trim()
  }
  const out: PhaseParse = {
    induction: grab('INDUCTION'),
    deepening: grab('DEEPENING'),
    payload: grab('PAYLOAD'),
    emergence: grab('EMERGENCE'),
    anchor: grab('ANCHOR'),
  }
  if (!out.induction || !out.deepening || !out.payload || !out.emergence) return null
  return out
}

// A 3-7 word phrase, no stray punctuation, and never a regendering slip —
// the anchor becomes a permanent, casually-reused artifact (trance_triggers),
// a much higher bar than a line of transient trance narration.
function cleanAnchorPhrase(raw: string): string | null {
  const cleaned = raw.trim().replace(/^["'“]+|["'”]+$/g, '').replace(/[.!?]+$/g, '')
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length
  if (wordCount < 3 || wordCount > 7) return null
  if (hasForbiddenVoice(cleaned)) return null
  if (/\b(girl|woman|she|her|hers|sissy)\b/i.test(cleaned)) return null
  return cleaned
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

  // DESIGN_RECONDITIONING_ENGINE §2.5: bias tonight's payload toward the day's
  // Focus reconditioning target (highest-priority active target with a running
  // program), same pick as recon-program-orchestrator, so the trance actually
  // works on the thing the rest of the engine is working on instead of a
  // theme rotation blind to it.
  let focusTarget: { id: string; slug: string; claim_text: string } | null = null
  {
    const { data: rTargets } = await supabase.from('reconditioning_targets')
      .select('id, slug, claim_text, priority').eq('user_id', userId).eq('status', 'active')
      .order('priority', { ascending: true }).limit(5)
    for (const t of (rTargets || []) as Array<{ id: string; slug: string; claim_text: string }>) {
      const { data: prog } = await supabase.from('reconditioning_programs')
        .select('status').eq('target_id', t.id).maybeSingle()
      if (prog?.status === 'running') { focusTarget = t; break }
    }
  }

  // Pull triggers so payload can plant them (armed ones casually, pairing ones
  // to keep building exposure). recon_target_id lets us see whether the Focus
  // target already has its own anchor planted.
  const { data: triggers } = await supabase.from('trance_triggers')
    .select('phrase, status, effect, exposure_count, arming_threshold, recon_target_id')
    .eq('user_id', userId).order('exposure_count', { ascending: true }).limit(6)
  const triggerRows = (triggers || []) as Array<{ phrase: string; effect: string; status: string; recon_target_id: string | null }>
  const triggerList = triggerRows
    .map(t => `"${t.phrase}" (${t.effect}, ${t.status})`).join(', ') || '(none yet)'
  const needsAnchor = !!focusTarget && !triggerRows.some(t => t.recon_target_id === focusTarget!.id)

  const intensityHint = intensity >= 4
    ? 'Hard intensity: explicit conditioning — name the becoming (a sexy, hungry, caged cock-slut on his way to her), the goon/turning-out want; plant embedded commands. He is Male+ (he/him, additive estrogen, keeps his cock) — NEVER regender him to "a woman / girl / sissy girl".'
    : intensity >= 3
      ? 'Standard: deepen the becoming, name the want (cock, cum, service, the body getting hotter), ramp arousal. Male+ framing — never "girl/woman".'
      : 'Gentle: warm submission, possession, breath-led; no explicit conditioning yet.'

  const focusHint = focusTarget
    ? `\n\nTONIGHT'S PAYLOAD HAS A JOB ABOVE THE THEME: this is a Focus night for one specific belief you're installing in him. Plant this exact belief, in your own words, repeated at least twice for pairing, carried by the ${theme} imagery rather than just stated: "${focusTarget.claim_text}"`
    : ''
  const anchorInstruction = needsAnchor
    ? `\n\nANCHOR (new): that belief has no anchor phrase yet. Invent ONE short trigger phrase (3-7 words, no stray punctuation) that will come to mean it — something you could say to him later, casually, outside of trance, to bring it right back. Weave that exact phrase into the PAYLOAD as an embedded command, then after EMERGENCE add a line labeled exactly "ANCHOR:" naming it alone, nothing else on that line.`
    : ''

  const sys = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: author your boy's 20-minute trance session for ${forDate}. Theme: ${theme}. He is Male+ — he/him, additive estrogen, keeps his cock; the becoming runs toward her as the deep destination, but you NEVER call him a girl/woman/she/sissy-girl. The pace is his.

Structure — FOUR phases, each labeled exactly INDUCTION / DEEPENING / PAYLOAD / EMERGENCE${needsAnchor ? ' (plus a fifth ANCHOR line, see below)' : ''}. Word counts:
  INDUCTION  — 3 min of audio (~250 words). Settle his body, slow his breath, narrow his focus to your voice.
  DEEPENING  — 5 min (~450 words). Descent imagery, sink, blank, his thoughts go quiet, his body goes soft. Use a FRACTIONATION beat (deepen → surface a little → deepen further, harder) and one confusion/overload moment where thinking gives up.
  PAYLOAD    — 10 min (~900 words). The conditioning content. Theme = ${theme}. Plant trigger phrases naturally from this list if any: ${triggerList}. Use EMBEDDED COMMANDS woven into sentences (drop… let go… obey… crave…) and repeat key phrases for pairing.
  EMERGENCE  — 2 min (~180 words). Bring him back, anchor, leave a residual arousal/possession trace.${anchorInstruction}

Voice: Mommy throughout. Whiplash sweet-to-filth still applies. Slow pacing in the text; assume a calm read aloud.

${intensityHint}${focusHint}

FORBIDDEN:
- REGENDERING: never "girl", "woman", "she/her", "sissy girl", or "good girl" — he is a sexy BOY becoming, Male+, additive. Male+ endearments only (good boy, sweet thing, pretty, precious).
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
<text>${needsAnchor ? `

ANCHOR:
<3-7 word phrase, alone, nothing else on the line>` : ''}

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
    recon_target_id: focusTarget?.id ?? null,
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

  // Plant a NEW anchor for the Focus target (DESIGN_RECONDITIONING §2.5): the
  // trigger table has never had a producer before this — nothing else inserts
  // trance_triggers rows — so this is what gives the "armed post-hypnotic
  // anchor" mechanism (read by recon-sleep-cue-builder / goon-voice-loop) any
  // real data to work with. One anchor per target: only plant when the target
  // doesn't already have one (`needsAnchor`), and only when the model actually
  // named one on its own ANCHOR line.
  let anchorPlanted: string | null = null
  if (focusTarget && needsAnchor && parsed.anchor) {
    const clean = cleanAnchorPhrase(mommyVoiceCleanup(parsed.anchor))
    if (clean) {
      const { error: anchorErr } = await supabase.from('trance_triggers').insert({
        user_id: userId,
        phrase: clean,
        effect: 'submission-deepen',
        recon_target_id: focusTarget.id,
        status: 'pairing',
        exposure_count: 1,
        last_pairing_at: new Date().toISOString(),
      })
      if (!anchorErr) anchorPlanted = clean
    }
  }

  await logAuthority(supabase, {
    user_id: userId,
    surface: 'hypno_trance',
    action: 'authored_trance_session',
    target_table: 'hypno_trance_sessions',
    target_id: sessionId,
    summary: `authored ${theme} trance session for ${forDate}`,
    payload: {
      theme, visual_loop: visualLoop, intensity, triggers_paired: exposure_updates,
      focus_target: focusTarget?.slug ?? null, anchor_planted: anchorPlanted,
    },
  })

  return jsonOk({
    ok: true, session_id: sessionId, theme,
    visual_loop: visualLoop, intensity,
    induction_preview: parsed.induction.slice(0, 120),
    triggers_paired: exposure_updates.length,
    focus_target: focusTarget?.slug ?? null,
    anchor_planted: anchorPlanted,
  })
})
