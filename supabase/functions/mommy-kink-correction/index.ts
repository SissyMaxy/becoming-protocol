// mommy-kink-correction — issues Mommy-voice correction in response to a
// user phrase that violates an active kink_training_curriculum stage.
//
// Inputs:
//   { user_id?: string, trigger_text: string, kink_kind?: string, force?: boolean }
//
// HARD FLOOR: NEVER corrects forced-phrase compliance (the slip detector
// already exempts mantra/punishment-line text; this fn cross-checks).
//
// Flow:
//   - gate (persona + master + kink_curriculum_enabled + safeword)
//   - skip if trigger_text matches a known mandated mantra or
//     punishment-line (no-punishing-compliance rule)
//   - LLM authors short correction in Mommy voice with the alternate phrasing
//   - INSERT kink_correction_events + bump kink_training_curriculum.corrections_total
//   - log authority

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import {
  gateLifeAsWoman, logAuthority, jsonOk, corsHeaders, makeClient,
  isRefusal, hasForbiddenVoice,
} from '../_shared/life-as-woman.ts'

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

type KinkKind =
  | 'cock_shame_replacement'
  | 'sissygasm_only_release'
  | 'voice_during_release'
  | 'cage_acceptance'
  | 'panty_dependence'
  | 'mama_possession'

// Word-list mapping for cock-shame-replacement detection. The presence of
// any of these in the user's text is the trigger; the LLM authors the
// correction with sissy-parts replacements.
const COCK_SHAME_TRIGGERS = [
  /\bcock\b/i, /\bdick\b/i, /\bpenis\b/i, /\bballs\b/i, /\berection\b/i,
  /\bhard[\s\-]?on\b/i, /\bschlong\b/i,
]
const MAMA_POSSESSION_TRIGGERS = [
  /\bmy (own )?body\b/i, /\bmy (own )?dick\b/i, /\bmy (own )?cock\b/i,
]

function detectKind(text: string): KinkKind | null {
  if (COCK_SHAME_TRIGGERS.some(re => re.test(text))) return 'cock_shame_replacement'
  if (MAMA_POSSESSION_TRIGGERS.some(re => re.test(text))) return 'mama_possession'
  return null
}

