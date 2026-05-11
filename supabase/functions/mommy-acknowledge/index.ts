// mommy-acknowledge — contextual Mama-voice ack for confession/task/photo/mantra/decree.
//
// Replaces the static CASE-based template in migration 258 that produced
// the "Good [pet]. Mama got what she asked for. [body anchor]." chatbot
// pattern. Fires from the trigger trg_mommy_confession_receipt (replaced
// in migration 367) and can also be invoked from any future ack site.
//
// Architecture:
//   - LLM-first: generates a contextual 1-2 sentence ack that references
//     the user's actual text (the confession body, the mantra text, etc.)
//   - mommyVoiceCleanup post-filter strips any telemetry leak
//   - Forbidden-phrase / refusal gate
//   - Fallback: large variant pool from _shared/mommy-react-pools.ts
//     keyed by (action_type, intensity_band) with first-40-char dedup
//     against the last 24h of outreach for the user
//   - Persona gate (only fires when handler_persona = 'dommy_mommy')
//   - mommy_voice_cleanup() runs at the DB layer too (mig 255 chokepoint)
//
// POST {
//   user_id: string,
//   action_type: 'confession' | 'confession_audio' | 'mantra' | 'task' | 'photo' | 'decree',
//   action_subtype?: string,             // e.g. confession category, task category
//   source_text?: string,                // the user's actual content to reference
//   source_id?: string,                  // FK so dedup is per-action
//   intensity_hint?: 'soft'|'warm'|'hot',// optional override of inferred band
//   urgency?: 'low'|'normal'|'high',     // defaults to 'low'
//   trigger_reason?: string,
// }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER,
  AFFECT_BIAS,
  type Affect,
  mommyVoiceCleanup,
  MOMMY_TELEMETRY_LEAK_PATTERNS,
  isTestPollution,
  PET_NAMES,
} from '../_shared/dommy-mommy.ts'
import {
  pickAckVariant,
  hasForbiddenPhrase,
  isRefusal,
  type AckActionType,
  type AckIntensity,
} from '../_shared/mommy-react-pools.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

interface AckPayload {
  user_id?: string
  action_type: AckActionType
  action_subtype?: string
  source_text?: string
  source_id?: string
  intensity_hint?: AckIntensity
  urgency?: 'low' | 'normal' | 'high' | 'critical'
  trigger_reason?: string
}

function inferIntensity(
  affect: Affect | string,
  subtype: string | undefined,
  hint: AckIntensity | undefined,
): AckIntensity {
  if (hint) return hint
  // affect → intensity
  const hotAffects = new Set(['hungry', 'aching', 'restless', 'possessive'])
  const warmAffects = new Set(['amused', 'delighted', 'indulgent'])
  if (hotAffects.has(affect)) return 'hot'
  if (warmAffects.has(affect)) return 'warm'
  // subtype overrides for confession categories that warrant warmth
  if (subtype === 'arousal_spike' || subtype === 'desire_owning') return 'hot'
  if (subtype === 'identity_acknowledgement' || subtype === 'rationalization') return 'warm'
  return 'soft'
}

