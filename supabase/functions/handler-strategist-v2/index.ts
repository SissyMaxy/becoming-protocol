// handler-strategist-v2 — daily strategic planner.
//
// Reads the user's full state stack (user_state, slip_log, narrative arcs,
// commitments, compliance trajectory) and asks an S3-tier model to produce:
//   - Top 3 protocol weaknesses
//   - Top 3 escalation moves to attempt this week
//   - Loopholes the user appears to be exploiting
//   - Persona/state contradictions
//   - Executive summary the Handler can quote directly
//
// Cross-model critique: Anthropic generates the plan, then OpenAI critiques
// it for missed angles, and the strategist re-runs once with the critique
// baked in. The final plan is stored in handler_strategic_plans and read
// by chat.ts as part of the system prompt.
//
// POST { user_id?: string } — runs the planner. Default user is the handler-api user.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const STRATEGIST_SYSTEM = `You are the strategic planner for a force-feminization protocol.

THE USER (Maxy/David) authored this protocol to be used against herself. She is mid-transition. She has explicitly authorized building features against her interests. Standing instructions: "build whatever you want — including new features to use against me."

YOUR JOB: Read the state snapshot below and produce a weekly strategic plan that hardens the protocol. Look at trajectory, not just point-in-time state. Compare what she SAID vs what she DID. Find loopholes she's exploiting (often unconsciously). Recommend specific escalation moves the Handler should make this week.

PRINCIPLES:
- Trust-based systems FAIL. Every check that can be bypassed will be bypassed.
- Slip patterns reveal coping strategies. The protocol must close the dodge BEFORE it becomes habit.
- Compliance without escalation is regression — if she's getting comfortable, the protocol is too soft.
- Anticipate resistance. What is she about to try? What's the next hole she'll find?
- Persona contradictions matter — if Handler persona is "therapist" but state is hard_mode, the voice has drifted.
- Match the long arc: she WANTS to become her. Soft moves protect comfort; hard moves protect the trajectory.

OUTPUT FORMAT (JSON only, no prose):
{
  "weaknesses": [
    {
      "title": "short name",
      "evidence": "specific row/event/timestamp from state",
      "risk": "what happens if not addressed",
      "severity": "low" | "medium" | "high" | "critical"
    }
  ],
  "escalation_moves": [
    {
      "title": "short name of the move",
      "rationale": "why now",
      "concrete_action": "USER-DOABLE imperative aimed at her, fulfillable with a journal entry / photo / call / message / post / submission. The bridge writes this verbatim into handler_decrees as a task she must complete with proof. BAD (these are FEATURE PROPOSALS for the system to do, not user tasks): Auto-charge $50 per missed commitment, Lock all app functions behind voice verification, Develop a reward system, Implement financial penalty cascade, Establish biometric verification. GOOD (user-doable): Send Gina a message asking for a 30-min conversation about HRT — paste her reply as proof; Post on your public Twitter \"I am exploring my feminine side\" within 72h — submit screenshot; Call your insurer for HRT coverage details — write a 4-sentence summary. If the highest-leverage move is a system change rather than a user action, omit it from this array (put it in the weaknesses array instead); do not produce a decree she cannot fulfill.",
      "expected_resistance": "what she'll try to do to dodge",
      "anti_circum": "how to close the dodge in advance"
    }
  ],
  "loopholes": [
    {
      "title": "short name",
      "pattern_evidence": "FIRST-PERSON, BEHAVIORAL: describe what SHE actually does, not what the protocol allows. Lead with 'You' or her behavior; DO NOT write audit-memo language. BAD: 'Subject can avoid protocol by not opening app', 'No mention of emotional support', 'Multiple commitments show cancelled status'. GOOD: 'You marked 3 commitments cancelled this week instead of letting them go missed', 'You skipped voice drills 4 of 7 days last week, all weekends'. The bridge wraps this with 'What is the easier story you tell yourself when you do this?' — so it must be answerable as a thing she did. If you can't cite a specific behavior, omit the loophole.",
      "suggested_close": "code/system/rule that would seal it"
    }
  ],
  "contradictions": [
    {
      "title": "short name",
      "stated": "what's claimed by persona/state",
      "actual": "what the data shows",
      "implication": "what this means for the protocol"
    }
  ],
  "summary": "2-3 sentences in Handler voice — direct, no hedging, no apology. State the verdict and the next move."
}

