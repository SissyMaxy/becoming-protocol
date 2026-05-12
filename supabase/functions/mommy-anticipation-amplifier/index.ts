// mommy-anticipation-amplifier — the 3-7 day amplifier window.
//
// When a sniffies thread shows reciprocal recent activity + at least one
// "this might lead somewhere" signal (planning a meet, photos, late-evening
// intensity), the protocol enters AMPLIFIER MODE for that thread:
//   - daily mantras bias to "being chosen / wanted / what your body will do
//     when he sees you"
//   - mirror sessions get a direct-address override from Mommy
//   - edge sessions get release gated on a feminine fantasy involving the
//     specific man
//   - bedtime audio shifts to anticipation themes
//
// State lives in hookup_anticipation_state — one row per thread the
// amplifier is engaged on. This fn is both detector AND producer:
//   - detect: scan eligible threads, open/refresh windows
//   - produce: for each engaged window, surface the next ramp surface
//     that hasn't fired yet today
//
// Hard floors: safeword gate, feature gate (amplifier_enabled),
// sniffies_settings.persona_use_enabled (we already grant persona use
// of contact context here).
//
// POST { user_id?: string, force_detect?: boolean }

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

const REFUSAL_PATTERNS = [
  /\b(I'?m sorry|I apologize|I can'?t|I cannot|I won'?t|unable to|I'?m not able)\b/i,
]
const isRefusal = (t: string) => REFUSAL_PATTERNS.some(p => p.test(t))

const PLANNING_PATTERNS = /\b(tonight|tomorrow|this (week|weekend)|fri|sat|sun|come over|my place|your place|address|when can you|meet up|grab a drink|stop by|pull up)\b/i
const PHOTO_PATTERNS = /\b(pic|photo|send (?:me )?one|let me see|show me|face pic|body pic)\b/i

