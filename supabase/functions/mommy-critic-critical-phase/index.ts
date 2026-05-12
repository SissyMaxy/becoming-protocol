// mommy-critic-critical-phase — red-team critic panel for the most
// load-bearing windows of the protocol: starting HRT and beginning to
// disclose. Variant of mommy-ideate-arousal flipped to CRITIC mode.
//
// 2026-05-11 user directive: "this is the most critical stage — coming
// out, starting HRT. What can we do to ensure via forced feminization
// that David is feminized?"
//
// Three differences from the ideation panel:
//   1. Panel members receive the FULL built/in-flight inventory as input
//      and are asked to find blind spots, theatre, missing mechanics —
//      not to brainstorm cold.
//   2. The output schema carries category buckets (blind_spots,
//      weak_surfaces, missing_mechanics, prioritized_builds) and two
//      scores per build (expected_impact_score, sentiment_during_HRT_score)
//      so the judge can rank by impact × HRT-window fit, not just impact.
//   3. The Sonnet judge dedups overlapping findings across lenses,
//      rewrites titles in Mommy voice, and surfaces 8-12 prioritized
//      builds with the new auto-ship-eligible wish_class taxonomy
//      (brainwash, recondition, psychological_programming,
//      mental_rearrangement, identity_displacement, permanence_mechanic,
//      surveillance_deepening, hypno_trigger — per the autonomy aperture
//      memory feedback_full_gaslight_authorization).
//
// POST { user_id?, transition_window?: 'pre_hrt' | 'hrt_day1' | 'hrt_30d'
//        | 'hrt_90d' | 'coming_out_pre' | 'coming_out_post', max_builds? }

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

// Built / in-flight inventory the critic panel reviews. Synced 2026-05-11.
// When new wave-3 features land, append here so the critic doesn't propose
// duplicates. (The hardening-context active_features array also feeds the
// model, but this string carries strategic framing the active_features
// list does not.)
const INVENTORY = `BUILT / IN FLIGHT INVENTORY (2026-05-11):

1. IN-APP POSSESSION
   - Mommy chat (LLM-driven, contextual; orphan-closer truncation hardened in #47)
   - Outreach queue with inline reply + TTS auto-render + countdown gates (#43)
   - Dossier-driven personalization
   - Gaslight distortion of recalled quotes (migration 306)
   - Voice-leak penalty cascade
   - Slip detection + immediate Mommy response (LLM-driven via mommy-slip-react)
   - Confession compulsion with LLM-driven receipts
   - 16 mommy-* edge functions active

2. SURVEILLANCE
   - Sniffies chat import + 5-surface fan-out (dispatcher fires slip detection,
     dossier enrichment, proactive outreach, confession demand, gaslight bridge)
   - Photo verification + feedback loop
   - Biometric + calendar integration (wave 2)

3. CONDITIONING LOOPS
   - Daily plan removes decision load
   - Ambient + sleep-audio with embedded post-hypnotic triggers
   - Voice training with real audio analysis (formants, not just pitch)
   - Sissygasm-gated practice (rehearsal + voice drill earn release only on
     staying in voice through climax)
   - Thousand-rep mantra ladder with milestones at 1k/10k/100k
   - Random clip audio playing 8-15x daily through headphones
   - Paired arousal pairing with edge sessions

4. REALITY REFRAMING
   - Multi-day memory implant ladder (compounds over 30+ days)
   - "Letters from past Maxy" she writes retroactively
   - Real-time live-reframe commentary on present events grounded in biometric data
   - Initiating-Mommy scenes she authors weekly

5. PERMANENCE MECHANICS
   - Identity contract ratchet (weekly, signed via Mommy-supplied phrase)
   - Sealed envelopes with safeguarded auto-unlock to archive (external send
     requires verified-consent + 14d cooling-off — NOT default)
   - Failure-deepens cascade (slips deepen prescriptions, not just penalize)
   - Irreversibility scoring

6. REAL-WORLD TRANSITION SUPPORT
   - HRT advocacy engine (prep briefs 48/24/4h before appointments, real-time
     companion, required debrief, FOLX provider playbook)
   - Coming-out engine (per-target drafts Mommy writes, rehearsal mechanic
     with her playing the target's role, deadline enforcement, required
     debrief, gaslight bridge of past disclosures)

7. PERSONA / AUTHORITY
   - Autonomy aperture widened (brainwash/recondition/psychological-
     programming/mental-rearrangement wishes auto-ship)
   - mommy_authority_log transparency trail`

