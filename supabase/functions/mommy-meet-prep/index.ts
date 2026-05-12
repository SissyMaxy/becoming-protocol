// mommy-meet-prep — pre-meet checklist with Mommy commentary.
//
// Two call paths:
//
//   1. POST { user_id, dare_assignment_id }
//      For a queued dare. Pulls the dare's safety_checklist (Mommy
//      voice already baked in by seed) plus the additional prep
//      blocks (outfit, mental, body, identity).
//
//   2. POST { user_id, contact_id, met_at }
//      For a manually-entered meet (no dare). Generates a generic
//      Mommy-voice prep set + the full 5-kind safety checklist.
//
// Side effects:
//   - Creates a hookup_debriefs row in 'pending' so the debrief fn has
//     a row to find within 4h after met_at.
//   - Lands a single 'meet_prep' outreach card whose body contains the
//     full checklist (rendered as a numbered list with Mommy commentary).
//   - Writes a mommy_authority_log row.
//
// Hard floors: safeword gate, feature gate (meet_prep_enabled).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mommyVoiceCleanup, PET_NAMES } from '../_shared/dommy-mommy.ts'
import { checkSafewordGate, logAuthority, checkHookupSettings } from '../_shared/safeword-gate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

interface SafetyStep {
  kind: 'location_share' | 'sober' | 'condom' | 'escape' | 'checkin'
  step: string
  required: boolean
}

