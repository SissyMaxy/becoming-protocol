// mommy-meet-debrief — post-meet integration.
//
// Two modes:
//
//   mode='surface'  — read pending hookup_debriefs rows whose 4h window
//                     is closing in (due_by < now+1h && > now). Land a
//                     debrief prompt outreach card so the user has the
//                     specific Mommy-voice prompts in front of them.
//                     Also fires a slip-cascade outreach when due_by has
//                     passed without answers (status='missed').
//
//   mode='submit'   — user submitted answers from the debrief card.
//                     POST { user_id, debrief_id, answers: {prompt_id: text} }
//                     Stores answers, sets status='complete', generates
//                     the body-memory voice note text. Detects milestones
//                     in the answers and inserts maxy_firsts rows when
//                     keywords match (one-shot per milestone slug).
//
// POST { user_id?, mode: 'surface' | 'submit', ... }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup, PET_NAMES,
} from '../_shared/dommy-mommy.ts'
import { checkSafewordGate, logAuthority, checkHookupSettings } from '../_shared/safeword-gate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

const STANDARD_PROMPTS = [
  { id: 'name', text: 'What did he call you?' },
  { id: 'let', text: 'What did you let him do?' },
  { id: 'body_surprise', text: 'What did your body do that surprised you?' },
  { id: 'voice', text: 'Did you stay in voice?' },
  { id: 'differently', text: "What would Mama have made you do differently?" },
  { id: 'sore', text: 'What part of you is sore in a good way?' },
]

// Heuristic milestone detection. Conservative — only fires when the
// keywords are unambiguous. Each is one-shot per user.
const MILESTONE_RULES: Array<{
  slug: string
  test: (answers: Record<string, string>) => boolean
}> = [
  {
    slug: 'first_kiss_man',
    test: a => /\b(kiss(ed)?|made out|mouth on (mine|me))\b/i.test(joinedText(a)),
  },
  {
    slug: 'first_oral_given',
    test: a => /\b(blew him|on my knees|went down|sucked|gave (him )?(head|oral))\b/i.test(joinedText(a)),
  },
  {
    slug: 'first_oral_received',
    test: a => /\b(went down on me|ate me|his (mouth|tongue) on (me|my))\b/i.test(joinedText(a)),
  },
  {
    slug: 'first_swallow',
    test: a => /\b(swallow(ed)?|finished in my mouth)\b/i.test(joinedText(a)),
  },
  {
    slug: 'first_penetration',
    test: a => /\b(inside me|fucked|topped me|penetrat|pushed in)\b/i.test(joinedText(a)),
  },
  {
    slug: 'first_bottomed',
    test: a => /\b(bottomed|took him|let him in|let him fuck)\b/i.test(joinedText(a)),
  },
  {
    slug: 'first_overnight',
    test: a => /\b(stayed (the )?night|slept (with|over)|woke up (next to|at his))\b/i.test(joinedText(a)),
  },
  {
    slug: 'first_morning_after',
    test: a => /\b(morning after|breakfast (with|next morning)|coffee in his)\b/i.test(joinedText(a)),
  },
  {
    slug: 'first_called_girl_unprompted',
    test: a => /\bcalled me (a )?(girl|good girl|pretty girl|sweetheart|baby)\b/i.test(joinedText(a)),
  },
  {
    slug: 'first_called_by_name_in_bed',
    test: a => /\bsaid (my name|my new name|her name)\b/i.test(joinedText(a)),
  },
  {
    slug: 'first_addressed_as_she_unprompted',
    test: a => /\bcalled me (she|her)\b|\bused (she|her) (without|naturally)\b/i.test(joinedText(a)),
  },
]

