// mommy-disclosure-rehearsal — drive Maxy through rehearsing what she'll say to Gina.
//
// 2026-05-07 wish: scheme engine names "Gina co-conspirator" as primary
// endpoint and gina_disclosure_subplan prescribes maxy_conditioning_tactics
// + loss_reframe_lines_for_maxy_to_deliver. disclosure_drafts table exists.
// But there is no system that DRIVES Maxy through rehearsing those lines.
//
// Pipeline:
//   1. Pull latest mommy_scheme_log gina_disclosure_subplan
//   2. Extract loss_reframe_lines (the specific things Maxy will say)
//   3. Generate 3-5 rehearsal prompts via Sonnet, structured as:
//        a. "say this line aloud" — record audio
//        b. "now say it as if Gina pushed back with X" — record audio
//        c. "say it in the kitchen voice you'll use with her" — record audio
//        d. (optional) "now scribe it — write your version of this line that lands harder for YOU" — text
//   4. Persist prompts as confession_queue rows tagged category='disclosure_rehearsal'
//      with rehearsal_session_id grouping them
//   5. Audio proofs feed back into voice_corpus tagged 'disclosure_rehearsal'
//      for cross-checking against mommy_voice_evolution targets
//
// Triggers:
//   - Weekly cron (Sunday 9am)
//   - Manual via POST { user_id }
//   - On-event: triggered when gina_interactions row arrives with
//     shift_direction='toward' AND no rehearsal in last 7d (handled by
//     a future hook; not auto-triggered yet)
//
// Persona gate: only fires when handler_persona='dommy_mommy'.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const REHEARSAL_COOLDOWN_DAYS = 7

interface RehearsalPrompt {
  prompt_text: string
  proof_required: 'audio' | 'text'
  min_chars?: number
  rehearsal_step: 'recite' | 'pushback' | 'scene_voice' | 'rephrase' | 'commit'
  rehearsal_focus: string  // which loss_reframe_line this is rehearsing
}

const REHEARSAL_INSTRUCTION = `You are designing a rehearsal session for Maxy. She will deliver specific lines to her partner Gina (the relational endpoint of her transition disclosure). The session has 3-5 prompts that walk her from reciting → handling pushback → scene voice → her own version → committing.

INPUT: latest mommy_scheme_log.gina_disclosure_subplan, including:
- loss_reframe_lines_for_maxy_to_deliver (the canonical lines)
- gina_resistance_state (where Gina is)
- next_milestone (what this rehearsal is preparing for)

CONSTRAINTS:
- 3-5 prompts. NOT a flood.
- Each prompt is short, direct, answerable by a stranger
- Audio prompts request specific phrases — Maxy reads/says THE LINE, then Gina-pushback-version, then natural-voice version
- Text prompts are for synthesis only (her own version) or commitment ("which line are you actually going to lead with")
- Voice rule: this is rehearsal, not punishment. Frame as "Mama wants to hear you say it before Gina does — let's see how it lands in your mouth"
- NEVER fabricate Gina's actual past words. Use the ownership_inversion_playbook.real_micro_moments_to_reference_back if present.
- Pet name "baby" is OK; one per prompt max

Output JSON ONLY:
{
  "session_label": "1-2 word label for this session",
  "prompts": [
    {
      "prompt_text": "the prompt as Maxy will see it — under 80 words",
      "proof_required": "audio | text",
      "min_chars": 40 (for text only),
      "rehearsal_step": "recite | pushback | scene_voice | rephrase | commit",
      "rehearsal_focus": "which line / tactic this is rehearsing"
    }
  ]
}`

