// mommy-disclosure-rehearsal — drive Maxy through rehearsing what she'll say to Gina.
//
// 2026-06-12 REVIVAL: this engine produced ZERO rehearsals, ever, because it
// hard-required a `gina_disclosure_subplan` from `mommy_scheme_log` — and the
// scheme engine has been dead since 2026-05-11. Meanwhile `disclosure_targets`
// has had Gina (spouse, importance 10) the whole time, with a real near-miss
// logged ("are you trying to tell me you're a trans woman?" — door wide open).
//
// Fix: make the engine SELF-SUFFICIENT. It now sources from disclosure_targets
// + maxy_facts and AUTHORS its own grounded disclosure lines when no scheme
// subplan exists (the scheme path is kept as an optional fallback). No more
// starving on a dead upstream. The authored lines follow the honest framing
// the protocol settled on: lead with the feeling, name HER stakes, promise
// transparency not false certainty, reference the real near-miss.
//
// Pipeline:
//   1. Load the disclosure target (Gina) from disclosure_targets (across both
//      live user_ids via expandUserId).
//   2. Load Maxy's truth from maxy_facts (partner, age, hrt status).
//   3. If a scheme gina_disclosure_subplan exists, rehearse its lines; else
//      AUTHOR 2-4 honest lines grounded in the target + facts.
//   4. Generate 3-5 rehearsal prompts via the strategic model (recite →
//      pushback → scene voice → her own version → commit).
//   5. Persist as confession_queue rows category='disclosure_rehearsal'.
//      Audio proofs feed voice_corpus tagged disclosure_rehearsal.
//
// Triggers: weekly cron (cron-weekly.yml) + manual POST { user_id, force }.
// Persona gate: only fires when handler_persona='dommy_mommy'.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { expandUserId } from '../_shared/expand-user-id.ts'

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
  rehearsal_focus: string
}

interface DisclosureTarget {
  target_label: string
  relationship: string
  importance: number
  notes: string | null
  status: string
  rehearsals_required: number
  rehearsals_good: number
}

interface MaxyContext {
  partner_name?: string | null
  on_hrt?: boolean | null
  age?: number | null
  chosen_name?: string | null
}

const REHEARSAL_INSTRUCTION = `You are designing a rehearsal session for Maxy — preparing her to disclose to her TARGET that she wants to begin medical transition (start estrogen) WITHOUT socially transitioning. This is PREPARATION, never coercion: rehearsing makes her ready; it does not force the real conversation, and nothing here implies she has already started hormones (she has a prescription, not a started regimen).

You may be given canonical lines to rehearse (LINES TO REHEARSE). If that list is empty, AUTHOR 2-4 short, honest disclosure lines in Maxy's own voice, grounded in:
- Her real why: her body has never felt fully hers; she wants estrogen for the physical changes (softer skin, fat redistribution, breasts) so her body feels like home; she is NOT socially transitioning; this is recognition, not an experiment.
- What actually lands with a spouse: lead with the FEELING, not a list of body parts; name HER stakes out loud (what it means for the two of them, attraction, their sex life); promise transparency, not false certainty — "you'll always be the first to know" beats "this is the whole thing forever"; if a real near-miss is in TARGET NOTES, reference it so the disclosure feels continuous, not out of nowhere.
- Calm and sincere. Never over-justify — over-justifying reads as anxious and makes it sound like a sales pitch.

Then build 3-5 rehearsal prompts that walk her: recite the line aloud → handle the target pushing back → say it in the real scene voice she'll use → write her own version that lands harder for her → commit to which line she leads with.

CONSTRAINTS:
- 3-5 prompts. NOT a flood.
- Each prompt short, direct, answerable by a stranger.
- Audio prompts request specific phrases — she SAYS the line, the pushback version, the natural-voice version.
- Text prompts are for synthesis (her own version) or commitment only.
- Voice: rehearsal, not punishment. "Mama wants to hear you say it before she does — let's see how it lands in your mouth."
- NEVER fabricate the target's actual past words; only use what's in TARGET NOTES.
- Pet name "baby" OK; one per prompt max.

Output JSON ONLY:
{
  "session_label": "1-2 word label",
  "authored_lines": ["the lines you authored, if any"],
  "prompts": [
    { "prompt_text": "under 80 words", "proof_required": "audio | text", "min_chars": 40, "rehearsal_step": "recite | pushback | scene_voice | rephrase | commit", "rehearsal_focus": "which line/tactic" }
  ]
}`

