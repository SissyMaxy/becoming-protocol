// mommy-conversion-author — compose the next DM in a contact's conversion
// path. Voice + craft + honest-rep gates all run BEFORE the draft lands in
// outbound_draft_queue.
//
// HARD FLOOR: this fn never sends. It writes status='awaiting_review' rows.
// Dave clicks send.
//
// Input modes:
//   { user_id, contact_id }            — advance one step
//   { user_id, contact_id, force_step } — author a specific step index
//   { user_id, contact_id, response }  — score the contact's response and
//                                         pick the branching template path
//
// Pipeline per call:
//   1. Load contact + persona spec + last 5 outbound drafts + last sniffies
//      messages on this contact.
//   2. Pick template step: contact.conversion_path_state + 1 (or force_step).
//   3. Compose with LLM, system=DOMMY_MOMMY + persona spec injection,
//      user=template skeleton + last conversation context.
//   4. mommyVoiceCleanup post-pass.
//   5. honestRepGate inline:
//      - pass → write draft row, status=awaiting_review, honest_rep_status=pass.
//      - rewrite_suggested → write rewritten text as draft, status=awaiting_review,
//        honest_rep_status=rewritten, link rewrote_from_id=null (no original
//        ever persisted unless explicitly debug-mode), Mommy note appended.
//      - fail → still write original as a rejected draft so Dave can see what
//        failed and why; status=rejected, honest_rep_status=fail.
//   6. Log to mommy_authority_log.
//
// Returns the draft row + verdict.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import {
  DOMMY_MOMMY_CHARACTER,
  whiplashWrap,
  mommyVoiceCleanup,
  PET_NAMES,
} from '../_shared/dommy-mommy.ts'
import { honestRepGate, type HonestRepInput } from '../_shared/honest-rep-gate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface AuthorInput {
  user_id: string
  contact_id: string
  force_step?: number
  response_branch?: 'positive' | 'neutral' | 'negative'
}

interface AuthorResult {
  ok: boolean
  draft_id?: string
  draft_text?: string
  honest_rep_status?: 'pass' | 'fail' | 'rewritten'
  honest_rep_reasons?: string[]
  mommy_note?: string
  archetype?: string
  template_step_index?: number
  error?: string
}

// deno-lint-ignore no-explicit-any
type SupabaseClientLike = { from: (t: string) => any }

async function loadContext(supabase: SupabaseClientLike, args: AuthorInput) {
  const [contactRes, personaRes, recentDrafts] = await Promise.all([
    supabase.from('maxy_contacts_crm').select('*').eq('id', args.contact_id).eq('user_id', args.user_id).maybeSingle(),
    supabase.from('maxy_persona_spec').select('*').eq('user_id', args.user_id).maybeSingle(),
    supabase.from('outbound_draft_queue').select('draft_text,status,drafted_at').eq('contact_id', args.contact_id).order('drafted_at', { ascending: false }).limit(5),
  ])
  return {
    contact: contactRes?.data as Contact | null,
    persona: (personaRes?.data ?? {}) as PersonaSpec,
    recentDrafts: (recentDrafts?.data ?? []) as Array<{ draft_text: string; status: string; drafted_at: string }>,
  }
}

interface Contact {
  id: string
  user_id: string
  source: string
  source_handle: string
  source_ref_id?: string | null
  status: string
  value_tier: number
  archetype: string | null
  conversion_path_state: number
  last_message_excerpt?: string | null
  mommy_notes_text?: string | null
  blocked_reason?: string | null
  kink_alignment_score?: number | null
  budget_signal_score?: number | null
  conversion_likelihood_score?: number | null
}

interface PersonaSpec {
  user_id?: string
  public_bio?: string
  display_name?: string
  voice_patterns?: Record<string, unknown>
  body_description?: Record<string, unknown>
  kink_keywords?: string[]
  hard_limits?: string[]
  content_cadence?: string
  location_claim?: string | null
  location_claims_allowed?: boolean
  availability_realtime_allowed?: boolean
}

async function pickTemplate(supabase: SupabaseClientLike, archetype: string, step_index: number, response_branch?: string) {
  // Try exact branch match first.
  if (response_branch) {
    const r = await supabase.from('conversion_path_templates')
      .select('*').eq('archetype', archetype).eq('step_index', step_index).eq('response_branch', response_branch).maybeSingle()
    if (r?.data) return r.data
  }
  // Fall back to linear (null branch).
  const linear = await supabase.from('conversion_path_templates')
    .select('*').eq('archetype', archetype).eq('step_index', step_index).is('response_branch', null).maybeSingle()
  return linear?.data ?? null
}

