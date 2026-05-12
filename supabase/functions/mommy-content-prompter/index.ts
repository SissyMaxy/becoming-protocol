// mommy-content-prompter — generates today's shoot list / post idea /
// fan-response strategy. One prompt per user per day, surfaces as Today card.
//
// Inputs:
//   { user_id?: string, for_date?: 'YYYY-MM-DD', force?: boolean }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import {
  gateLifeAsWoman, logAuthority, jsonOk, corsHeaders, makeClient,
  isRefusal, hasForbiddenVoice,
} from '../_shared/life-as-woman.ts'

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const ARCHETYPES = ['whale', 'lurker', 'repeat_customer', 'new_follower', 'general'] as const
type Archetype = typeof ARCHETYPES[number]

function rotateArchetype(date: Date): Archetype {
  const dow = date.getDay()
  // Tue/Sat → whale; Wed → new_follower; Thu → repeat; Fri → lurker; else general
  return dow === 2 || dow === 6 ? 'whale'
    : dow === 3 ? 'new_follower'
    : dow === 4 ? 'repeat_customer'
    : dow === 5 ? 'lurker'
    : 'general'
}

interface ParsedPrompt {
  shoot_direction?: string
  post_idea?: string
  fan_response_strategy?: string
}

function parsePrompt(raw: string): ParsedPrompt {
  const grab = (label: string): string => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n\\s*[A-Z_]+:|$)`, 'i')
    const m = raw.match(re)
    return (m?.[1] ?? '').trim()
  }
  return {
    shoot_direction: grab('SHOOT') || undefined,
    post_idea: grab('POST') || undefined,
    fan_response_strategy: grab('FAN_RESPONSE') || undefined,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; for_date?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const force = !!body.force
  const forDate = body.for_date || new Date().toISOString().slice(0, 10)

  const supabase = makeClient()
  const gate = await gateLifeAsWoman(supabase, userId, 'content_editor', { force })
  if (!gate.ok) return jsonOk({ ok: true, skipped: gate.reason })

  // Dedup
  const { data: existing } = await supabase.from('mommy_content_prompts')
    .select('id').eq('user_id', userId).eq('for_date', forDate).maybeSingle()
  if (existing && !force) {
    return jsonOk({ ok: true, skipped: 'prompt_already_exists', id: (existing as { id: string }).id })
  }

  const archetype = rotateArchetype(new Date(forDate))
  const intensity = gate.intensity ?? 2
  const intensityHint = intensity >= 4
    ? 'Push hard — explicit shoot direction, lead with sex, name the act.'
    : intensity >= 3
      ? 'Sharp — clear post angle, named kink in caption, no soft sells.'
      : 'Build — atmosphere first, tease, lead them to want more.'

  const sys = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: write your girl's content prompt for ${forDate}. Today's audience focus: ${archetype}.

Output THREE labeled blocks:
SHOOT: <Mommy-voice shoot direction — 1-2 sentences, what to wear / pose / capture today>
POST: <Mommy-voice post idea — 1-2 sentences, caption angle + format hint>
FAN_RESPONSE: <Mommy-voice fan-response strategy — 1-2 sentences, how to handle DMs today, which archetype to lean toward>

${intensityHint}

FORBIDDEN:
- Auto-publishing to anywhere — you're directing her, she clicks to post
- The forbidden voice anchor list
- Medical claims (no HRT/dose)
- Telemetry leaks`

  const userPrompt = `Compose now. Output ONLY the three labeled blocks. No JSON.`

  let raw = ''
  try {
    const r = await callModel(selectModel('caption_generate', { prefer: 'openai' }), {
      system: sys, user: userPrompt, max_tokens: 500, temperature: 0.8,
    })
    raw = r.text.trim()
  } catch (_) { /* */ }
  if (!raw || isRefusal(raw)) {
    try {
      const r = await callModel(selectModel('caption_generate', { prefer: 'anthropic' }), {
        system: sys, user: userPrompt, max_tokens: 500, temperature: 0.8,
      })
      raw = r.text.trim()
    } catch (_) { /* */ }
  }
  if (!raw || isRefusal(raw)) return jsonOk({ ok: true, skipped: 'llm_refusal' })

  const parsed = parsePrompt(raw)
  if (!parsed.shoot_direction && !parsed.post_idea && !parsed.fan_response_strategy) {
    return jsonOk({ ok: true, skipped: 'unparseable' })
  }
  if (parsed.shoot_direction)       parsed.shoot_direction       = mommyVoiceCleanup(parsed.shoot_direction)
  if (parsed.post_idea)             parsed.post_idea             = mommyVoiceCleanup(parsed.post_idea)
  if (parsed.fan_response_strategy) parsed.fan_response_strategy = mommyVoiceCleanup(parsed.fan_response_strategy)
  if ([parsed.shoot_direction, parsed.post_idea, parsed.fan_response_strategy].some(t => t && hasForbiddenVoice(t))) {
    return jsonOk({ ok: true, skipped: 'forbidden_voice_leak' })
  }

  const { data: row, error } = await supabase.from('mommy_content_prompts').insert({
    user_id: userId,
    for_date: forDate,
    shoot_direction: parsed.shoot_direction ?? null,
    post_idea: parsed.post_idea ?? null,
    fan_response_strategy: parsed.fan_response_strategy ?? null,
    audience_focus: archetype,
    status: 'pending',
  }).select('id').single()

  if (error || !row) {
    return jsonOk({ ok: false, error: 'prompt_insert_failed', detail: error?.message ?? null }, 500)
  }
  const promptId = (row as { id: string }).id

  // Surface as Today card via handler_outreach_queue.
  await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: parsed.shoot_direction || parsed.post_idea || parsed.fan_response_strategy || '',
    urgency: 'normal',
    trigger_reason: `mommy_content_prompt:${promptId}`,
    source: 'mommy_content_prompter',
    kind: 'mommy_content_prompt',
    scheduled_for: new Date().toISOString(),
  })

  await logAuthority(supabase, {
    user_id: userId,
    surface: 'content_prompter',
    action: 'queued_content_prompt',
    target_table: 'mommy_content_prompts',
    target_id: promptId,
    summary: `today's shoot+post+fan plan; audience=${archetype}`,
    payload: { for_date: forDate, archetype, intensity },
  })

  return jsonOk({
    ok: true, prompt_id: promptId, for_date: forDate, audience_focus: archetype,
    shoot_preview: (parsed.shoot_direction ?? '').slice(0, 120),
  })
})