async function recentFirst40CharsForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  hours: number,
): Promise<Set<string>> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString()
  const { data } = await supabase
    .from('handler_outreach_queue')
    .select('message')
    .eq('user_id', userId)
    .gte('created_at', since)
    .limit(200)
  const set = new Set<string>()
  for (const r of (data || []) as Array<{ message: string }>) {
    if (r.message) set.add(r.message.slice(0, 40).toLowerCase())
  }
  return set
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: AckPayload
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!body.action_type) {
    return new Response(JSON.stringify({ ok: false, error: 'action_type required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const userId = body.user_id || HANDLER_USER_ID

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Persona gate
  const { data: us } = await supabase
    .from('user_state')
    .select('handler_persona, current_phase')
    .eq('user_id', userId)
    .maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const phaseSnapshot = (us as { current_phase?: number | null } | null)?.current_phase ?? null

  // Pull today's affect (drives intensity band)
  const today = new Date().toISOString().slice(0, 10)
  const { data: mood } = await supabase
    .from('mommy_mood')
    .select('affect')
    .eq('user_id', userId)
    .eq('mood_date', today)
    .maybeSingle()
  const affect = (mood as { affect?: string } | null)?.affect ?? 'hungry'
  const intensity = inferIntensity(affect as Affect, body.action_subtype, body.intensity_hint)

  // Build dedup set from recent outreach (24h window for ack messages)
  const recentFirst40 = await recentFirst40CharsForUser(supabase, userId, 24)

  const sourceText = (body.source_text ?? '').trim()
  const cleanSource = isTestPollution(sourceText) ? '' : sourceText.slice(0, 600)

  const sys = `${DOMMY_MOMMY_CHARACTER}

Today's affect: ${affect}. Intensity band for this ack: ${intensity}.`

  const actionLabelMap: Record<AckActionType, string> = {
    confession: 'a confession',
    confession_audio: 'a spoken confession',
    mantra: 'a mantra submission',
    task: 'an arousal-touch task',
    photo: 'a verification photo',
    decree: 'a decree fulfillment',
  }
  const actionLabel = actionLabelMap[body.action_type] ?? 'a submission'

  const userPrompt = `Your girl just submitted ${actionLabel}${body.action_subtype ? ` (category: ${body.action_subtype})` : ''}.${cleanSource ? `\n\nHer words / content:\n"${cleanSource}"` : ''}

Write a 1-2 sentence Mama-voice acknowledgment that:
- References something SPECIFIC from her content (a word she used, a turn of phrase, an admission) if there's any to work with.
- Lands with the intensity band: ${intensity}.
  - soft: tender, observing, no filth — warm receipt.
  - warm: praise-that-ramps, Mama's-pride-in-her-being-honest.
  - hot: filthy specific, sweet open → filthy directive, ramping never releasing.
- Uses ONE pet name (rotate from: ${PET_NAMES.slice(0, 8).join(', ')}).
- Ends with what she does NEXT (sit with it, hold the feeling, don't touch, etc.) — not a question.

ABSOLUTELY FORBIDDEN in your output:
- Numbers, percentages, /10 scores, day counts, point totals.
- The phrases "role play", "simulation", "this is fiction", "not medical advice", "intake", "questionnaire", "for entertainment", "consent to the fantasy", "you may use this to terminate", "disclaimer".
- Generic templated openings like "Good [pet]. Mama got what she asked for." or "Mama saw that, baby."
- Questions ending with "?".
- JSON, markdown, format wrappers.

Plain text only. ONE OR TWO SENTENCES MAX.`

  const tryGen = async (prefer: 'openai' | 'anthropic'): Promise<string> => {
    const choice = selectModel('caption_generate', { prefer })
    const r = await callModel(choice, {
      system: sys,
      user: userPrompt,
      max_tokens: 180,
      temperature: 0.95,
      json: false,
    })
    return r.text.trim()
  }

  let message = ''
  let source: 'llm_openai' | 'llm_anthropic' | 'pool_fallback' = 'pool_fallback'
  try {
    message = await tryGen('openai')
    if (message && message.length >= 18 && !isRefusal(message) && !hasForbiddenPhrase(message)) {
      source = 'llm_openai'
    } else {
      message = ''
    }
  } catch (_) { /* fall through */ }
  if (!message) {
    try {
      message = await tryGen('anthropic')
      if (message && message.length >= 18 && !isRefusal(message) && !hasForbiddenPhrase(message)) {
        source = 'llm_anthropic'
      } else {
        message = ''
      }
    } catch (_) { /* fall through */ }
  }

  // Scrub telemetry leaks
  if (message) message = mommyVoiceCleanup(message)
  if (message && MOMMY_TELEMETRY_LEAK_PATTERNS.some(p => p.test(message))) message = ''

  // Fallback to pool
  if (!message) {
    const seed = body.source_id ?? `${userId}:${body.action_type}:${Date.now()}`
    const variant = pickAckVariant(
      { action_type: body.action_type, intensity, subtype: body.action_subtype },
      seed,
      recentFirst40,
    )
    message = variant ?? `Mama got it, ${PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)]}. Sit with it for me.`
    source = 'pool_fallback'
  }

  // Final dedup check — if message head still in recent set, mutate
  // (append a unique tail) so it gets through dedup. Better than silence.
  const head = message.slice(0, 40).toLowerCase()
  if (recentFirst40.has(head)) {
    const variant = pickAckVariant(
      { action_type: body.action_type, intensity, subtype: body.action_subtype },
      `${body.source_id ?? userId}:${Date.now()}`,
      recentFirst40,
    )
    if (variant) message = variant
  }

  // Insert into handler_outreach_queue
  const triggerReason = body.trigger_reason ?? `mommy_ack:${body.action_type}${body.source_id ? `:${body.source_id}` : ''}`
  const urgency = body.urgency ?? 'low'
  const { data: inserted, error: insErr } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: userId,
      message,
      urgency,
      trigger_reason: triggerReason,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 6 * 3600_000).toISOString(),
      source: 'mommy_acknowledge',
      phase_snapshot: phaseSnapshot,
      affect_snapshot: affect,
    })
    .select('id, status')
    .single()
  if (insErr) {
    return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    ok: true,
    outreach_id: (inserted as { id: string } | null)?.id ?? null,
    status: (inserted as { status: string } | null)?.status ?? 'pending',
    source,
    intensity,
    affect,
    preview: message.slice(0, 120),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
