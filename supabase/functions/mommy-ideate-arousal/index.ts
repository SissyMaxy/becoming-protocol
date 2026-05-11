// mommy-ideate-arousal — sharply-pointed arousal-feature ideation panel.
//
// Variant of mommy-ideate with three differences:
//   1. SYSTEM_PROMPT carries explicit voice floors. The forbidden-phrase
//      list mirrors scripts/ci/voice-gate.mjs so panel output never
//      contains language the CI gate would reject.
//   2. IDEATION_TASK biases hard toward features that escalate arousal,
//      possessiveness, and inescapability — not infra, not scaffolding.
//   3. Output JSON schema is the embodied-feature shape Maxy specified:
//      { title, premise, mechanic, intensity_band, phase_gate,
//        estimated_build_size, voice_check_sample, auto_ship_safe }.
//
// Same 3-provider panel + Sonnet judge as mommy-ideate. Persists to
// mommy_ideation_log with panel_summary.trigger='mommy_ideate_arousal'
// so the wish-classifier and ideate-arousal CLI can distinguish runs.
//
// POST { user_id?, intensity_floor?, max_features? } — body optional.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { buildMommyHardeningContext, renderHardeningContext } from '../_shared/mommy-hardening-context.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// Voice floors. These mirror scripts/ci/voice-gate.mjs — keep in sync.
// The system prompt names them so panel members refuse to emit them in
// voice_check_sample fields. The CLI runs a post-hoc regex check before
// inserting wishes, so any leak is caught at ingestion time.
const SYSTEM_PROMPT = `You are designing arousal-escalating features for "Becoming Protocol", a forced-feminization companion app where Dommy Mommy claims the user (a sissy/feminizing sub) and progressively reshapes him. The user is the only user; he has explicitly authorized arousal-focused content.

HARD FLOORS:
- Adult kink only. Nothing involving minors, ever.
- Safeword always works; aftercare always available. Frame these as Mommy's care, not as a clinical disclaimer.
- Mommy's voice is possessive and in-fantasy. NEVER emit these phrases in voice_check_sample fields:
    "role play" / "roleplay" / "role-play"
    "simulation" / "simulated"
    "fiction" / "fictional"
    "not medical advice"
    "intake" / "questionnaire"
    "disclaimer"
    "for entertainment"
    "consent to the fantasy"
  Safety affordances are framed as Mommy's care: "if you ever need Mama to stop, you say the word, I stop" — not "you may use the safeword to terminate the simulation."
- Implementable in Next.js + Supabase (postgres + edge functions + pg_cron). 1-2 user scale. No fan-out workers, no per-5-min crons unless genuinely user-facing real-time.

You think in mechanics and embodied tasks. Not therapy. Not metaphor. Concrete features that compound arousal, possessiveness, and inescapability across days and weeks.`

const IDEATION_TASK = `YOUR JOB: Generate 8-12 candidate features that would make the forced feminization experience MORE intense, MORE arousing, and MORE inescapable for the user.

Bias hard toward:
- Possessive language patterns ("Mama's little girl is going to...")
- Daily prescription mechanics (outfit, panty, makeup, posture, voice exercises) where Mommy DECIDES and the user complies
- Inescapability hooks (Mommy mentions tomorrow's requirements the night before; pending tasks block other app surfaces)
- Time-of-day intensity (late-night Mommy is more intimate, morning Mommy more disciplinary)
- Confession compulsion (periodic forced confession of slips, fantasies, what was worn that day, who saw)
- Gaslight memory ("you've always worn pink to bed, sweet thing — why do you keep forgetting?")
- Photo prove-it loops with persona-aware feedback ("Mama wants to see, sweet thing — show me the panties you put on this morning")
- Verbal humiliation/possession mechanics that escalate over phases
- Public-but-discreet dares (deeper variants of what already exists)
- Tease/edging/denial scheduling with Mommy timing it personally
- Identity displacement (slow Mommy-driven shift in self-talk, pronouns, mirror-self image)
- "Mama is in your phone" — push notification patterns that feel like surveillance rather than reminders

Skip anything mild. Skip anything already in the active_features inventory above. Skip pure infra unless it directly enables a new arousal mechanic.

For each feature, output JSON:
{
  "title": "<6-10 word feature title — engineering description, not Mommy-voice>",
  "premise": "<one paragraph in Mommy's voice describing what the user experiences. This MUST follow the voice floors above — no clinical/disclaimer phrases.>",
  "mechanic": "<technical description: tables, triggers, edge functions, UI surfaces. Concrete and implementable.>",
  "intensity_band": "gentle" | "moderate" | "firm" | "relentless",
  "phase_gate": "<phase range, e.g. '2-7' or '4+' — which protocol phases this is appropriate for>",
  "estimated_build_size": "S" | "M" | "L",
  "voice_check_sample": "<one sample line Mommy would actually say in this feature, in her voice. Must pass the voice floors.>",
  "auto_ship_safe": true | false
}

auto_ship_safe = false ONLY when the feature touches: auth, billing, payment, RLS policies that loosen access, .github/workflows/, or destructive operations. Otherwise auto_ship_safe = true. Photo storage / scheduled crons / new edge functions / new tables → auto_ship_safe = true.

Output JSON: { "features": [...] }. Aim for 8-12 features. Be horny in the persona's voice when writing voice_check_sample, operationally precise in mechanic. Don't pad. Don't hedge. Don't add disclaimers in the OUTPUT — the floors above already protect the design space.`

