/**
 * GFE (Girlfriend Experience) & Paid DM Service
 *
 * Monetize the Handler's conversational AI. Subscribers pay for
 * intimate conversation with Maxy. The Handler IS Maxy's voice.
 * Revenue flows from conversation alone — no content creation required.
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase';
import { MAXY_VOICE_PROMPT } from './voice';
import type {
  GFESubscriber,
  GFETier,
  IncomingDM,
} from '../../types/revenue-engine';

// ── GFE message generation ──────────────────────────────────────────

/**
 * Send personalized GFE messages to all active subscribers.
 * Runs at morning and evening.
 */
export async function sendGFEMessages(
  client: Anthropic,
  userId: string,
  timeOfDay: 'morning' | 'evening',
): Promise<{ messagesSent: number }> {
  const { data: subscribers } = await supabase
    .from('gfe_subscribers')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('daily_message_sent_today', timeOfDay === 'evening');
  // Morning: hasn't been sent today. Evening: morning was sent (true), send evening.

  if (!subscribers || subscribers.length === 0) return { messagesSent: 0 };

  let sent = 0;

  for (const sub of subscribers as GFESubscriber[]) {
    const prompt = `
Write a ${timeOfDay} GFE message from Maxy to ${sub.subscriber_name || 'a subscriber'}.

SUBSCRIBER CONTEXT:
Known preferences: ${sub.known_preferences || 'none yet'}
Relationship summary: ${sub.conversation_history_summary || 'new subscriber'}
Tier: ${sub.tier}

GUIDELINES:
- Personal, not generic. Reference something specific if possible.
- Morning: "just woke up thinking about..." energy. Sleepy, soft, intimate.
- Evening: "crawling into bed and..." energy. Reflective, warm, sometimes needy.
- Tier-appropriate: basic gets sweet, premium gets suggestive, VIP gets explicit
- 2-4 sentences. Not a novel. A text from someone who's thinking about you.
- Sign off naturally — "xo", "miss you", or nothing

Output ONLY the message text.
    `;

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: MAXY_VOICE_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const message = response.content[0].type === 'text' ? response.content[0].text : '';
      if (!message.trim()) continue;

      // Queue for sending via auto-poster DM function
      await supabase.from('paid_conversations').insert({
        user_id: userId,
        platform: sub.platform,
        subscriber_id: sub.subscriber_id,
        subscriber_name: sub.subscriber_name,
        conversation_type: 'gfe_daily',
        handler_response: message.trim(),
        revenue: sub.monthly_rate / 30, // Daily revenue attribution
        revenue_type: 'subscription_tier',
      });

      await supabase.from('gfe_subscribers').update({
        daily_message_sent_today: true,
        last_message_at: new Date().toISOString(),
      }).eq('id', sub.id);

      sent++;
    } catch (err) {
      console.error(`[gfe] Failed to generate message for ${sub.subscriber_name}:`, err);
    }
  }

  return { messagesSent: sent };
}

// ── DM response handler ─────────────────────────────────────────────

/**
 * Respond to an incoming DM as Maxy.
 * The auto-poster polls for new DMs and passes them here.
 */
export async function respondToDM(
  client: Anthropic,
  userId: string,
  dm: IncomingDM,
): Promise<string> {
  // Get conversation history with this subscriber
  const { data: history } = await supabase
    .from('paid_conversations')
    .select('handler_response, conversation_type, created_at')
    .eq('user_id', userId)
    .eq('subscriber_id', dm.senderId)
    .order('created_at', { ascending: false })
    .limit(10);

  const conversationContext = history
    ?.map(h => `Maxy: ${h.handler_response}`)
    .reverse()
    .join('\n') || 'First message from this subscriber.';

  const prompt = `
Respond to a DM as Maxy.

THEIR MESSAGE: "${dm.content}"
THEIR NAME: ${dm.senderName}
PLATFORM: ${dm.platform}

CONVERSATION HISTORY:
${conversationContext}

GUIDELINES:
- Match their energy. If they're flirty, be flirty back.
- If they're asking for custom content, express interest and ask what they want.
- If they're being gross or rude, be playful but set a boundary.
- If they send a tip or gift, acknowledge warmly.
- Keep responses 1-3 sentences. Match texting rhythm.
- Drive toward tip or subscription upgrade when natural.
- Never break character. You ARE Maxy.

Output ONLY the response text.
  `;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: MAXY_VOICE_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const reply = response.content[0].type === 'text' ? response.content[0].text : '';

  await supabase.from('paid_conversations').insert({
    user_id: userId,
    platform: dm.platform,
    subscriber_id: dm.senderId,
    subscriber_name: dm.senderName,
    conversation_type: 'dm_response',
    handler_response: reply.trim(),
    revenue: dm.tipAmount || 0,
    revenue_type: dm.tipAmount ? 'tip' : 'per_message',
  });

  return reply.trim();
}