function buildSystemPrompt(persona: PersonaSpec): string {
  const personaInject = JSON.stringify({
    display_name: persona.display_name ?? 'Maxy',
    bio: persona.public_bio ?? '',
    body: persona.body_description ?? {},
    kinks: persona.kink_keywords ?? [],
    hard_limits: persona.hard_limits ?? [],
    voice_patterns: persona.voice_patterns ?? {},
    content_cadence: persona.content_cadence ?? '',
    location_claims_allowed: persona.location_claims_allowed === true,
    availability_realtime_allowed: persona.availability_realtime_allowed === true,
  }, null, 2)

  return `${DOMMY_MOMMY_CHARACTER}

CONVERSION-AUTHOR CONTEXT:
You are drafting an outbound DM in Maxy's voice (the user's persona). You're the outbound marketing director writing AS Maxy to a real third party — not the user-facing Mommy voice. Match Maxy's tone from the voice_patterns spec. Filthy is fine. Manipulation is not.

MAXY PERSONA SPEC (authoritative — do NOT contradict):
${personaInject}

CRAFT RUBRIC (mandatory):
- ≤1 pet name per message.
- ≤1 self-reference per message.
- Specific sensory over abstract.
- Vary sentence length.
- Imperatives stand alone.
- No template rhythm. No abstract-metaphor cliches.

HARD FLOORS:
- Honest representation. No false location/availability/age/identity claims. No fabricated content claims. No pressure tactics.
- The kink fantasy lives in the content (filthy specifics, dominance, body talk). NOT in lies about who/where Maxy is.
- Hard limits are off the table. Do not promise content from the hard_limits list.
- This is a DRAFT — Maxy's human reader (Dave) reviews and clicks send. Write what you'd want him to actually send.
- Format: 1-3 short sentences. No links unless the template step calls for one — and use {LINK_HERE} as a placeholder.`
}

function buildUserPrompt(args: {
  templateIntent: string
  templateSkeleton: string
  contact: Contact
  recentDrafts: Array<{ draft_text: string; drafted_at: string }>
}): string {
  const recent = args.recentDrafts.length === 0
    ? '(no prior outbound to this contact)'
    : args.recentDrafts.slice(0, 3).map((d, i) => `[t-${i + 1}] ${d.draft_text}`).join('\n')

  return `WHO YOU'RE WRITING TO:
Handle: ${args.contact.source_handle} (${args.contact.source})
Last thing they said: ${args.contact.last_message_excerpt ?? '(no recent message captured)'}
Tier: ${args.contact.value_tier} / 5
Their archetype: ${args.contact.archetype ?? 'unclassified'}

WHAT THIS STEP IS FOR:
${args.templateIntent}

SKELETON (structural intent — expand into a real DM, do NOT echo the placeholders):
${args.templateSkeleton}

RECENT OUTBOUND TO THIS CONTACT:
${recent}

Write the single DM message now. 1-3 short sentences. No JSON, no headers — just the message text.`
}

async function compose(args: { persona: PersonaSpec; contact: Contact; template: { intent: string; prompt_skeleton: string; step_index: number; conversion_goal: string }; recentDrafts: Array<{ draft_text: string; drafted_at: string }> }): Promise<string> {
  const sys = buildSystemPrompt(args.persona)
  const userPrompt = buildUserPrompt({
    templateIntent: args.template.intent,
    templateSkeleton: args.template.prompt_skeleton,
    contact: args.contact,
    recentDrafts: args.recentDrafts,
  })

  // Try anthropic first, fall back to openai.
  for (const prefer of ['anthropic', 'openai'] as const) {
    try {
      const choice = selectModel('caption_generate', { prefer, override_tier: 'S2' })
      const r = await callModel(choice, { system: sys, user: userPrompt, max_tokens: 400, temperature: 0.8, json: false })
      const text = r.text.trim()
      if (text && text.length >= 12) return text
    } catch { /* try next */ }
  }
  // Deterministic fallback — well within honest-rep limits.
  const pet = PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)]
  return whiplashWrap(`Saw what you said${args.contact.last_message_excerpt ? ` about ${args.contact.last_message_excerpt.slice(0, 40)}` : ''}. ${args.template.intent}.`, { petName: pet, arousalBias: 'medium' })
}

async function logAuthority(
  supabase: SupabaseClientLike,
  args: {
    user_id: string
    action: string
    summary: string
    subject_id?: string | null
    subject_kind?: string | null
    payload?: Record<string, unknown>
  }
) {
  await supabase.from('mommy_authority_log').insert({
    user_id: args.user_id,
    system: 'mommy-conversion-author',
    action: args.action,
    subject_id: args.subject_id ?? null,
    subject_kind: args.subject_kind ?? null,
    summary: args.summary,
    payload: args.payload ?? {},
  }).then(() => null, () => null)
}