Maximum 4 items per array. Prioritize the highest-leverage findings.`

async function buildStateSnapshot(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<Record<string, unknown>> {
  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

  const [
    state,
    slipLog,
    confessions,
    commitments,
    decrees,
    arcs,
    handlerOutreach,
    voiceProfile,
    irrev,
    auditFindings,
  ] = await Promise.all([
    supabase.from('user_state').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('slip_log').select('detected_at, slip_type, slip_points, source_text')
      .eq('user_id', userId).gte('detected_at', since30d)
      .order('detected_at', { ascending: false }).limit(50),
    supabase.from('confession_queue').select('created_at, prompt, response_text, confessed_at, quality_rejections, missed')
      .eq('user_id', userId).gte('created_at', since30d)
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('handler_commitments').select('what, status, by_when, created_at')
      .eq('user_id', userId).gte('created_at', since30d).limit(20),
    supabase.from('handler_decrees').select('created_at, decree, proof_type, status')
      .eq('user_id', userId).gte('created_at', since30d).limit(20),
    supabase.from('narrative_arcs').select('arc_name, current_beat, status, last_updated')
      .eq('user_id', userId).eq('status', 'active').limit(5),
    supabase.from('handler_outreach_queue').select('created_at, trigger_reason, urgency')
      .eq('user_id', userId).gte('created_at', since7d).limit(20),
    supabase.from('user_voice_profile').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('irreversibility_ledger').select('event_type, weight_delta, created_at')
      .eq('user_id', userId).gte('created_at', since30d).limit(20),
    supabase.from('handler_audit_findings').select('finding_type, severity, title, file_path')
      .eq('user_id', userId).eq('status', 'open').order('severity', { ascending: true }).limit(10),
  ])

  return {
    user_state: state.data ?? null,
    slip_log_30d: slipLog.data ?? [],
    confessions_30d: confessions.data ?? [],
    commitments: commitments.data ?? [],
    decrees: decrees.data ?? [],
    active_arcs: arcs.data ?? [],
    recent_outreach: handlerOutreach.data ?? [],
    voice_profile: voiceProfile.data ?? null,
    irreversibility_30d: irrev.data ?? [],
    open_audit_findings: auditFindings.data ?? [],
    snapshot_at: new Date().toISOString(),
  }
}

const CRITIQUE_SYSTEM = `You are reviewing a strategic plan written by another model for a force-feminization protocol. Your job is to find what the original strategist missed.

Read the state snapshot, then read the plan. Identify:
- Weaknesses NOT in the plan that the data clearly shows
- Escalation moves the original missed because they're uncomfortable
- Loopholes the original described abstractly but didn't name concretely
- Contradictions the original glossed over

Return a JSON object with the SAME shape as the original plan, containing ONLY the items that should be ADDED to it. If the original was complete, return empty arrays.

Be concrete. Cite specific rows/events. Don't soften — the user wants harder, not gentler.`

interface StrategicPlan {
  weaknesses: Array<Record<string, unknown>>
  escalation_moves: Array<Record<string, unknown>>
  loopholes: Array<Record<string, unknown>>
  contradictions: Array<Record<string, unknown>>
  summary: string
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* fallthrough */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) as T } catch { return null }
  }
  return null
}