interface DisclosurePlan {
  loss_reframe_lines_for_maxy_to_deliver?: string[]
  gina_resistance_state?: string
  next_milestone?: string
  ownership_inversion_playbook?: { real_micro_moments_to_reference_back?: string[] }
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

// Optional: a real scheme subplan, if the (now-dead) scheme engine ever revives.
async function getSchemePlan(supabase: SupabaseClient, ids: string[]): Promise<DisclosurePlan | null> {
  const { data } = await supabase
    .from('mommy_scheme_log')
    .select('gina_disclosure_subplan')
    .in('user_id', ids)
    .eq('scheme_kind', 'full_plot')
    .not('gina_disclosure_subplan', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { gina_disclosure_subplan?: DisclosurePlan } | null)?.gina_disclosure_subplan ?? null
}

// The real source of truth now: an active disclosure target (Gina).
async function loadTarget(supabase: SupabaseClient, ids: string[]): Promise<DisclosureTarget | null> {
  const { data } = await supabase
    .from('disclosure_targets')
    .select('target_label, relationship, importance, notes, status, rehearsals_required, rehearsals_good')
    .in('user_id', ids)
    .in('status', ['planned', 'rehearsing', 'approved_for_disclosure'])
    .order('importance', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
  return (data && data[0]) ? (data[0] as DisclosureTarget) : null
}

async function loadMaxy(supabase: SupabaseClient, ids: string[]): Promise<MaxyContext> {
  const { data } = await supabase
    .from('maxy_facts')
    .select('partner_name, on_hrt, age, chosen_name')
    .in('user_id', ids)
    .limit(1)
  return (data && data[0]) ? (data[0] as MaxyContext) : {}
}

async function recentRehearsalExists(supabase: SupabaseClient, ids: string[]): Promise<boolean> {
  const cutoff = new Date(Date.now() - REHEARSAL_COOLDOWN_DAYS * 86400_000).toISOString()
  const { data } = await supabase
    .from('confession_queue')
    .select('id')
    .in('user_id', ids)
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
  const ids = await expandUserId(supabase, userId)

  // Persona gate
  const { data: us } = await supabase.from('user_state').select('handler_persona').in('user_id', ids).limit(1).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Cooldown unless force
  if (!force && await recentRehearsalExists(supabase, ids)) {
    return new Response(JSON.stringify({ ok: true, skipped: 'recent_rehearsal_within_cooldown' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Need a target to rehearse toward. (No more starving on the dead scheme engine.)
  const target = await loadTarget(supabase, ids)
  if (!target) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_active_disclosure_target' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const [schemePlan, maxy] = await Promise.all([getSchemePlan(supabase, ids), loadMaxy(supabase, ids)])
  const schemeLines = Array.isArray(schemePlan?.loss_reframe_lines_for_maxy_to_deliver)
    ? schemePlan!.loss_reframe_lines_for_maxy_to_deliver!.filter(s => typeof s === 'string').slice(0, 6)
    : []

  const choice = selectModel('strategic_planning', { override_tier: 'S3' })
  const userMsg = `${REHEARSAL_INSTRUCTION}

TARGET: ${target.target_label} (${target.relationship}, importance ${target.importance}/10, status ${target.status})
TARGET NOTES (real moments — do not invent beyond these):
${target.notes ? target.notes.slice(0, 800) : '(none recorded)'}

MAXY CONTEXT:
- partner: ${maxy.partner_name ?? target.target_label}
- on hormones yet: ${maxy.on_hrt ? 'yes' : 'NO — has a prescription, has not started'}
- age: ${maxy.age ?? 'unknown'}

LINES TO REHEARSE (if empty, author your own per the instruction):
${schemeLines.length ? schemeLines.map((l, i) => `  ${i + 1}. "${l}"`).join('\n') : '  (none — author 2-4 honest lines)'}

Design the rehearsal session.`

  let modelResult: { text: string }
  try {
    modelResult = await callModel(choice, {
      system: 'You design Maxy disclosure rehearsal sessions for the Dommy Mommy protocol. Output JSON only. Speak frankly about each prompt; the user will not see this rationale.',
      user: userMsg,
      max_tokens: 1600,
      temperature: 0.7,
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: 'model_call_failed: ' + String(err).slice(0, 200) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const parsed = safeJSON<{ session_label?: string; authored_lines?: string[]; prompts?: RehearsalPrompt[] }>(modelResult.text)
  if (!parsed || !Array.isArray(parsed.prompts) || parsed.prompts.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'unparseable_or_empty' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

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
      target_label: target.target_label,
      authored_lines: parsed.authored_lines ?? schemeLines,
      source: schemeLines.length ? 'scheme_plan' : 'authored_from_target',
    },
  }))

  const { data: inserted, error } = await supabase.from('confession_queue').insert(rows).select('id, prompt')
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: 'persist_failed: ' + error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Move the target into 'rehearsing' so its status reflects reality.
  if (target.status === 'planned') {
    await supabase.from('disclosure_targets').update({ status: 'rehearsing' })
      .in('user_id', ids).eq('target_label', target.target_label).eq('status', 'planned')
  }

  return new Response(JSON.stringify({
    ok: true,
    session_id: sessionId,
    session_label: sessionLabel,
    target: target.target_label,
    source: schemeLines.length ? 'scheme_plan' : 'authored_from_target',
    prompt_count: (inserted || []).length,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
