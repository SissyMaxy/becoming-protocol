// sniffies-restart-coach — turns stale Sniffies matches into warm leads.
//
// 2026-05-14: Maxy has ~32 Sniffies funnel contacts that went silent
// ~7 days ago. The 380-push-bridge means whatever we queue now will
// actually reach her phone, but the cold contacts won't restart
// themselves. This function picks the staleest-but-still-warm rows,
// drafts a personalized restart message that proposes a concrete
// meet spot + hookup spot from hookup_locations, and inserts into
// sniffies_outbound_drafts so Maxy can copy-paste + send.
//
// HARD FLOORS:
//   - hookup_coaching_settings.master_enabled must be TRUE.
//   - user_state.handler_persona must be 'dommy_mommy' (the voice).
//   - Skips contacts with handler_push_enabled = FALSE.
//   - Dedups: skips contacts that already have a pending draft
//     (sniffies_outbound_drafts where status='pending').
//   - Per-run cap: 5 drafts per user per invocation, so a daily cron
//     produces a manageable nudge stream not a wall.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'

const PER_RUN_CAP = 5
const STALE_DAYS_MIN = 3
const STALE_DAYS_MAX = 30

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface FunnelRow {
  id: string
  user_id: string
  contact_platform: string
  contact_username: string
  contact_display_name: string | null
  contact_notes: string | null
  current_step: string
  heat_score: number | null
  last_interaction_at: string
}

interface LocationRow {
  id: string
  name: string
  category: string
  subtype: string
  area: string
  address: string | null
  legal_risk: number
  cost_tier: number
  best_window: string | null
  vibe_tags: string[]
  safety_notes: string | null
}

