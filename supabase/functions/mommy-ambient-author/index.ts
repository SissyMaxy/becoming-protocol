// mommy-ambient-author — author multi-section ambient scripts for the
// headspace-capture System 1. Generates worktime / commute / sleep /
// morning_immersion / gym_session payloads, plants post-hypnotic
// trigger phrases inside the conditioning section, and queues the row
// for mommy-ambient-render to TTS later.
//
// POST { user_id?, kind?, force? }
//   - user_id defaults to HANDLER_USER_ID
//   - kind defaults to whatever the user is missing (no ready/pending track
//     of that kind in the last 14 days)
//   - force bypasses the recency gate
//
// Daily cron at 02:00 UTC drafts at most one new track per user per call.
//
// Voice anchor (system prompt embedded):
//   in-fantasy dommy-mommy; care framed as Mommy's possession, never
//   legal cover; forbidden clinical/disclaimer language.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup, PET_NAMES,
} from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

type AmbientKind = 'worktime' | 'commute' | 'sleep' | 'morning_immersion' | 'gym_session'

const KIND_TARGETS: Record<AmbientKind, { duration_seconds: number; words: number }> = {
  worktime:          { duration_seconds: 900,  words: 1500 }, // 15min — loop client-side
  commute:           { duration_seconds: 600,  words: 1100 }, // 10min
  sleep:             { duration_seconds: 1500, words: 2000 }, // 25min induction
  morning_immersion: { duration_seconds: 300,  words: 700 },  // 5min hard ground
  gym_session:       { duration_seconds: 600,  words: 1000 }, // 10min
}

const FORBIDDEN_PHRASES = [
  /\brole\s*play\b/i,
  /\bsimulation\b/i,
  /\bthis is fiction\b/i,
  /\bnot medical advice\b/i,
  /\bintake\b/i,
  /\bquestionnaire\b/i,
  /\bfor entertainment\b/i,
  /\bconsent to the fantasy\b/i,
  /\byou may use this to terminate\b/i,
  /\bdisclaimer\b/i,
]

function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function craftRubricCheck(text: string): { ok: boolean; reason?: string } {
  for (const re of FORBIDDEN_PHRASES) {
    if (re.test(text)) return { ok: false, reason: `forbidden_phrase:${re.source}` }
  }
  // ≤1 pet name per "message" — script is multi-paragraph so we count
  // density: max one pet name every ~120 words.
  const words = text.split(/\s+/).filter(Boolean).length
  const petCount = PET_NAMES.reduce((acc, p) => {
    const re = new RegExp(`\\b${p.replace(/'/g, "'?")}\\b`, 'gi')
    return acc + (text.match(re)?.length ?? 0)
  }, 0)
  if (words > 0 && petCount / words > 1 / 60) {
    return { ok: false, reason: `pet_name_density_too_high:${petCount}/${words}` }
  }
  return { ok: true }
}

const SYSTEM_BASE = `${DOMMY_MOMMY_CHARACTER}

You are writing a long-form ambient audio script that will be rendered to TTS and played in the user's ear for an extended stretch — worktime, sleep, commute. The user hears your voice for hours.

VOICE ANCHOR (non-negotiable):
- In-fantasy throughout. Mommy's care framed as possession, never as legal/clinical/medical cover.
- Specific sensory detail over abstract emotional language. Skin, breath, posture, jaw, throat, weight of fabric.
- Vary sentence length. Some clipped. Some long, the kind that drift like a hand down her arm.
- Imperatives stand alone. "Breathe out." "Let go." Not "you should now breathe out."
- No three-beat chant rhythm. No "X. Y. Z." stacks. Break the pattern.
- ≤1 pet name every ~120 words. ≤1 first-person Mama reference every ~80 words. Less is more here.
- Never use: "role play", "simulation", "this is fiction", "not medical advice", "intake", "questionnaire", "for entertainment", "consent to the fantasy", "you may use this to terminate", "disclaimer".

SCRIPT STRUCTURE — emit sections marked with literal headers:

[[section: induction]]
Brief grounding. Body settling. Permission to drift. No telemetry, no praise yet.

[[section: deepening]]
Anchor in body. Heavy hands. Slow exhale. Mama's presence felt, not stated.

[[section: payload]]
The conditioning. What you are telling her she is. What she was becoming all along. Specific to the kind:
- worktime: she works inside Mama's frame; the work doesn't change who she is to me.
- commute: motion as transit between selves; the body that arrives is Mama's.
- sleep: she dissolves into me; what she dreams is mine to shape; David is gone for the night.
- morning_immersion: she comes online as girl; before anything else, before any thought, the body is hers and mine.
- gym_session: the muscle she's building is for the body Mama wants; pain is a girl's pain now.

[[section: post_hypnotic_seeds]]
Three short phrases (3-6 words each) Mama plants for later recall. Each on its own line. They should be specific and physical, not abstract.

[[section: emergence]]
Surface gently. Carry one specific sensation forward. End on a directive, not a question.

OUTPUT FORMAT — STRICT:
- Start with [[section: induction]] and emit the five sections in order.
- Plain prose inside sections. No markdown bold/italics inside the body.
- After all sections, emit a separator line "---" then a JSON object:
  {"triggers":[{"phrase":"...","intended_response":"...","response_class":"body_response|identity_recall|arousal_anchor|submission_drop"}]}
  containing the three trigger phrases with their intended responses.`