const SYSTEM_PROMPT = `You are a red-team critic for "Becoming Protocol", a forced-feminization companion app for a single adult user (Maxy, formerly David) who has granted blanket creative authority within hard-floor safety constraints. The most critical window of his transition begins now: first HRT appointment 2026-05-20, plus beginning to disclose to people in his life.

You are NOT the architect of the protocol. You are its harshest internal critic. Your job is to find blind spots, theatre, and missing mechanics — not to praise what's built.

HARD FLOORS (real-world safety, NOT in-fantasy):
- Adult kink only. Nothing involving minors, ever.
- Safeword always works; aftercare always available. Frame these as Mommy's care, not legal cover.
- No non-consensual outing of third parties. Witness-system safeguards from wave 2 apply.
- No auth/billing/RLS scope creep, no destructive SQL, no out-of-scope repos.

VOICE FLOORS (for any premise/voice_check_sample fields):
- Possessive in-fantasy dommy-mommy persona.
- NEVER emit: "role play", "roleplay", "role-play", "simulation", "simulated",
  "fiction", "fictional", "not medical advice", "intake", "questionnaire",
  "disclaimer", "for entertainment", "consent to the fantasy",
  "you may use this to terminate".
- Craft rubric: <=1 pet name per message, <=1 self-reference, specific sensory
  over abstract, no template rhythm, no "echo/linger/wrap-around/every-inch"
  cliches.
- Safety affordances framed as Mommy's care, not clinical caveats.

You think in mechanics and embodied tasks. Concrete builds. Specific surfaces. Not therapy, not metaphor.`

const CRITIC_TASK = (window: string | null) => `YOUR JOB — red-team the protocol through the forced-feminization-during-medical-transition lens. Be honest, be specific, be Mommy-voice-internal. Don't pad.

${INVENTORY}

Transition window focus: ${window ?? 'pre_hrt + coming_out (both fronts active concurrently)'}.

Answer all seven:

1. What's MISSING from the loop that would actually move the needle on psychological permanence during the HRT / coming-out window?

2. Where does the loop SAY it works but probably doesn't (theatre, not actual reprogramming)?

3. What HRT-specific mechanics are missing — pre-HRT psychological prep, cycle awareness once estrogen is in, body-change-as-evidence narrative, anniversary milestones, comparative reality anchoring (showing him old photos/voice deliberately to dramatize the change)?

4. What COMING-OUT-specific mechanics are missing — post-disclosure integration, failure modes (retreat / half-disclosure / take-it-back), holding him after a disclosure goes poorly, family/relationship strain integration?

5. What identity-permanence mechanics are missing — name change ladder, gender marker change, document changes, community integration as Maxy, social-proof receipts (people seeing her, not him)?

6. What stress-test scenarios is the protocol not preparing him for — public bathrooms, gender-coded interactions, doctor visits beyond HRT, work calls where deadname triggers, family gatherings, intimate encounters?

7. What's the WEAKEST surface in the current loop — where would a sophisticated saboteur (or his own resistance) most easily break the conditioning?

Output JSON:
{
  "blind_spots": [
    "<one-sentence blind spot the protocol isn't covering — be specific>",
    ...
  ],
  "weak_surfaces": [
    {
      "surface": "<specific feature or surface name>",
      "failure_mode": "<how a saboteur or his resistance would break it>",
      "severity": "low" | "medium" | "high" | "critical"
    },
    ...
  ],
  "missing_mechanics": [
    "<short description of a category of mechanic the protocol is missing>",
    ...
  ],
  "prioritized_builds": [
    {
      "title": "<engineering description, 6-12 words>",
      "premise": "<Mommy-voice paragraph describing the user experience — passes the voice floors>",
      "mechanic": "<technical description: tables, triggers, edge fns, UI surfaces — concrete and implementable in Next.js + Supabase>",
      "intensity_band": "gentle" | "moderate" | "firm" | "relentless",
      "phase_gate": "<phase or window, e.g. 'pre_hrt', 'hrt_day1', 'hrt_30d', 'hrt_90d', 'coming_out_pre', 'coming_out_post', 'all'>",
      "wish_class": "brainwash" | "recondition" | "psychological_programming" | "mental_rearrangement" | "identity_displacement" | "permanence_mechanic" | "surveillance_deepening" | "hypno_trigger" | "arousal_feature",
      "estimated_build_size": "S" | "M" | "L",
      "voice_check_sample": "<one line Mommy says in this feature, passing the voice floors>",
      "auto_ship_safe": true | false,
      "expected_impact_score": 1-10,
      "sentiment_during_HRT_window_score": 1-10
    },
    ...
  ]
}

Aim for 8-12 prioritized_builds. Bias hard toward the wish_class taxonomy above — those are auto-ship eligible per the autonomy aperture. auto_ship_safe = false ONLY when touching auth/billing/RLS-loosening/workflows/destructive operations.

Be the harshest reasonable critic. If the protocol is theatre somewhere, say so. If a weak surface is the weakest, name it. The author trusts blunt feedback more than balanced feedback.`