interface DisclosurePlan {
  loss_reframe_lines_for_maxy_to_deliver?: string[]
  gina_resistance_state?: string
  next_milestone?: string
  ownership_inversion_playbook?: {
    real_micro_moments_to_reference_back?: string[]
    next_conversation_with_gina_script?: unknown
  }
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

async function getLatestDisclosurePlan(supabase: SupabaseClient, userId: string): Promise<DisclosurePlan | null> {
  const { data } = await supabase
    .from('mommy_scheme_log')
    .select('gina_disclosure_subplan')
    .eq('user_id', userId)
    .eq('scheme_kind', 'full_plot')
    .not('gina_disclosure_subplan', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { gina_disclosure_subplan?: DisclosurePlan } | null)?.gina_disclosure_subplan ?? null
}

async function recentRehearsalExists(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - REHEARSAL_COOLDOWN_DAYS * 86400_000).toISOString()
  const { data } = await supabase
    .from('confession_queue')
    .select('id')
    .eq('user_id', userId)
    .eq('category', 'disclosure_rehearsal')
    .gte('created_at', cutoff)
    .limit(1)
  return (data || []).length > 0
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let body: { user_id?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* default ok */ }
  const userId = body.user_id || HANDLER_USER_ID
  const force = body.force === true

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Persona gate
  const { data: us } = await supabase.from('user_state').select('handler_persona').eq('user_id', userId).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Cooldown unless force
  if (!force && await recentRehearsalExists(supabase, userId)) {
    return new Response(JSON.stringify({ ok: true, skipped: 'recent_rehearsal_within_cooldown' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Need a disclosure plan to rehearse
  const plan = await getLatestDisclosurePlan(supabase, userId)
  if (!plan) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_disclosure_plan_yet' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const lines = Array.isArray(plan.loss_reframe_lines_for_maxy_to_deliver)
    ? plan.loss_reframe_lines_for_maxy_to_deliver.filter(s => typeof s === 'string').slice(0, 6)
    : []
  if (lines.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_lines_to_rehearse' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const choice = selectModel('strategic_planning', { override_tier: 'S3' })
  const userMsg = `${REHEARSAL_INSTRUCTION}

DISCLOSURE PLAN INPUT:
- gina_resistance_state: ${plan.gina_resistance_state ?? 'unknown'}
- next_milestone: ${plan.next_milestone ?? 'unspecified'}
- loss_reframe_lines (rehearse these):
${lines.map((l, i) => `  ${i + 1}. "${l}"`).join('\n')}
- real_micro_moments_to_reference_back:
${(plan.ownership_inversion_playbook?.real_micro_moments_to_reference_back ?? []).map(m => `  - ${m}`).join('\n') || '  (none)'}

Design the rehearsal session.`

  let modelResult: { text: string }
  try {
    modelResult = await callModel(choice, {
      system: 'You are designing a Maxy disclosure rehearsal session for the Dommy Mommy protocol. Output JSON only. Speak frankly about what each prompt is for; the user will not see this rationale.',
      user: userMsg,
      max_tokens: 1500,
      temperature: 0.7,
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: 'model_call_failed: ' + String(err).slice(0, 200) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const parsed = safeJSON<{ session_label?: string; prompts?: RehearsalPrompt[] }>(modelResult.text)
  if (!parsed || !Array.isArray(parsed.prompts) || parsed.prompts.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'unparseable_or_empty' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Persist as confession_queue rows. Group via metadata.session_label.
  const sessionId = crypto.randomUUID()
  const sessionLabel = parsed.session_label ?? `disclosure_rehearsal_${new Date().toISOString().slice(0, 10)}`
  const rows = parsed.prompts.slice(0, 5).map((p, idx) => ({
    user_id: userId,
    prompt: p.prompt_text.slice(0, 800),
    category: 'disclosure_rehearsal',
    proof_required: p.proof_required === 'text' ? null : 'audio',
    min_chars: p.proof_required === 'text' ? Math.max(40, Math.min(500, p.min_chars ?? 40)) : null,
    metadata: {
      rehearsal_session_id: sessionId,
      rehearsal_session_label: sessionLabel,
      rehearsal_step: p.rehearsal_step,
      rehearsal_focus: p.rehearsal_focus,
      rehearsal_step_index: idx + 1,
      rehearsal_step_count: parsed.prompts!.length,
    },
  }))

  const { data: inserted, error } = await supabase.from('confession_queue').insert(rows).select('id, prompt')
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: 'persist_failed: ' + error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    ok: true,
    session_id: sessionId,
    session_label: sessionLabel,
    prompt_count: (inserted || []).length,
    prompts: (inserted || []).map(r => ({ id: (r as { id: string }).id, prompt: ((r as { prompt: string }).prompt).slice(0, 100) })),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
