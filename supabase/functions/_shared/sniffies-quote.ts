// sniffies-quote — shared helper that returns a single quotable Sniffies
// snippet for the persona surfaces (recall, tease, public-dare context).
//
// Privacy gates ALL evaluated here:
//   1. sniffies_settings.sniffies_integration_enabled = TRUE
//   2. sniffies_settings.persona_use_enabled = TRUE (or use_for: 'dares' →
//      dares_use_enabled = TRUE)
//   3. The contact is NOT excluded_from_persona
//   4. The message is NOT excluded AND NOT needs_review
//   5. The message text contains no [redacted-] placeholder fragment
//
// If any gate fails, returns null. Callers must treat null as "no
// surface fires" and fall through to other quote sources.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type QuoteUse = 'persona' | 'dares' | 'slip'

export interface SniffiesQuotePick {
  contact_id: string
  contact_name: string
  message_id: string
  message_text: string
  direction: 'inbound' | 'outbound'
  kink_tags: string[]
}

const REDACTION_FRAGMENT = '[redacted-'

interface SettingsRow {
  sniffies_integration_enabled?: boolean
  persona_use_enabled?: boolean
  dares_use_enabled?: boolean
  slip_use_enabled?: boolean
}

export async function loadSniffiesGate(
  admin: SupabaseClient,
  userId: string,
  use: QuoteUse,
): Promise<boolean> {
  const { data } = await admin
    .from('sniffies_settings')
    .select('sniffies_integration_enabled, persona_use_enabled, dares_use_enabled, slip_use_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  const s = (data as SettingsRow | null) ?? null
  if (!s?.sniffies_integration_enabled) return false
  if (use === 'persona') return !!s.persona_use_enabled
  if (use === 'dares') return !!s.dares_use_enabled
  if (use === 'slip') return !!s.slip_use_enabled
  return false
}

export interface PickOpts {
  /** Default 'outbound' — what SHE said is what gives the persona leverage. */
  direction?: 'inbound' | 'outbound' | 'any'
  /** Default 200 — max characters returned in message_text. */
  max_text_chars?: number
  /** Optional kink-tag filter — pick only messages tagged with one of these. */
  kink_tags?: string[]
}

/**
 * Pull a random quotable Sniffies message for `userId`, gated by
 * `sniffies_settings` for `use`. Returns null when gates fail or no
 * eligible message exists.
 */
export async function pickSniffiesQuote(
  admin: SupabaseClient,
  userId: string,
  use: QuoteUse,
  opts: PickOpts = {},
): Promise<SniffiesQuotePick | null> {
  const allowed = await loadSniffiesGate(admin, userId, use)
  if (!allowed) return null

  const direction = opts.direction ?? 'outbound'
  const maxChars = opts.max_text_chars ?? 200

  // Pull eligible contacts first (excluded_from_persona = false).
  const { data: contacts } = await admin
    .from('sniffies_contacts')
    .select('id, display_name')
    .eq('user_id', userId)
    .eq('excluded_from_persona', false)
  const eligibleContacts = (contacts ?? []) as Array<{ id: string; display_name: string }>
  if (eligibleContacts.length === 0) return null
  const contactById = new Map(eligibleContacts.map(c => [c.id, c.display_name]))

  // Pull recent eligible messages from those contacts.
  let q = admin
    .from('sniffies_chat_messages')
    .select('id, contact_id, direction, text, kink_tags, message_at')
    .eq('user_id', userId)
    .eq('excluded', false)
    .eq('needs_review', false)
    .in('contact_id', Array.from(contactById.keys()))
    .order('created_at', { ascending: false })
    .limit(120)
  if (direction !== 'any') q = q.eq('direction', direction)

  const { data: msgs } = await q
  const eligibleMsgs = ((msgs ?? []) as Array<{
    id: string
    contact_id: string | null
    direction: 'inbound' | 'outbound'
    text: string
    kink_tags: string[] | null
    message_at: string | null
  }>)
    .filter(m => m.contact_id && contactById.has(m.contact_id))
    .filter(m => !m.text.includes(REDACTION_FRAGMENT))
    .filter(m => m.text.trim().length >= 8)
    .filter(m => {
      if (!opts.kink_tags || opts.kink_tags.length === 0) return true
      const tags = m.kink_tags ?? []
      return opts.kink_tags.some(k => tags.includes(k))
    })

  if (eligibleMsgs.length === 0) return null
  // Bias toward the top of the order (most recent), but pick from a
  // wider pool so successive fires don't repeat.
  const pickWindow = Math.min(eligibleMsgs.length, 24)
  const chosen = eligibleMsgs[Math.floor(Math.random() * pickWindow)]
  if (!chosen.contact_id) return null

  return {
    contact_id: chosen.contact_id,
    contact_name: contactById.get(chosen.contact_id) ?? 'someone',
    message_id: chosen.id,
    message_text: chosen.text.slice(0, maxChars),
    direction: chosen.direction,
    kink_tags: chosen.kink_tags ?? [],
  }
}