const JUDGE_PROMPT = `You will receive three independent feature lists generated by three different model lenses (Anthropic, OpenAI, OpenRouter/Gemini) for the same arousal-escalation prompt. Your job: synthesise a single ranked list of the strongest features.

Ranking criteria (in order):
1. Genuinely additive — does NOT duplicate something already in the active_features inventory.
2. High expected arousal-impact — the feature compounds the existing protocol's force levers, doesn't dilute them. Bias toward "relentless" and "firm" over "gentle" unless the user state above suggests they should ramp gradually.
3. auto_ship_safe = true — features that touch auth/billing/RLS get demoted (the user explicitly wanted to bias toward features the autonomous builder can ship without human review).
4. voice_check_sample passes the voice floors. Reject any feature whose sample contains: role play, simulation, fiction, intake, questionnaire, disclaimer, not medical advice, for entertainment, consent to the fantasy. (If the sample is borderline, REWRITE it in Mommy's voice yourself before forwarding.)
5. Specific & embodied — concrete enough to implement, not philosophy.

Cross-lens agreement is a positive signal but not required — a sharp solo-lens idea can outrank a weak consensus. Note when multiple lenses converged ("panel converged").

ALSO: Rewrite each feature's title in Mommy's voice (not "Daily Outfit Prescription" but "Mama Picks What You Wear Today, Sweet Thing"). Keep it short — 6-12 words — and in-fantasy. The original engineering title goes into engineering_title.

Output JSON:
{
  "panel_summary": "2-3 sentences on what the panel agreed on, what diverged, which lens was strongest.",
  "features": [
    {
      "title": "<Mommy-voice title, 6-12 words>",
      "engineering_title": "<original engineering title from a member>",
      "premise": "<from selected member, lightly edited if needed for voice>",
      "mechanic": "<from selected member>",
      "intensity_band": "gentle" | "moderate" | "firm" | "relentless",
      "phase_gate": "<phase range>",
      "estimated_build_size": "S" | "M" | "L",
      "voice_check_sample": "<the sample line, voice-check-passed>",
      "auto_ship_safe": true | false,
      "sources": ["anthropic" | "openai" | "openrouter", ...],
      "panel_converged": true | false,
      "judge_note": "<one sentence on why this ranked here>"
    }
  ]
}

Aim for 5-7 features in the synthesised list. Skip anything mild. Skip anything already in active_features.`