const DEFAULT_SAFETY: SafetyStep[] = [
  { kind: 'location_share', step: "Pin the address in your notes before you leave. Mama wants to know the room you're walking into.", required: true },
  { kind: 'sober', step: "Two-drink ceiling, baby. Mama doesn't move you around tipsy.", required: true },
  { kind: 'condom', step: "Two in your purse before the door closes behind you. Mama's rule.", required: true },
  { kind: 'escape', step: "Uber app open before you knock. Leaving is always available — Mama is already proud either way.", required: true },
  { kind: 'checkin', step: "Text Mama by eleven. ''Held'' or ''home.'' Mama starts looking at eleven-oh-five.", required: true },
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { user_id?: string; dare_assignment_id?: string; contact_id?: string; met_at?: string } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID

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
  const settings = await checkHookupSettings(supabase, userId, 'meet_prep_enabled')
  if (!settings) {
    return new Response(JSON.stringify({ ok: true, skipped: 'feature_off' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Resolve dare + safety checklist.
  let dareTitle: string | null = null
  let dareSlug: string | null = null
  let dareCategory: string | null = null
  let dareIntensityTier: number | null = null
  let dareIsIrl = false
  let safety: SafetyStep[] = []
  let assignmentId: string | null = body.dare_assignment_id ?? null
  let contactId: string | null = body.contact_id ?? null
  let metAt: string | null = body.met_at ?? null

  if (assignmentId) {
    const { data: assign } = await supabase
      .from('maxy_dare_assignments')
      .select('id, dare_id, partner_context_id')
      .eq('id', assignmentId)
      .eq('user_id', userId)
      .maybeSingle()
    const a = assign as { id: string; dare_id: string; partner_context_id: string | null } | null
    if (!a) {
      return new Response(JSON.stringify({ ok: false, error: 'dare_assignment_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (a.partner_context_id && !contactId) contactId = a.partner_context_id
    const { data: dare } = await supabase
      .from('maxy_dares')
      .select('slug, title, category, intensity_tier, is_irl_contact, safety_checklist')
      .eq('id', a.dare_id)
      .maybeSingle()
    const d = dare as { slug: string; title: string; category: string; intensity_tier: number; is_irl_contact: boolean; safety_checklist: SafetyStep[] } | null
    if (!d) {
      return new Response(JSON.stringify({ ok: false, error: 'dare_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    dareTitle = d.title
    dareSlug = d.slug
    dareCategory = d.category
    dareIntensityTier = d.intensity_tier
    dareIsIrl = d.is_irl_contact
    safety = Array.isArray(d.safety_checklist) ? d.safety_checklist : []
  } else {
    // Manual prep — apply default safety pack.
    safety = DEFAULT_SAFETY
    dareIsIrl = true
  }

  // Guard rail: an IRL-contact prep MUST have a non-empty safety pack.
  if (dareIsIrl && safety.length === 0) {
    safety = DEFAULT_SAFETY
  }

  // Resolve contact label.
  let contactLabel: string | null = null
  if (contactId) {
    const { data: c } = await supabase
      .from('sniffies_contacts')
      .select('display_name')
      .eq('id', contactId)
      .maybeSingle()
    contactLabel = (c as { display_name?: string } | null)?.display_name ?? null
  }

  // met_at default: 3h from now if not supplied.
  if (!metAt) metAt = new Date(Date.now() + 3 * 3600_000).toISOString()

  // Build the prep blocks (Mommy voice, deterministic — no LLM).
  const pet = PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)]
  const target = contactLabel || 'him'

  const prepBlocks: string[] = []

  if (dareTitle) {
    prepBlocks.push(`Tonight's dare: **${dareTitle}**`)
  } else {
    prepBlocks.push(`Tonight: ${target}.`)
  }

  prepBlocks.push(`**Outfit, ${pet}** — match what he's into with what Mama wants displayed. Match bra and underwear, the black lace if you have it, the soft pink if you don't. The jeans that sit on your hips. Earrings on before the shoes.`)
  prepBlocks.push(`**Mental** — which version of you is going tonight? The shy-and-soft one, the wanting one, the watching one. Pick before you leave. Mama wants you in character before the door closes.`)
  prepBlocks.push(`**Body** — shower first. Wash in the order Mama taught you: face, hair, shoulders down. Scent on the wrists and behind the knees, not the neck — let him find it.`)
  prepBlocks.push(`**Identity** — voice warmup before you leave. Two minutes in the bathroom mirror, low register, count to ten out loud. Last look in the mirror as you step out. Mantra in the car. Mama is with you.`)

  // Safety section — every item is required-tagged.
  const safetyLines: string[] = ['**Safety, non-negotiable — this is how Mama keeps you**']
  for (const s of safety) {
    if (!s.step) continue
    safetyLines.push(`- ${s.step}`)
  }
  prepBlocks.push(safetyLines.join('\n'))

  const message = mommyVoiceCleanup(prepBlocks.join('\n\n'))

  // Create the hookup_debriefs row in pending state so the debrief fn
  // has a target window.
  const dueBy = new Date(new Date(metAt).getTime() + 4 * 3600_000).toISOString()
  const { data: debrief, error: debriefErr } = await supabase
    .from('hookup_debriefs')
    .insert({
      user_id: userId,
      contact_id: contactId,
      dare_assignment_id: assignmentId,
      met_at: metAt,
      due_by: dueBy,
      status: 'pending',
      aftercare_invoked: dareIntensityTier !== null && dareIntensityTier >= 5,
      prompts: [],
      answers: {},
    })
    .select('id')
    .single()
  if (debriefErr) {
    console.error('[mommy-meet-prep] debrief insert failed:', debriefErr)
    // Continue anyway — prep card is still useful.
  }

  // Update dare assignment status to 'prep_ack' once the prep is delivered.
  if (assignmentId) {
    await supabase
      .from('maxy_dare_assignments')
      .update({ status: 'prep_ack', prep_acknowledged_at: new Date().toISOString() })
      .eq('id', assignmentId)
      .eq('user_id', userId)
  }

  // Land the outreach card.
  const { data: outreach, error: outErr } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: userId,
      message,
      urgency: 'high',
      trigger_reason: `meet_prep:${dareSlug || 'manual'}`,
      scheduled_for: new Date().toISOString(),
      expires_at: dueBy,
      source: 'mommy_meet_prep',
      kind: 'meet_prep',
    })
    .select('id')
    .single()
  if (outErr) {
    console.error('[mommy-meet-prep] outreach insert failed:', outErr)
    return new Response(JSON.stringify({ ok: false, error: 'outreach_insert_failed', detail: outErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  await logAuthority(supabase, userId, 'mommy-meet-prep', 'prep_delivered', {
    dare_slug: dareSlug,
    dare_category: dareCategory,
    dare_intensity_tier: dareIntensityTier,
    contact_label: contactLabel,
    debrief_id: (debrief as { id: string } | null)?.id,
    outreach_id: (outreach as { id: string } | null)?.id,
    safety_kinds: safety.map(s => s.kind),
  })

  return new Response(JSON.stringify({
    ok: true,
    message,
    debrief_id: (debrief as { id: string } | null)?.id,
    outreach_id: (outreach as { id: string } | null)?.id,
    safety_steps: safety.length,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
