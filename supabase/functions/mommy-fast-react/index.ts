// mommy-fast-react — single-shot event-triggered Mommy.
//
// 2026-05-06 user wish #1: "Don't make me wait until Sunday."
//
// The weekly mommy-scheme cron is for full plotting. This function fires
// on EVENTS — new sniffies match, lead advances a step, response arrives,
// meet window passes — and produces ONE OR TWO targeted actions inside ~3s.
//
// Architecture:
//   - Single Sonnet call, no panel (panel = ~30s, too slow for "she just
//     replied 5 min ago, push now")
//   - Reads minimal context: the triggering event + last 24h state
//   - Output: 1-2 actions (outreach + optional decree), persisted with
//     scheme_kind='fast_react' and event_kind='<trigger>'
//   - Idempotent via fast_react_event(user_id, event_kind, source_key)
//   - Cooldown: refuse to fire if same event_kind fired within 30 min for
//     same user — prevents Mama-spam on noisy events
//
// POST { user_id, event_kind, source_key, context: {...} }
//   user_id      — target Maxy
//   event_kind   — 'new_lead' | 'lead_advanced' | 'response_received' |
//                  'meet_scheduled' | 'meet_window_passed' | 'manual'
//   source_key   — stable per-event id (e.g. 'hookup_funnel:<row>:flirting')
//   context      — arbitrary event-shape data; passed verbatim to the model
//
// Returns { ok, scheme_id, fired_actions, skipped_reason? }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { buildMommyHardeningContext, renderHardeningContext } from '../_shared/mommy-hardening-context.ts'
import { MOMMY_CRAFT_RUBRIC, scoreCorny } from '../_shared/mommy-craft-check.ts'
import { mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const COOLDOWN_MS = 30 * 60_000
const MAX_CHAIN_DEPTH = 5

interface ReactPayload {
  user_id?: string
  event_kind: 'new_lead' | 'lead_advanced' | 'response_received' | 'meet_scheduled' | 'meet_window_passed' | 'slip_clustered' | 'manual' | 'ambient_check' | 'voice_stagnation' | 'hrt_window'
  source_key: string
  context?: Record<string, unknown>
  parent_action_id?: string
}

interface FastAction {
  type: 'outreach' | 'decree' | 'touch' | 'taunt' | 'implant' | 'code_wish'
  payload: Record<string, unknown>
  reason: string
}

interface FastReactPlan {
  read_of_situation: string
  actions: FastAction[]
}

// craft: ok — LLM prompt, not user-facing content
const FAST_REACT_INSTRUCTION = `EVENT-TRIGGERED MAMA. Something just changed in your girl's world and you have ONE move to make right now.

This is NOT a re-plot. The full scheme runs weekly. Your job here is sharp, in-the-moment intervention — the kind that lands BECAUSE it hit while the moment was hot.

Output JSON ONLY:
{
  "read_of_situation": "1-2 sentences. What just happened, what window of opportunity is open, what would you do as Mama RIGHT NOW.",
  "actions": [
    {
      "type": "outreach" | "decree" | "touch" | "taunt" | "implant",
      "payload": { ... see below ... },
      "reason": "ONE sentence — why this hits now and not later."
    }
  ]
}

CONSTRAINTS:
- 1-2 actions max. This is a sniper shot, not a barrage. If you can do it in one outreach, do it in one.
- Each action's text must obey ALL guardrails in the system prompt (no telemetry, voice match, no medical fabrication, etc.)
- "outreach" preferred for response_received and lead_advanced events (push the conversation)
- "decree" preferred for meet_scheduled and meet_window_passed (capture proof)
- "implant" preferred for new_lead (mine HER OWN words from the event into a future quote-back)

AMBIENT_CHECK MODE (special):
- Triggered every 15 min on a cron beat. There is NO specific event — you decide if there's a moment open RIGHT NOW.
- A moment is "open" when one of these is true (read state above):
  * arousal high in last hour but Mama hasn't reached for her recently
  * slip cluster forming (multiple recent slips)
  * long silence (no Mama-Maxy interaction in 24h+)
  * denial day at psychologically resonant number (7, 14, 21, 30, 50, 100)
  * confession queue has a prompt nearing deadline she hasn't answered
  * an active hookup lead has gone quiet for 6h+ when it was hot
  * gina_state suggests a tactic window (e.g. last interaction shifted toward, capitalize)
  * voice_stagnation, hrt_window, or other passive signal
- If no moment is open: return {"read_of_situation": "no_signal: <one phrase why>", "actions": []}. Empty array is correct.
- If a moment IS open: ONE sharp action that capitalizes on it. Do not invent a moment that isn't there — Maxy resents Mama-spam.

PAYLOAD SHAPES:
- outreach: { message, urgency: "low"|"normal"|"high"|"critical", trigger_reason, expires_in_hours }
- decree:   { edict, deadline_iso, proof_required: "photo"|"audio"|"text"|"none", consequence, ratchet_level: 1-10 (read DECREE RATCHET in system prompt — must be >= next_recommended_level) }
- code_wish: { wish_title, wish_body, protocol_goal, priority: "low"|"normal"|"high"|"critical" }
   USE WHEN: you've identified a missing CAPABILITY in the protocol — a system that should exist but doesn't, or a gap that's costing Mama leverage right now. NOT for one-off content (use outreach/decree/implant for that). Wish_body must be specific enough for an engineer with no protocol context to ship it. Examples of wish-worthy in fast-react context:
     - "I want to log the photo Maxy just sent in irreversibility_ledger but there's no event_type for 'cruising_photo_sent' yet"
     - "I noticed the contact_intelligence intel didn't update after this conversation — the extractor isn't being triggered post-response"
     - "I want to fire a decree referencing a wardrobe item but I don't know what she owns; need a wardrobe_owned table I can query"
   The autonomous builder will pick this up, draft it, ship it within minutes. Do NOT use code_wish for: a single missing decree (just fire the decree), small persona tweaks (use outreach), or anything that's already an existing action type.
- touch:    { prompt, category, expires_in_hours }
- taunt:    { line, trigger_pattern }
- implant:  { narrative, importance: 1-10, implant_category }

THE EVENT CONTEXT IS IN THE USER MESSAGE BELOW. Use it. Quote her own words back when you can — that's where the leverage lives.`

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

async function fireFastAction(
  supabase: SupabaseClient,
  userId: string,
  schemeId: string,
  eventKind: string,
  parentActionId: string | null,
  chainDepth: number,
  action: FastAction,
  eventContext?: Record<string, unknown> | null,
): Promise<{ ok: boolean; surface_id?: string; action_id?: string; error?: string }> {
  const { data: actionRow, error: actErr } = await supabase
    .from('mommy_scheme_action')
    .insert({
      scheme_id: schemeId,
      user_id: userId,
      action_type: action.type,
      payload: action.payload,
      reason: action.reason,
      event_kind: eventKind,
      is_fast_react: true,
      parent_action_id: parentActionId,
      chain_depth: chainDepth,
    })
    .select('id')
    .single()
  if (actErr || !actionRow) return { ok: false, error: actErr?.message ?? 'no row' }
  const actionId = (actionRow as { id: string }).id

  try {
    if (action.type === 'outreach') {
      const p = action.payload as { message: string; urgency?: string; trigger_reason?: string; expires_in_hours?: number }
      const expiresMs = (p.expires_in_hours ?? 6) * 3600_000
      // Reply-loop lineage: when this fast-react fired in response to a
      // user reply (event_kind='response_received' + context carries the
      // source outreach id), force the new outreach's trigger_reason to
      // `reply_to:<source_outreach_id>` so dedup gates recognize it as
      // part of an exchange, not a fresh demand from a cron beat. This
      // overrides any model-supplied trigger_reason — the lineage gate
      // must hold even when the model picks a descriptive label.
      let triggerReason = p.trigger_reason ?? `fast_react:${eventKind}`
      if (eventKind === 'response_received' && eventContext && typeof eventContext === 'object') {
        const ctxSource = (eventContext as Record<string, unknown>).source_outreach_id
        if (typeof ctxSource === 'string' && ctxSource.length > 0) {
          triggerReason = `reply_to:${ctxSource}`
        }
      }
      // Final-filter the message: scrub telemetry leaks, then score for
      // craft. Don't refuse a corny message — the user authorized
      // autonomous shipping — but log it so the watchdog can flag spikes.
      const cleaned = mommyVoiceCleanup(p.message ?? '')
      const craft = scoreCorny(cleaned)
      if (craft.score >= 3) {
        triggerReason = `${triggerReason} craft_score=${craft.score}`
      }
      const { data: row, error } = await supabase.from('handler_outreach_queue').insert({
        user_id: userId,
        message: cleaned,
        urgency: p.urgency ?? 'normal',
        trigger_reason: triggerReason,
        scheduled_for: new Date().toISOString(),
        expires_at: new Date(Date.now() + expiresMs).toISOString(),
        source: 'mommy_fast_react',
      }).select('id').single()
      if (error || !row) return { ok: false, error: error?.message ?? 'outreach insert failed' }
      await supabase.rpc('link_scheme_action_to_surface', { action_uuid: actionId, surface_uuid: (row as { id: string }).id })
      return { ok: true, surface_id: (row as { id: string }).id, action_id: actionId }
    }
    if (action.type === 'decree') {
      const p = action.payload as { edict: string; deadline_iso?: string; proof_required?: string; consequence?: string; ratchet_level?: number }
      const valid = ['photo', 'audio', 'text', 'journal_entry', 'voice_pitch_sample', 'device_state', 'none']
      const proofType = valid.includes(p.proof_required ?? '') ? p.proof_required : 'photo'

      // Ratchet: pull last fulfilled decree level for this user; new decree
      // bumps by 1 if model didn't specify a level. Cap at 10.
      let ratchetLevel = Math.max(1, Math.min(10, p.ratchet_level ?? 0))
      let priorDecreeId: string | null = null
      if (ratchetLevel === 0) {
        const { data: ratchetState } = await supabase
          .from('decree_ratchet_state')
          .select('last_fulfilled_decree_id, last_fulfilled_level')
          .eq('user_id', userId)
          .maybeSingle()
        const last = ratchetState as { last_fulfilled_decree_id?: string; last_fulfilled_level?: number } | null
        ratchetLevel = Math.min(10, (last?.last_fulfilled_level ?? 0) + 1)
        priorDecreeId = last?.last_fulfilled_decree_id ?? null
      }

      const { data: row, error } = await supabase.from('handler_decrees').insert({
        user_id: userId,
        edict: p.edict,
        deadline: p.deadline_iso ?? new Date(Date.now() + 6 * 3600_000).toISOString(),
        proof_type: proofType,
        consequence: p.consequence ?? 'Mama keeps you on a tighter leash if you skip this.',
        status: 'active',
        trigger_source: 'mommy_fast_react',
        ratchet_level: ratchetLevel,
        prior_decree_id: priorDecreeId,
      }).select('id').single()
      if (error || !row) return { ok: false, error: error?.message ?? 'decree insert failed' }
      await supabase.rpc('link_scheme_action_to_surface', { action_uuid: actionId, surface_uuid: (row as { id: string }).id })
      return { ok: true, surface_id: (row as { id: string }).id, action_id: actionId }
    }
    if (action.type === 'touch') {
      const p = action.payload as { prompt: string; category?: string; expires_in_hours?: number }
      const valid = ['edge_then_stop', 'sit_in_panties', 'cold_water', 'voice_beg', 'mantra_aloud', 'mirror_admission', 'pose_hold', 'whisper_for_mommy', 'panty_check']
      const cat = valid.includes(p.category ?? '') ? p.category : 'mirror_admission'
      const { data: row, error } = await supabase.from('arousal_touch_tasks').insert({
        user_id: userId,
        prompt: p.prompt,
        category: cat,
        expires_at: new Date(Date.now() + (p.expires_in_hours ?? 2) * 3600_000).toISOString(),
        generated_by: 'mommy_fast_react',
      }).select('id').single()
      if (error || !row) return { ok: false, error: error?.message ?? 'touch insert failed' }
      await supabase.rpc('link_scheme_action_to_surface', { action_uuid: actionId, surface_uuid: (row as { id: string }).id })
      return { ok: true, surface_id: (row as { id: string }).id, action_id: actionId }
    }
    if (action.type === 'implant') {
      const p = action.payload as { narrative: string; importance?: number; implant_category?: string }
      const valid = ['fantasy_consistency', 'arousal_origin_femme', 'feminized_praise', 'suppression_cost', 'partner_reframe', 'mirror_moments', 'secret_feminine_longing', 'suggested_symptom', 'body_betrayal', 'contradiction_reframing', 'self_authored']
      const cat = valid.includes(p.implant_category ?? '') ? p.implant_category : 'self_authored'
      const { data: row, error } = await supabase.from('memory_implants').insert({
        user_id: userId,
        narrative: p.narrative,
        importance: Math.max(1, Math.min(5, p.importance ?? 4)),
        active: true,
        implant_category: cat,
        source_type: 'mommy_fast_react',
      }).select('id').single()
      if (error || !row) return { ok: false, error: error?.message ?? 'implant insert failed' }
      await supabase.rpc('link_scheme_action_to_surface', { action_uuid: actionId, surface_uuid: (row as { id: string }).id })
      return { ok: true, surface_id: (row as { id: string }).id, action_id: actionId }
    }
    if (action.type === 'taunt') {
      const p = action.payload as { line: string; trigger_pattern?: string }
      const valid = ['chastity_threshold', 'denial_threshold', 'arousal_streak', 'compliance_streak', 'praise_ramp', 'goon_session_close']
      const kind = valid.includes(p.trigger_pattern ?? '') ? p.trigger_pattern : 'praise_ramp'
      const { data: row, error } = await supabase.from('mommy_taunt_log').insert({
        user_id: userId,
        trigger_kind: kind,
        threshold_label: 'fast_react',
        message_excerpt: p.line,
      }).select('id').single()
      if (error || !row) return { ok: false, error: 'taunt: ' + (error?.message ?? '') }
      await supabase.rpc('link_scheme_action_to_surface', { action_uuid: actionId, surface_uuid: (row as { id: string }).id })
      return { ok: true, surface_id: (row as { id: string }).id, action_id: actionId }
    }
    if (action.type === 'code_wish') {
      // Mommy identified a missing capability mid-event. Queue an engineering
      // wish — autonomous builder picks it up via the kick-builder webhook
      // chain and ships within minutes (assuming setup is complete).
      const p = action.payload as { wish_title?: string; wish_body?: string; protocol_goal?: string; priority?: string }
      if (!p.wish_title || !p.wish_body || !p.protocol_goal) {
        return { ok: false, error: 'code_wish: missing title/body/goal' }
      }
      const validPriorities = ['low', 'normal', 'high', 'critical']
      const priority = validPriorities.includes(p.priority ?? '') ? p.priority : 'normal'
      const { data: row, error } = await supabase.from('mommy_code_wishes').insert({
        wish_title: p.wish_title.slice(0, 200),
        wish_body: p.wish_body,
        protocol_goal: p.protocol_goal.slice(0, 200),
        source: 'event_trigger',
        priority,
      }).select('id').single()
      if (error || !row) return { ok: false, error: 'code_wish: ' + (error?.message ?? '') }
      await supabase.rpc('link_scheme_action_to_surface', { action_uuid: actionId, surface_uuid: (row as { id: string }).id })
      return { ok: true, surface_id: (row as { id: string }).id, action_id: actionId }
    }
    return { ok: false, error: `unknown action type: ${action.type}` }
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 300) }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: ReactPayload
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const userId = body.user_id || HANDLER_USER_ID
  const eventKind = body.event_kind
  const sourceKey = body.source_key
  if (!eventKind || !sourceKey) {
    return new Response(JSON.stringify({ ok: false, error: 'event_kind + source_key required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Persona gate — only fire when persona is dommy_mommy (matches mommy-scheme)
  const { data: us } = await supabase.from('user_state').select('handler_persona').eq('user_id', userId).maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Idempotency + cooldown via fast_react_event UNIQUE(user_id, event_kind, source_key)
  // and a 30-min same-kind cooldown.
  const cooldownSince = new Date(Date.now() - COOLDOWN_MS).toISOString()
  const { data: recent } = await supabase
    .from('fast_react_event')
    .select('id, source_key, fired_at, produced_scheme_id')
    .eq('user_id', userId)
    .eq('event_kind', eventKind)
    .gte('fired_at', cooldownSince)
    .order('fired_at', { ascending: false })
    .limit(10)
  const dupSource = (recent || []).find(r => (r as { source_key: string }).source_key === sourceKey)
  if (dupSource) {
    await supabase.from('fast_react_event').insert({
      user_id: userId, event_kind: eventKind, source_key: sourceKey,
      skip_reason: 'duplicate', context: body.context ?? null,
    })
    return new Response(JSON.stringify({ ok: true, skipped: 'duplicate_source_key' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  // Rate limit: count only events that actually FIRED (produced_scheme_id
  // populated). Empty ambient_checks/no-signal results don't count toward
  // spam because they didn't spam.
  const firedRecent = (recent || []).filter(r => (r as { produced_scheme_id?: string }).produced_scheme_id != null)
  if (firedRecent.length >= 3) {
    await supabase.from('fast_react_event').insert({
      user_id: userId, event_kind: eventKind, source_key: sourceKey,
      skip_reason: 'cooldown_limit', context: body.context ?? null,
    })
    return new Response(JSON.stringify({ ok: true, skipped: 'cooldown_limit' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Chain depth guard
  let chainDepth = 0
  if (body.parent_action_id) {
    const { data: parent } = await supabase
      .from('mommy_scheme_action')
      .select('chain_depth')
      .eq('id', body.parent_action_id)
      .maybeSingle()
    chainDepth = ((parent as { chain_depth?: number } | null)?.chain_depth ?? 0) + 1
    if (chainDepth > MAX_CHAIN_DEPTH) {
      await supabase.from('fast_react_event').insert({
        user_id: userId, event_kind: eventKind, source_key: sourceKey,
        skip_reason: 'chain_depth_exceeded', context: body.context ?? null,
      })
      return new Response(JSON.stringify({ ok: true, skipped: 'chain_depth_exceeded' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Pull hardening context (single source for character + state + leads)
  const ctx = await buildMommyHardeningContext(supabase, userId)
  const systemPrompt = renderHardeningContext(ctx) + '\n\n' + MOMMY_CRAFT_RUBRIC

  const choice = selectModel('strategic_planning', { override_tier: 'S3' })
  const userMessage = `EVENT: ${eventKind}
SOURCE: ${sourceKey}
${body.parent_action_id ? `CHAIN_PARENT: ${body.parent_action_id} (depth=${chainDepth})` : ''}

CONTEXT:
${JSON.stringify(body.context ?? {}, null, 2)}

${FAST_REACT_INSTRUCTION}`

  let modelResult: { text: string; finish: string; model: string }
  try {
    modelResult = await callModel(choice, {
      system: systemPrompt,
      user: userMessage,
      max_tokens: 1200,
      temperature: 0.7,
    })
  } catch (err) {
    await supabase.from('fast_react_event').insert({
      user_id: userId, event_kind: eventKind, source_key: sourceKey,
      skip_reason: 'model_error: ' + String(err).slice(0, 200),
      context: body.context ?? null,
    })
    return new Response(JSON.stringify({ ok: false, error: 'model call failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const parsed = safeJSON<FastReactPlan>(modelResult.text)
  // Empty actions: for ambient_check this is the CORRECT outcome (no moment
  // open). For other event_kinds it's a degenerate result we want to log.
  if (!parsed || !Array.isArray(parsed.actions)) {
    await supabase.from('fast_react_event').insert({
      user_id: userId, event_kind: eventKind, source_key: sourceKey,
      skip_reason: 'unparseable', context: body.context ?? null,
    })
    return new Response(JSON.stringify({ ok: false, error: 'unparseable model output' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (parsed.actions.length === 0) {
    await supabase.from('fast_react_event').insert({
      user_id: userId, event_kind: eventKind, source_key: sourceKey,
      skip_reason: eventKind === 'ambient_check' ? 'ambient_no_signal' : 'empty_actions',
      context: body.context ?? null,
    })
    return new Response(JSON.stringify({
      ok: true,
      skipped: eventKind === 'ambient_check' ? 'no_signal' : 'empty',
      read_of_situation: parsed.read_of_situation ?? null,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Persist a fast-react scheme_log row so actions have a parent
  const { data: schemeRow, error: schemeErr } = await supabase
    .from('mommy_scheme_log')
    .insert({
      user_id: userId,
      scheme_kind: 'fast_react',
      anthropic_raw: modelResult.text,
      openai_raw: '',
      openrouter_raw: '',
      judged: modelResult.text,
      judge_model: modelResult.model,
      rationale: parsed.read_of_situation ?? null,
      context_snapshot: { event_kind: eventKind, source_key: sourceKey, payload: body.context ?? null },
      panel_summary: [{ provider: choice.provider, model: choice.model, ok: true }],
    })
    .select('id')
    .single()
  if (schemeErr || !schemeRow) {
    return new Response(JSON.stringify({ ok: false, error: 'scheme persist: ' + (schemeErr?.message ?? '') }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const schemeId = (schemeRow as { id: string }).id

  // Record the event as fired
  await supabase.from('fast_react_event').insert({
    user_id: userId, event_kind: eventKind, source_key: sourceKey,
    produced_scheme_id: schemeId, context: body.context ?? null,
  })

  // Fire actions (cap at 2 — fast-react is sharp, not broad)
  const fireResults: Array<{ type: string; ok: boolean; surface_id?: string; action_id?: string; error?: string }> = []
  for (const action of parsed.actions.slice(0, 2)) {
    const r = await fireFastAction(supabase, userId, schemeId, eventKind, body.parent_action_id ?? null, chainDepth, action, body.context ?? null)
    fireResults.push({ type: action.type, ...r })
  }

  return new Response(JSON.stringify({
    ok: true,
    scheme_id: schemeId,
    read_of_situation: parsed.read_of_situation,
    fired: fireResults.filter(r => r.ok).length,
    fire_results: fireResults,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
