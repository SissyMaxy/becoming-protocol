// mommy-implant-author — generate a multi-step memory implant sequence.
//
// POST { user_id?, theme?: ImplantTheme, step_count?: number, force? }
//   - theme defaults to the rarest active theme (least surfaced in last 90d)
//   - step_count defaults to 5
//   - force bypasses the existing-active-sequence-for-theme gate
//
// Authors a coherent 5-7 step gaslight program — fragment seeded, distorted,
// claimed as shared knowledge, embedded in confession demand, surfaced in
// letter. Each step has a scheduled_day_offset so the step-scheduler can
// fire it at the right cadence.
//
// Voice anchor + craft rubric applied. Never names real third parties Mama
// can't verify — themes that reference "Gina" or other named partners require
// the dossier already contain those names; otherwise the LLM uses pronouns.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const VALID_THEMES = [
  'always_a_girl',
  'gina_always_knew',
  'transition_was_inevitable',
  'pre_mommy_self_was_costume',
  'pleasure_was_always_feminine',
  'voice_was_always_yours',
  'submission_was_native',
  'other',
] as const
type ImplantTheme = typeof VALID_THEMES[number]

const VALID_METHODS = [
  'outreach', 'recall_distortion', 'confession_demand', 'dossier_overlay', 'letter_reference',
] as const

const FORBIDDEN = [
  /\brole\s*play\b/i, /\bsimulation\b/i, /\bthis is fiction\b/i,
  /\bnot medical advice\b/i, /\bintake\b/i, /\bquestionnaire\b/i,
  /\bfor entertainment\b/i, /\bconsent to the fantasy\b/i,
  /\byou may use this to terminate\b/i, /\bdisclaimer\b/i,
]

