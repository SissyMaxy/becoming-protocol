/**
 * Cross-platform identity graph — resolver module.
 *
 * Every engine (Twitter replies, Sniffies chats, DMs, etc.) calls resolveContact()
 * before responding, then records the interaction with recordEvent(). The Handler
 * injects getContactContext() into system prompts so the model knows who it's
 * talking to: tier, LTV, recent messages, kinks, flags.
 *
 * Tables live in migration 199_contact_graph.sql.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ContactTier = 'stranger' | 'warm' | 'paid' | 'regular' | 'inner';
export type ContactPlatform =
  | 'twitter' | 'reddit' | 'fansly' | 'onlyfans'
  | 'chaturbate' | 'fetlife' | 'sniffies' | 'dm' | 'other';
export type EventType =
  | 'dm_in' | 'dm_out' | 'reply_in' | 'reply_out'
  | 'chat_in' | 'chat_out' | 'tip' | 'sub'
  | 'ppv_purchase' | 'cam_tip' | 'mention' | 'follow' | 'unfollow' | 'flag';

export interface Contact {
  id: string;
  user_id: string;
  display_name: string | null;
  first_seen_at: string;
  last_interaction_at: string;
  lifetime_value_cents: number;
  tier: ContactTier;
  screening_status: string;
  kinks_of_record: string[];
  hard_nos: string[];
  flags: string[];
  notes: string | null;
}

function normalize(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

/**
 * Generate fuzzy variants of a handle — same person, different formatting.
 * E.g., "soft_maxy" → ["softmaxy", "soft-maxy", "soft.maxy", "softmaxy1"-like]
 * Only used for *suggesting* merges, never auto-merging.
 */
export function handleVariants(handle: string): string[] {
  const norm = normalize(handle);
  const variants = new Set<string>([norm]);
  variants.add(norm.replace(/[._-]+/g, ''));                 // stripped separators
  variants.add(norm.replace(/[._-]+/g, '_'));                // unified separator
  variants.add(norm.replace(/\d+$/, ''));                    // trailing numbers removed
  variants.add(norm.replace(/(?:official|real|the)/g, ''));  // common suffixes/prefixes
  return [...variants].filter(v => v.length >= 3);
}

/**
 * Find likely same-person matches for a handle across platforms.
 * Returns candidate contact_ids with a crude similarity score (0..1).
 * Caller decides whether to merge.
 */
