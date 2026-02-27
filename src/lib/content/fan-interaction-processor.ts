/**
 * Fan Interaction Processor
 *
 * Classifies sentiment, decides handler action, generates responses,
 * curates positive interactions for morning briefing.
 */

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';
import type { FanInteraction, Sentiment, HandlerAction } from '../../types/content-pipeline';

// ── Sentiment classification ─────────────────────────────

const SENTIMENT_KEYWORDS: Record<Sentiment, string[]> = {
  positive: ['love', 'amazing', 'gorgeous', 'beautiful', 'queen', 'goddess', 'perfect', 'stunning'],
  supportive: ['proud', 'support', 'keep going', 'inspire', 'strong', 'brave'],
  thirsty: ['please', 'more', 'want', 'need', 'show', 'when'],
  demanding: ['now', 'where', 'why haven\'t', 'you owe', 'pay', 'unfair'],
  negative: ['hate', 'ugly', 'fake', 'scam', 'waste', 'terrible', 'worst'],
  neutral: [],
};

export function classifySentiment(content: string): Sentiment {
  const lower = content.toLowerCase();

  let bestMatch: Sentiment = 'neutral';
  let bestCount = 0;

  for (const [sentiment, keywords] of Object.entries(SENTIMENT_KEYWORDS)) {
    const count = keywords.filter(kw => lower.includes(kw)).length;
    if (count > bestCount) {
      bestCount = count;
      bestMatch = sentiment as Sentiment;
    }
  }

  return bestMatch;
}

// ── Decide handler action ────────────────────────────────

export function decideAction(
  sentiment: Sentiment,
  tipAmount: number,
  fanTier: string
): HandlerAction {
  // Whales and supporters always get responses
  if (fanTier === 'whale' || fanTier === 'gfe') return 'respond';

  // Tips always get responses
  if (tipAmount > 0) return 'respond';

  // Negative gets ignored
  if (sentiment === 'negative') return 'ignore';

  // Demanding — escalate if persistent, ignore otherwise
  if (sentiment === 'demanding') return 'ignore';

  // Positive/supportive — curate for briefing
  if (sentiment === 'positive' || sentiment === 'supportive') return 'curate';

  // Thirsty from supporters — respond
  if (sentiment === 'thirsty' && (fanTier === 'supporter' || fanTier === 'regular')) return 'respond';

  return 'ignore';
}

// ── Process interaction (full pipeline) ──────────────────

export async function processFanInteraction(
  userId: string,
  interactionId: string
): Promise<boolean> {
  const { data: interaction, error } = await supabase
    .from('fan_interactions')
    .select('*')
    .eq('id', interactionId)
    .eq('user_id', userId)
    .single();

  if (error || !interaction) return false;

  const content = (interaction.content as string) || '';
  const sentiment = classifySentiment(content);
  const action = decideAction(
    sentiment,
    interaction.tip_amount_cents as number,
    interaction.fan_tier as string
  );

  let handlerResponse: string | null = null;

  // Generate response if action requires it
  if (action === 'respond') {
    const { data: aiResult } = await invokeWithAuth('handler-ai', {
      action: 'draft_fan_response',
      fan: {
        username: interaction.fan_username,
        platform: interaction.fan_platform,
        tier: interaction.fan_tier,
      },
      interaction: {
        type: interaction.interaction_type,
        content,
        sentiment,
        tip_amount: interaction.tip_amount_cents,
      },
    });

    handlerResponse = (aiResult && typeof aiResult === 'object')
      ? (aiResult as Record<string, unknown>).response as string || null
      : null;
  }

  // Update interaction
  const { error: updateErr } = await supabase
    .from('fan_interactions')
    .update({
      sentiment,
      handler_action: action,
      handler_response: handlerResponse,
      updated_at: new Date().toISOString(),
    })
    .eq('id', interactionId)
    .eq('user_id', userId);

  return !updateErr;
}

// ── Get curated praise (for briefing) ────────────────────

export async function getCuratedPraise(
  userId: string,
  limit: number = 10
): Promise<FanInteraction[]> {
  const { data, error } = await supabase
    .from('fan_interactions')
    .select('*')
    .eq('user_id', userId)
    .in('sentiment', ['positive', 'supportive'])
    .eq('handler_action', 'curate')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data || []) as FanInteraction[];
}

// ── Get interaction summary for context ──────────────────

export async function getInteractionSummary(userId: string): Promise<{
  totalToday: number;
  pendingResponses: number;
  tipsToday: number;
  topSentiment: string;
}> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('fan_interactions')
    .select('sentiment, handler_action, response_approved, tip_amount_cents, created_at')
    .eq('user_id', userId)
    .gte('created_at', today + 'T00:00:00');

  if (error || !data) {
    return { totalToday: 0, pendingResponses: 0, tipsToday: 0, topSentiment: 'neutral' };
  }

  const sentimentCounts: Record<string, number> = {};
  let pendingResponses = 0;
  let tipsToday = 0;

  for (const row of data) {
    const s = (row.sentiment as string) || 'neutral';
    sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;

    if (row.handler_action === 'respond' && !row.response_approved) pendingResponses++;
    tipsToday += (row.tip_amount_cents as number) || 0;
  }

  const topSentiment = Object.entries(sentimentCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';

  return {
    totalToday: data.length,
    pendingResponses,
    tipsToday,
    topSentiment,
  };
}
