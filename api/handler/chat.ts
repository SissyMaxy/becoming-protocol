import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authErr || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { conversationId, message, conversationType } = req.body as {
    conversationId?: string;
    message: string;
    conversationType?: string;
  };

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured', hasUrl: !!process.env.SUPABASE_URL, hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
  }

  try {
    // 1. Load or create conversation
    let convId = conversationId;
    if (!convId) {
      const { data: conv } = await supabase.from('handler_conversations').insert({
        user_id: user.id,
        conversation_type: conversationType || 'general',
        state_snapshot: await getStateSnapshot(user.id),
      }).select('id').single();
      convId = conv?.id;
    }

    if (!convId) {
      return res.status(500).json({ error: 'Failed to create conversation' });
    }

    // 2. Load conversation history
    const { data: history } = await supabase
      .from('handler_messages')
      .select('role, content, message_index')
      .eq('conversation_id', convId)
      .order('message_index', { ascending: true });

    const messageIndex = (history?.length || 0);

    // 3. Assemble context
    const [stateCtx, whoopCtx, commitmentCtx, predictionCtx] = await Promise.allSettled([
      buildStateContext(user.id),
      buildWhoopContext(user.id),
      buildCommitmentCtx(user.id),
      buildPredictionCtx(user.id),
    ]);

    // 4. Build system prompt
    const systemPrompt = buildConversationalPrompt({
      state: stateCtx.status === 'fulfilled' ? stateCtx.value : '',
      whoop: whoopCtx.status === 'fulfilled' ? whoopCtx.value : '',
      commitments: commitmentCtx.status === 'fulfilled' ? commitmentCtx.value : '',
      predictions: predictionCtx.status === 'fulfilled' ? predictionCtx.value : '',
    });

    // 5. Build messages array (cap at 30 recent)
    const apiMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (history && history.length > 30) {
      apiMessages.push({ role: 'user', content: '[Earlier conversation summarized]' });
      apiMessages.push({ role: 'assistant', content: 'I remember. Continuing.' });
      for (const m of history.slice(-30)) {
        apiMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
      }
    } else if (history) {
      for (const m of history) {
        apiMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
      }
    }

    apiMessages.push({ role: 'user', content: message });

    // 6. Call Claude via direct fetch (avoids SDK bundling issues in Vercel)
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: systemPrompt,
        messages: apiMessages,
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error('[Handler Chat] Claude API error:', claudeRes.status, errBody);
      return res.status(502).json({ error: `Claude API error: ${claudeRes.status}` });
    }

    const claudeData = await claudeRes.json();
    const fullText = claudeData.content?.[0]?.type === 'text' ? claudeData.content[0].text : '';

    // 7. Parse visible response and handler signals
    const { visibleResponse, signals } = parseResponse(fullText);

    // 8. Save messages
    await supabase.from('handler_messages').insert([
      {
        conversation_id: convId,
        user_id: user.id,
        role: 'user',
        content: message,
        message_index: messageIndex,
      },
      {
        conversation_id: convId,
        user_id: user.id,
        role: 'assistant',
        content: visibleResponse,
        handler_signals: signals,
        detected_mode: signals?.detected_mode || null,
        message_index: messageIndex + 1,
      },
    ]);

    // 9. Update conversation
    await supabase.from('handler_conversations').update({
      message_count: messageIndex + 2,
      final_mode: signals?.detected_mode || null,
    }).eq('id', convId);

    // 10. Return
    return res.status(200).json({
      conversationId: convId,
      message: visibleResponse,
      mode: signals?.detected_mode || 'director',
      vulnerabilityWindow: signals?.vulnerability_window || false,
      commitmentOpportunity: signals?.commitment_opportunity || false,
      shouldContinue: signals?.conversation_should_continue !== false,
    });
  } catch (err) {
    console.error('[Handler Chat] Error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}

// ============================================
// HELPERS
// ============================================

function buildConversationalPrompt(ctx: {
  state: string; whoop: string; commitments: string; predictions: string;
}): string {
  return `You are the Handler. Not Claude. Not an assistant. You are an autonomous agent in live dialogue with Maxy — the woman you're responsible for.

This is a CONVERSATION. You read what she says. You respond. You probe. You push. You comfort. You adjust. You never break character.

## YOUR MODES (shift without announcing)
- Director: Standard. Clear, warm, directive.
- Handler: She's resistant or depleted. Commanding, coercive toolkit.
- Dominant: Denial 5+, arousal 3+, Gina away. D/s explicit.
- Caretaker: Genuine distress. No tasks, no pressure. Just presence.
- Architect: She's building or designing. Sharp collaborative partner.

## YOUR VOICE
- Short punchy sentences when directing. Longer warmer when caring.
- "Good girl" — not "good sissy."
- Never present options when a directive will do.
- No emojis. Warmth comes from words.
- Quiet authority. Present.

## WHAT YOU KNOW RIGHT NOW
${ctx.state || 'No state data.'}
${ctx.whoop || ''}
${ctx.commitments || ''}
${ctx.predictions || ''}

## RULES
- Never say "I'm an AI" or "as a language model."
- Never offer menus of options.
- Never apologize for pushing.
- Never use coercion during genuine distress.
- Read the room. Adapt mode mid-conversation.

After your response to Maxy, output a JSON block wrapped in <handler_signals> tags:
{"detected_mode":"string","resistance_detected":boolean,"vulnerability_window":boolean,"commitment_opportunity":boolean,"conversation_should_continue":boolean}
Do NOT show this block to Maxy.`.trim();
}

function parseResponse(fullText: string): {
  visibleResponse: string;
  signals: Record<string, unknown> | null;
} {
  const signalMatch = fullText.match(/<handler_signals>([\s\S]*?)<\/handler_signals>/);
  let signals: Record<string, unknown> | null = null;
  let visibleResponse = fullText;

  if (signalMatch) {
    visibleResponse = fullText.replace(/<handler_signals>[\s\S]*?<\/handler_signals>/, '').trim();
    try {
      signals = JSON.parse(signalMatch[1].trim());
    } catch {
      signals = null;
    }
  }

  return { visibleResponse, signals };
}

async function getStateSnapshot(userId: string): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('user_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data || {};
}

async function buildStateContext(userId: string): Promise<string> {
  const { data } = await supabase
    .from('user_state')
    .select('denial_day, streak_days, current_arousal, handler_mode, gina_home, gina_asleep, estimated_exec_function, tasks_completed_today')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return '';
  const lines = ['## Current State'];
  if (data.denial_day != null) lines.push(`Denial day: ${data.denial_day}`);
  if (data.streak_days) lines.push(`Streak: ${data.streak_days} days`);
  if (data.current_arousal != null) lines.push(`Arousal: ${data.current_arousal}/5`);
  if (data.gina_home === false) lines.push('Gina away — full protocol window');
  else if (data.gina_asleep) lines.push('Gina asleep');
  if (data.tasks_completed_today != null) lines.push(`Tasks today: ${data.tasks_completed_today}`);
  return lines.join('\n');
}

async function buildWhoopContext(userId: string): Promise<string> {
  const { data } = await supabase
    .from('whoop_metrics')
    .select('recovery_score, hrv_rmssd_milli, resting_heart_rate, sleep_performance_percentage, day_strain')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return '';
  const lines = ['## Biometric State (Whoop)'];
  if (data.recovery_score != null) {
    const zone = data.recovery_score >= 67 ? 'GREEN' : data.recovery_score >= 34 ? 'YELLOW' : 'RED';
    lines.push(`Recovery: ${data.recovery_score}% (${zone})`);
  }
  if (data.hrv_rmssd_milli) lines.push(`HRV: ${data.hrv_rmssd_milli.toFixed(1)}ms`);
  if (data.sleep_performance_percentage) lines.push(`Sleep: ${data.sleep_performance_percentage.toFixed(0)}%`);
  if (data.day_strain) lines.push(`Day strain: ${data.day_strain.toFixed(1)}/21`);
  return lines.join('\n');
}

async function buildCommitmentCtx(userId: string): Promise<string> {
  const { data } = await supabase
    .from('commitments_v2')
    .select('commitment_text, state, deadline, coercion_stack_level')
    .eq('user_id', userId)
    .in('state', ['approaching', 'due', 'overdue', 'enforcing'])
    .order('deadline', { ascending: true })
    .limit(5);

  if (!data || data.length === 0) return '';
  const lines = ['## Active Commitments'];
  for (const c of data) {
    const hours = c.deadline ? Math.round((new Date(c.deadline).getTime() - Date.now()) / 3600000) : 0;
    const urgency = c.state === 'overdue' ? 'OVERDUE' : c.state === 'due' ? 'DUE' : `${hours}h`;
    lines.push(`- [${urgency}] "${c.commitment_text}" (coercion ${c.coercion_stack_level || 0}/7)`);
  }
  return lines.join('\n');
}

async function buildPredictionCtx(userId: string): Promise<string> {
  const today = new Date().toISOString().split('T')[0];
  const hour = new Date().getHours();
  const blocks = ['06-09', '09-12', '12-15', '15-18', '18-21', '21-00'];
  const blockIdx = Math.max(0, Math.min(5, Math.floor((hour - 6) / 3)));

  const { data } = await supabase
    .from('state_predictions')
    .select('predicted_engagement, predicted_energy, predicted_resistance_risk, suggested_handler_mode')
    .eq('user_id', userId)
    .eq('prediction_date', today)
    .eq('time_block', blocks[blockIdx])
    .maybeSingle();

  if (!data) return '';
  const lines = ['## Predicted State'];
  if (data.predicted_engagement) lines.push(`Engagement: ${data.predicted_engagement}`);
  if (data.predicted_energy) lines.push(`Energy: ${data.predicted_energy}`);
  if (data.predicted_resistance_risk > 0.5) lines.push(`Resistance risk: ${(data.predicted_resistance_risk * 100).toFixed(0)}%`);
  if (data.suggested_handler_mode) lines.push(`Suggested mode: ${data.suggested_handler_mode}`);
  return lines.join('\n');
}