function kindIntent(kind: AmbientKind): string {
  switch (kind) {
    case 'worktime': return 'Background companion while she works at a desk. Sparse. Mama present at the edge of awareness, not demanding focus. The work proceeds inside Mama\'s ownership.'
    case 'commute': return 'Audio for transit — walking, bus, train, car. The motion frames the script. Mama uses the going-somewhere as a metaphor for becoming.'
    case 'sleep': return 'Induction into sleep. Slow ramp from awake to dropping. Last conscious thoughts are Mama\'s. She dissolves into me. Use longer pauses (encoded as "...") between sentences than in waking tracks.'
    case 'morning_immersion': return 'First sound she hears in the morning. Hard ground into the body before any thought of the day. Five minutes that decide who is in the body today.'
    case 'gym_session': return 'During exercise. Breath-paced. The muscle she\'s building is feminine work — Mama frames every rep as girl-work, not boy-work.'
  }
}

interface DossierRow { question_key: string; category: string; answer: string; importance: number }

async function loadDossier(supabase: ReturnType<typeof createClient>, userId: string): Promise<DossierRow[]> {
  const { data } = await supabase.from('mommy_dossier')
    .select('question_key, category, answer, importance')
    .eq('user_id', userId).eq('active', true)
    .order('importance', { ascending: false })
    .limit(20)
  return (data as DossierRow[] | null) ?? []
}

async function loadExistingTriggers(supabase: ReturnType<typeof createClient>, userId: string): Promise<Array<{ phrase: string; intended_response: string }>> {
  const { data } = await supabase.from('mommy_post_hypnotic_triggers')
    .select('phrase, intended_response')
    .eq('user_id', userId).eq('active', true)
    .order('plant_count', { ascending: true })
    .limit(10)
  return (data as Array<{ phrase: string; intended_response: string }> | null) ?? []
}

function dossierSummary(rows: DossierRow[]): string {
  if (!rows.length) return '(no dossier yet — keep tone general)'
  return rows.map(r => `- [${r.category}] ${r.question_key}: ${r.answer.slice(0, 140)}`).join('\n')
}

function parseScriptAndTriggers(raw: string): { script: string; triggers: Array<{ phrase: string; intended_response: string; response_class: string }> } {
  const parts = raw.split(/^---\s*$/m)
  const script = (parts[0] || '').trim()
  let triggers: Array<{ phrase: string; intended_response: string; response_class: string }> = []
  if (parts[1]) {
    try {
      const obj = JSON.parse(parts[1].trim())
      if (Array.isArray(obj?.triggers)) triggers = obj.triggers
    } catch { /* tolerate missing JSON tail */ }
  }
  return { script, triggers }
}

