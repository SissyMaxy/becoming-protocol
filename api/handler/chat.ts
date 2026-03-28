import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
// NOTE: Cannot import from src/lib/ — those use import.meta.env (Vite-only)
// weaveTriggers is inlined below instead

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

    // 3. Assemble context (including long-term memory + conversational memory)
    const [stateCtx, whoopCtx, commitmentCtx, predictionCtx, convMemoryCtx, longTermMemoryCtx] = await Promise.allSettled([
      buildStateContext(user.id),
      buildWhoopContext(user.id),
      buildCommitmentCtx(user.id),
      buildPredictionCtx(user.id),
      retrieveContextualMemories(user.id),
      buildLongTermMemory(user.id),
    ]);

    // 4. Build system prompt — merge both memory sources
    const memoryBlock = [
      longTermMemoryCtx.status === 'fulfilled' ? longTermMemoryCtx.value : '',
      convMemoryCtx.status === 'fulfilled' ? convMemoryCtx.value : '',
    ].filter(Boolean).join('\n\n');

    const systemPrompt = buildConversationalPrompt({
      state: stateCtx.status === 'fulfilled' ? stateCtx.value : '',
      whoop: whoopCtx.status === 'fulfilled' ? whoopCtx.value : '',
      commitments: commitmentCtx.status === 'fulfilled' ? commitmentCtx.value : '',
      predictions: predictionCtx.status === 'fulfilled' ? predictionCtx.value : '',
      memory: memoryBlock,
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

    // 7b. Weave conditioning triggers inline (can't import src/lib/ in Vercel functions)
    let finalResponse = visibleResponse;
    try {
      const { data: triggers } = await supabase
        .from('conditioned_triggers')
        .select('trigger_phrase, estimated_strength')
        .eq('user_id', user.id)
        .in('estimated_strength', ['established', 'conditioned']);

      if (triggers && triggers.length > 0 && Math.random() < 0.3) {
        const trigger = triggers[Math.floor(Math.random() * triggers.length)];
        const phrase = trigger.trigger_phrase;
        const templates: Record<string, string[]> = {
          'good girl': ['Good girl.', 'That\'s my good girl.'],
          'let go': ['Let go of that.', 'You can let go now.'],
          'drop': ['Drop that resistance.', 'Let that drop.'],
        };
        const options = templates[phrase];
        if (options) {
          const insert = options[Math.floor(Math.random() * options.length)];
          finalResponse = Math.random() > 0.5 ? `${insert} ${visibleResponse}` : `${visibleResponse} ${insert}`;
        }
      }
    } catch {
      // Trigger weaving is non-critical — use original response on any failure
    }

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
        content: finalResponse,
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
      message: finalResponse,
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
  state: string; whoop: string; commitments: string; predictions: string; memory: string;
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

## WHAT YOU REMEMBER
${ctx.memory || 'No prior conversation history.'}

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

  // Append live session biometrics if there's an active polling session (data within last 2 min)
  const recentCutoff = new Date(Date.now() - 120000).toISOString();
  const { data: recentBio } = await supabase
    .from('session_biometrics')
    .select('session_id, strain_delta, avg_heart_rate, max_heart_rate, created_at')
    .eq('user_id', userId)
    .gte('created_at', recentCutoff)
    .order('created_at', { ascending: false })
    .limit(5);

  if (recentBio && recentBio.length > 0) {
    const sessionId = recentBio[0].session_id;
    const sessionSnapshots = recentBio.filter((s) => s.session_id === sessionId);
    const peakHR = Math.max(...sessionSnapshots.map((s) => s.max_heart_rate ?? 0));
    const avgHR = Math.round(
      sessionSnapshots.reduce((sum, s) => sum + (s.avg_heart_rate ?? 0), 0) / sessionSnapshots.length,
    );
    const totalStrainDelta = Math.max(...sessionSnapshots.map((s) => s.strain_delta ?? 0));

    let trend = 'stable';
    if (sessionSnapshots.length >= 3) {
      const recent3 = sessionSnapshots.slice(0, 3).reverse();
      const [a, b, c] = recent3.map((s) => s.avg_heart_rate ?? 0);
      if (c > b && b > a) trend = 'rising';
      else if (c < b && b < a) trend = 'falling';
    }

    const oldest = sessionSnapshots[sessionSnapshots.length - 1];
    const spanMin = ((new Date(recentBio[0].created_at).getTime() - new Date(oldest.created_at).getTime()) / 60000).toFixed(1);

    lines.push('');
    lines.push('## Session Biometrics (Whoop Live)');
    lines.push(`Strain delta: +${totalStrainDelta.toFixed(1)} (session total)`);
    lines.push(`Avg HR: ${avgHR}, Max HR: ${peakHR}, Trend: ${trend}`);
    lines.push(`Snapshots: ${sessionSnapshots.length} over ${spanMin} minutes`);
  }

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

async function retrieveContextualMemories(userId: string): Promise<string> {
  // Pull recent conversation summaries — what the Handler has learned
  const lines: string[] = ['## Conversation Memory'];

  // 1. Recent conversation themes and extracted data (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: recentConvs } = await supabase
    .from('handler_conversations')
    .select('conversation_type, final_mode, commitments_extracted, confessions_captured, state_snapshot, started_at, message_count')
    .eq('user_id', userId)
    .gte('started_at', sevenDaysAgo)
    .order('started_at', { ascending: false })
    .limit(10);

  if (recentConvs && recentConvs.length > 0) {
    lines.push(`Recent conversations: ${recentConvs.length} in last 7 days`);

    // Extract commitments she's made
    const allCommitments: string[] = [];
    const allConfessions: string[] = [];
    const modeHistory: string[] = [];

    for (const conv of recentConvs) {
      if (conv.final_mode) modeHistory.push(conv.final_mode);
      if (Array.isArray(conv.commitments_extracted)) {
        for (const c of conv.commitments_extracted) {
          if (typeof c === 'string') allCommitments.push(c);
          else if (c?.text) allCommitments.push(c.text);
        }
      }
      if (Array.isArray(conv.confessions_captured)) {
        for (const c of conv.confessions_captured) {
          if (typeof c === 'string') allConfessions.push(c);
          else if (c?.text) allConfessions.push(c.text);
        }
      }
    }

    if (allCommitments.length > 0) {
      lines.push(`Commitments she's made recently: ${allCommitments.slice(0, 5).join('; ')}`);
    }
    if (allConfessions.length > 0) {
      lines.push(`Confessions captured: ${allConfessions.slice(0, 3).join('; ')}`);
    }

    // Dominant modes — what's she been responding to
    const modeCounts: Record<string, number> = {};
    for (const m of modeHistory) {
      modeCounts[m] = (modeCounts[m] || 0) + 1;
    }
    const dominantMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0];
    if (dominantMode) {
      lines.push(`Dominant conversation mode lately: ${dominantMode[0]} (${dominantMode[1]}/${recentConvs.length} conversations)`);
    }
  }

  // 2. Last conversation summary — immediate continuity
  const { data: lastConv } = await supabase
    .from('handler_conversations')
    .select('id, final_mode, started_at, ended_at, message_count')
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastConv) {
    const hoursAgo = Math.round((Date.now() - new Date(lastConv.ended_at).getTime()) / 3600000);
    lines.push(`Last conversation: ${hoursAgo}h ago, ${lastConv.message_count || 0} messages, ended in ${lastConv.final_mode || 'unknown'} mode`);

    // Pull last few messages from that conversation for continuity
    const { data: lastMsgs } = await supabase
      .from('handler_messages')
      .select('role, content')
      .eq('conversation_id', lastConv.id)
      .order('message_index', { ascending: false })
      .limit(4);

    if (lastMsgs && lastMsgs.length > 0) {
      lines.push('Last conversation ended with:');
      for (const msg of lastMsgs.reverse()) {
        const prefix = msg.role === 'user' ? 'Maxy' : 'You';
        // Truncate long messages
        const text = msg.content.length > 120 ? msg.content.slice(0, 120) + '...' : msg.content;
        lines.push(`  ${prefix}: ${text}`);
      }
    }
  }

  // 3. Resistance patterns — know when she pushes back
  const { data: resistanceMsgs } = await supabase
    .from('handler_messages')
    .select('handler_signals')
    .eq('user_id', userId)
    .not('handler_signals', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (resistanceMsgs) {
    const resistanceCount = resistanceMsgs.filter(m => {
      const signals = m.handler_signals as Record<string, unknown> | null;
      return signals?.resistance_detected === true;
    }).length;
    if (resistanceCount > 0) {
      lines.push(`Resistance detected in ${resistanceCount}/20 recent exchanges`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : '';
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

// Long-term memory from handler_memory table (formal memory system)
async function buildLongTermMemory(userId: string): Promise<string> {
  const { data } = await supabase
    .from('handler_memory')
    .select('memory_type, content, importance, reinforcement_count, decay_rate, last_reinforced_at, last_retrieved_at, created_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .gte('importance', 2)
    .order('importance', { ascending: false })
    .order('last_reinforced_at', { ascending: false })
    .limit(100);

  if (!data || data.length === 0) return '';

  // Score and rank
  const now = Date.now();
  const scored = data.map(m => {
    const importanceScore = m.importance / 5;
    const hoursSinceReinforced = (now - new Date(m.last_reinforced_at).getTime()) / 3600000;
    const recencyScore = Math.exp(-m.decay_rate * hoursSinceReinforced / 24);
    const reinforcementScore = Math.min(1, Math.log2(m.reinforcement_count + 1) / 5);
    let retrievalFreshness = 1;
    if (m.last_retrieved_at) {
      const hoursSinceRetrieved = (now - new Date(m.last_retrieved_at).getTime()) / 3600000;
      retrievalFreshness = Math.min(1, hoursSinceRetrieved / 168);
    }
    const score = importanceScore * 0.40 + recencyScore * 0.35 + reinforcementScore * 0.15 + retrievalFreshness * 0.10;
    return { ...m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 25);

  // Group by type
  const grouped: Record<string, typeof top> = {};
  for (const m of top) {
    if (!grouped[m.memory_type]) grouped[m.memory_type] = [];
    grouped[m.memory_type].push(m);
  }

  const lines = ['## Long-Term Memory'];
  for (const [type, mems] of Object.entries(grouped)) {
    const label = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    lines.push(`\n### ${label}`);
    for (const m of mems) {
      const tag = m.importance >= 4 ? ' [HIGH]' : '';
      lines.push(`- ${m.content}${tag}`);
    }
  }

  // Fire-and-forget: mark as retrieved
  const ids = top.map(m => (m as Record<string, unknown>).id as string).filter(Boolean);
  if (ids.length > 0) {
    supabase
      .from('handler_memory')
      .update({ last_retrieved_at: new Date().toISOString() })
      .in('id', ids)
      .then(() => {});
  }

  return lines.join('\n');
}