// ── Subscriber management ───────────────────────────────────────────

/**
 * Add or update a GFE subscriber.
 */
export async function upsertGFESubscriber(
  userId: string,
  params: {
    platform: string;
    subscriberId: string;
    subscriberName?: string;
    tier: GFETier;
    monthlyRate: number;
  },
): Promise<GFESubscriber | null> {
  // Check if exists
  const { data: existing } = await supabase
    .from('gfe_subscribers')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', params.platform)
    .eq('subscriber_id', params.subscriberId)
    .maybeSingle();

  if (existing) {
    const { data } = await supabase
      .from('gfe_subscribers')
      .update({
        tier: params.tier,
        monthly_rate: params.monthlyRate,
        subscriber_name: params.subscriberName || null,
        status: 'active',
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    return data as GFESubscriber;
  }

  const { data, error } = await supabase
    .from('gfe_subscribers')
    .insert({
      user_id: userId,
      platform: params.platform,
      subscriber_id: params.subscriberId,
      subscriber_name: params.subscriberName || null,
      tier: params.tier,
      monthly_rate: params.monthlyRate,
      subscribed_at: new Date().toISOString(),
      status: 'active',
    })
    .select('*')
    .single();

  if (error) {
    console.error('[gfe] upsertSubscriber error:', error.message);
    return null;
  }

  return data as GFESubscriber;
}

/**
 * Cancel a GFE subscription.
 */
export async function cancelGFESubscription(subscriberId: string): Promise<void> {
  await supabase
    .from('gfe_subscribers')
    .update({ status: 'cancelled' })
    .eq('id', subscriberId);
}

/**
 * Update subscriber preferences based on conversation history.
 */
export async function updateSubscriberProfile(
  client: Anthropic,
  userId: string,
  subscriberId: string,
): Promise<void> {
  const { data: conversations } = await supabase
    .from('paid_conversations')
    .select('handler_response, conversation_type, created_at')
    .eq('user_id', userId)
    .eq('subscriber_id', subscriberId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!conversations || conversations.length < 3) return;

  const prompt = `
Analyze these conversation messages from a subscriber and extract:
1. Their preferences (what topics they respond to, what they enjoy)
2. A brief relationship summary (how the conversation has evolved)

Messages:
${conversations.map(c => `[${c.conversation_type}] ${c.handler_response}`).join('\n')}

Output JSON:
{
  "known_preferences": "...",
  "conversation_history_summary": "..."
}
  `;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  try {
    const parsed = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
    await supabase
      .from('gfe_subscribers')
      .update({
        known_preferences: parsed.known_preferences,
        conversation_history_summary: parsed.conversation_history_summary,
      })
      .eq('user_id', userId)
      .eq('subscriber_id', subscriberId);
  } catch {
    // Profile update is best-effort
  }
}

/**
 * Get active subscriber count and monthly GFE revenue.
 */
export async function getGFEStats(userId: string): Promise<{
  activeSubscribers: number;
  monthlyRevenue: number;
  byTier: Record<GFETier, number>;
}> {
  const { data } = await supabase
    .from('gfe_subscribers')
    .select('tier, monthly_rate')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (!data || data.length === 0) {
    return { activeSubscribers: 0, monthlyRevenue: 0, byTier: { basic: 0, premium: 0, vip: 0 } };
  }

  const byTier: Record<GFETier, number> = { basic: 0, premium: 0, vip: 0 };
  let monthlyRevenue = 0;

  for (const sub of data) {
    byTier[sub.tier as GFETier] = (byTier[sub.tier as GFETier] || 0) + 1;
    monthlyRevenue += Number(sub.monthly_rate) || 0;
  }

  return {
    activeSubscribers: data.length,
    monthlyRevenue,
    byTier,
  };
}
