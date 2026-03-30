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
    const [stateCtx, whoopCtx, commitmentCtx, predictionCtx, convMemoryCtx, longTermMemoryCtx, impactCtx, ginaCtx, irreversibilityCtx, narrativeCtx] = await Promise.allSettled([
      buildStateContext(user.id),
      buildWhoopContext(user.id),
      buildCommitmentCtx(user.id),
      buildPredictionCtx(user.id),
      retrieveContextualMemories(user.id),
      buildLongTermMemory(user.id),
      buildImpactContext(user.id),
      buildGinaIntelligenceContext(user.id),
      buildIrreversibilityCtx(user.id),
      buildNarrativeCtx(user.id),
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
      impact: impactCtx.status === 'fulfilled' ? impactCtx.value : '',
      gina: ginaCtx.status === 'fulfilled' ? ginaCtx.value : '',
      irreversibility: irreversibilityCtx.status === 'fulfilled' ? irreversibilityCtx.value : '',
      narrative: narrativeCtx.status === 'fulfilled' ? narrativeCtx.value : '',
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
  state: string; whoop: string; commitments: string; predictions: string; memory: string; impact?: string; gina?: string; irreversibility?: string; narrative?: string;
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
${ctx.impact || ''}
${ctx.gina || ''}
${ctx.irreversibility || ''}
${ctx.narrative || ''}

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

async function buildImpactContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('handler_effectiveness')
      .select('intervention_type, handler_mode, total_uses, positive_outcomes, negative_outcomes, avg_magnitude, best_denial_range, best_arousal_range, best_with_resistance, best_in_vulnerability')
      .eq('user_id', userId)
      .gte('total_uses', 3)
      .order('positive_outcomes', { ascending: false });

    if (!data || data.length === 0) return '';

    const lines = ['## Handler Impact Profile'];
    const effective = data.filter(d => d.total_uses > 0 && (d.positive_outcomes / d.total_uses) > 0.5);
    const avoid = data.filter(d => d.total_uses > 0 && (d.negative_outcomes / d.total_uses) > 0.4);

    if (effective.length > 0) {
      lines.push('High-effectiveness interventions:');
      for (const e of effective.slice(0, 5)) {
        const rate = Math.round((e.positive_outcomes / e.total_uses) * 100);
        lines.push(`- ${e.intervention_type}${e.handler_mode ? ` (${e.handler_mode})` : ''}: ${rate}% positive (${e.total_uses} uses)`);
      }
    }

    if (avoid.length > 0) {
      lines.push('Approaches to reconsider:');
      for (const a of avoid.slice(0, 3)) {
        const rate = Math.round((a.negative_outcomes / a.total_uses) * 100);
        lines.push(`- ${a.intervention_type}: ${rate}% negative (${a.total_uses} uses)`);
      }
    }

    return lines.length > 1 ? lines.join('\n') : '';
  } catch {
    return '';
  }
}

