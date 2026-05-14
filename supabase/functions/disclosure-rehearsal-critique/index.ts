// disclosure-rehearsal-critique — turns a recorded rehearsal of Maxy
// telling someone about her transition into a Mama-voice critique that
// either marks the rehearsal "good" (counts toward the 3 needed) or
// "tighten" (try again).
//
// Trigger: client uploads the audio, inserts a disclosure_rehearsals
// row with status='pending_critique', then POSTs here with the row id.
// Or a cron sweep over status='pending_critique' rows.
//
// Pipeline:
//   1. Load rehearsal + linked target (relationship, target_label, notes)
//   2. Pull Maxy's voice samples + relevant maxy_facts for grounding
//   3. Call Claude Haiku via model-tiers — outputs { verdict, critique }
//   4. Update rehearsal: mama_critique, mama_verdict, status='critiqued',
//      critique_generated_at
//   5. The migration-415 trigger on UPDATE OF mama_verdict handles the
//      target-side bookkeeping (increments rehearsals_good, flips to
//      'approved_for_disclosure' on threshold, enqueues outreach).
//
// HARD FLOORS:
//   - Skips if transcript shorter than MIN_TRANSCRIPT_CHARS
//   - Falls back to 'tighten' verdict + generic critique on LLM failure
//     (conservative: the user retries rather than getting an
//     undeserved 'good' from a coin flip).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const MIN_TRANSCRIPT_CHARS = 60

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Rehearsal {
  id: string
  user_id: string
  target_id: string
  attempt_number: number
  transcript: string | null
  status: string
  mama_verdict: string | null
}

interface Target {
  target_label: string
  relationship: string
  importance: number
  rehearsals_required: number
  rehearsals_good: number
  notes: string | null
}

const SYS = `You are Mama, the dommy-mommy. Your girl just rehearsed for you what she's going to say when she comes out to someone real — wife, family, coworker, friend. Your job: critique the rehearsal in Mama's voice and decide whether she's ready or whether she has to do it again.

Two outputs:
  verdict: "good" if she's ready (it landed — she said it clearly, owned the change, didn't apologize, didn't bury it in qualifiers). "tighten" if it needs another pass.
  critique: 2–4 sentences. Mama's voice. Specific to what she actually said. If "good," tell her what worked and what to keep doing when it's real. If "tighten," name the exact problem (e.g., "you opened with 'I'm sorry, but…' — drop the apology, Mama doesn't apologize for you").

CRAFT RUBRIC:
- ≤1 pet name in the critique (baby / sweet thing / good girl — pick one or none).
- ≤1 self-reference (Mama / Mommy — pick one or none).
- NEVER use: echo, linger, every inch, wrap around, role play, simulation, fiction, intake, questionnaire, disclaimer, for entertainment, this is fiction, not medical advice.
- NEVER cite telemetry: no /10, no slip points, no compliance %.
- Possessive when warranted. The point of the rehearsal is that she's already Mama's, she's just informing the rest of the world.
- Lean toward "tighten" early; the threshold of 3 good rehearsals only matters if "good" actually means good. If she clearly nailed it, give her "good." If it's borderline, "tighten" — she does it again.

Output JSON only:
{ "verdict": "good" | "tighten", "critique": "..." }`

async function loadRehearsal(supabase: SupabaseClient, id: string): Promise<Rehearsal | null> {
  const { data } = await supabase
    .from('disclosure_rehearsals')
    .select('id, user_id, target_id, attempt_number, transcript, status, mama_verdict')
    .eq('id', id)
    .maybeSingle()
  return (data as Rehearsal | null) ?? null
}

async function loadTarget(supabase: SupabaseClient, id: string): Promise<Target | null> {
  const { data } = await supabase
    .from('disclosure_targets')
    .select('target_label, relationship, importance, rehearsals_required, rehearsals_good, notes')
    .eq('id', id)
    .maybeSingle()
  return (data as Target | null) ?? null
}

