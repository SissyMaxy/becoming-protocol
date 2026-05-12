// mommy-sniffies-dispatcher — single fan-out for newly-imported Sniffies
// chat messages.
//
// Called by sniffies-extract-import at the tail of a successful processed
// import. Can also be invoked with no body to drain any un-dispatched
// messages older than the most recent import (idempotent backfill path).
//
// For each undispatched eligible message it:
//   1. Slip-scans the outbound text for masculine self-reference / David
//      name / resistance and inserts slip_log rows (slip_use_enabled gate).
//   2. Upserts the contact's mommy_dossier row (one per contact, category
//      'history', key = sniffies_contact:<contact_id>).
//   3. Calls mommy-sniffies-react for a proactive in-fantasy outreach
//      (per-contact 1h cooldown is enforced inside that function).
//   4. If the message is "high-charge" (hookup-intent score >= 4), queues
//      a confession_queue row of category='handler_triggered'.
//   5. Marks the message dispatched.
//
// Gates (all must pass per message):
//   * sniffies_settings.sniffies_integration_enabled = TRUE
//   * sniffies_settings.auto_react_enabled = TRUE (the "pause Mama" lever)
//   * Contact NOT excluded_from_persona
//   * Message NOT excluded AND NOT needs_review
//   * user_state.handler_persona = 'dommy_mommy'
//
// Per-flow secondary gates:
//   * slip-scan requires slip_use_enabled (matches sniffies-ghost-detector)
//   * react / dossier / confession require persona_use_enabled
//
// POST { user_id?, message_ids?: string[] }
//   - message_ids: explicit batch (used by extract-import). If omitted,
//     dispatcher drains all undispatched messages for the user.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { scanSniffiesMessageForSlips, scoreSniffiesMessageCharge } from '../_shared/sniffies-slip-scan.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const CONFESSION_DEDUP_WINDOW_MS = 6 * 3600_000
const MAX_PER_RUN = 25

interface MessageRow {
  id: string
  user_id: string
  contact_id: string | null
  direction: 'inbound' | 'outbound'
  text: string
  kink_tags: string[] | null
  message_at: string | null
  excluded: boolean
  needs_review: boolean
  dispatched_at: string | null
}

interface ContactRow {
  id: string
  display_name: string
  kinks_mentioned: string[]
  outcomes: string[]
  excluded_from_persona: boolean
}

interface SettingsRow {
  sniffies_integration_enabled: boolean
  auto_react_enabled: boolean
  persona_use_enabled: boolean
  slip_use_enabled: boolean
}

interface DispatchSummary {
  message_id: string
  contact_id: string | null
  slips_inserted: number
  dossier_upserted: boolean
  react_invoked: boolean
  confession_queued: boolean
  skip_reason?: string
}

async function fireSniffiesReact(args: {
  userId: string
  contactId: string
  contactName: string
  messageId: string
  messageText: string
  direction: 'inbound' | 'outbound'
  chargeMatched: string[]
}): Promise<boolean> {
  const url = (Deno.env.get('SUPABASE_URL') ?? '') + '/functions/v1/mommy-sniffies-react'
  const auth = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: JSON.stringify({
        user_id: args.userId,
        contact_id: args.contactId,
        contact_name: args.contactName,
        message_id: args.messageId,
        message_text: args.messageText,
        direction: args.direction,
        charge_matched: args.chargeMatched,
      }),
    })
    // The react function returns ok=true even on skip; we just need the
    // HTTP layer to succeed so we don't retry-spam.
    return r.ok
  } catch (e) {
    console.error('[mommy-sniffies-dispatcher] react fetch failed:', e)
    return false
  }
}