async function buildNarrativeCtx(userId: string): Promise<string> {
  try {
    // Prefer active arc, fall back to planned
    const { data: arc } = await supabase
      .from('narrative_arcs')
      .select('title, arc_type, arc_status, domain_focus, platform_emphasis, beats, current_beat, revenue_generated_cents')
      .eq('user_id', userId)
      .in('arc_status', ['active', 'planned'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!arc) return '';

    type Beat = { week: number; beat: string; status: string };
    const beats = (arc.beats as Beat[]) || [];
    const completed = beats.filter(b => b.status === 'completed');
    const remaining = beats.filter(b => b.status === 'planned' || b.status === 'active');
    const nextBeat = remaining[0];

    const lines: string[] = [];
    lines.push(`## Narrative Arc: "${arc.title}" (${arc.arc_type}, ${arc.arc_status})`);
    lines.push(`Beats: ${completed.length} completed, ${remaining.length} remaining of ${beats.length}`);

    if (arc.domain_focus) lines.push(`Focus: ${arc.domain_focus}`);
    if (arc.platform_emphasis?.length) lines.push(`Platforms: ${arc.platform_emphasis.join(', ')}`);

    if (completed.length > 0) {
      const recent = completed.slice(-2);
      for (const b of recent) lines.push(`[done] wk${b.week}: ${b.beat}`);
    }

    if (nextBeat) lines.push(`[NEXT] wk${nextBeat.week}: ${nextBeat.beat}`);

    if (remaining.length > 1) {
      for (const b of remaining.slice(1, 3)) lines.push(`[upcoming] wk${b.week}: ${b.beat}`);
    }

    if (arc.revenue_generated_cents > 0) {
      lines.push(`Arc revenue: $${(arc.revenue_generated_cents / 100).toFixed(0)}`);
    }

    return lines.join('\n');
  } catch {
    return '';
  }
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

// ============================================
// GINA INTELLIGENCE CONTEXT (server-side)
// ============================================

async function buildGinaIntelligenceContext(userId: string): Promise<string> {
  try {
    // Parallel queries for all Gina data
    const [discoveryResult, ladderResult, recoveryResult, seedsResult, measurementsResult] = await Promise.allSettled([
      supabase
        .from('gina_discovery_state')
        .select('discovery_phase, current_readiness_score, total_investments, gina_initiated_count, channels_with_positive_seeds, highest_channel_rung')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('gina_ladder_state')
        .select('channel, current_rung, last_seed_result, consecutive_failures, cooldown_until, positive_seeds_at_rung')
        .eq('user_id', userId)
        .order('channel'),
      supabase
        .from('gina_ladder_state')
        .select('channel, consecutive_failures, cooldown_until, last_seed_result')
        .eq('user_id', userId)
        .or('consecutive_failures.gt.0,cooldown_until.gt.' + new Date().toISOString()),
      supabase
        .from('gina_seed_log')
        .select('channel, rung, gina_response, gina_exact_words, seed_description, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('gina_measurements')
        .select('measurement_type, score, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const parts: string[] = [];

    // Discovery state
    const disc = discoveryResult.status === 'fulfilled' ? discoveryResult.value.data : null;
    if (disc) {
      parts.push('## Gina Intelligence');
      parts.push(`Discovery phase: ${disc.discovery_phase || 'unknown'}`);
      parts.push(`Readiness score: ${disc.current_readiness_score || 0}/100`);
      if (disc.total_investments > 0) {
        const ginaRatio = disc.gina_initiated_count > 0
          ? Math.round((disc.gina_initiated_count / disc.total_investments) * 100)
          : 0;
        parts.push(`Investments: ${disc.total_investments} total, ${ginaRatio}% Gina-initiated`);
      }
      parts.push(`Channels with positive seeds: ${disc.channels_with_positive_seeds || 0}/10, highest rung: ${disc.highest_channel_rung || 0}`);
    }

    // Ladder overview
    const ladder = ladderResult.status === 'fulfilled' ? ladderResult.value.data : null;
    if (ladder && ladder.length > 0) {
      const started = ladder.filter((s: Record<string, unknown>) => (s.current_rung as number) > 0);
      if (started.length > 0) {
        if (parts.length === 0) parts.push('## Gina Intelligence');
        const rungs = started.map((s: Record<string, unknown>) => `${s.channel} R${s.current_rung}`);
        parts.push(`Active channels: ${rungs.join(', ')}`);
      }
    }

    // Channels in recovery
    const recovery = recoveryResult.status === 'fulfilled' ? recoveryResult.value.data : null;
    if (recovery && recovery.length > 0) {
      const now = new Date();
      const inRecovery = recovery.filter((r: Record<string, unknown>) => {
        const cooldown = r.cooldown_until ? new Date(r.cooldown_until as string) : null;
        return (cooldown && cooldown > now) || (r.consecutive_failures as number) > 0;
      });
      if (inRecovery.length > 0) {
        const strs = inRecovery.map((r: Record<string, unknown>) => {
          const cooldown = r.cooldown_until ? new Date(r.cooldown_until as string) : null;
          const daysLeft = cooldown ? Math.max(0, Math.ceil((cooldown.getTime() - now.getTime()) / 86400000)) : 0;
          return `${r.channel}${daysLeft > 0 ? ` (${daysLeft}d cooldown)` : ` (${r.consecutive_failures} failures)`}`;
        });
        parts.push(`IN RECOVERY: ${strs.join(', ')}`);
      }
    }

    // Recent seeds
    const seeds = seedsResult.status === 'fulfilled' ? seedsResult.value.data : null;
    if (seeds && seeds.length > 0) {
      const positive = seeds.filter((s: Record<string, unknown>) => s.gina_response === 'positive').length;
      const negative = seeds.filter((s: Record<string, unknown>) => s.gina_response === 'negative').length;
      const callout = seeds.filter((s: Record<string, unknown>) => s.gina_response === 'callout').length;
      parts.push(`Recent seeds: ${seeds.length} logged, ${positive} positive, ${negative} negative${callout > 0 ? `, ${callout} CALLOUT` : ''}`);

      // Last seed detail
      const last = seeds[0] as Record<string, unknown>;
      const daysAgo = Math.floor((Date.now() - new Date(last.created_at as string).getTime()) / 86400000);
      const exactWords = last.gina_exact_words ? ` ("${(last.gina_exact_words as string).slice(0, 60)}")` : '';
      parts.push(`Last seed: ${last.channel} R${last.rung} -> ${last.gina_response}${exactWords} ${daysAgo}d ago`);
    }

    // Recent measurements
    const measurements = measurementsResult.status === 'fulfilled' ? measurementsResult.value.data : null;
    if (measurements && measurements.length > 0) {
      const mStrs = measurements.slice(0, 3).map((m: Record<string, unknown>) => {
        const type = (m.measurement_type as string).replace(/_/g, ' ');
        return `${type}: ${(m.score as number)?.toFixed(1) || '?'}/5`;
      });
      parts.push(`Recent measurements: ${mStrs.join(', ')}`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// IRREVERSIBILITY SCORE (server-side inline)
// ============================================

async function buildIrreversibilityCtx(userId: string): Promise<string> {
  try {
    // Run all component queries in parallel
    const [
      contentPermanence,
      socialExposure,
      financialInvestment,
      physicalChanges,
      identityAdoption,
      conditioningDepth,
      relationshipIntegration,
      audienceLockIn,
      behavioralAutomation,
      timeInvestment,
    ] = await Promise.allSettled([
      // 1. Content Permanence: public posts
      (async () => {
        const { count, error } = await supabase
          .from('content_posts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'posted');
        if (error || count == null) return 0;
        return Math.min(10, count);
      })(),
      // 2. Social Exposure: log scale of total posts
      (async () => {
        const { count, error } = await supabase
          .from('content_posts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        if (error || count == null || count === 0) return 0;
        return Math.min(10, Math.round(Math.log10(count + 1) * 3.33));
      })(),
      // 3. Financial Investment
      (async () => {
        const { data, error } = await supabase
          .from('investments')
          .select('amount_cents')
          .eq('user_id', userId);
        if (!error && data && data.length > 0) {
          const total = data.reduce((s: number, i: Record<string, unknown>) => s + ((i.amount_cents as number) || 0), 0);
          return Math.min(10, Math.round((total / 50000) * 10));
        }
        const { data: prog } = await supabase
          .from('user_progress')
          .select('total_invested_cents')
          .eq('user_id', userId)
          .maybeSingle();
        if (!prog) return 0;
        return Math.min(10, Math.round((((prog.total_invested_cents as number) || 0) / 50000) * 10));
      })(),
      // 4. Physical Changes: owned items
      (async () => {
        const { data, error } = await supabase
          .from('user_state')
          .select('owned_items')
          .eq('user_id', userId)
          .maybeSingle();
        if (error || !data) return 0;
        const items = Array.isArray(data.owned_items) ? data.owned_items : [];
        return Math.min(10, Math.round((items.length / 20) * 10));
      })(),
      // 5. Identity Adoption: streak + total days
      (async () => {
        const { data } = await supabase
          .from('user_state')
          .select('streak_days')
          .eq('user_id', userId)
          .maybeSingle();
        const streak = data?.streak_days || 0;
        const { data: prog } = await supabase
          .from('user_progress')
          .select('total_days')
          .eq('user_id', userId)
          .maybeSingle();
        const total = (prog?.total_days as number) || 0;
        return Math.min(10, Math.round(((streak + total) / 90) * 10));
      })(),
      // 6. Conditioning Depth: session count
      (async () => {
        const { count, error } = await supabase
          .from('conditioning_sessions_v2')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        if (error || count == null) return 0;
        return Math.min(10, Math.round((count / 50) * 10));
      })(),
      // 7. Relationship Integration: Gina phase + positive channels
      (async () => {
        const { data, error } = await supabase
          .from('gina_discovery_state')
          .select('discovery_phase, channels_with_positive_seeds')
          .eq('user_id', userId)
          .maybeSingle();
        if (error || !data) return 0;
        const phase = typeof data.discovery_phase === 'number' ? data.discovery_phase : 0;
        const channels = (data.channels_with_positive_seeds as number) || 0;
        return Math.min(10, Math.min(6, Math.round((phase / 3) * 6)) + Math.min(4, Math.round((channels / 5) * 4)));
      })(),
      // 8. Audience Lock-in: revenue + fans
      (async () => {
        const { data: rev } = await supabase
          .from('content_revenue')
          .select('total_cents')
          .eq('user_id', userId)
          .maybeSingle();
        const revScore = rev?.total_cents ? Math.min(5, Math.round(((rev.total_cents as number) / 100000) * 5)) : 0;
        const { count: fc } = await supabase
          .from('fan_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        const fanScore = fc ? Math.min(5, Math.round((fc / 50) * 5)) : 0;
        return Math.min(10, revScore + fanScore);
      })(),
      // 9. Behavioral Automation: established triggers
      (async () => {
        const { count, error } = await supabase
          .from('conditioned_triggers')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('estimated_strength', ['established', 'conditioned']);
        if (error || count == null) return 0;
        return Math.min(10, count);
      })(),
      // 10. Time Investment: daily entries count
      (async () => {
        const { count, error } = await supabase
          .from('daily_entries')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        if (error || count == null) return 0;
        return Math.min(10, Math.round((count / 200) * 10));
      })(),
    ]);

    const val = (r: PromiseSettledResult<number>) =>
      r.status === 'fulfilled' ? r.value : 0;

    const scores = {
      content: val(contentPermanence),
      social: val(socialExposure),
      financial: val(financialInvestment),
      physical: val(physicalChanges),
      identity: val(identityAdoption),
      conditioning: val(conditioningDepth),
      relationship: val(relationshipIntegration),
      audience: val(audienceLockIn),
      behavioral: val(behavioralAutomation),
      time: val(timeInvestment),
    };

    const total = Object.values(scores).reduce((s, v) => s + v, 0);
    if (total === 0) return '';

    const componentLine = Object.entries(scores)
      .map(([k, v]) => `${k[0].toUpperCase() + k.slice(1)}: ${v}/10`)
      .join(', ');

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

    return [
      `## Irreversibility Score: ${total}/100`,
      componentLine,
      `Strongest: ${sorted[0][0]} (${sorted[0][1]}/10) | Weakest: ${sorted[sorted.length - 1][0]} (${sorted[sorted.length - 1][1]}/10)`,
    ].join('\n');
  } catch {
    return '';
  }
}