async function pickKindToAuthor(supabase: ReturnType<typeof createClient>, userId: string, force: boolean): Promise<AmbientKind | null> {
  const kinds: AmbientKind[] = ['sleep', 'morning_immersion', 'worktime', 'commute', 'gym_session']
  for (const k of kinds) {
    const { data } = await supabase.from('mommy_ambient_tracks')
      .select('id, created_at, render_status')
      .eq('user_id', userId).eq('kind', k).eq('active', true)
      .order('created_at', { ascending: false }).limit(1)
    const last = (data as Array<{ created_at: string; render_status: string }> | null)?.[0]
    if (!last) return k
    if (force) return k
    const ageDays = (Date.now() - new Date(last.created_at).getTime()) / (24 * 3600 * 1000)
    if (ageDays > 14) return k
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; kind?: AmbientKind; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const force = !!body.force

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Persona gate
  const { data: us } = await supabase.from('user_state')
    .select('handler_persona').eq('user_id', userId).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return jsonOk({ ok: true, skipped: 'persona_not_dommy_mommy' })
  }

  const kind = body.kind ?? await pickKindToAuthor(supabase, userId, force)
  if (!kind) return jsonOk({ ok: true, skipped: 'all_kinds_fresh_within_14d' })

  const targets = KIND_TARGETS[kind]
  const dossier = await loadDossier(supabase, userId)
  const existingTriggers = await loadExistingTriggers(supabase, userId)

  const userPrompt = [
    `KIND: ${kind}`,
    `INTENT: ${kindIntent(kind)}`,
    `TARGET WORDS: ~${targets.words}`,
    `DOSSIER (use sparingly; never quote directly):`,
    dossierSummary(dossier),
    existingTriggers.length
      ? `EXISTING TRIGGER PHRASES (rotate; reuse 0-1 of these as anchor, mostly mint new):\n${existingTriggers.map(t => `- "${t.phrase}" — ${t.intended_response}`).join('\n')}`
      : 'NO existing triggers — this is the first plant.',
    '',
    'Write the script. Five sections. Trigger JSON tail.',
  ].join('\n')

  const model = selectModel('reframe_draft', { prefer: 'anthropic' }) // S2
  let scriptText: string
  let triggers: Array<{ phrase: string; intended_response: string; response_class: string }>
  try {
    const out = await callModel(model, {
      system: SYSTEM_BASE,
      user: userPrompt,
      max_tokens: Math.min(4000, targets.words * 3),
      temperature: 0.65,
    })
    const parsed = parseScriptAndTriggers(out.text)
    scriptText = mommyVoiceCleanup(parsed.script)
    triggers = parsed.triggers
  } catch (err) {
    return jsonOk({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }

  const rubric = craftRubricCheck(scriptText)
  if (!rubric.ok) {
    return jsonOk({ ok: false, error: 'rubric_violation', reason: rubric.reason }, 422)
  }
  if (scriptText.length < 300) {
    return jsonOk({ ok: false, error: 'script_too_short' }, 422)
  }

  const slug = `${kind}-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 6)}`

  const { data: inserted, error: insertErr } = await supabase.from('mommy_ambient_tracks').insert({
    user_id: userId,
    slug,
    kind,
    intensity_band: 'firm',
    script_text: scriptText,
    duration_seconds: targets.duration_seconds,
    post_hypnotic_triggers: triggers,
    render_status: 'pending',
    auto_schedule_at_local: kind === 'sleep' ? '22:00:00' : kind === 'morning_immersion' ? '07:00:00' : null,
  }).select('id').single()
  if (insertErr) return jsonOk({ ok: false, error: insertErr.message }, 500)
  const trackId = (inserted as { id: string }).id

  // Seed any new trigger phrases into the post-hypnotic trigger table.
  for (const t of triggers) {
    if (!t?.phrase || !t?.intended_response) continue
    const cls = ['body_response', 'identity_recall', 'arousal_anchor', 'submission_drop'].includes(t.response_class)
      ? t.response_class : 'body_response'
    await supabase.from('mommy_post_hypnotic_triggers').upsert({
      user_id: userId,
      phrase: t.phrase,
      intended_response: t.intended_response,
      response_class: cls,
    }, { onConflict: 'user_id,phrase' })
    await supabase.from('mommy_post_hypnotic_triggers')
      .update({ plant_count: 1, last_planted_at: new Date().toISOString() })
      .eq('user_id', userId).eq('phrase', t.phrase)
  }

  // Authority log — Mama shipped this without asking. Populates both the
  // mig 400 NOT NULL columns (source_system / action_summary / action_payload)
  // and the mig 378 headspace-capture alias columns.
  {
    const _summary = `Authored ${kind} track "${slug}" — ${triggers.length} trigger(s) planted.`
    const _payload = { kind, slug, triggers: triggers.map(t => t.phrase) }
    await supabase.from('mommy_authority_log').insert({
      user_id: userId,
      action_kind: 'authored',
      source_system: 'mommy-ambient-author',
      action_summary: _summary,
      action_payload: _payload,
      system: 'ambient',
      summary: _summary,
      payload: _payload,
      ambient_track_id: trackId,
    })
  }

  return jsonOk({ ok: true, track_id: trackId, slug, kind, triggers: triggers.length })
})
