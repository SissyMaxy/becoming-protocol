/**
 * Stale Conversation Revival
 *
 * Scans paid_conversations for threads that died off and surfaces them to
 * Handler's attention queue so Maxy sees what she let slip.
 *
 * Two patterns flagged:
 *   - "unanswered_inbound"  — they messaged last, no reply from us, >48h old
 *   - "stale_outbound"      — we messaged last, no follow-up from them, >7d old
 *
 * Severity is scored by contact tier, lifetime spend, and thread length.
 *
 * Run: npx tsx stale-conversation-revival.ts
 * Or scheduled via scheduler.ts (daily cadence — see integration below).
 */

import 'dotenv/config';
import { supabase } from './config';
import { queueAttentionDedup } from './handler-attention';

const USER_ID = process.env.USER_ID || '';
if (!USER_ID) {
  console.error('[stale] USER_ID not set');
  process.exit(1);
}

const UNANSWERED_INBOUND_MIN_HOURS = 48;
const STALE_OUTBOUND_MIN_DAYS = 7;
const HARD_CUTOFF_DAYS = 45;  // Past this, don't bother — dead is dead.
const MAX_ITEMS_QUEUED_PER_RUN = 15;

interface ThreadState {
  platform: string;
  subscriberId: string;
  subscriberName: string;
  lastIncomingAt: string | null;
  lastOutgoingAt: string | null;
  lastIncomingText: string | null;
  lastOutgoingText: string | null;
  messageCount: number;
  lifetimeValueCents: number;
  tier: string | null;
  contactId: string | null;
}

async function loadActiveThreads(): Promise<ThreadState[]> {
  const cutoff = new Date(Date.now() - HARD_CUTOFF_DAYS * 86400_000).toISOString();

  const { data: rows, error } = await supabase
    .from('paid_conversations')
    .select('platform, subscriber_id, subscriber_name, incoming_message, handler_response, message_direction, sent_at, created_at')
    .eq('user_id', USER_ID)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(5000);

  if (error) {
    console.error('[stale] paid_conversations read failed:', error.message);
    return [];
  }
  if (!rows || rows.length === 0) return [];

  const byThread = new Map<string, ThreadState>();
  for (const r of rows) {
    const key = `${r.platform}::${r.subscriber_id}`;
    let t = byThread.get(key);
    if (!t) {
      t = {
        platform: r.platform,
        subscriberId: r.subscriber_id,
        subscriberName: r.subscriber_name || r.subscriber_id,
        lastIncomingAt: null,
        lastOutgoingAt: null,
        lastIncomingText: null,
        lastOutgoingText: null,
        messageCount: 0,
        lifetimeValueCents: 0,
        tier: null,
        contactId: null,
      };
      byThread.set(key, t);
    }
    t.messageCount++;
    const when = r.sent_at || r.created_at;
    if (r.message_direction === 'inbound' || (!r.message_direction && r.incoming_message)) {
      if (!t.lastIncomingAt || when > t.lastIncomingAt) {
        t.lastIncomingAt = when;
        t.lastIncomingText = r.incoming_message;
      }
    } else if (r.message_direction === 'outbound' || (!r.message_direction && r.handler_response)) {
      if (!t.lastOutgoingAt || when > t.lastOutgoingAt) {
        t.lastOutgoingAt = when;
        t.lastOutgoingText = r.handler_response;
      }
    }
  }

  // Join contact tier + lifetime value from contacts via contact_handles.
  const subscriberIds = [...new Set([...byThread.values()].map(t => t.subscriberId))];
  if (subscriberIds.length > 0) {
    const { data: handles } = await supabase
      .from('contact_handles')
      .select('contact_id, platform, handle')
      .eq('user_id', USER_ID)
      .in('handle', subscriberIds)
      .limit(2000);
    const contactIds = [...new Set((handles || []).map(h => h.contact_id).filter(Boolean))];
    const contactsById = new Map<string, { tier: string | null; lifetime_value_cents: number; display_name: string | null }>();
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, tier, lifetime_value_cents, display_name')
        .in('id', contactIds);
      for (const c of contacts || []) {
        contactsById.set(c.id, {
          tier: c.tier || null,
          lifetime_value_cents: c.lifetime_value_cents || 0,
          display_name: c.display_name || null,
        });
      }
    }
    for (const h of handles || []) {
      for (const t of byThread.values()) {
        // Match on platform + handle so the same username on two platforms
        // doesn't get cross-contaminated attribution.
        if (t.subscriberId === h.handle && t.platform === h.platform) {
          t.contactId = h.contact_id;
          const c = contactsById.get(h.contact_id);
          if (c) {
            t.tier = c.tier;
            t.lifetimeValueCents = c.lifetime_value_cents;
            if (c.display_name) t.subscriberName = c.display_name;
          }
        }
      }
    }
  }

  return [...byThread.values()];
}

interface StaleFinding {
  kind: 'unanswered_inbound' | 'stale_outbound';
  thread: ThreadState;
  ageHours: number;
  severity: 'low' | 'medium' | 'high';
  summary: string;
  payload: Record<string, unknown>;
}