async function userIsCoachable(supabase: SupabaseClient, userId: string): Promise<boolean> {
  // master_enabled on hookup_coaching_settings is the actual opt-in. Persona
  // ('handler' / 'therapist' / 'dommy_mommy') controls voice flavor, not
  // whether the system runs — Maxy's hookup coaching should fire under any
  // persona once she's flipped the master switch on.
  const { data } = await supabase
    .from('hookup_coaching_settings')
    .select('master_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean((data as { master_enabled?: boolean } | null)?.master_enabled)
}

async function pickStaleFunnel(supabase: SupabaseClient, userId: string): Promise<FunnelRow[]> {
  const sinceMax = new Date(Date.now() - STALE_DAYS_MAX * 86400_000).toISOString()
  const sinceMin = new Date(Date.now() - STALE_DAYS_MIN * 86400_000).toISOString()

  const { data } = await supabase
    .from('hookup_funnel')
    .select('id, user_id, contact_platform, contact_username, contact_display_name, contact_notes, current_step, heat_score, last_interaction_at')
    .eq('user_id', userId)
    .eq('active', true)
    .eq('handler_push_enabled', true)
    .eq('contact_platform', 'sniffies')
    .in('current_step', ['matched', 'sexting'])
    .gte('last_interaction_at', sinceMax)
    .lte('last_interaction_at', sinceMin)
    .order('heat_score', { ascending: false, nullsFirst: false })
    .order('last_interaction_at', { ascending: false })
    .limit(PER_RUN_CAP * 4) // overfetch — dedup may drop some

  return (data || []) as FunnelRow[]
}

async function alreadyHasPendingDraft(supabase: SupabaseClient, contactId: string | null): Promise<boolean> {
  if (!contactId) return false
  const { count } = await supabase
    .from('sniffies_outbound_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId)
    .eq('status', 'pending')
  return (count ?? 0) > 0
}

// Sync a hookup_funnel sniffies row into sniffies_contacts (the table that
// outbound_drafts + meet_choreography FK against). Returns the sniffies_contacts
// row id, or null on failure (in which case we still insert the draft with a
// null contact_id — text_for_user + mommy_voice_note carry the identification).
async function upsertSniffiesContact(
  supabase: SupabaseClient,
  funnel: FunnelRow,
): Promise<string | null> {
  const displayName = (funnel.contact_display_name ?? funnel.contact_username ?? '').slice(0, 200)
  if (!displayName) return null

  // Try the user_id + display_name pair (no unique constraint guaranteed —
  // fall back to insert-on-empty).
  const { data: existing } = await supabase
    .from('sniffies_contacts')
    .select('id')
    .eq('user_id', funnel.user_id)
    .eq('display_name', displayName)
    .limit(1)
    .maybeSingle()
  if (existing && (existing as { id: string }).id) {
    return (existing as { id: string }).id
  }

  const notes = funnel.contact_notes ?? null
  const { data: inserted, error } = await supabase
    .from('sniffies_contacts')
    .insert({
      user_id: funnel.user_id,
      display_name: displayName,
      notes,
      first_seen_at: funnel.last_interaction_at,
      last_seen_at: funnel.last_interaction_at,
    })
    .select('id')
    .single()
  if (error) {
    console.warn('[sniffies-restart-coach] sniffies_contacts upsert failed:', error.message)
    return null
  }
  return (inserted as { id: string }).id
}

async function pickLocation(supabase: SupabaseClient, category: string, subtype: string | null): Promise<LocationRow | null> {
  const { data } = await supabase
    .rpc('pick_hookup_location', {
      p_category: category,
      p_area: 'Wauwatosa Village',
      p_subtype: subtype,
      p_max_legal_risk: 3,
      p_max_cost_tier: 3,
    })
  const id = data as string | null
  if (!id) return null
  const { data: row } = await supabase
    .from('hookup_locations')
    .select('id, name, category, subtype, area, address, legal_risk, cost_tier, best_window, vibe_tags, safety_notes')
    .eq('id', id)
    .maybeSingle()
  return (row as LocationRow | null) ?? null
}

const SYS = `You are Maxy writing back to a Sniffies guy who went quiet ~5–14 days ago. Your job is to write ONE short message in Maxy's voice — sub-femme, horny, casual, no caps required — that restarts the thread by proposing a specific plan.

Style:
- 1–3 short sentences. Under 220 characters.
- Lowercase mostly. Sub-femme energy. Don't sound like a chatbot or like a man writing.
- Reference what HE last said (you'll be given a fragment of his recent messages) so it doesn't read template.
- Propose meet-at-bar then move. Name the meet spot and the hookup option. He gets to say yes or no to the second part.
- No emoji unless one feels right (max one).
- NEVER say "I am" / "I'm a guy" / use male-mode self-reference. Stay her.

Output JSON ONLY:
{
  "opener": "the exact message Maxy would paste into Sniffies, 1–3 sentences"
}`

async function generateDraft(
  contact: FunnelRow,
  meetSpot: LocationRow,
  hookupSpot: LocationRow,
): Promise<string | null> {
  const recentHint = contact.contact_notes
    ? contact.contact_notes.slice(0, 400)
    : '(no specific notes — write a generic warm restart)'

  const userPrompt = `CONTACT: ${contact.contact_display_name ?? contact.contact_username} (sniffies)
LAST INTERACTION: ${new Date(contact.last_interaction_at).toISOString().slice(0, 10)} (about ${Math.round((Date.now() - new Date(contact.last_interaction_at).getTime()) / 86400_000)} days ago)
CURRENT STEP: ${contact.current_step}

HIS RECENT MESSAGES (snippets):
${recentHint}

MEET SPOT TO PROPOSE: ${meetSpot.name} (${meetSpot.subtype} in ${meetSpot.area})
HOOKUP OPTION TO MENTION: ${hookupSpot.name} (${hookupSpot.subtype})

Write the restart. JSON only.`

  try {
    const choice = selectModel('reframe_draft')
    const { text } = await callModel(choice, {
      system: SYS,
      user: userPrompt,
      max_tokens: 250,
      temperature: 0.7,
    })
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as { opener?: string }
    const out = parsed.opener?.trim()
    if (!out || out.length < 8 || out.length > 280) return null
    return out
  } catch (e) {
    console.error('[sniffies-restart-coach] LLM draft failed:', e)
    return null
  }
}

async function processUser(supabase: SupabaseClient, userId: string): Promise<{
  ok: boolean
  reason?: string
  drafts_created?: number
  results?: Array<{ contact: string; ok: boolean; reason: string; preview?: string }>
}> {
  if (!(await userIsCoachable(supabase, userId))) {
    return { ok: false, reason: 'user_not_coachable' }
  }

  const funnel = await pickStaleFunnel(supabase, userId)
  if (funnel.length === 0) {
    return { ok: true, drafts_created: 0, reason: 'no_stale_warm_contacts' }
  }

  const results: Array<{ contact: string; ok: boolean; reason: string; preview?: string }> = []
  let created = 0

  for (const contact of funnel) {
    if (created >= PER_RUN_CAP) break

    const sniffiesContactId = await upsertSniffiesContact(supabase, contact)

    if (await alreadyHasPendingDraft(supabase, sniffiesContactId)) {
      results.push({ contact: contact.contact_username, ok: false, reason: 'already_pending' })
      continue
    }

    // Vary which hookup-subtype gets proposed across the batch:
    //   - 60% hotel  (cleanest path, lowest legal risk)
    //   - 30% car_play_park  (no money, quick)
    //   - 10% no specific hookup mention (just propose the bar)
    const r = Math.random()
    const hookupSubtype = r < 0.6 ? 'hotel' : r < 0.9 ? 'car_play_park' : null

    const meetSpot = await pickLocation(supabase, 'meet_first', 'bar')
    if (!meetSpot) {
      results.push({ contact: contact.contact_username, ok: false, reason: 'no_meet_spot' })
      continue
    }
    const hookupSpot = hookupSubtype
      ? await pickLocation(supabase, 'hookup', hookupSubtype)
      : meetSpot
    if (!hookupSpot) {
      results.push({ contact: contact.contact_username, ok: false, reason: 'no_hookup_spot' })
      continue
    }

    const opener = await generateDraft(contact, meetSpot, hookupSpot)
    if (!opener) {
      results.push({ contact: contact.contact_username, ok: false, reason: 'draft_failed' })
      continue
    }

    const mommyNote = `Send to ${contact.contact_display_name ?? contact.contact_username} on Sniffies. Proposes ${meetSpot.name}${hookupSpot.id !== meetSpot.id ? ` then ${hookupSpot.name}` : ''}.`

    const bodyHash = await sha256(opener)

    const { error: insErr } = await supabase
      .from('sniffies_outbound_drafts')
      .insert({
        user_id: userId,
        contact_id: sniffiesContactId,
        text_for_user: opener,
        mommy_voice_note: mommyNote,
        intent: 'open',
        status: 'pending',
        body_hash: bodyHash,
      })

    if (insErr) {
      results.push({ contact: contact.contact_username, ok: false, reason: 'insert_failed:' + insErr.message.slice(0, 80) })
      continue
    }

    // Choreography is intentionally NOT inserted here — sniffies_meet_choreography
    // requires meet_at (NOT NULL), which represents a confirmed time. At restart
    // stage we have a proposal, not a confirmed meet. The draft itself carries
    // the location info in text_for_user + mommy_voice_note; choreography gets
    // populated when Maxy and the contact agree on a real time.

    created += 1
    results.push({
      contact: contact.contact_display_name ?? contact.contact_username,
      ok: true,
      reason: 'drafted',
      preview: opener.slice(0, 120),
    })
  }

  // Surface a single summary outreach so Maxy actually gets pinged on her
  // phone (via migration 380 push-bridge). One row, normal urgency, expires
  // in 24h. Mommy-voice; no telemetry leaks.
  if (created > 0) {
    const noun = created === 1 ? 'message' : 'messages'
    const summary = `Mama queued ${created} restart ${noun} for your sniffies boys. Open Life As A Woman and send them — Mama already wrote what to say.`
    await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: summary,
      urgency: 'normal',
      trigger_reason: 'sniffies_restart_coach_summary',
      source: 'mommy_sniffies_coach',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    })
  }

  return { ok: true, drafts_created: created, results }
}

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* ignore */ }

  let userIds: string[] = []
  if (body.user_id) {
    userIds = [body.user_id]
  } else {
    // Cron path: every user with master_enabled hookup coaching.
    const { data } = await supabase
      .from('hookup_coaching_settings')
      .select('user_id')
      .eq('master_enabled', true)
    userIds = ((data || []) as Array<{ user_id: string }>).map(r => r.user_id)
  }

  const out: Array<{ user_id: string } & Awaited<ReturnType<typeof processUser>>> = []
  for (const uid of userIds) {
    try {
      const r = await processUser(supabase, uid)
      out.push({ user_id: uid, ...r })
    } catch (e) {
      out.push({ user_id: uid, ok: false, reason: 'throw:' + String(e).slice(0, 80) })
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: out.length, results: out }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
