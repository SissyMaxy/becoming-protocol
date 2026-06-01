// Auto-Poster Activity Context
//
// The Handler runs in the Becoming app chat. The auto-poster runs in a
// scheduler script. Without a bridge, they are strangers — the Handler has
// no idea what the auto-poster is saying to men on Sniffies/FetLife/DMs.
//
// This builder reads the last 24h of auto-poster chat activity from
// ai_generated_content (outbound replies) and contact_events (both
// directions), clusters by contact, flags meetup-proposing messages, and
// emits a compact context block the Handler can reference.
//
// Keys: "did the auto-poster just agree to meet someone tonight?" must be
// answerable from this block alone.

import { supabase } from '../supabase';

const MEETUP_SIGNALS = [
  /\btonight\b/i,
  /\bcome over\b/i,
  /\bmeet\b/i,
  /\bwhen can you\b/i,
  /\bwhat time\b/i,
  /\bwhere (are|r) you\b/i,
  /\baddress\b/i,
  /\bhotel\b/i,
  /\bmy place\b/i,
  /\byour place\b/i,
  /\btoday\b/i,
  /\bthis afternoon\b/i,
  /\bin an hour\b/i,
  /\bright now\b/i,
  /\bon my way\b/i,
  /\beta\b/i,
];

function detectMeetupProposal(text: string): boolean {
  if (!text) return false;
  let hits = 0;
  for (const re of MEETUP_SIGNALS) {
    if (re.test(text)) hits++;
    if (hits >= 1) return true;  // single strong keyword is enough
  }
  return false;
}

interface ContactCluster {
  contactId: string;
  displayName: string;
  tier: string;
  platform: string;
  handle: string;
  inCount: number;
  outCount: number;
  lastIn: { content: string; at: string } | null;
  lastOut: { content: string; at: string } | null;
  meetupFlagged: boolean;
}

export async function buildAutoPosterActivityContext(userId: string): Promise<string> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  try {
    // Pull recent inbound/outbound chat events across platforms the auto-poster
    // operates on (sniffies, fetlife, fansly, twitter, reddit, onlyfans).
    const { data: events } = await supabase
      .from('contact_events')
      .select('contact_id, platform, event_type, direction, content, occurred_at')
      .eq('user_id', userId)
      .in('event_type', ['chat_in', 'chat_out', 'dm_in', 'dm_out', 'reply_in', 'reply_out'])
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(200);

    if (!events || events.length === 0) return '';

    // Load contact metadata in one batch
    const contactIds = Array.from(new Set(events.map(e => e.contact_id)));
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, display_name, tier')
      .in('id', contactIds);

    const { data: handles } = await supabase
      .from('contact_handles')
      .select('contact_id, platform, handle')
      .in('contact_id', contactIds);

    const contactById = new Map(contacts?.map(c => [c.id, c]) || []);
    const handlesByContact = new Map<string, { platform: string; handle: string }>();
    for (const h of handles || []) {
      if (!handlesByContact.has(h.contact_id)) {
        handlesByContact.set(h.contact_id, { platform: h.platform, handle: h.handle });
      }
    }

    // Cluster by contact
    const clusters = new Map<string, ContactCluster>();
    for (const e of events) {
      const c = contactById.get(e.contact_id);
      if (!c) continue;
      const h = handlesByContact.get(e.contact_id);
      if (!clusters.has(e.contact_id)) {
        clusters.set(e.contact_id, {
          contactId: e.contact_id,
          displayName: c.display_name || h?.handle || 'unknown',
          tier: c.tier,
          platform: h?.platform || e.platform,
          handle: h?.handle || '',
          inCount: 0,
          outCount: 0,
          lastIn: null,
          lastOut: null,
          meetupFlagged: false,
        });
      }
      const cluster = clusters.get(e.contact_id)!;
      const isIn = e.direction === 'in';
      if (isIn) {
        cluster.inCount++;
        if (!cluster.lastIn) cluster.lastIn = { content: e.content || '', at: e.occurred_at };
      } else {
        cluster.outCount++;
        if (!cluster.lastOut) cluster.lastOut = { content: e.content || '', at: e.occurred_at };
      }
      if (detectMeetupProposal(e.content || '')) cluster.meetupFlagged = true;
    }

    if (clusters.size === 0) return '';

    // Sort: meetup-flagged first, then by exchange volume
    const sorted = Array.from(clusters.values()).sort((a, b) => {
      if (a.meetupFlagged !== b.meetupFlagged) return a.meetupFlagged ? -1 : 1;
      return (b.inCount + b.outCount) - (a.inCount + a.outCount);
    });

    const flagged = sorted.filter(c => c.meetupFlagged);
    const lines: string[] = [];
    lines.push(`AUTO-POSTER ACTIVITY (24h): ${sorted.length} active conversation(s) across platforms`);

    if (flagged.length > 0) {
      lines.push(`  ⚠ MEETUP SIGNAL in ${flagged.length} conversation(s):`);
      for (const c of flagged.slice(0, 5)) {
        const hrsAgo = c.lastIn
          ? Math.round((Date.now() - new Date(c.lastIn.at).getTime()) / 3600_000)
          : -1;
        const lastInPreview = c.lastIn ? c.lastIn.content.slice(0, 80).replace(/\s+/g, ' ') : '(none)';
        const lastOutPreview = c.lastOut ? c.lastOut.content.slice(0, 80).replace(/\s+/g, ' ') : '(none)';
        lines.push(`    [${c.platform}/${c.tier}] ${c.displayName} (in=${c.inCount} out=${c.outCount}, last ${hrsAgo}h):`);
        lines.push(`      them: "${lastInPreview}"`);
        lines.push(`      bot:  "${lastOutPreview}"`);
      }
    }

    const nonFlagged = sorted.filter(c => !c.meetupFlagged).slice(0, 5);
    if (nonFlagged.length > 0) {
      lines.push(`  Other active: ${nonFlagged.map(c => `${c.displayName}[${c.platform}](${c.inCount}i/${c.outCount}o)`).join(', ')}`);
    }

    return lines.join('\n');
  } catch (err) {
    console.error('[auto-poster-activity] context build failed:', err);
    return '';
  }
}