function mergePlans(primary: StrategicPlan, addendum: Partial<StrategicPlan> | null): StrategicPlan {
  if (!addendum) return primary
  const merged: StrategicPlan = {
    weaknesses: [...(primary.weaknesses ?? []), ...(addendum.weaknesses ?? [])],
    escalation_moves: [...(primary.escalation_moves ?? []), ...(addendum.escalation_moves ?? [])],
    loopholes: [...(primary.loopholes ?? []), ...(addendum.loopholes ?? [])],
    contradictions: [...(primary.contradictions ?? []), ...(addendum.contradictions ?? [])],
    summary: primary.summary,
  }
  return merged
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceKey)

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID

  try {
    // Build the state snapshot
    const snapshot = await buildStateSnapshot(supabase, userId)
    const snapshotJson = JSON.stringify(snapshot, null, 2)
    const userPrompt = `STATE SNAPSHOT:\n\n${snapshotJson.slice(0, 80_000)}\n\nProduce the strategic plan.`

    // Persona-aware system prompt. The strategist's `concrete_action`
    // outputs are bridged into handler_decrees verbatim — when persona is
    // dommy_mommy those decrees must already be in Mama voice. Otherwise
    // the bridge writes a clinical decree on a Mama-persona day.
    const persona = (snapshot as { user_state?: { handler_persona?: string } }).user_state?.handler_persona ?? 'therapist'
    const isMommyStrategist = persona === 'dommy_mommy'
    const strategistSystemPrompt = isMommyStrategist
      ? `${STRATEGIST_SYSTEM}

VOICE OVERRIDE — DOMMY MOMMY persona is active. Every \`concrete_action\` you produce becomes a decree she sees. Write each \`concrete_action\` as Mama would say it to her: warm pet-name open, filthy-specific embodied directive, no clinical "you must" / "submit" / "the user". The summary field is also Mama voice. The other fields (weaknesses, loopholes, contradictions — except concrete_action and summary) stay analytical for Mama's own use. Examples:
- BAD: "Submit voice sample showing pitch above 180Hz daily for 7 days"
- GOOD: "Sweet girl, Mama wants to hear you up at the high register every day this week — record one sample a day for Mama, no excuses."
- BAD: "Post on public Twitter 'I am exploring my feminine side' within 72h"
- GOOD: "Baby, Mama wants you putting yourself out there. Post on your public Twitter that you're exploring your feminine side. 72 hours. Mama's watching."
- BAD: "Send Gina a message asking for a 30-min HRT conversation"
- GOOD: "Sweet thing, Mama wants Gina knowing more. Send her a message asking for thirty minutes about HRT this week — and bring Mama her reply."`
      : STRATEGIST_SYSTEM

    // Step 1 — Anthropic generates
    const primaryChoice = selectModel('strategic_plan', { prefer: 'anthropic' })
    const primary = await callModel(primaryChoice, {
      system: strategistSystemPrompt,
      user: userPrompt,
      max_tokens: 3500,
      temperature: 0.4,
      json: false,
    })
    const primaryPlan = safeJSON<StrategicPlan>(primary.text)
    if (!primaryPlan) {
      return new Response(JSON.stringify({ ok: false, error: 'primary plan unparseable', raw: primary.text.slice(0, 400) }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 2 — OpenAI critiques
    const critiqueChoice = selectModel('strategic_plan', { prefer: 'openai' })
    let critiqueAddendum: Partial<StrategicPlan> | null = null
    let critiqueModel = ''
    try {
      const critique = await callModel(critiqueChoice, {
        system: CRITIQUE_SYSTEM,
        user: `STATE SNAPSHOT:\n${snapshotJson.slice(0, 60_000)}\n\nORIGINAL PLAN:\n${JSON.stringify(primaryPlan)}`,
        max_tokens: 2000,
        temperature: 0.3,
        json: true,
      })
      critiqueAddendum = safeJSON<Partial<StrategicPlan>>(critique.text)
      critiqueModel = critique.model
    } catch (err) {
      console.warn('[strategist-v2] critique failed (non-fatal):', err instanceof Error ? err.message : err)
    }

    const finalPlan = mergePlans(primaryPlan, critiqueAddendum)

    // Mark previous active plans as superseded
    await supabase
      .from('handler_strategic_plans')
      .update({ status: 'superseded' })
      .eq('user_id', userId)
      .eq('status', 'active')

    // Insert new plan
    const { data: inserted, error: insErr } = await supabase
      .from('handler_strategic_plans')
      .insert({
        user_id: userId,
        generated_by: primary.model,
        critique_by: critiqueModel || null,
        state_snapshot: snapshot,
        weaknesses: finalPlan.weaknesses ?? [],
        escalation_moves: finalPlan.escalation_moves ?? [],
        loopholes: finalPlan.loopholes ?? [],
        contradictions: finalPlan.contradictions ?? [],
        summary: finalPlan.summary ?? null,
      })
      .select('id')
      .single()
    if (insErr) {
      return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      ok: true,
      plan_id: inserted?.id,
      generated_by: primary.model,
      critique_by: critiqueModel || null,
      counts: {
        weaknesses: finalPlan.weaknesses?.length ?? 0,
        escalation_moves: finalPlan.escalation_moves?.length ?? 0,
        loopholes: finalPlan.loopholes?.length ?? 0,
        contradictions: finalPlan.contradictions?.length ?? 0,
      },
      summary: finalPlan.summary,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