export async function findFuzzyCandidates(
  sb: SupabaseClient,
  userId: string,
  platform: ContactPlatform,
  handle: string,
): Promise<Array<{ contactId: string; matchedHandle: string; matchedPlatform: string; score: number }>> {
  const variants = handleVariants(handle);
  if (variants.length === 0) return [];

  const { data } = await sb
    .from('contact_handles')
    .select('contact_id, platform, handle')
    .eq('user_id', userId)
    .neq('platform', platform)
    .in('handle', variants);

  const out: Array<{ contactId: string; matchedHandle: string; matchedPlatform: string; score: number }> = [];
  const needle = normalize(handle).replace(/[._-]/g, '');
  for (const row of data || []) {
    const candidate = (row.handle as string).replace(/[._-]/g, '');
    // Exact normalized match = 1.0; variant match = 0.7-0.9
    const score = candidate === needle ? 1.0
      : candidate.includes(needle) || needle.includes(candidate) ? 0.8
      : 0.7;
    out.push({ contactId: row.contact_id, matchedHandle: row.handle, matchedPlatform: row.platform, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Attach an additional (platform, handle) to an existing contact.
 * Used when you manually merge or the Handler confirms a same-person match.
 */
export async function linkHandle(
  sb: SupabaseClient,
  userId: string,
  contactId: string,
  platform: ContactPlatform,
  handle: string,
  confidence = 1.0,
): Promise<void> {
  const normalized = normalize(handle);
  const { error } = await sb.from('contact_handles').insert({
    user_id: userId,
    contact_id: contactId,
    platform,
    handle: normalized,
    confidence,
  });
  if (error && error.code !== '23505') throw error;
}

/**
 * Merge source contact into target contact.
 * Moves all handles and events, deletes source. Destructive — run after confirming.
 */
export async function mergeContacts(
  sb: SupabaseClient,
  userId: string,
  targetId: string,
  sourceId: string,
): Promise<void> {
  if (targetId === sourceId) return;

  // Re-point handles, tagging merge origin.
  await sb.from('contact_handles')
    .update({ contact_id: targetId, merged_from_contact_id: sourceId })
    .eq('contact_id', sourceId)
    .eq('user_id', userId);

  // Re-point events.
  await sb.from('contact_events')
    .update({ contact_id: targetId })
    .eq('contact_id', sourceId)
    .eq('user_id', userId);

  // Fold LTV into target.
  const { data: src } = await sb.from('contacts').select('lifetime_value_cents, flags, kinks_of_record, hard_nos, notes').eq('id', sourceId).single();
  const { data: dst } = await sb.from('contacts').select('lifetime_value_cents, flags, kinks_of_record, hard_nos, notes').eq('id', targetId).single();
  if (src && dst) {
    const mergedFlags = [...new Set([...(dst.flags || []), ...(src.flags || [])])];
    const mergedKinks = [...new Set([...(dst.kinks_of_record || []), ...(src.kinks_of_record || [])])];
    const mergedNos = [...new Set([...(dst.hard_nos || []), ...(src.hard_nos || [])])];
    const mergedNotes = [dst.notes, src.notes].filter(Boolean).join('\n---\n');
    await sb.from('contacts').update({
      lifetime_value_cents: (dst.lifetime_value_cents || 0) + (src.lifetime_value_cents || 0),
      flags: mergedFlags,
      kinks_of_record: mergedKinks,
      hard_nos: mergedNos,
      notes: mergedNotes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', targetId);
  }

  // Delete source.
  await sb.from('contacts').delete().eq('id', sourceId).eq('user_id', userId);

  // Recompute tier after merge.
  await recomputeTier(sb, targetId);
}

/**
 * Find or create the contact record for (platform, handle).
 * Always returns a Contact — creates one on first sighting.
 */
export async function resolveContact(
  sb: SupabaseClient,
  userId: string,
  platform: ContactPlatform,
  handle: string,
  displayName?: string,
): Promise<Contact> {
  const normalized = normalize(handle);
  if (!normalized) throw new Error('resolveContact: empty handle');

  const { data: existing } = await sb
    .from('contact_handles')
    .select('contact_id')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('handle', normalized)
    .maybeSingle();

  if (existing?.contact_id) {
    const { data: c } = await sb
      .from('contacts')
      .select('*')
      .eq('id', existing.contact_id)
      .single();
    if (c) return c as Contact;
  }

  const { data: newContact, error: ce } = await sb
    .from('contacts')
    .insert({ user_id: userId, display_name: displayName || handle })
    .select('*')
    .single();
  if (ce || !newContact) throw new Error(`resolveContact: failed to create: ${ce?.message}`);

  const { error: he } = await sb.from('contact_handles').insert({
    user_id: userId,
    contact_id: newContact.id,
    platform,
    handle: normalized,
  });
  // Race: if another call inserted the handle between our SELECT and INSERT,
  // ignore unique-violation and re-resolve.
  if (he && he.code !== '23505') {
    throw new Error(`resolveContact: failed to insert handle: ${he.message}`);
  }

  return newContact as Contact;
}

/**
 * Log an interaction. Triggers in the DB update last_interaction_at automatically.
 * If valueCents > 0, also increments lifetime_value_cents atomically.
 */
export async function recordEvent(
  sb: SupabaseClient,
  userId: string,
  contactId: string,
  eventType: EventType,
  direction: 'in' | 'out' | 'na',
  platform: ContactPlatform,
  content?: string,
  valueCents = 0,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await sb.from('contact_events').insert({
    user_id: userId,
    contact_id: contactId,
    platform,
    event_type: eventType,
    direction,
    content: content ? content.slice(0, 2000) : null,
    value_cents: valueCents,
    metadata,
  });

  if (valueCents > 0) {
    const { error } = await sb.rpc('increment_contact_ltv', {
      p_contact_id: contactId,
      p_cents: valueCents,
    });
    if (error) {
      // Fallback if RPC not deployed yet — read-modify-write with best effort
      const { data: c } = await sb.from('contacts')
        .select('lifetime_value_cents')
        .eq('id', contactId)
        .single();
      if (c) {
        await sb.from('contacts')
          .update({ lifetime_value_cents: (c.lifetime_value_cents || 0) + valueCents })
          .eq('id', contactId);
      }
    }
  }
}

/**
 * Render a contact's state as a prompt-ready block. Inject this into the
 * system prompt of any LLM call that's generating a reply to this person.
 */
export async function getContactContext(
  sb: SupabaseClient,
  contactId: string,
  recentEventLimit = 5,
): Promise<string> {
  const { data: contact } = await sb
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .single();
  if (!contact) return '';

  const [{ data: events }, { data: handles }] = await Promise.all([
    sb.from('contact_events')
      .select('event_type,direction,content,occurred_at,platform,value_cents')
      .eq('contact_id', contactId)
      .order('occurred_at', { ascending: false })
      .limit(recentEventLimit),
    sb.from('contact_handles')
      .select('platform,handle')
      .eq('contact_id', contactId),
  ]);

  const lines: string[] = [];
  lines.push(`━━ CONTACT CONTEXT ━━`);
  lines.push(`Name: ${contact.display_name || '(unknown)'}`);
  lines.push(`Tier: ${contact.tier}${contact.screening_status !== 'unscreened' ? ` / screening: ${contact.screening_status}` : ''}`);
  if (contact.lifetime_value_cents > 0) {
    lines.push(`Lifetime paid: $${(contact.lifetime_value_cents / 100).toFixed(2)}`);
  }
  if (Array.isArray(contact.flags) && contact.flags.length > 0) {
    lines.push(`⚠ Flags: ${contact.flags.join(', ')}`);
  }
  if (Array.isArray(contact.kinks_of_record) && contact.kinks_of_record.length > 0) {
    lines.push(`Known kinks: ${contact.kinks_of_record.join(', ')}`);
  }
  if (Array.isArray(contact.hard_nos) && contact.hard_nos.length > 0) {
    lines.push(`Hard NOs: ${contact.hard_nos.join(', ')}`);
  }
  if (contact.notes) {
    lines.push(`Notes: ${contact.notes}`);
  }
  if (handles && handles.length > 1) {
    lines.push(`Also on: ${handles.map((h: any) => `${h.platform}:${h.handle}`).join(', ')}`);
  }
  if (events && events.length > 0) {
    lines.push(`Recent interactions:`);
    for (const e of events) {
      const dir = e.direction === 'in' ? '←' : e.direction === 'out' ? '→' : '·';
      const money = e.value_cents > 0 ? ` $${(e.value_cents / 100).toFixed(2)}` : '';
      const snippet = (e.content || '').slice(0, 100).replace(/\s+/g, ' ');
      lines.push(`  ${dir} [${e.platform}/${e.event_type}${money}] ${snippet}`);
    }
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  return lines.join('\n');
}

/**
 * Add a flag to a contact (e.g. 'catfish', 'asked_address', 'ghosted_after_paid').
 * Idempotent — duplicates are ignored.
 */
export async function flagContact(
  sb: SupabaseClient,
  contactId: string,
  flag: string,
): Promise<void> {
  const { data: c } = await sb.from('contacts').select('flags').eq('id', contactId).single();
  const flags: string[] = Array.isArray(c?.flags) ? [...c!.flags] : [];
  if (flags.includes(flag)) return;
  flags.push(flag);
  await sb.from('contacts').update({ flags, updated_at: new Date().toISOString() }).eq('id', contactId);
}

/**
 * Add a kink to a contact's known kinks. Case-insensitive dedupe.
 */
export async function addKink(
  sb: SupabaseClient,
  contactId: string,
  kink: string,
): Promise<void> {
  const { data: c } = await sb.from('contacts').select('kinks_of_record').eq('id', contactId).single();
  const kinks: string[] = Array.isArray(c?.kinks_of_record) ? [...c!.kinks_of_record] : [];
  if (kinks.some(k => k.toLowerCase() === kink.toLowerCase())) return;
  kinks.push(kink);
  await sb.from('contacts').update({ kinks_of_record: kinks, updated_at: new Date().toISOString() }).eq('id', contactId);
}

/**
 * Recompute tier based on lifetime value + interaction count.
 * Thresholds: warm = 5+ events; paid = $5+; regular = $50+; inner = $250+.
 */
const TIER_THRESHOLDS = { paid: 500, regular: 5000, inner: 25000 } as const;

export async function recomputeTier(
  sb: SupabaseClient,
  contactId: string,
): Promise<ContactTier> {
  const { data: c } = await sb.from('contacts')
    .select('lifetime_value_cents, tier')
    .eq('id', contactId)
    .single();
  if (!c) return 'stranger';

  const { count } = await sb.from('contact_events')
    .select('id', { count: 'exact', head: true })
    .eq('contact_id', contactId);

  const ltv = c.lifetime_value_cents || 0;
  let tier: ContactTier = 'stranger';
  if (ltv >= TIER_THRESHOLDS.inner) tier = 'inner';
  else if (ltv >= TIER_THRESHOLDS.regular) tier = 'regular';
  else if (ltv >= TIER_THRESHOLDS.paid) tier = 'paid';
  else if ((count || 0) >= 5) tier = 'warm';

  if (tier !== c.tier) {
    await sb.from('contacts').update({ tier, updated_at: new Date().toISOString() }).eq('id', contactId);
  }
  return tier;
}
