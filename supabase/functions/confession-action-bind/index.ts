// confession-action-bind — confession → embodied micro-decree 24-72h later.
//
// Wish 849ae5af: in parallel with confession-gaslight-mine (which makes
// quote-back implants), this mirrors a confession's desire/fear/identity
// admission back as an EMBODIED command (voice/photo proof) surfacing 24-72h
// out — confession → compulsion. Per-week cap; idempotent per confession.
//
// Fired by confession-watcher-cron alongside the miner.
// POST { user_id, confession_id }.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, isTestPollution, isMommyPersona, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import { checkSafewordGate } from '../_shared/safeword-gate.ts'
import { logAuthority } from '../_shared/life-as-woman.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const WEEKLY_CAP = 3

// ── PARITY with src/lib/confession-action-bind.ts ──────────────────────
const CLERICAL_RE = /\b(type|write|copy|paste|repeat in (the )?chat|fill (in|out)|log it|enter (it|the))\b/i
interface BindProposal { should_bind?: boolean; embodied_command?: string; proof_kind?: string; topic_tag?: string }
function validateBind(p: BindProposal): { embodied_command: string; proof_kind: 'voice' | 'photo'; decree_proof_type: 'audio' | 'photo'; topic_tag: string } | null {
  if (!p || p.should_bind !== true) return null
  const cmd = (p.embodied_command ?? '').trim()
  if (cmd.length < 12 || CLERICAL_RE.test(cmd)) return null
  const kind: 'voice' | 'photo' = p.proof_kind === 'photo' ? 'photo' : 'voice'
  return { embodied_command: cmd, proof_kind: kind, decree_proof_type: kind === 'photo' ? 'photo' : 'audio', topic_tag: (p.topic_tag ?? 'general').slice(0, 40) }
}
function bindDeadlineMs(jitter: number, now = Date.now()): number {
  return now + (24 + Math.max(0, Math.min(1, jitter)) * 48) * 3600_000
}

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

const SYSTEM = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: read a confession the girl just wrote and decide whether one specific admission in it should become an EMBODIED command she has to obey in the next day or two — mirroring her own words back as an order.

RULES:
- Bind ONLY a genuine desire / fear / identity admission you can turn into a concrete BODY action with voice or photo proof. If the confession is flat or has nothing to act on, return should_bind:false. Be selective — most confessions are release, not material.
- The command must be EMBODIED: kneel/say-out-loud/record/photograph/wear/pose. NEVER clerical ("type it", "write it out", "log it") — those are rejected.
- Anchor on HER actual words. The order mirrors what she confessed.
- One sentence, Mama's voice, an imperative she can obey alone in 1-2 days.
- Proof kind: "voice" for spoken/whispered admissions, "photo" for body/wardrobe/posture.`

async function bind(supabase: SupabaseClient, userId: string, confessionId: string): Promise<{ status: string }> {
  const gate = await checkSafewordGate(supabase, userId)
  if (!gate.allowed) return { status: `gated:${gate.reason}` }
  const { data: us } = await supabase.from('user_state').select('handler_persona').eq('user_id', userId).maybeSingle()
  if (!isMommyPersona((us as { handler_persona?: string } | null)?.handler_persona)) return { status: 'persona_off' }

  // Idempotent per confession.
  const { count: existing } = await supabase.from('confession_action_bindings')
    .select('id', { count: 'exact', head: true }).eq('confession_id', confessionId)
  if ((existing ?? 0) > 0) return { status: 'already_bound' }

  // Weekly cap.
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
  const { count: recent } = await supabase.from('confession_action_bindings')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', weekAgo)
  if ((recent ?? 0) >= WEEKLY_CAP) return { status: 'weekly_cap' }

  const { data: conf } = await supabase.from('confession_queue')
    .select('id, prompt, response_text').eq('id', confessionId).eq('user_id', userId).maybeSingle()
  const row = conf as { prompt: string; response_text: string | null } | null
  if (!row || !row.response_text || row.response_text.trim().length < 25) return { status: 'too_short' }
  if (isTestPollution(row.response_text)) return { status: 'test_pollution' }

  // Recent mismatch topics → tell the model to avoid them.
  const { data: misses } = await supabase.from('confession_action_bindings')
    .select('topic_tag').eq('user_id', userId).not('mismatch_at', 'is', null).gte('created_at', weekAgo).limit(5)
  const avoid = ((misses || []) as Array<{ topic_tag: string }>).map(m => m.topic_tag).filter(Boolean)

  const userPrompt = `PROMPT:\n${row.prompt}\n\nWHAT SHE WROTE:\n${row.response_text}\n${avoid.length ? `\nAvoid these topics (she flagged them off-base recently): ${avoid.join(', ')}\n` : ''}\nDecide. Return JSON only:\n{ "should_bind": true|false, "embodied_command": "one imperative sentence, Mama's voice", "proof_kind": "voice"|"photo", "topic_tag": "short slug" }`

  let proposal: BindProposal | null = null
  try {
    const choice = selectModel('decree_draft', { prefer: 'anthropic' })
    const { text } = await callModel(choice, { system: SYSTEM, user: userPrompt, max_tokens: 400, temperature: 0.7, json: true })
    proposal = safeJSON<BindProposal>(text)
  } catch (err) { console.error('[action-bind] llm failed', (err as Error).message); return { status: 'llm_error' } }

  const valid = proposal ? validateBind(proposal) : null
  if (!valid) return { status: 'nothing_to_bind' }

  const deadline = new Date(bindDeadlineMs(Math.random())).toISOString()
  const edict = mommyVoiceCleanup(valid.embodied_command)

  // Create the decree (auto-gets a penalty preview via mig 601; surfaces via
  // the decree path). consequence is the stated cost.
  const { data: decree, error: decErr } = await supabase.from('handler_decrees').insert({
    user_id: userId,
    edict,
    proof_type: valid.decree_proof_type,
    deadline,
    consequence: 'slip +1',
    trigger_source: 'confession_action_bind',
    status: 'active',
    proof_payload: { confession_id: confessionId, topic_tag: valid.topic_tag },
  }).select('id').single()
  if (decErr || !decree) {
    // A BEFORE-INSERT gate (clerical/pause) may cancel it — that's fine.
    return { status: `decree_rejected:${decErr?.message ?? 'unknown'}` }
  }
  const decreeId = (decree as { id: string }).id

  await supabase.from('confession_action_bindings').insert({
    user_id: userId, confession_id: confessionId, decree_id: decreeId,
    topic_tag: valid.topic_tag, proof_kind: valid.proof_kind, embodied_command: edict,
  })

  await logAuthority(supabase, {
    user_id: userId, surface: 'confession_action_bind', action: 'bound',
    target_table: 'handler_decrees', target_id: decreeId,
    summary: `Bound a confession to an embodied ${valid.proof_kind} decree (${valid.topic_tag})`,
    payload: { confession_id: confessionId, proof_kind: valid.proof_kind }, autonomous: true,
  })

  return { status: 'bound' }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; confession_id?: string } = {}
  try { body = await req.json() } catch { /* */ }
  if (!body.user_id || !body.confession_id) return new Response(JSON.stringify({ ok: false, error: 'user_id and confession_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  const result = await bind(supabase, body.user_id, body.confession_id)
  return new Response(JSON.stringify({ ok: true, ...result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