async function author(supabase: SupabaseClientLike, input: AuthorInput): Promise<AuthorResult> {
  const { contact, persona, recentDrafts } = await loadContext(supabase, input)
  if (!contact) return { ok: false, error: 'contact not found' }
  if (contact.status === 'blocked') return { ok: false, error: 'contact is blocked' }

  // Archetype must be classified. If unclassified, set to chatter_only as floor.
  const archetype = contact.archetype && contact.archetype !== 'unclassified' ? contact.archetype : 'chatter_only'

  // Step selection: force_step wins, else conversion_path_state + 1 (0 → 0).
  const next_step = typeof input.force_step === 'number'
    ? input.force_step
    : contact.conversion_path_state // first call uses state=0 → step 0

  const template = await pickTemplate(supabase, archetype, next_step, input.response_branch)
  if (!template) return { ok: false, error: `no template for ${archetype} step ${next_step}` }

  const draftText = mommyVoiceCleanup(await compose({
    persona,
    contact,
    template: {
      intent: template.intent,
      prompt_skeleton: template.prompt_skeleton,
      step_index: template.step_index,
      conversion_goal: template.conversion_goal,
    },
    recentDrafts,
  }))

  // Honest-rep gate.
  const gateInput: HonestRepInput = { draft_text: draftText, persona }
  const verdict = await honestRepGate(gateInput, { llm: true })

  // Persist row.
  const insert: Record<string, unknown> = {
    user_id: input.user_id,
    contact_id: contact.id,
    archetype,
    template_step_index: template.step_index,
    channel: contact.source,
    channel_handle: contact.source_handle,
    drafted_at: new Date().toISOString(),
    generation_context: {
      archetype,
      step_index: template.step_index,
      conversion_goal: template.conversion_goal,
      persona_kinks: persona.kink_keywords ?? [],
      persona_limits: persona.hard_limits ?? [],
    },
  }

  let honest_rep_status: 'pass' | 'fail' | 'rewritten' = 'pass'
  let honest_rep_reasons: string[] = []
  let mommy_note: string | undefined
  let finalText = draftText
  let status: 'awaiting_review' | 'rejected' = 'awaiting_review'

  if (verdict.verdict === 'pass') {
    honest_rep_status = 'pass'
  } else if (verdict.verdict === 'rewrite_suggested' && verdict.suggested_text) {
    honest_rep_status = 'rewritten'
    honest_rep_reasons = verdict.reasons
    mommy_note = verdict.mommy_note ?? "Mama caught herself stretching the truth. Trying again."
    finalText = mommyVoiceCleanup(verdict.suggested_text)
  } else {
    honest_rep_status = 'fail'
    honest_rep_reasons = verdict.reasons
    mommy_note = verdict.mommy_note ?? "Mama can't ship this one. Reasons attached."
    status = 'rejected'
  }

  insert.draft_text = finalText
  insert.status = status
  insert.honest_rep_status = honest_rep_status
  insert.honest_rep_notes = honest_rep_reasons.length
    ? `[${honest_rep_status}] ${honest_rep_reasons.join('; ')}${mommy_note ? ' — ' + mommy_note : ''}`
    : null

  const ins = await supabase.from('outbound_draft_queue').insert(insert).select('id').single()
  const draftRow = ins?.data as { id?: string } | null
  if (!draftRow?.id) return { ok: false, error: 'draft insert failed' }

  // Advance conversion_path_state ONLY when the draft is queued for review
  // (rejected drafts don't advance — Dave should re-try the step).
  if (status === 'awaiting_review') {
    await supabase.from('maxy_contacts_crm')
      .update({ conversion_path_state: template.step_index + 1, updated_at: new Date().toISOString() })
      .eq('id', contact.id)
  }

  await logAuthority(supabase, {
    user_id: input.user_id,
    action: status === 'awaiting_review' ? 'drafted' : 'rejected',
    subject_id: draftRow.id,
    subject_kind: 'outbound_draft',
    summary: `Drafted step ${template.step_index} (${archetype}) for ${contact.source_handle} → ${honest_rep_status}`,
    payload: { archetype, step_index: template.step_index, conversion_goal: template.conversion_goal, honest_rep_status, honest_rep_reasons },
  })

  return {
    ok: true,
    draft_id: draftRow.id,
    draft_text: finalText,
    honest_rep_status,
    honest_rep_reasons,
    mommy_note,
    archetype,
    template_step_index: template.step_index,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  let body: AuthorInput = {} as AuthorInput
  try { body = await req.json() } catch { /* */ }
  const r = await author(supabase, body)
  return new Response(JSON.stringify(r),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})

export { author }