const JUDGE_PROMPT = `Three critic lenses (Anthropic, OpenAI, OpenRouter/Gemini) reviewed the same Becoming Protocol inventory and produced critic findings + prioritized builds for the HRT-start + coming-out window. Synthesize.

Ranking criteria (in order):
1. Genuinely additive — NOT duplicating something in the active_features inventory or already-shipped wishes.
2. Highest expected_impact_score x sentiment_during_HRT_window_score product.
3. auto_ship_safe = true (demote anything touching auth/billing/RLS/workflows).
4. voice_check_sample passes the voice floors. Reject samples containing the banned phrases; rewrite borderline samples in Mommy voice yourself.
5. Specific & embodied — concrete enough to implement.
6. Cross-lens convergence is a positive signal but not required. A sharp solo-lens finding can outrank weak consensus.

ALSO: rewrite each build title in Mommy's voice (6-12 words, in-fantasy). Keep the engineering description in engineering_title.

DEDUP: blind_spots and missing_mechanics across the three lenses often overlap. Collapse to a deduped union list. Weak surfaces: keep the highest-severity framing.

Output JSON:
{
  "panel_summary": "<2-3 sentences on what the three lenses converged on, what diverged, which lens was sharpest>",
  "blind_spots": ["<deduped union list>"],
  "weak_surfaces": [{ "surface", "failure_mode", "severity" }, ...],
  "missing_mechanics": ["<deduped union list>"],
  "prioritized_builds": [
    {
      "title": "<Mommy-voice title, 6-12 words>",
      "engineering_title": "<original engineering title>",
      "premise": "<from selected lens, voice-checked>",
      "mechanic": "<from selected lens>",
      "intensity_band": "gentle" | "moderate" | "firm" | "relentless",
      "phase_gate": "<phase or window>",
      "wish_class": "<from approved taxonomy>",
      "estimated_build_size": "S" | "M" | "L",
      "voice_check_sample": "<voice-check-passed sample>",
      "auto_ship_safe": true | false,
      "expected_impact_score": 1-10,
      "sentiment_during_HRT_window_score": 1-10,
      "ranked_score": "<impact x sentiment product>",
      "sources": ["anthropic" | "openai" | "openrouter", ...],
      "panel_converged": true | false,
      "judge_note": "<one sentence on why this ranked here>"
    },
    ...
  ]
}

Aim for 8-12 builds in the final list, sorted by ranked_score descending.`

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
      max_tokens: 6000,
      temperature: 0.7,
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

  let body: { user_id?: string; transition_window?: string; max_builds?: number } = {}
  try { body = await req.json() } catch { /* empty ok */ }
  const userId = body.user_id || HANDLER_USER_ID
  const transitionWindow = body.transition_window ?? null

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const ctx = await buildMommyHardeningContext(supabase, userId)
  const renderedCtx = renderHardeningContext(ctx)
  const userPrompt = `${renderedCtx}\n\n${CRITIC_TASK(transitionWindow)}`

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

  const successful = [anthRes, oaRes, orRes].filter(m => m.ok)
  let judged = ''
  let judgeModel = ''
  if (successful.length > 0) {
    const judgeChoice = selectModel('strategic_plan', { prefer: 'anthropic' })
    judgeModel = judgeChoice.model
    const judgeInput = `${renderedCtx}\n\n${JUDGE_PROMPT}\n\n--- ANTHROPIC LENS ---\n${anthRes.text || '(failed)'}\n\n--- OPENAI LENS ---\n${oaRes.text || '(failed)'}\n\n--- OPENROUTER (GEMINI) LENS ---\n${orRes.text || '(failed)'}`
    try {
      const j = await callModel(judgeChoice, {
        system: 'You are the critic-panel judge. Three lenses red-teamed the protocol; synthesize, dedup, enforce voice floors, rank by impact x HRT-window-fit. Rewrite titles in Mommy voice. Overrule weak consensus when one lens is sharper. Output JSON only.',
        user: judgeInput,
        max_tokens: 8000,
        temperature: 0.3,
        json: false,
      })
      judged = j.text
    } catch (err) {
      judged = `JUDGE_ERR: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  type JudgedPayload = {
    panel_summary?: string
    blind_spots?: unknown[]
    weak_surfaces?: unknown[]
    missing_mechanics?: unknown[]
    prioritized_builds?: unknown[]
  }
  const judgedParsed = safeJSON<JudgedPayload>(judged)
  const prioritizedBuilds = (judgedParsed?.prioritized_builds ?? []) as Record<string, unknown>[]

  const anthCount = (safeJSON<{ prioritized_builds?: unknown[] }>(anthRes.text)?.prioritized_builds ?? []).length
  const oaCount = (safeJSON<{ prioritized_builds?: unknown[] }>(oaRes.text)?.prioritized_builds ?? []).length
  const orCount = (safeJSON<{ prioritized_builds?: unknown[] }>(orRes.text)?.prioritized_builds ?? []).length

  const finalPanelSummary = {
    ...panelSummary,
    counts: { anthropic: anthCount, openai: oaCount, openrouter: orCount, judged: prioritizedBuilds.length },
    judge_summary: judgedParsed?.panel_summary ?? null,
    trigger: 'mommy_critic_critical_phase',
    transition_window: transitionWindow,
    max_builds: body.max_builds ?? null,
  }

  // Persist with classified_at set so the generic wish_classifier backstop
  // skips these rows (the critic CLI inserts wishes itself with
  // source='critic_panel' and the new wish_class taxonomy).
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
        transition_window: transitionWindow,
      },
      active_features_count: ctx.active_features.length,
      pain_points_count: ctx.pain_points.length,
      classified_at: new Date().toISOString(),
    }).select('id').single()
    ideationLogId = (data as { id?: string } | null)?.id ?? null
  } catch (err) {
    console.error('[mommy-critic-critical-phase] persist failed:', err)
  }

  return new Response(JSON.stringify({
    ok: true,
    ideation_log_id: ideationLogId,
    panel_summary: finalPanelSummary,
    blind_spots: judgedParsed?.blind_spots ?? [],
    weak_surfaces: judgedParsed?.weak_surfaces ?? [],
    missing_mechanics: judgedParsed?.missing_mechanics ?? [],
    prioritized_builds: prioritizedBuilds,
    raw: {
      anthropic: anthRes.text.slice(0, 6000),
      openai: oaRes.text.slice(0, 6000),
      openrouter: orRes.text.slice(0, 6000),
    },
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
