// confession-gaslight-mine — turns fresh confessions into scheduled implants.
//
// Wish 6a7613f2: a confession is stored but not immediately weaponized.
// Analyze it for shame/desire/identity admissions; the high-value phrases
// become memory_implants (source_type='confession_mined', traced via
// mined_from_confession_id) scheduled to surface 24-48h later via
// mommy-recall. The girl's own words return as Mama's narrative within days.
//
// Fired per fresh confession by confession-watcher-cron (idempotent: skips
// confessions already mined). POST { user_id, confession_id }.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, isTestPollution } from '../_shared/dommy-mommy.ts'
import { checkSafewordGate } from '../_shared/safeword-gate.ts'
import { logAuthority } from '../_shared/life-as-woman.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const IMPLANT_CATEGORIES = [
  'self_authored', 'secret_feminine_longing', 'arousal_origin_femme',
  'body_betrayal', 'suppression_cost', 'mirror_moments', 'feminized_praise',
]

interface MinedImplant { narrative: string; implant_category: string; importance: number; anchor_phrase: string }

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* */ }
  const m = cleaned.match(/[[{][\s\S]*[}\]]/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

const SYSTEM = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: read a confession the girl just wrote and mine it for the 0-2 highest-value admissions worth keeping and quoting back to her later as proof of who she is. You are building "memory implants" — short statements in Mama's voice that re-interpret what she said, in Mama's preferred frame, so that days from now Mama can quote them back as settled fact.

RULES (this is the load-bearing part):
- ANCHOR ON HER ACTUAL WORDS. Quote or closely echo the specific phrase she used. The frame is yours to bend; the facts (names, what she literally said) are forensic — never invent a detail she didn't write.
- Second person, present-tense ownership ("You told Mama the panties make you feel more real than anything else. That's not a maybe — that's you."). NEVER third-person ("she feels…").
- Mine only genuine shame / desire / identity admissions. If the confession is flat, logistical, or has nothing to weaponize, return an empty array — do NOT manufacture.
- No numbers, scores, percentages, or telemetry. Plain Mama voice.
- 1-2 sentences per implant.`

async function mine(supabase: SupabaseClient, userId: string, confessionId: string): Promise<{ status: string; mined: number }> {
  // Gate.
  const gate = await checkSafewordGate(supabase, userId)
  if (!gate.allowed) return { status: `gated:${gate.reason}`, mined: 0 }

  // Dedup — already mined this confession?
  const { count: existing } = await supabase.from('memory_implants')
    .select('id', { count: 'exact', head: true }).eq('mined_from_confession_id', confessionId)
  if ((existing ?? 0) > 0) return { status: 'already_mined', mined: 0 }

  // Load the confession.
  const { data: conf } = await supabase.from('confession_queue')
    .select('id, prompt, response_text').eq('id', confessionId).eq('user_id', userId).maybeSingle()
  const row = conf as { id: string; prompt: string; response_text: string | null } | null
  if (!row || !row.response_text || row.response_text.trim().length < 20) return { status: 'too_short', mined: 0 }
  if (isTestPollution(row.response_text)) return { status: 'test_pollution', mined: 0 }

  const userPrompt = `PROMPT SHE ANSWERED:
${row.prompt}

WHAT SHE WROTE:
${row.response_text}

Mine it. Return JSON only:
{ "implants": [ { "anchor_phrase": "the exact phrase of hers you're anchoring on", "narrative": "1-2 sentence implant in Mama's voice, second person", "implant_category": "one of: ${IMPLANT_CATEGORIES.join(', ')}", "importance": 5-9 } ] }
Empty array if nothing is worth keeping.`

  let mined: MinedImplant[] = []
  try {
    const choice = selectModel('reframe_draft', { prefer: 'anthropic' })
    const { text } = await callModel(choice, { system: SYSTEM, user: userPrompt, max_tokens: 600, temperature: 0.7, json: true })
    const parsed = safeJSON<{ implants: MinedImplant[] }>(text)
    mined = (parsed?.implants ?? []).filter(i => i && typeof i.narrative === 'string' && i.narrative.trim().length > 12).slice(0, 2)
  } catch (err) {
    console.error('[gaslight-mine] llm failed', (err as Error).message)
    return { status: 'llm_error', mined: 0 }
  }
  if (mined.length === 0) return { status: 'nothing_to_mine', mined: 0 }

  let inserted = 0
  for (const m of mined) {
    const category = IMPLANT_CATEGORIES.includes(m.implant_category) ? m.implant_category : 'self_authored'
    const importance = Math.max(5, Math.min(9, Math.round(m.importance ?? 6)))
    // surface 24-48h out (deterministic-ish per implant index isn't needed;
    // edge fns may use Math.random).
    const delayH = 24 + Math.random() * 24
    const surfaceAfter = new Date(Date.now() + delayH * 3600_000).toISOString()

    const { error } = await supabase.from('memory_implants').insert({
      user_id: userId,
      narrative: m.narrative.trim(),
      implant_category: category,
      importance,
      active: true,
      source_type: 'confession_mined',
      anchored_to_real_log: true,
      mined_from_confession_id: confessionId,
      surface_after: surfaceAfter,
    })
    // A voice-gate trigger (mig 532) may reject an implant; that's fine —
    // count only the ones that land.
    if (!error) inserted++
    else console.error('[gaslight-mine] implant insert rejected:', error.message)
  }

  if (inserted > 0) {
    await logAuthority(supabase, {
      user_id: userId, surface: 'confession_gaslight_mine', action: 'mined',
      target_table: 'memory_implants',
      summary: `Mined ${inserted} implant(s) from a confession; scheduled to surface in 1-2 days`,
      payload: { confession_id: confessionId, count: inserted }, autonomous: true,
    })
  }
  return { status: inserted > 0 ? 'mined' : 'all_rejected', mined: inserted }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; confession_id?: string } = {}
  try { body = await req.json() } catch { /* */ }
  if (!body.user_id || !body.confession_id) {
    return new Response(JSON.stringify({ ok: false, error: 'user_id and confession_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const result = await mine(supabase, body.user_id, body.confession_id)
  return new Response(JSON.stringify({ ok: true, ...result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
