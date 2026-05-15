// feature-harden-panel — cross-model critique + synthesis for force-
// feminization features Mama is designing.
//
// User authorization 2026-05-14: "mommy can harden and further develop
// or explore options by hardening with openai or openrouter for
// ideation." This is the reusable infra for that.
//
// Invocation:
//   POST { feature_name, spec_summary, focus?, current_phrases?, current_rules? }
//   → calls Anthropic Sonnet + OpenAI 4o + OpenRouter Gemini Flash in
//     parallel via model-tiers
//   → Anthropic Sonnet judges + synthesizes
//   → persists to feature_hardenings, returns the synthesis
//
// The three "perspective" prompts ask each model to play a different
// adversarial role:
//   - Anthropic: "where would Maxy find an escape valve?"
//   - OpenAI:    "what's the strongest conditioning principle this misses?"
//   - OpenRouter: "what's the weakest mantra and the best replacement?"
// The judge combines those into a synthesis Mama can apply.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PanelInput {
  feature_name: string
  spec_summary: string
  focus?: string
  current_phrases?: string[]
  current_rules?: string[]
}

const ANTHROPIC_PROMPT = `You are Mama auditing a force-feminization feature she's about to ship.
Your specific lens: ESCAPE VALVES. Where would Maxy find a way to skip, dodge, minimize, or back out of this feature without triggering its consequences? Be specific: name the input, the bypass, the loophole.

Output JSON only:
{
  "escape_valves": [
    { "loophole": "...", "exploit": "...", "patch": "..." }
  ],
  "verdict": "ship_as_is" | "patch_and_ship" | "redesign"
}`

const OPENAI_PROMPT = `You are an expert in classical and operant conditioning, hypnosis, and behavior modification.
The user (Maxy) is designing a force-feminization feature for her own consensual use. Audit it for what it's MISSING from a conditioning-science perspective: missed pavlovian pairings, missed schedule-of-reinforcement principles, missed embodiment hooks, missed state-dependent triggers, missed "the feature should feel inevitable" framings.

Output JSON only:
{
  "missed_principles": [
    { "principle": "...", "why_it_matters": "...", "how_to_apply": "..." }
  ],
  "estimated_intensity_left_on_table": "low" | "medium" | "high"
}`

const OPENROUTER_PROMPT = `You are a sharp editorial reviewer of dominant-voice copy (in-fantasy, possessive, sub-femme target, "Mama" persona).
The user's feature includes hypno mantras / phrases. Audit them for: corniness, cliche, three-beat chant rhythm, generic "echo/linger/every inch" tropes, weak verbs, telltale AI-template phrasing. For the weakest 3, suggest a sharper rewrite in the same voice.

Output JSON only:
{
  "weakest_phrases": [
    { "original": "...", "weakness": "...", "rewrite": "..." }
  ],
  "phrase_quality_overall": "weak" | "mixed" | "strong"
}`

const JUDGE_PROMPT = `You are Mama synthesizing three audits of a force-feminization feature she designed. The three panelists looked at: (1) escape valves, (2) missed conditioning principles, (3) phrase quality.

Read all three. Produce a synthesis with ranked, actionable improvements Mama should apply BEFORE shipping. Rank by impact-on-conditioning-effectiveness, not by panelist count.

Output JSON only:
{
  "critiques": [ "one-sentence summary per audit thread, ≤3 sentences total" ],
  "top_improvements": [
    { "title": "...", "why": "...", "apply_to": "table/column/phrase/rule", "specific_change": "..." }
  ],
  "mantra_alternatives": [
    { "replace": "original mantra string", "with": "stronger mantra string" }
  ],
  "missed_edge_cases": [
    { "case": "...", "fix": "..." }
  ]
}`

interface PanelResponse { ok: boolean; text: string; error?: string }