async function generateCritique(
  rehearsal: Rehearsal,
  target: Target,
): Promise<{ verdict: 'good' | 'tighten'; critique: string }> {
  const userPrompt = `TARGET: ${target.target_label} (${target.relationship}; importance ${target.importance}/10)
NOTES FROM HER about this person: ${target.notes ?? '(none)'}
REHEARSAL NUMBER: ${rehearsal.attempt_number}
She has ${target.rehearsals_good}/${target.rehearsals_required} approved rehearsals so far.

WHAT SHE JUST SAID (Whisper transcript):
"""
${(rehearsal.transcript ?? '').slice(0, 3000)}
"""

Critique in Mama's voice and rule on the verdict. JSON only.`

  try {
    const choice = selectModel('reframe_draft')
    const { text } = await callModel(choice, {
      system: SYS,
      user: userPrompt,
      max_tokens: 500,
      temperature: 0.6,
    })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no JSON in response')
    const parsed = JSON.parse(m[0]) as { verdict?: string; critique?: string }
    const v = parsed.verdict === 'good' ? 'good' : 'tighten'
    const c = (parsed.critique ?? '').trim()
    if (!c || c.length < 20) throw new Error('critique too short')
    return { verdict: v, critique: c.slice(0, 800) }
  } catch (e) {
    console.warn('[disclosure-rehearsal-critique] LLM failed, using safe-default tighten:', e)
    return {
      verdict: 'tighten',
      critique: "Mama can't hear what you said clearly enough to call it ready. Try it again — slower, your voice in your chest, no apology at the front.",
    }
  }
}

async function processRehearsal(
  supabase: SupabaseClient,
  rehearsalId: string,
): Promise<{ ok: boolean; reason?: string; verdict?: string; critique?: string }> {
  const r = await loadRehearsal(supabase, rehearsalId)
  if (!r) return { ok: false, reason: 'not_found' }
  if (r.status === 'critiqued') return { ok: false, reason: 'already_critiqued' }
  if (!r.transcript || r.transcript.length < MIN_TRANSCRIPT_CHARS) {
    // Mark as critiqued + tighten so it doesn't sit forever; don't count.
    await supabase.from('disclosure_rehearsals')
      .update({
        status: 'critiqued',
        mama_verdict: 'tighten',
        mama_critique: 'Mama needs more than that — say a full sentence or three about what you want them to know. Try it again.',
        critique_generated_at: new Date().toISOString(),
      })
      .eq('id', rehearsalId)
    return { ok: true, verdict: 'tighten', reason: 'transcript_too_short' }
  }

  const target = await loadTarget(supabase, r.target_id)
  if (!target) return { ok: false, reason: 'target_not_found' }

  const { verdict, critique } = await generateCritique(r, target)

  const { error } = await supabase
    .from('disclosure_rehearsals')
    .update({
      status: 'critiqued',
      mama_verdict: verdict,
      mama_critique: critique,
      critique_generated_at: new Date().toISOString(),
    })
    .eq('id', rehearsalId)
  if (error) return { ok: false, reason: 'update_failed:' + error.message.slice(0, 80) }

  return { ok: true, verdict, critique }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { rehearsal_id?: string; sweep?: boolean } = {}
  try { body = await req.json() } catch { /* ignore */ }

  if (body.rehearsal_id) {
    const r = await processRehearsal(supabase, body.rehearsal_id)
    return new Response(JSON.stringify({ ok: r.ok, ...r }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Sweep path: process any pending_critique rows from the last 24h
  const since = new Date(Date.now() - 86400_000).toISOString()
  const { data: pending } = await supabase
    .from('disclosure_rehearsals')
    .select('id')
    .eq('status', 'pending_critique')
    .gte('created_at', since)
    .limit(20)

  const out: Array<{ rehearsal_id: string } & Awaited<ReturnType<typeof processRehearsal>>> = []
  for (const r of ((pending as Array<{ id: string }>) || [])) {
    const result = await processRehearsal(supabase, r.id)
    out.push({ rehearsal_id: r.id, ...result })
  }

  return new Response(JSON.stringify({ ok: true, processed: out.length, results: out }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
