// sniffies-dare-context — supplies a contact-name + kink-tag pair that
// the public-dares generator can weave into a dare description, e.g.
// "wear the panties you mentioned to <contact_name>" or "send <contact_name>
// the pose he asked you for".
//
// Coexistence note: the public-dares engine lives on sibling branch
// feature/public-dares-engine-2026-04-30 and uses migrations 339-340.
// When BOTH branches merge, the public-dare selector can call this
// helper. While only the sniffies branch is merged, this file sits
// dormant (no caller). When only the public-dares branch is merged,
// public-dares runs without context (no harm).
//
// Privacy gates:
//   1. sniffies_settings.sniffies_integration_enabled = TRUE
//   2. sniffies_settings.dares_use_enabled = TRUE
//   3. The contact is NOT excluded_from_persona
//   4. There exist eligible (non-excluded, non-needs_review, non-redacted)
//      outbound messages.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { pickSniffiesQuote } from './sniffies-quote.ts'

export interface SniffiesDareContext {
  contact_name: string
  contact_id: string
  kink_hint: string | null
  message_id: string
}

/**
 * Returns a contact + optional kink hint suitable for dare context, or
 * null when the gates fail / no eligible content exists. The dare
 * generator should treat null as "fall back to a generic dare without
 * contact reference".
 */
export async function pickSniffiesDareContext(
  admin: SupabaseClient,
  userId: string,
): Promise<SniffiesDareContext | null> {
  const pick = await pickSniffiesQuote(admin, userId, 'dares', {
    direction: 'outbound',
    max_text_chars: 120,
  })
  if (!pick) return null

  const kinkHint = pick.kink_tags.length > 0
    ? pick.kink_tags[Math.floor(Math.random() * Math.min(pick.kink_tags.length, 4))]
    : null

  return {
    contact_name: pick.contact_name,
    contact_id: pick.contact_id,
    kink_hint: kinkHint,
    message_id: pick.message_id,
  }
}