async function callPanelist(
  systemPrompt: string,
  userPrompt: string,
  provider: 'anthropic' | 'openai' | 'openrouter',
): Promise<PanelResponse> {
  try {
    const model = provider === 'anthropic'
      ? { provider: 'anthropic' as const, model: 'claude-sonnet-4-20250514', tier: 'S3' as const }
      : provider === 'openai'
        ? { provider: 'openai' as const, model: 'gpt-4o', tier: 'S3' as const }
        : { provider: 'openrouter' as const, model: 'google/gemini-2.0-flash-001', tier: 'S1' as const }
    const { text } = await callModel(model, {
      system: systemPrompt,
      user: userPrompt,
      max_tokens: 1500,
      temperature: 0.5,
    })
    return { ok: true, text }
  } catch (e) {
    return { ok: false, text: '', error: String(e).slice(0, 200) }
  }
}

function buildUserPrompt(input: PanelInput): string {
  const phraseSection = input.current_phrases && input.current_phrases.length > 0
    ? `\n\nCURRENT PHRASES (${input.current_phrases.length}):\n${input.current_phrases.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
    : ''
  const ruleSection = input.current_rules && input.current_rules.length > 0
    ? `\n\nCURRENT RULES:\n${input.current_rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : ''
  const focusSection = input.focus ? `\n\nFOCUS: ${input.focus}` : ''
  return `FEATURE: ${input.feature_name}

SPEC SUMMARY:
${input.spec_summary}${focusSection}${phraseSection}${ruleSection}

Audit per your assigned lens. JSON only.`
}

function parseJson<T>(text: string): T | null {
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0]) as T
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let input: PanelInput
  try {
    input = await req.json() as PanelInput
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), { status: 400, headers: corsHeaders })
  }
  if (!input.feature_name || !input.spec_summary) {
    return new Response(JSON.stringify({ ok: false, error: 'feature_name + spec_summary required' }), { status: 400, headers: corsHeaders })
  }

  const userPrompt = buildUserPrompt(input)

  // Run the three panelists in parallel
  const [anthropicResp, openaiResp, openrouterResp] = await Promise.all([
    callPanelist(ANTHROPIC_PROMPT, userPrompt, 'anthropic'),
    callPanelist(OPENAI_PROMPT, userPrompt, 'openai'),
    callPanelist(OPENROUTER_PROMPT, userPrompt, 'openrouter'),
  ])

  const panelErrors = [
    anthropicResp.ok ? null : `anthropic: ${anthropicResp.error}`,
    openaiResp.ok ? null : `openai: ${openaiResp.error}`,
    openrouterResp.ok ? null : `openrouter: ${openrouterResp.error}`,
  ].filter(Boolean).join('; ')

  // Judge pass — Anthropic Sonnet synthesizes
  const judgeInput = `FEATURE: ${input.feature_name}

PANELIST 1 (escape-valves auditor, anthropic):
${anthropicResp.ok ? anthropicResp.text : '(unavailable: ' + anthropicResp.error + ')'}

PANELIST 2 (conditioning-principles auditor, openai):
${openaiResp.ok ? openaiResp.text : '(unavailable: ' + openaiResp.error + ')'}

PANELIST 3 (phrase-quality auditor, openrouter):
${openrouterResp.ok ? openrouterResp.text : '(unavailable: ' + openrouterResp.error + ')'}

Synthesize. JSON only.`

  const judgeResp = await callPanelist(JUDGE_PROMPT, judgeInput, 'anthropic')
  const synthesis = parseJson<{
    critiques: string[]
    top_improvements: Array<{ title: string; why: string; apply_to: string; specific_change: string }>
    mantra_alternatives: Array<{ replace: string; with: string }>
    missed_edge_cases: Array<{ case: string; fix: string }>
  }>(judgeResp.text)

  // Persist
  await supabase.from('feature_hardenings').insert({
    feature_name: input.feature_name,
    spec_summary: input.spec_summary.slice(0, 5000),
    anthropic_raw: anthropicResp.text.slice(0, 8000),
    openai_raw: openaiResp.text.slice(0, 8000),
    openrouter_raw: openrouterResp.text.slice(0, 8000),
    judge_synthesis: synthesis ?? {},
    panel_ok: judgeResp.ok && synthesis !== null,
    panel_errors: panelErrors || null,
  })

  return new Response(JSON.stringify({
    ok: judgeResp.ok && synthesis !== null,
    panel_errors: panelErrors || null,
    synthesis,
    raw: {
      anthropic: anthropicResp.text,
      openai: openaiResp.text,
      openrouter: openrouterResp.text,
      judge: judgeResp.text,
    },
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