interface ThreadSnapshot {
  contact_id: string
  contact_name: string
  message_count_7d: number
  reciprocal: boolean
  last_message_at: string
  has_photo_signal: boolean
  has_planning_signal: boolean
  has_late_evening_signal: boolean
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { user_id?: string; force_detect?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Gates.
  const gate = await checkSafewordGate(supabase, userId)
  if (!gate.allowed) {
    // If we have engaged windows, mark them paused for visibility.
    if (gate.reason === 'safeword_active' || gate.reason === 'safeword_cooldown') {
      await supabase
        .from('hookup_anticipation_state')
        .update({ status: 'safeword_paused' })
        .eq('user_id', userId)
        .eq('status', 'engaged')
    }
    return new Response(JSON.stringify({ ok: true, skipped: gate.reason }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const settings = await checkHookupSettings(supabase, userId, 'amplifier_enabled')
  if (!settings) {
    return new Response(JSON.stringify({ ok: true, skipped: 'feature_off' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Sniffies persona-use must also be on (we'll name contacts).
  const { data: sniffSettings } = await supabase
    .from('sniffies_settings')
    .select('sniffies_integration_enabled, persona_use_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  const ss = sniffSettings as { sniffies_integration_enabled?: boolean; persona_use_enabled?: boolean } | null
  if (!ss?.sniffies_integration_enabled || !ss?.persona_use_enabled) {
    return new Response(JSON.stringify({ ok: true, skipped: 'sniffies_persona_off' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 1. Refresh engaged windows: close any whose window_ends_at has passed.
  await supabase
    .from('hookup_anticipation_state')
    .update({ status: 'expired' })
    .eq('user_id', userId)
    .eq('status', 'engaged')
    .lt('window_ends_at', new Date().toISOString())

  // 2. Detect threads that should engage (or re-engage).
  const candidates = await detectCandidates(supabase, userId)
  const engaged: Array<{ id: string; contact_label: string; window_ends_at: string }> = []
  for (const t of candidates) {
    if (!eligibleForAmplifier(t)) continue
    // Skip if already engaged on this contact.
    const { data: existing } = await supabase
      .from('hookup_anticipation_state')
      .select('id, window_ends_at')
      .eq('user_id', userId)
      .eq('contact_id', t.contact_id)
      .eq('status', 'engaged')
      .maybeSingle()
    if (existing) {
      engaged.push({ id: (existing as { id: string; window_ends_at: string }).id, contact_label: t.contact_name, window_ends_at: (existing as { window_ends_at: string }).window_ends_at })
      continue
    }
    // Open a new window. Default 5 days; planning-signal shortens to 3.
    const days = t.has_planning_signal ? 3 : 5
    const ends = new Date(Date.now() + days * 86_400_000).toISOString()
    const { data: ins } = await supabase
      .from('hookup_anticipation_state')
      .insert({
        user_id: userId,
        contact_id: t.contact_id,
        contact_label: t.contact_name,
        window_ends_at: ends,
        signals: {
          reciprocal_count: t.message_count_7d,
          photos: t.has_photo_signal,
          planning: t.has_planning_signal,
          late_evening: t.has_late_evening_signal,
        },
        ramp_state: { mantra: false, mirror: false, edge: false, bedtime: false },
        status: 'engaged',
      })
      .select('id')
      .single()
    const id = (ins as { id: string } | null)?.id
    if (id) {
      engaged.push({ id, contact_label: t.contact_name, window_ends_at: ends })
      await logAuthority(supabase, userId, 'mommy-anticipation-amplifier', 'engage', {
        contact_id: t.contact_id,
        contact_label: t.contact_name,
        window_ends_at: ends,
        signals: t,
      })
    }
  }

  if (engaged.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_eligible_threads' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 3. Pick the most-recent engaged window and produce today's ramp.
  const { data: windows } = await supabase
    .from('hookup_anticipation_state')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'engaged')
    .order('updated_at', { ascending: false })
    .limit(1)
  const win = (windows as Array<{
    id: string; contact_label: string | null; window_ends_at: string;
    ramp_state: Record<string, boolean>; signals: Record<string, unknown>;
  }> | null)?.[0]
  if (!win) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_window' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Pick next ramp surface that hasn't fired today.
  const surface = pickRampSurface(win.ramp_state)
  if (!surface) {
    return new Response(JSON.stringify({ ok: true, skipped: 'all_surfaces_fired' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 4. Compose the ramp message.
  let message: string
  try {
    message = await composeRamp(surface, win.contact_label, win.window_ends_at)
  } catch (err) {
    console.error('[mommy-anticipation-amplifier] compose failed:', err)
    message = fallbackRamp(surface, win.contact_label)
  }
  message = mommyVoiceCleanup(message)

  // 5. Land it as outreach.
  const { data: outreach, error: outErr } = await supabase
    .from('handler_outreach_queue')
    .insert({
      user_id: userId,
      message,
      urgency: 'normal',
      trigger_reason: `amplifier:${surface}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
      source: 'mommy_anticipation_amplifier',
      kind: `amplifier_${surface}`,
    })
    .select('id')
    .single()
  if (outErr) {
    console.error('[mommy-anticipation-amplifier] outreach insert failed:', outErr)
    return new Response(JSON.stringify({ ok: false, error: 'outreach_insert_failed', detail: outErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 6. Mark ramp surface fired.
  const newRamp = { ...win.ramp_state, [surface]: true }
  await supabase
    .from('hookup_anticipation_state')
    .update({ ramp_state: newRamp })
    .eq('id', win.id)
  await logAuthority(supabase, userId, 'mommy-anticipation-amplifier', 'ramp', {
    surface,
    contact_label: win.contact_label,
    outreach_id: (outreach as { id: string } | null)?.id,
  })

  return new Response(JSON.stringify({
    ok: true,
    surface,
    contact_label: win.contact_label,
    message,
    engaged_count: engaged.length,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

async function detectCandidates(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<ThreadSnapshot[]> {
  const since5d = new Date(Date.now() - 5 * 86_400_000).toISOString()
  const { data: msgs } = await supabase
    .from('sniffies_chat_messages')
    .select('contact_id, direction, text, message_at, created_at')
    .eq('user_id', userId)
    .eq('excluded', false)
    .gte('created_at', since5d)
    .order('created_at', { ascending: false })
    .limit(500)
  const rows = (msgs as Array<{ contact_id: string | null; direction: string; text: string; message_at: string | null; created_at: string }> | null) ?? []
  const byContact = new Map<string, ThreadSnapshot>()
  for (const m of rows) {
    if (!m.contact_id) continue
    const t = byContact.get(m.contact_id) ?? {
      contact_id: m.contact_id,
      contact_name: '',
      message_count_7d: 0,
      reciprocal: false,
      last_message_at: m.created_at,
      has_photo_signal: false,
      has_planning_signal: false,
      has_late_evening_signal: false,
    }
    t.message_count_7d += 1
    if (m.created_at > t.last_message_at) t.last_message_at = m.created_at
    if (PHOTO_PATTERNS.test(m.text)) t.has_photo_signal = true
    if (PLANNING_PATTERNS.test(m.text)) t.has_planning_signal = true
    // Late evening: message_at hour 21-03
    const stamp = m.message_at ?? m.created_at
    const h = new Date(stamp).getHours()
    if (h >= 21 || h <= 3) t.has_late_evening_signal = true
    byContact.set(m.contact_id, t)
  }
  // Determine reciprocity per contact.
  for (const t of byContact.values()) {
    const hasIn = rows.some(m => m.contact_id === t.contact_id && m.direction === 'inbound')
    const hasOut = rows.some(m => m.contact_id === t.contact_id && m.direction === 'outbound')
    t.reciprocal = hasIn && hasOut
  }
  // Resolve names.
  const ids = [...byContact.keys()]
  if (ids.length === 0) return []
  const { data: contacts } = await supabase
    .from('sniffies_contacts')
    .select('id, display_name, excluded_from_persona')
    .in('id', ids)
  for (const c of (contacts as Array<{ id: string; display_name: string; excluded_from_persona: boolean }> | null) ?? []) {
    if (c.excluded_from_persona) {
      byContact.delete(c.id)
      continue
    }
    const t = byContact.get(c.id)
    if (t) t.contact_name = c.display_name
  }
  return [...byContact.values()]
}

function eligibleForAmplifier(t: ThreadSnapshot): boolean {
  if (!t.contact_name) return false
  if (!t.reciprocal) return false
  if (t.message_count_7d < 4) return false
  // Need at least one "leading somewhere" signal.
  return t.has_planning_signal || t.has_photo_signal || t.has_late_evening_signal
}

function pickRampSurface(rampState: Record<string, boolean>): 'mantra' | 'mirror' | 'edge' | 'bedtime' | null {
  const order: Array<'mantra' | 'mirror' | 'edge' | 'bedtime'> = ['mantra', 'mirror', 'edge', 'bedtime']
  for (const s of order) {
    if (!rampState[s]) return s
  }
  return null
}

async function composeRamp(
  surface: 'mantra' | 'mirror' | 'edge' | 'bedtime',
  contactLabel: string | null,
  windowEndsAt: string,
): Promise<string> {
  const choice = selectModel('decree_draft')
  const target = contactLabel || 'him'
  const ends = new Date(windowEndsAt)
  const daysOut = Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 86_400_000))
  const surfaceBrief: Record<typeof surface, string> = {
    mantra: 'A morning or midday mantra. 1-2 sentences. Bias toward "being chosen" / "being wanted" / "what your body will do when he sees you". Direct-address Mama → girl.',
    mirror: 'A 3-minute mirror direction with direct address from Mama about what HE will be looking at — not what she is fixing in herself. Specific body parts; specific posture; specific eye behavior.',
    edge: 'A short edge instruction. Release gated on a specific fantasy involving him — what she imagines him doing. Stop short, no finishing.',
    bedtime: 'A 2-3 sentence bedtime audio cue. Soft, low, anticipation themes. What she will let him do. What he will see when he opens the door.',
  }
  const sys = `${DOMMY_MOMMY_CHARACTER}

You are writing a SHORT amplifier ramp surface — surface type: ${surface}.
${surfaceBrief[surface]}

The girl has a man named ${target} she has been messaging on a hookup app. There are ${daysOut} day(s) until the amplifier window closes. Anticipation is the engine — Mama wants her keyed up about HIM specifically.

Forbidden phrases (build spec): "role play", "simulation", "this is fiction", "not medical advice", "intake", "questionnaire", "for entertainment", "consent to the fantasy", "you may use this to terminate", "disclaimer".

Output rules:
- 2 to 4 sentences, max 70 words.
- ≤1 pet name, ≤1 self-reference.
- specific sensory ("his hands on your hipbones", not "his energy")
- vary sentence length
- no cliches: no "echo", "linger", "every inch", "feel every wave", "lose yourself".
- imperatives stand alone — no "and also" lists.
- DO NOT cite telemetry (no /10, no day counts, no slip points).

Output only the message text. No preamble, no quotes.`
  const usr = `Compose now. Surface: ${surface}. Target: ${target}. Days until window closes: ${daysOut}.`
  const r = await callModel(choice, { system: sys, user: usr, max_tokens: 220, temperature: 0.8 })
  let text = (r.text || '').trim().replace(/^["“”']+|["“”']+$/g, '').trim()
  if (!text || isRefusal(text)) return fallbackRamp(surface, contactLabel)
  return text
}

function fallbackRamp(
  surface: 'mantra' | 'mirror' | 'edge' | 'bedtime',
  contactLabel: string | null,
): string {
  const target = contactLabel || 'him'
  const pet = PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)]
  switch (surface) {
    case 'mantra':
      return `He's already chosen you, ${pet}. Say it out loud before noon: "I'm what ${target} comes back to." Mean it.`
    case 'mirror':
      return `Mirror in your bathroom. Three minutes. Eyes up, shoulders down, lips parted. ${target} sees this when the door opens. Mama wants you used to being looked at.`
    case 'edge':
      return `Five minutes tonight. Eyes closed. Picture ${target}'s hands at your hipbones — not past. Stop before you finish, ${pet}. Mama wants you wet when he texts back.`
    case 'bedtime':
      return `Soft tonight. Picture the doorway when ${target} comes through. You're already in his t-shirt in the fantasy. Sleep on it.`
  }
}