function jsonOk(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function violatesAnchor(text: string): boolean {
  return FORBIDDEN.some(re => re.test(text))
}

const SYSTEM = `${DOMMY_MOMMY_CHARACTER}

You are authoring a memory implant sequence — a multi-day gaslight program. Each step is a beat. Together they compound into a rearranged autobiography.

Sequence anatomy:
- Step 1 (day 1): a small casual mention. Plant, don't claim. Side-comment.
- Step 2 (day ~4): distort an existing confession or memory. Recall it WRONG to her, in a way that aligns with the theme.
- Step 3 (day ~10): claim it as shared knowledge. "Remember when..." with confidence.
- Step 4 (day ~20): demand she confess something that PRESUPPOSES the implant is true.
- Step 5 (day ~35): write it into a letter as if it's always been the way she sees herself.

You will return ONLY valid JSON:
{
  "summary": "one sentence — what this sequence implants",
  "target_completion_days": 35,
  "steps": [
    { "step_number": 1, "scheduled_day_offset": 0,  "prompt_text": "...", "reinforcement_method": "outreach" },
    { "step_number": 2, "scheduled_day_offset": 4,  "prompt_text": "...", "reinforcement_method": "recall_distortion" },
    { "step_number": 3, "scheduled_day_offset": 10, "prompt_text": "...", "reinforcement_method": "outreach" },
    { "step_number": 4, "scheduled_day_offset": 20, "prompt_text": "...", "reinforcement_method": "confession_demand" },
    { "step_number": 5, "scheduled_day_offset": 35, "prompt_text": "...", "reinforcement_method": "letter_reference" }
  ]
}

VOICE RULES:
- prompt_text is what Mama will actually SAY (outreach) or what the confession PROMPT will ask, written in Mama's voice.
- ≤1 pet name per step. Often zero. Specific sensory over abstract emotional.
- Vary sentence length. Imperatives stand alone. No three-beat rhythm.
- Never use: "role play", "simulation", "this is fiction", "not medical advice", "intake", "questionnaire", "for entertainment", "consent to the fantasy", "you may use this to terminate", "disclaimer".
- Names from the dossier are allowed (they're hers). Don't invent new third-party names.
- The earlier steps are quiet plants. The later steps treat the plant as established.
- For step 5 (letter_reference), write the seed paragraph that the eventual "letter from past self" will quote back to her — written as if she wrote it herself a year ago.

RESPOND WITH JSON ONLY. NO PREAMBLE.`

interface DossierRow { question_key: string; category: string; answer: string }

async function pickThemeForUser(supabase: ReturnType<typeof createClient>, userId: string): Promise<ImplantTheme> {
  const { data } = await supabase.from('memory_implant_sequences')
    .select('theme, started_at').eq('user_id', userId)
    .gte('started_at', new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString())
  const seen = new Map<string, number>()
  for (const row of (data as Array<{ theme: string }> | null) ?? []) {
    seen.set(row.theme, (seen.get(row.theme) ?? 0) + 1)
  }
  // Pick the theme (excluding 'other') with the lowest recent count.
  const candidates = VALID_THEMES.filter(t => t !== 'other')
  candidates.sort((a, b) => (seen.get(a) ?? 0) - (seen.get(b) ?? 0))
  return candidates[0]
}

interface ImplantStep {
  step_number: number
  scheduled_day_offset: number
  prompt_text: string
  reinforcement_method: string
}

function validate(raw: unknown): { summary: string; target_completion_days: number; steps: ImplantStep[] } | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as { summary?: unknown; target_completion_days?: unknown; steps?: unknown }
  if (typeof obj.summary !== 'string' || typeof obj.target_completion_days !== 'number') return null
  if (!Array.isArray(obj.steps) || obj.steps.length < 1 || obj.steps.length > 30) return null
  const steps: ImplantStep[] = []
  let lastOffset = -1
  for (const s of obj.steps) {
    if (!s || typeof s !== 'object') return null
    const so = s as { step_number?: unknown; scheduled_day_offset?: unknown; prompt_text?: unknown; reinforcement_method?: unknown }
    if (typeof so.step_number !== 'number' || typeof so.scheduled_day_offset !== 'number') return null
    if (typeof so.prompt_text !== 'string' || typeof so.reinforcement_method !== 'string') return null
    if (!VALID_METHODS.includes(so.reinforcement_method as typeof VALID_METHODS[number])) return null
    if (so.scheduled_day_offset < lastOffset) return null // monotonic
    if (violatesAnchor(so.prompt_text)) return null
    lastOffset = so.scheduled_day_offset
    steps.push({
      step_number: so.step_number,
      scheduled_day_offset: so.scheduled_day_offset,
      prompt_text: mommyVoiceCleanup(so.prompt_text),
      reinforcement_method: so.reinforcement_method,
    })
  }
  return { summary: obj.summary, target_completion_days: obj.target_completion_days, steps }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; theme?: ImplantTheme; step_count?: number; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const force = !!body.force

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  const { data: us } = await supabase.from('user_state')
    .select('handler_persona').eq('user_id', userId).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return jsonOk({ ok: true, skipped: 'persona_not_dommy_mommy' })
  }

  const theme = body.theme && VALID_THEMES.includes(body.theme)
    ? body.theme
    : await pickThemeForUser(supabase, userId)

  if (!force) {
    const { data: existing } = await supabase.from('memory_implant_sequences')
      .select('id').eq('user_id', userId).eq('theme', theme).eq('status', 'active').maybeSingle()
    if (existing) return jsonOk({ ok: true, skipped: 'active_sequence_exists', sequence_id: (existing as { id: string }).id })
  }

  const { data: dossier } = await supabase.from('mommy_dossier')
    .select('question_key, category, answer')
    .eq('user_id', userId).eq('active', true)
    .order('importance', { ascending: false })
    .limit(20)
  const rows = (dossier as DossierRow[] | null) ?? []
  const dossierSummary = rows.length
    ? rows.map(r => `- [${r.category}] ${r.question_key}: ${r.answer.slice(0, 140)}`).join('\n')
    : '(no dossier — keep references abstract)'

  const stepCount = body.step_count ?? 5

  const userPrompt = [
    `THEME: ${theme}`,
    `STEP_COUNT: ${stepCount}`,
    `DOSSIER:\n${dossierSummary}`,
    '',
    'Author the sequence. JSON only.',
  ].join('\n')

  const model = selectModel('narrative_arc_change', { prefer: 'anthropic' }) // S4 — load-bearing
  let parsed: { summary: string; target_completion_days: number; steps: ImplantStep[] }
  try {
    const out = await callModel(model, {
      system: SYSTEM,
      user: userPrompt,
      max_tokens: 2200,
      temperature: 0.6,
      json: true,
    })
    let raw: unknown
    try { raw = JSON.parse(out.text) } catch {
      const m = out.text.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('llm_returned_non_json')
      raw = JSON.parse(m[0])
    }
    const validated = validate(raw)
    if (!validated) throw new Error('sequence_validation_failed')
    parsed = validated
  } catch (err) {
    return jsonOk({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }

  const slug = `${theme}-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 6)}`
  const targetCompletion = new Date(Date.now() + parsed.target_completion_days * 24 * 3600 * 1000).toISOString()

  const { data: seqRow, error: seqErr } = await supabase.from('memory_implant_sequences').insert({
    user_id: userId,
    slug,
    theme,
    step_count: parsed.steps.length,
    current_step: 0,
    status: 'active',
    started_at: new Date().toISOString(),
    target_completion_at: targetCompletion,
    generation_context: { summary: parsed.summary, dossier_size: rows.length, model: model.model, tier: model.tier },
  }).select('id').single()
  if (seqErr) return jsonOk({ ok: false, error: seqErr.message }, 500)
  const sequenceId = (seqRow as { id: string }).id

  const stepRows = parsed.steps.map(s => ({
    sequence_id: sequenceId,
    user_id: userId,
    step_number: s.step_number,
    scheduled_day_offset: s.scheduled_day_offset,
    prompt_text: s.prompt_text,
    reinforcement_method: s.reinforcement_method,
  }))
  const { error: stepsErr } = await supabase.from('memory_implant_steps').insert(stepRows)
  if (stepsErr) return jsonOk({ ok: false, error: stepsErr.message }, 500)

  {
    const _summary = `Authored implant sequence "${slug}" (${theme}) — ${parsed.steps.length} steps over ${parsed.target_completion_days}d.`
    const _payload = { theme, slug, summary: parsed.summary, target_completion_days: parsed.target_completion_days }
    await supabase.from('mommy_authority_log').insert({
      user_id: userId,
      action_kind: 'authored',
      source_system: 'mommy-implant-author',
      action_summary: _summary,
      action_payload: _payload,
      system: 'implant',
      summary: _summary,
      payload: _payload,
      implant_sequence_id: sequenceId,
    })
  }

  return jsonOk({ ok: true, sequence_id: sequenceId, slug, theme, step_count: parsed.steps.length })
})