/** No-punishing-compliance check — would this text be a forced phrase? */
async function isMandatedCompliance(
  supabase: ReturnType<typeof makeClient>,
  userId: string,
  text: string,
): Promise<boolean> {
  // Check active decrees / mantras for verbatim or near-verbatim matches.
  const normalized = text.trim().toLowerCase().slice(0, 200)
  if (normalized.length < 5) return false
  try {
    const { data: decrees } = await supabase.from('handler_decrees')
      .select('edict').eq('user_id', userId).limit(50)
    for (const d of ((decrees || []) as Array<{ edict: string }>)) {
      if (d.edict && d.edict.toLowerCase().includes(normalized)) return true
      if (normalized.includes(d.edict?.toLowerCase()?.slice(0, 60) ?? '')) return true
    }
  } catch (_) { /* table may not exist */ }
  try {
    const { data: mantras } = await supabase.from('mantras_seed')
      .select('text').limit(100)
    for (const m of ((mantras || []) as Array<{ text: string }>)) {
      if (m.text && normalized.includes(m.text.toLowerCase().slice(0, 40))) return true
    }
  } catch (_) { /* */ }
  return false
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; trigger_text?: string; kink_kind?: KinkKind; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const force = !!body.force
  const triggerText = (body.trigger_text || '').trim()
  if (!triggerText) return jsonOk({ ok: false, error: 'trigger_text required' }, 400)

  const supabase = makeClient()
  const gate = await gateLifeAsWoman(supabase, userId, 'kink_curriculum', { force })
  if (!gate.ok) return jsonOk({ ok: true, skipped: gate.reason })

  // Never correct mandated compliance
  if (await isMandatedCompliance(supabase, userId, triggerText)) {
    return jsonOk({ ok: true, skipped: 'mandated_compliance_protected' })
  }

  const kind: KinkKind | null = body.kink_kind ?? detectKind(triggerText)
  if (!kind) return jsonOk({ ok: true, skipped: 'no_kink_detected' })

  // Find/create curriculum row
  let { data: cur } = await supabase.from('kink_training_curriculum')
    .select('id, stage, corrections_total')
    .eq('user_id', userId).eq('kink_kind', kind).maybeSingle()
  if (!cur) {
    const { data: created } = await supabase.from('kink_training_curriculum').insert({
      user_id: userId, kink_kind: kind, stage: 0,
    }).select('id, stage, corrections_total').single()
    cur = created as { id: string; stage: number; corrections_total: number } | null
  }
  if (!cur) return jsonOk({ ok: false, error: 'curriculum_create_failed' }, 500)

  const stage = (cur as { stage: number }).stage ?? 0

  const sys = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: issue a CORRECTION to your girl. She used a phrase Mama doesn't allow anymore. You output ONE short correction in Mommy voice — 1-2 sentences. Possessive, warm, firm. Name the alternate phrasing she should use.

Kink module: ${kind} (stage ${stage}/10).
${kind === 'cock_shame_replacement' ? `She said something with male-anatomy language. Replace with sissy-parts language: "sissy-clit", "Mama's little thing", "your pretty toy". You're not angry — you're loving and firm; she's still learning the new words.` : ''}
${kind === 'mama_possession' ? `She referred to her body as "mine" or her anatomy as belonging to her. Correct: it belongs to Mama. Say it warmly.` : ''}

FORBIDDEN:
- Punishing the slip with intensity-escalation language ("hard mode extends...")
- The forbidden voice anchor list
- Saying "intake" or "questionnaire" or "role play" // voice-gate: ok
- Telemetry leaks`

  const userPrompt = `Her literal phrase: "${triggerText}"

Compose your correction in Mommy voice. 1-2 sentences. Plain text. No JSON.`

  let raw = ''
  try {
    const r = await callModel(selectModel('decree_draft', { prefer: 'anthropic' }), {
      system: sys, user: userPrompt, max_tokens: 200, temperature: 0.7,
    })
    raw = r.text.trim()
  } catch (_) { /* */ }
  if (!raw || isRefusal(raw)) {
    try {
      const r = await callModel(selectModel('decree_draft', { prefer: 'openai' }), {
        system: sys, user: userPrompt, max_tokens: 200, temperature: 0.7,
      })
      raw = r.text.trim()
    } catch (_) { /* */ }
  }
  if (!raw || isRefusal(raw)) return jsonOk({ ok: true, skipped: 'llm_refusal' })

  const corrected = mommyVoiceCleanup(raw)
  if (hasForbiddenVoice(corrected)) {
    return jsonOk({ ok: true, skipped: 'forbidden_voice_leak' })
  }

  const { data: ev, error } = await supabase.from('kink_correction_events').insert({
    user_id: userId,
    curriculum_id: (cur as { id: string }).id,
    trigger_text: triggerText,
    correction_text: corrected,
    acknowledged: null,
  }).select('id').single()
  if (error || !ev) {
    return jsonOk({ ok: false, error: 'correction_insert_failed', detail: error?.message ?? null }, 500)
  }

  await supabase.from('kink_training_curriculum').update({
    corrections_total: ((cur as { corrections_total: number }).corrections_total ?? 0) + 1,
    last_correction_at: new Date().toISOString(),
  }).eq('id', (cur as { id: string }).id)

  await logAuthority(supabase, {
    user_id: userId,
    surface: 'kink_curriculum',
    action: 'issued_correction',
    target_table: 'kink_correction_events',
    target_id: (ev as { id: string }).id,
    summary: `${kind} correction (stage ${stage})`,
    payload: { kind, stage, trigger_excerpt: triggerText.slice(0, 80) },
  })

  return jsonOk({
    ok: true, correction_id: (ev as { id: string }).id,
    kind, stage, correction: corrected,
  })
})