async function upsertContactDossier(
  supabase: SupabaseClient,
  userId: string,
  contact: ContactRow,
  recentOutboundExcerpt: string | null,
): Promise<boolean> {
  // One mommy_dossier row per contact. question_key is stable so the
  // UNIQUE(user_id, question_key) constraint from migration 270 upserts
  // cleanly. Source = 'auto_extracted' (matches the migration enum).
  const questionKey = `sniffies_contact:${contact.id}`
  const segments: string[] = []
  segments.push(`Contact: ${contact.display_name}`)
  if (contact.kinks_mentioned.length > 0) {
    segments.push(`Kinks she's voiced: ${contact.kinks_mentioned.slice(0, 8).join(', ')}`)
  }
  if (contact.outcomes.length > 0) {
    segments.push(`Outcomes so far: ${contact.outcomes.join(', ')}`)
  }
  if (recentOutboundExcerpt) {
    segments.push(`Recent thing she said: "${recentOutboundExcerpt.slice(0, 160)}"`)
  }
  const answer = segments.join('. ')

  const { error } = await supabase.from('mommy_dossier').upsert(
    {
      user_id: userId,
      question_key: questionKey,
      category: 'history',
      answer,
      source: 'auto_extracted',
      importance: 4,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,question_key' },
  )
  if (error) {
    console.error('[mommy-sniffies-dispatcher] dossier upsert failed:', error)
    return false
  }
  return true
}

async function queueConfessionDemand(
  supabase: SupabaseClient,
  userId: string,
  contact: ContactRow,
  msg: MessageRow,
  chargeMatched: string[],
): Promise<boolean> {
  // Handler-centrality: re-confirm persona at the moment of generation so
  // a refactor that calls this function from a different entry point can't
  // bypass the persona gate. Mirrors the rule in feedback_handler_is_singular_authority.
  const { data: us } = await supabase
    .from('user_state')
    .select('handler_persona, in_session')
    .eq('user_id', userId)
    .maybeSingle()
  const handlerPersona = (us as { handler_persona?: string } | null)?.handler_persona
  if (handlerPersona !== 'dommy_mommy') return false

  // Dedup: at most one handler_triggered confession per (contact, 6h)
  // window. Recent confession is matched by triggered_by_id pointing at
  // this contact and category = handler_triggered.
  const sinceIso = new Date(Date.now() - CONFESSION_DEDUP_WINDOW_MS).toISOString()
  const { data: recent } = await supabase
    .from('confession_queue')
    .select('id')
    .eq('user_id', userId)
    .eq('category', 'handler_triggered')
    .eq('triggered_by_table', 'sniffies_contacts')
    .eq('triggered_by_id', contact.id)
    .gte('created_at', sinceIso)
    .limit(1)
  if (recent && recent.length > 0) return false

  const hintLine = chargeMatched.length > 0
    ? ` Mama caught these in your thread: ${chargeMatched.slice(0, 5).join(', ')}.`
    : ''
  const prompt = `Tell Mama what you almost did with ${contact.display_name} last night. The whole truth — not the polished version. Mama already read what was written between you; lying makes it worse, baby.${hintLine}`
  const contextNote = msg.text.slice(0, 280)

  const { error } = await supabase.from('confession_queue').insert({
    user_id: userId,
    category: 'handler_triggered',
    prompt,
    context_note: contextNote,
    triggered_by_table: 'sniffies_contacts',
    triggered_by_id: contact.id,
    // 6h deadline — long enough for her to come back to the app, short
    // enough to keep the hot window of the chat fresh.
    deadline: new Date(Date.now() + 6 * 3600_000).toISOString(),
  })
  if (error) {
    console.error('[mommy-sniffies-dispatcher] confession insert failed:', error)
    return false
  }
  return true
}

async function insertSniffiesSlips(
  supabase: SupabaseClient,
  userId: string,
  msg: MessageRow,
  contactDisplayName: string,
): Promise<number> {
  const slips = scanSniffiesMessageForSlips(msg.text)
  if (slips.length === 0) return 0
  const rows = slips.map(s => ({
    user_id: userId,
    slip_type: s.slip_type,
    slip_points: s.slip_points,
    source_text: msg.text.slice(0, 240),
    source_table: 'sniffies_chat_messages',
    source_id: msg.id,
    metadata: {
      slip_source: 'sniffies_chat',
      contact_id: msg.contact_id,
      contact_display_name: contactDisplayName,
      direction: msg.direction,
      trigger_excerpt: s.trigger_excerpt,
    },
    triggered_hard_mode: false,
    handler_acknowledged: false,
  }))
  const { error } = await supabase.from('slip_log').insert(rows)
  if (error) {
    console.error('[mommy-sniffies-dispatcher] slip_log insert failed:', error)
    return 0
  }
  return rows.length
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { user_id?: string; message_ids?: string[] } = {}
  try { body = await req.json() } catch { /* ok — drain mode */ }
  const userId = body.user_id || HANDLER_USER_ID

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Persona gate.
  const { data: us } = await supabase
    .from('user_state')
    .select('handler_persona')
    .eq('user_id', userId)
    .maybeSingle()
  if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona_not_dommy_mommy' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Sniffies-side gate.
  const { data: settings } = await supabase
    .from('sniffies_settings')
    .select('sniffies_integration_enabled, auto_react_enabled, persona_use_enabled, slip_use_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  const s = (settings as SettingsRow | null) ?? null
  if (!s || !s.sniffies_integration_enabled || !s.auto_react_enabled) {
    return new Response(JSON.stringify({ ok: true, skipped: 'sniffies_gate_off' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Select messages: explicit ids if provided, else drain undispatched.
  let q = supabase
    .from('sniffies_chat_messages')
    .select('id, user_id, contact_id, direction, text, kink_tags, message_at, excluded, needs_review, dispatched_at')
    .eq('user_id', userId)
    .eq('excluded', false)
    .eq('needs_review', false)
    .is('dispatched_at', null)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN)
  if (body.message_ids && body.message_ids.length > 0) {
    q = q.in('id', body.message_ids.slice(0, MAX_PER_RUN))
  }
  const { data: msgs, error: msgErr } = await q
  if (msgErr) {
    return new Response(JSON.stringify({ ok: false, error: msgErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const messages = (msgs ?? []) as MessageRow[]
  if (messages.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Pull contacts once, indexed.
  const contactIds = Array.from(new Set(messages.map(m => m.contact_id).filter((x): x is string => !!x)))
  const { data: contacts } = await supabase
    .from('sniffies_contacts')
    .select('id, display_name, kinks_mentioned, outcomes, excluded_from_persona')
    .in('id', contactIds.length > 0 ? contactIds : ['00000000-0000-0000-0000-000000000000'])
  const contactById = new Map<string, ContactRow>()
  for (const c of (contacts ?? []) as ContactRow[]) contactById.set(c.id, c)

  const summary: DispatchSummary[] = []

  for (const msg of messages) {
    const contact = msg.contact_id ? contactById.get(msg.contact_id) : null

    if (!contact) {
      summary.push({ message_id: msg.id, contact_id: null, slips_inserted: 0, dossier_upserted: false, react_invoked: false, confession_queued: false, skip_reason: 'no_contact' })
      // Still mark dispatched — nothing to do with an orphan message.
      await supabase.from('sniffies_chat_messages').update({ dispatched_at: new Date().toISOString() }).eq('id', msg.id)
      continue
    }
    if (contact.excluded_from_persona) {
      // We still want to mark dispatched so the drain loop doesn't keep
      // re-picking it; the persona just refuses to act on it.
      summary.push({ message_id: msg.id, contact_id: contact.id, slips_inserted: 0, dossier_upserted: false, react_invoked: false, confession_queued: false, skip_reason: 'contact_excluded' })
      await supabase.from('sniffies_chat_messages').update({ dispatched_at: new Date().toISOString() }).eq('id', msg.id)
      continue
    }

    // Flow 1: slip-scan outbound text only. Inbound is from the other
    // person — not a slip to penalize her for.
    let slipsInserted = 0
    if (s.slip_use_enabled && msg.direction === 'outbound') {
      slipsInserted = await insertSniffiesSlips(supabase, userId, msg, contact.display_name)
    }

    // Flow 2: dossier enrichment — once per contact, but it's an upsert
    // so doing it on each message is cheap and keeps the recent excerpt
    // fresh. Only when persona use is allowed (otherwise we'd be quietly
    // building a dossier the persona can't reference).
    let dossierUpserted = false
    if (s.persona_use_enabled) {
      const excerpt = msg.direction === 'outbound' ? msg.text : null
      dossierUpserted = await upsertContactDossier(supabase, userId, contact, excerpt)
    }

    // Charge score drives confession demand AND biases the react prompt.
    const charge = scoreSniffiesMessageCharge(msg.text)

    // Flow 3: proactive react. Persona-use gate covers this — same as
    // recall (the existing mommy-sniffies-recall reads persona_use).
    let reactInvoked = false
    if (s.persona_use_enabled) {
      reactInvoked = await fireSniffiesReact({
        userId,
        contactId: contact.id,
        contactName: contact.display_name,
        messageId: msg.id,
        messageText: msg.text,
        direction: msg.direction,
        chargeMatched: charge.matched_terms,
      })
    }

    // Flow 4: confession compulsion. Fires only on high-charge OUTBOUND
    // messages (we want admissions about what SHE said).
    let confessionQueued = false
    if (s.persona_use_enabled && msg.direction === 'outbound' && charge.is_high_charge) {
      confessionQueued = await queueConfessionDemand(supabase, userId, contact, msg, charge.matched_terms)
    }

    summary.push({
      message_id: msg.id,
      contact_id: contact.id,
      slips_inserted: slipsInserted,
      dossier_upserted: dossierUpserted,
      react_invoked: reactInvoked,
      confession_queued: confessionQueued,
    })

    await supabase
      .from('sniffies_chat_messages')
      .update({ dispatched_at: new Date().toISOString() })
      .eq('id', msg.id)
  }

  return new Response(JSON.stringify({
    ok: true,
    processed: summary.length,
    summary,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