function classifyThread(t: ThreadState): StaleFinding | null {
  const now = Date.now();
  const lastIncomingMs = t.lastIncomingAt ? new Date(t.lastIncomingAt).getTime() : 0;
  const lastOutgoingMs = t.lastOutgoingAt ? new Date(t.lastOutgoingAt).getTime() : 0;

  // Unanswered inbound: they spoke last and it's been >48h
  if (lastIncomingMs > 0 && lastIncomingMs > lastOutgoingMs) {
    const ageHours = Math.floor((now - lastIncomingMs) / 3600_000);
    if (ageHours < UNANSWERED_INBOUND_MIN_HOURS) return null;
    const severity = scoreSeverity(t, ageHours, 'inbound');
    return {
      kind: 'unanswered_inbound',
      thread: t,
      ageHours,
      severity,
      summary: `${t.platform}/${t.subscriberName} — unanswered ${Math.round(ageHours / 24)}d: "${(t.lastIncomingText || '').slice(0, 80)}"`,
      payload: {
        platform: t.platform,
        subscriber_id: t.subscriberId,
        subscriber_name: t.subscriberName,
        last_inbound_at: t.lastIncomingAt,
        last_inbound_text: t.lastIncomingText,
        age_hours: ageHours,
        tier: t.tier,
        lifetime_value_cents: t.lifetimeValueCents,
        message_count: t.messageCount,
      },
    };
  }

  // Stale outbound: we spoke last and it's been >7d with no response
  if (lastOutgoingMs > 0 && lastOutgoingMs > lastIncomingMs) {
    const ageHours = Math.floor((now - lastOutgoingMs) / 3600_000);
    const ageDays = Math.floor(ageHours / 24);
    if (ageDays < STALE_OUTBOUND_MIN_DAYS) return null;
    // Only flag stale-outbound for known contacts (tier or spend). Cold outreach
    // that went unanswered is noise — they weren't interested.
    if (!t.tier && t.lifetimeValueCents === 0) return null;
    const severity = scoreSeverity(t, ageHours, 'outbound');
    return {
      kind: 'stale_outbound',
      thread: t,
      ageHours,
      severity,
      summary: `${t.platform}/${t.subscriberName} — you spoke last ${ageDays}d ago, they ghosted: "${(t.lastOutgoingText || '').slice(0, 80)}"`,
      payload: {
        platform: t.platform,
        subscriber_id: t.subscriberId,
        subscriber_name: t.subscriberName,
        last_outbound_at: t.lastOutgoingAt,
        last_outbound_text: t.lastOutgoingText,
        age_hours: ageHours,
        tier: t.tier,
        lifetime_value_cents: t.lifetimeValueCents,
        message_count: t.messageCount,
      },
    };
  }

  return null;
}

function scoreSeverity(t: ThreadState, ageHours: number, direction: 'inbound' | 'outbound'): 'low' | 'medium' | 'high' {
  const tierWeight = t.tier === 'vip' ? 3 : t.tier === 'paying' ? 2 : t.tier === 'warm' ? 1 : 0;
  const revenueWeight = t.lifetimeValueCents >= 5000 ? 3 : t.lifetimeValueCents >= 1000 ? 2 : t.lifetimeValueCents > 0 ? 1 : 0;
  const threadDepthWeight = t.messageCount >= 10 ? 2 : t.messageCount >= 4 ? 1 : 0;
  // Inbound decays faster — a fresh unanswered is high, a 2-week-old one is lower
  // because the moment has passed. Outbound is the opposite — longer silence = higher ask.
  const ageWeight =
    direction === 'inbound'
      ? (ageHours < 96 ? 2 : ageHours < 240 ? 1 : 0)
      : (ageHours > 336 ? 2 : ageHours > 168 ? 1 : 0);

  const total = tierWeight + revenueWeight + threadDepthWeight + ageWeight;
  if (total >= 6) return 'high';
  if (total >= 3) return 'medium';
  return 'low';
}

export async function runStaleRevival(): Promise<{ scanned: number; queued: number }> {
  console.log('[stale] Scanning for conversations that died off...');

  const threads = await loadActiveThreads();
  if (threads.length === 0) {
    console.log('[stale] No recent conversations to scan.');
    return { scanned: 0, queued: 0 };
  }

  const findings: StaleFinding[] = [];
  for (const t of threads) {
    const f = classifyThread(t);
    if (f) findings.push(f);
  }

  // Rank by severity (high first) then age so top items get queued first even if the cap is hit.
  findings.sort((a, b) => {
    const sevRank = { high: 0, medium: 1, low: 2 };
    if (sevRank[a.severity] !== sevRank[b.severity]) return sevRank[a.severity] - sevRank[b.severity];
    return b.ageHours - a.ageHours;
  });

  const topN = findings.slice(0, MAX_ITEMS_QUEUED_PER_RUN);
  let queued = 0;
  for (const f of topN) {
    const ok = await queueAttentionDedup(
      supabase,
      USER_ID,
      {
        kind: f.kind,
        severity: f.severity,
        contactId: f.thread.contactId,
        platform: f.thread.platform,
        summary: f.summary,
        payload: f.payload,
      },
      24 * 60,  // dedup window: don't re-queue same contact+kind within 24h
    );
    if (ok) queued++;
  }

  console.log(`[stale] Scanned ${threads.length} thread(s), found ${findings.length} stale, queued ${queued}.`);
  if (topN.length > 0) {
    console.log('[stale] Top items:');
    for (const f of topN.slice(0, 5)) {
      console.log(`  [${f.severity}] ${f.summary}`);
    }
  }
  return { scanned: threads.length, queued };
}

if (require.main === module) {
  runStaleRevival()
    .then(r => {
      console.log(`[stale] Done: ${r.scanned} scanned, ${r.queued} queued.`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[stale] Fatal:', err);
      process.exit(1);
    });
}