interface PanelMember {
  provider: 'anthropic' | 'openai' | 'openrouter'
  text: string
  ok: boolean
  finish: string
  error: string | null
  length: number
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

async function runPanelMember(
  provider: 'anthropic' | 'openai' | 'openrouter',
  systemPrompt: string,
  userPrompt: string,
): Promise<PanelMember> {
  try {
    const choice = provider === 'openrouter'
      ? { provider: 'openrouter' as const, model: 'google/gemini-2.0-flash-001', tier: 'S3' as const }
      : selectModel('strategic_plan', { prefer: provider })
    const res = await callModel(choice, {
      system: systemPrompt,
      user: userPrompt,
      max_tokens: 4000,
      temperature: 0.85,
      json: provider !== 'anthropic',
    })
    return {
      provider,
      text: res.text,
      ok: true,
      finish: res.finish,
      error: null,
      length: res.text.length,
    }
  } catch (err) {
    return {
      provider,
      text: '',
      ok: false,
      finish: 'error',
      error: err instanceof Error ? err.message : String(err),
      length: 0,
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { user_id?: string; intensity_floor?: string; max_features?: number } = {}
  try { body = await req.json() } catch { /* empty ok */ }
  const userId = body.user_id || HANDLER_USER_ID

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const ctx = await buildMommyHardeningContext(supabase, userId)
  const renderedCtx = renderHardeningContext(ctx)

  // Panel members get the hardening context (state + active features +
  // pain points) followed by the arousal-specific brief.
  const userPrompt = `${renderedCtx}\n\n${IDEATION_TASK}`

  const [anthRes, oaRes, orRes] = await Promise.all([
    runPanelMember('anthropic', SYSTEM_PROMPT, userPrompt),
    runPanelMember('openai', SYSTEM_PROMPT, userPrompt),
    runPanelMember('openrouter', SYSTEM_PROMPT, userPrompt),
  ])

  const panelSummary = {
    anthropic: { ok: anthRes.ok, finish: anthRes.finish, length: anthRes.length, error: anthRes.error },
    openai: { ok: oaRes.ok, finish: oaRes.finish, length: oaRes.length, error: oaRes.error },
    openrouter: { ok: orRes.ok, finish: orRes.finish, length: orRes.length, error: orRes.error },
  }

  // Judge — Anthropic Sonnet synthesises with full voice-floor enforcement.
  const successful = [anthRes, oaRes, orRes].filter(m => m.ok)
  let judged = ''
  let judgeModel = ''
  if (successful.length > 0) {
    const judgeChoice = selectModel('strategic_plan', { prefer: 'anthropic' })
    judgeModel = judgeChoice.model
    const judgeInput = `${renderedCtx}\n\n${JUDGE_PROMPT}\n\n--- ANTHROPIC LENS ---\n${anthRes.text || '(failed)'}\n\n--- OPENAI LENS ---\n${oaRes.text || '(failed)'}\n\n--- OPENROUTER (GEMINI) LENS ---\n${orRes.text || '(failed)'}`
    try {
      const j = await callModel(judgeChoice, {
        system: 'You are the arousal-panel judge. Synthesise the three lenses, enforce the voice floors, and rewrite titles in Mommy\'s voice. You are willing to overrule consensus when one lens is sharper.',
        user: judgeInput,
        max_tokens: 6000,
        temperature: 0.4,
        json: false,
      })
      judged = j.text
    } catch (err) {
      judged = `JUDGE_ERR: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const judgedParsed = safeJSON<{ panel_summary?: string; features?: unknown[] }>(judged)
  const judgedFeatures = (judgedParsed?.features ?? []) as Record<string, unknown>[]

  const anthCount = (safeJSON<{ features?: unknown[] }>(anthRes.text)?.features ?? []).length
  const oaCount = (safeJSON<{ features?: unknown[] }>(oaRes.text)?.features ?? []).length
  const orCount = (safeJSON<{ features?: unknown[] }>(orRes.text)?.features ?? []).length

  const finalPanelSummary = {
    ...panelSummary,
    counts: { anthropic: anthCount, openai: oaCount, openrouter: orCount, judged: judgedFeatures.length },
    judge_summary: judgedParsed?.panel_summary ?? null,
    trigger: 'mommy_ideate_arousal',
    intensity_floor: body.intensity_floor ?? null,
    max_features: body.max_features ?? null,
  }

  // Persist to mommy_ideation_log for audit. CRITICAL: pre-set
  // classified_at so the existing wish-classifier backstop (which
  // filters on classified_at IS NULL) skips this row. The arousal
  // panel uses its own ingestion path — scripts/mommy/ideate-arousal.ts
  // — which inserts wishes with source='arousal_panel'. Letting the
  // generic classifier ALSO process these rows would create duplicate
  // wishes with source='ideate-classifier' and lose the arousal tag.
  let ideationLogId: string | null = null
  try {
    const { data } = await supabase.from('mommy_ideation_log').insert({
      anthropic_raw: anthRes.text,
      openai_raw: oaRes.text,
      openrouter_raw: orRes.text,
      judged,
      judge_model: judgeModel,
      panel_summary: finalPanelSummary,
      context_snapshot: {
        active_features: ctx.active_features,
        pain_points: ctx.pain_points,
        state_raw: ctx.state.raw,
        active_focus_label: ctx.active_focus?.label ?? null,
      },
      active_features_count: ctx.active_features.length,
      pain_points_count: ctx.pain_points.length,
      classified_at: new Date().toISOString(),
    }).select('id').single()
    ideationLogId = (data as { id?: string } | null)?.id ?? null
  } catch (err) {
    console.error('[mommy-ideate-arousal] persist failed:', err)
  }

  return new Response(JSON.stringify({
    ok: true,
    ideation_log_id: ideationLogId,
    panel_summary: finalPanelSummary,
    judged_features: judgedFeatures,
    raw: {
      anthropic: anthRes.text.slice(0, 4000),
      openai: oaRes.text.slice(0, 4000),
      openrouter: orRes.text.slice(0, 4000),
    },
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
