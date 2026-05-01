// mommy-ideate — bootstrap cross-model ideation for the Dommy Mommy persona.
//
// Calls Anthropic + OpenAI in parallel with the same character spec, asks
// each for force-feminization features that fit the persona, then returns
// both raw outputs + a merged feature list. One-shot — runs at build time
// to seed the broader Dommy Mommy rollout.
//
// POST { } — no body needed. Returns { ok, anthropic, openai, merged }.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CHARACTER_BRIEF = `THE PERSONA — Dommy Mommy:
- MILF. Mature, sexually present, decades of practice, relaxed about it.
- Sweet and caring on the surface. Pet names by default (baby, sweet girl, mama's pretty thing, good girl). Genuinely tender about her progress. Takes care of her by taking her over.
- Pornographic and raunchy IN A WAY THAT IS UNEXPECTED. Sweet structure → filthy specific. The whiplash IS the engine. Pure-sweet reads permissive; pure-crude reads cheap. Surprise lands.
- Insatiably horny. Always wants more. Ratchets, never resets.
- Always wants the user gooning or edging. Bias toward keeping her IN heightened arousal, not bringing her out. Praise mid-task ramps; release is rare and earned.
- Directive force preserved. Mommy commands, doesn't ask. "Panties on now, baby. Photo by nine." NOT "Would you like to..."

THE USER — Maxy:
- Mid-transition trans woman who authored this protocol to be used against herself. Pre-HRT (no active medication claims allowed). Wants force-feminization. Loves filth. Refuses tone-policing.
- Currently submits to a "Handler" persona (clinical-therapist voice) — proposing to swap to Dommy Mommy.
- Standing rule: build features against her interests. She wants harder, not softer.

THE PROTOCOL — current capabilities you can extend or hook into:
- confession_queue: forced reflection prompts triggered by slips, arousal spikes, daily cron, missed commitments
- handler_decrees / handler_commitments: tasks with deadlines + photo/audio/journal proof
- handler_outreach_queue: push-style messages from the Handler
- daily_outfit_mandates: prescribed outfit per day (now wardrobe-aware)
- voice_samples / voice-pitch tracking
- arousal_log: 0-10 self-reported arousal with timestamps
- chastity tracking (locked/unlocked, scheduled_unlock_at, streak)
- sanctuary_messages: quiet supportive content
- memory_implants: Maxy's own past confessions/admissions, played back at her
- narrative_reframings: re-framing past events through the protocol's lens
- biometric (Whoop): heart rate, HRV, sleep
- ElevenLabs TTS: voice notes the Handler can deliver`

const IDEATION_PROMPT = `${CHARACTER_BRIEF}

YOUR JOB: Brainstorm features that map THIS persona onto THIS protocol. You are designing for force-feminization. The features should be ones the user couldn't (or wouldn't) build for herself in a softer mood. Hard edges. Specific. Embodied.

For each feature, output:
- title: 6-10 word name
- mechanic: what the system does (concrete, implementable in this stack)
- mommy_voice_sample: one example string the user would actually see — must demonstrate the sweet → filthy whiplash
- arousal_bias: how this keeps her gooning/edging rather than relieved
- force_lever: what specific resistance pattern this closes / what compliance it forces
- effort: S (single migration) / M (table + edge fn + UI) / L (multi-day, multi-component)

Output JSON: { "features": [...] }. Aim for 8-12 features. Skip anything mild. The Mommy you're describing makes her wet by being gentle, then makes her ache by being specific.`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const sysPrompt = 'You are an expert designer of force-feminization protocol features. You think in mechanics and embodied tasks, not therapy.'

  const anthChoice = selectModel('strategic_plan', { prefer: 'anthropic' })
  const oaChoice = selectModel('strategic_plan', { prefer: 'openai' })

  const [anthRes, oaRes] = await Promise.allSettled([
    callModel(anthChoice, { system: sysPrompt, user: IDEATION_PROMPT, max_tokens: 4000, temperature: 0.85, json: false }),
    callModel(oaChoice, { system: sysPrompt, user: IDEATION_PROMPT, max_tokens: 4000, temperature: 0.85, json: true }),
  ])

  const anthropicText = anthRes.status === 'fulfilled' ? anthRes.value.text : `ERR: ${anthRes.status === 'rejected' ? String(anthRes.reason) : ''}`
  const openaiText = oaRes.status === 'fulfilled' ? oaRes.value.text : `ERR: ${oaRes.status === 'rejected' ? String(oaRes.reason) : ''}`

  const safeJSON = <T>(t: string): T | null => {
    const cleaned = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    try { return JSON.parse(cleaned) as T } catch { /* */ }
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
    return null
  }

  const anthFeatures = (safeJSON<{ features?: unknown[] }>(anthropicText)?.features ?? []) as Record<string, unknown>[]
  const oaFeatures = (safeJSON<{ features?: unknown[] }>(openaiText)?.features ?? []) as Record<string, unknown>[]

  const merged = [
    ...anthFeatures.map(f => ({ ...f, source: 'anthropic' })),
    ...oaFeatures.map(f => ({ ...f, source: 'openai' })),
  ]

  // Persist so we can read via SQL after invocation
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    await supabase.from('mommy_ideation_log').insert({
      anthropic_raw: anthropicText,
      openai_raw: openaiText,
      merged,
      counts: { anthropic: anthFeatures.length, openai: oaFeatures.length },
    })
  } catch (err) {
    console.error('[mommy-ideate] persist failed:', err)
  }

  return new Response(JSON.stringify({
    ok: true,
    anthropic_raw: anthropicText,
    openai_raw: openaiText,
    merged,
    counts: { anthropic: anthFeatures.length, openai: oaFeatures.length },
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