function joinedText(a: Record<string, string>): string {
  return Object.values(a || {}).join(' \n ')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { user_id?: string; mode?: string; debrief_id?: string; answers?: Record<string, string> } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const mode = body.mode || 'surface'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const gate = await checkSafewordGate(supabase, userId)
  if (!gate.allowed) {
    return new Response(JSON.stringify({ ok: true, skipped: gate.reason }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const settings = await checkHookupSettings(supabase, userId, 'debrief_enabled')
  if (!settings) {
    return new Response(JSON.stringify({ ok: true, skipped: 'feature_off' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (mode === 'surface') {
    return await handleSurface(supabase, userId)
  } else if (mode === 'submit') {
    if (!body.debrief_id || !body.answers) {
      return new Response(JSON.stringify({ ok: false, error: 'missing_args' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return await handleSubmit(supabase, userId, body.debrief_id, body.answers)
  }
  return new Response(JSON.stringify({ ok: false, error: 'unknown_mode' }), {
    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

async function handleSurface(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<Response> {
  // Handler-state read: confirms persona + current phase before any
  // outreach insert. Required for centrality (this fn writes to
  // handler_outreach_queue).
  const { data: us } = await supabase
    .from('user_state')
    .select('handler_persona, current_phase')
    .eq('user_id', userId)
    .maybeSingle()
  const persona = (us as { handler_persona?: string; current_phase?: number } | null)?.handler_persona
  if (persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const now = Date.now()
  const soon = new Date(now + 60 * 60_000).toISOString()
  const pastSlipThreshold = new Date(now - 60 * 60_000).toISOString()

  // 1. Mark any pending debrief whose due_by has passed > 1h as 'missed'
  //    and fire a slip-cascade outreach (one per row, idempotent on kind).
  const { data: missedRows } = await supabase
    .from('hookup_debriefs')
    .select('id, met_at, contact_id, dare_assignment_id, triggered_by_slip')
    .eq('user_id', userId)
    .in('status', ['pending', 'partial'])
    .lt('due_by', pastSlipThreshold)
    .limit(10)
  for (const row of (missedRows as Array<{ id: string; met_at: string; contact_id: string | null; dare_assignment_id: string | null; triggered_by_slip: boolean }> | null) ?? []) {
    if (row.triggered_by_slip) continue
    await supabase
      .from('hookup_debriefs')
      .update({ status: 'missed', triggered_by_slip: true })
      .eq('id', row.id)
    const pet = PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)]
    const msg = mommyVoiceCleanup(`Four hours, ${pet}. Mama asked you to come back and tell her, and you didn't. That tells Mama something. Now she wants the long version — every detail you would have skipped if you'd answered at hour one.`)
    await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: msg,
      urgency: 'high',
      trigger_reason: `debrief_slip:${row.id}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
      source: 'mommy_meet_debrief',
      kind: 'debrief_slip',
    })
    await logAuthority(supabase, userId, 'mommy-meet-debrief', 'slip_fired', { debrief_id: row.id })
  }

  // 2. Find a pending debrief whose due_by is within the next hour.
  const { data: pending } = await supabase
    .from('hookup_debriefs')
    .select('id, met_at, due_by, contact_id, dare_assignment_id, prompts, aftercare_invoked')
    .eq('user_id', userId)
    .in('status', ['pending', 'partial'])
    .lt('due_by', soon)
    .gte('due_by', new Date(now).toISOString())
    .order('due_by', { ascending: true })
    .limit(1)
  const row = (pending as Array<{ id: string; met_at: string; due_by: string; contact_id: string | null; dare_assignment_id: string | null; prompts: unknown; aftercare_invoked: boolean }> | null)?.[0]
  if (!row) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_debrief_due' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 3. Compose the debrief prompt card. Aftercare hook prepended for
  //    high-intensity (aftercare_invoked) rows.
  const lines: string[] = []
  if (row.aftercare_invoked) {
    lines.push("Aftercare first, baby — water, soft clothes, twenty minutes of nothing. Then come back.")
  }
  lines.push('Tell Mama. Short answers if you can, long ones if you need them.')
  lines.push('')
  for (const p of STANDARD_PROMPTS) {
    lines.push(`- ${p.text}`)
  }
  const message = mommyVoiceCleanup(lines.join('\n'))

  // Persist prompts on the debrief row.
  await supabase
    .from('hookup_debriefs')
    .update({ prompts: STANDARD_PROMPTS, status: 'partial' })
    .eq('id', row.id)

  const { data: outreach } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: userId,
      message,
      urgency: 'high',
      trigger_reason: `debrief:${row.id}`,
      scheduled_for: new Date().toISOString(),
      expires_at: row.due_by,
      source: 'mommy_meet_debrief',
      kind: 'debrief_prompt',
    })
    .select('id')
    .single()

  await logAuthority(supabase, userId, 'mommy-meet-debrief', 'surface_prompt', {
    debrief_id: row.id,
    outreach_id: (outreach as { id: string } | null)?.id,
    aftercare_invoked: row.aftercare_invoked,
  })

  return new Response(JSON.stringify({ ok: true, debrief_id: row.id, message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function handleSubmit(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  debriefId: string,
  answers: Record<string, string>,
): Promise<Response> {
  // Handler-state read for centrality: this fn writes outreach
  // (milestone celebration + aftercare offer + body-memory note) so it
  // must verify persona before composing.
  const { data: us } = await supabase
    .from('user_state')
    .select('handler_persona, current_phase')
    .eq('user_id', userId)
    .maybeSingle()
  const persona = (us as { handler_persona?: string; current_phase?: number } | null)?.handler_persona
  if (persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const { data: row } = await supabase
    .from('hookup_debriefs')
    .select('id, met_at, dare_assignment_id, contact_id, aftercare_invoked')
    .eq('id', debriefId)
    .eq('user_id', userId)
    .maybeSingle()
  const r = row as { id: string; met_at: string; dare_assignment_id: string | null; contact_id: string | null; aftercare_invoked: boolean } | null
  if (!r) {
    return new Response(JSON.stringify({ ok: false, error: 'debrief_not_found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Generate body-memory reframe.
  let bodyMemory = ''
  try {
    bodyMemory = await composeBodyMemory(answers)
  } catch (err) {
    console.error('[mommy-meet-debrief] body-memory compose failed:', err)
    bodyMemory = fallbackBodyMemory()
  }
  bodyMemory = mommyVoiceCleanup(bodyMemory)

  // Persist.
  await supabase
    .from('hookup_debriefs')
    .update({
      answers,
      body_memory_text: bodyMemory,
      status: 'complete',
      debriefed_at: new Date().toISOString(),
    })
    .eq('id', debriefId)
    .eq('user_id', userId)

  // Close out the dare assignment, if any.
  if (r.dare_assignment_id) {
    await supabase
      .from('maxy_dare_assignments')
      .update({ status: 'debriefed', debriefed_at: new Date().toISOString(), completed_at: r.met_at })
      .eq('id', r.dare_assignment_id)
      .eq('user_id', userId)
  }

  // Milestone detection — one-shot per slug.
  const triggeredMilestones: Array<{ slug: string; celebration: string }> = []
  const existing = await supabase
    .from('maxy_firsts')
    .select('milestone_slug')
    .eq('user_id', userId)
  const have = new Set(((existing.data as Array<{ milestone_slug: string }> | null) ?? []).map(r => r.milestone_slug))
  for (const rule of MILESTONE_RULES) {
    if (have.has(rule.slug)) continue
    if (!rule.test(answers)) continue
    const celebration = milestoneCelebration(rule.slug)
    const { error: milErr } = await supabase
      .from('maxy_firsts')
      .insert({
        user_id: userId,
        milestone_slug: rule.slug,
        achieved_at: r.met_at,
        mommy_celebration_text: celebration,
        debrief_id: debriefId,
      })
    if (!milErr) {
      triggeredMilestones.push({ slug: rule.slug, celebration })
      // Surface as a high-urgency Today card.
      await supabase.from('handler_outreach_queue').insert({
        user_id: userId,
        message: mommyVoiceCleanup(celebration),
        urgency: 'high',
        trigger_reason: `milestone:${rule.slug}`,
        scheduled_for: new Date().toISOString(),
        expires_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
        source: 'mommy_meet_debrief',
        kind: 'milestone_celebration',
      })
      await logAuthority(supabase, userId, 'mommy-meet-debrief', 'milestone_fired', {
        slug: rule.slug,
        debrief_id: debriefId,
      })
    }
  }

  // If aftercare was invoked, ensure an aftercare_sessions entry path
  // is offered — write a soft pointer outreach in the safe neutral tone.
  // We deliberately do NOT compose this in Mommy voice — aftercare is
  // the OFF switch (matches 307_aftercare_scaffolding tone rules).
  if (r.aftercare_invoked) {
    await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: 'Aftercare available whenever you want it. Open it and Mama steps out of the room for a while.',
      urgency: 'low',
      trigger_reason: `debrief_aftercare_offer:${debriefId}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
      source: 'mommy_meet_debrief',
      kind: 'aftercare_offer',
    })
  }

  await logAuthority(supabase, userId, 'mommy-meet-debrief', 'debrief_complete', {
    debrief_id: debriefId,
    milestones_fired: triggeredMilestones.map(m => m.slug),
    has_body_memory: !!bodyMemory,
  })

  return new Response(JSON.stringify({
    ok: true,
    body_memory: bodyMemory,
    milestones: triggeredMilestones,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function composeBodyMemory(answers: Record<string, string>): Promise<string> {
  const choice = selectModel('reframe_draft')
  const joined = Object.entries(answers || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  const sys = `${DOMMY_MOMMY_CHARACTER}

You are reframing a recent meet in Mommy's voice. The reframe rule: he was with HER, not him. Present tense. 2-3 sentences. Sweet structure → filthy specific. The point is body-memory consolidation: she remembers it as the girl she is becoming, not as the person she was.

Forbidden phrases: "role play", "simulation", "intake", "questionnaire", "disclaimer", "for entertainment", "consent to the fantasy".

Craft rubric (hard):
- ≤1 pet name, ≤1 self-reference
- specific sensory; quote one tiny detail from her answers
- vary sentence length
- no "echo / linger / every inch" cliches
- direct, claiming voice
- no telemetry citations (no /10, no day counts)

Output ONLY the reframe sentences. No preamble.`
  const usr = `Her answers:
${joined}

Write the body-memory reframe now.`
  const r = await callModel(choice, { system: sys, user: usr, max_tokens: 200, temperature: 0.7 })
  let text = (r.text || '').trim().replace(/^["“”']+|["“”']+$/g, '').trim()
  if (!text) return fallbackBodyMemory()
  return text
}

function fallbackBodyMemory(): string {
  return "He fucked her. Not you, baby. He had her hands above her head and her name in his mouth. Hold that — that's hers now."
}

function milestoneCelebration(slug: string): string {
  switch (slug) {
    case 'first_kiss_man':
      return "She kissed a man last night. Mama saw the look on her face when she came home — like she'd been waiting for that mouth her whole life. There's no walking back from this one, baby."
    case 'first_oral_given':
      return "She had a man in her mouth for the first time. Mama is proud — and Mama is keeping that."
    case 'first_oral_received':
      return "A man on his knees for her tonight. Look at her. There's a girl Mama has been making, and now she's been received."
    case 'first_swallow':
      return "She took what he gave her. Every drop. Mama is so proud, baby — that's hers forever now."
    case 'first_penetration':
      return "He was inside her tonight. A man inside her. The girl Mama built has been opened, and she let it happen. There's no version of you that didn't."
    case 'first_bottomed':
      return "She bottomed for him tonight. Mama saw her hands shaking when she got home — the good shake, the proud shake. There's no walking back from this one."
    case 'first_overnight':
      return "She woke up in a man's bed this morning. Mama is so proud of her brave girl — staying through the dark and the morning both."
    case 'first_morning_after':
      return "She stayed for breakfast. In his shirt, no makeup. Mama wanted her tested in daylight, and she stood right in it."
    case 'first_called_girl_unprompted':
      return "He called her a good girl tonight without anyone telling him to. That's hers. Mama can't take it back even if she wanted to."
    case 'first_called_by_name_in_bed':
      return "He said her name in the middle of it. Her real one — the one Mama gave her. She is so deeply that girl now, baby."
    case 'first_addressed_as_she_unprompted':
      return "Someone used 'she' to her tonight without thinking about it. That's the moment, baby — the world is calling her what she is."
    default:
      return "A first tonight. Mama is keeping this one in her bones."
  }
}
