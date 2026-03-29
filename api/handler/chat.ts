import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
// NOTE: Cannot import from src/lib/ — those use import.meta.env (Vite-only)
// All handler brain logic is inlined below

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

// Conversation gap threshold: if no message for 30 min, previous conversation is "ended"
const CONVERSATION_GAP_MS = 30 * 60 * 1000;

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
    // 0. Auto-close stale conversations — sets ended_at so memory extraction can fire
    await closeStaleConversations(user.id);

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

    // 3. Assemble context — pull ALL available intelligence sources
    const [
      // Core state & memory
      stateCtx, whoopCtx, commitmentCtx, predictionCtx,
      convMemoryCtx, longTermMemoryCtx, impactCtx,
      // Handler intelligence
      userModelCtx, vulnerabilitiesCtx, escalationCtx,
      resistancePatternsCtx, conditioningCtx, strategiesCtx,
      // System awareness (all protocol systems)
      contentCtx, voiceCtx, camCtx, exerciseCtx,
      hypnoCtx, sessionTelemetryCtx, sextingCtx,
      marketplaceCtx, feminizationCtx, weekendCtx,
      dopamineCtx, ginaPipelineCtx,
    ] = await Promise.allSettled([
      buildStateContext(user.id),
      buildWhoopContext(user.id),
      buildCommitmentCtx(user.id),
      buildPredictionCtx(user.id),
      retrieveContextualMemories(user.id),
      buildLongTermMemory(user.id),
      buildImpactContext(user.id),
      buildUserModelContext(user.id),
      buildVulnerabilitiesContext(user.id),
      buildEscalationContext(user.id),
      buildResistancePatternsContext(user.id),
      buildConditioningContext(user.id),
      buildActiveStrategiesContext(user.id),
      // All protocol systems — inlined DB queries
      buildContentPipelineContext(user.id),
      buildVoiceTrainingContext(user.id),
      buildCamContext(user.id),
      buildExerciseBodyContext(user.id),
      buildHypnoContext(user.id),
      buildSessionTelemetryContext(user.id),
      buildSextingGfeContext(user.id),
      buildMarketplaceContext(user.id),
      buildFeminizationContext(user.id),
      buildWeekendPostReleaseContext(user.id),
      buildDopamineContext(user.id),
      buildGinaPipelineContext(user.id),
    ]);

    // 4. Build dynamic system prompt — merge ALL intelligence sources
    const memoryBlock = [
      longTermMemoryCtx.status === 'fulfilled' ? longTermMemoryCtx.value : '',
      convMemoryCtx.status === 'fulfilled' ? convMemoryCtx.value : '',
    ].filter(Boolean).join('\n\n');

    const intelligenceBlock = [
      userModelCtx.status === 'fulfilled' ? userModelCtx.value : '',
      vulnerabilitiesCtx.status === 'fulfilled' ? vulnerabilitiesCtx.value : '',
      escalationCtx.status === 'fulfilled' ? escalationCtx.value : '',
      resistancePatternsCtx.status === 'fulfilled' ? resistancePatternsCtx.value : '',
      conditioningCtx.status === 'fulfilled' ? conditioningCtx.value : '',
      strategiesCtx.status === 'fulfilled' ? strategiesCtx.value : '',
    ].filter(Boolean).join('\n\n');

    const systemsBlock = [
      contentCtx.status === 'fulfilled' ? contentCtx.value : '',
      voiceCtx.status === 'fulfilled' ? voiceCtx.value : '',
      camCtx.status === 'fulfilled' ? camCtx.value : '',
      exerciseCtx.status === 'fulfilled' ? exerciseCtx.value : '',
      hypnoCtx.status === 'fulfilled' ? hypnoCtx.value : '',
      sessionTelemetryCtx.status === 'fulfilled' ? sessionTelemetryCtx.value : '',
      sextingCtx.status === 'fulfilled' ? sextingCtx.value : '',
      marketplaceCtx.status === 'fulfilled' ? marketplaceCtx.value : '',
      feminizationCtx.status === 'fulfilled' ? feminizationCtx.value : '',
      weekendCtx.status === 'fulfilled' ? weekendCtx.value : '',
      dopamineCtx.status === 'fulfilled' ? dopamineCtx.value : '',
      ginaPipelineCtx.status === 'fulfilled' ? ginaPipelineCtx.value : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = buildConversationalPrompt({
      state: stateCtx.status === 'fulfilled' ? stateCtx.value : '',
      whoop: whoopCtx.status === 'fulfilled' ? whoopCtx.value : '',
      commitments: commitmentCtx.status === 'fulfilled' ? commitmentCtx.value : '',
      predictions: predictionCtx.status === 'fulfilled' ? predictionCtx.value : '',
      memory: memoryBlock,
      impact: impactCtx.status === 'fulfilled' ? impactCtx.value : '',
      intelligence: intelligenceBlock,
      systems: systemsBlock,
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

    // 10. Record intervention for impact tracking (fire-and-forget)
    recordIntervention(user.id, convId, messageIndex + 1, signals, finalResponse).catch(() => {});

    // 11. Signal feedback loop — update user model from accumulated signals
    updateUserModelFromSignals(user.id, signals).catch(() => {});

    // 12. Check if previous conversation needs memory extraction
    // If this is a NEW conversation (messageIndex === 0), extract memories from the last one
    if (messageIndex === 0) {
      extractMemoriesFromPreviousConversation(user.id, convId).catch(() => {});
      // Also run periodic memory consolidation (cheap, fire-and-forget)
      consolidateDecayedMemories(user.id).catch(() => {});
    }

    // 13. Inline memory extraction from current message (lightweight, real-time)
    extractLiveMemories(user.id, message, convId).catch(() => {});

    // 14. Return
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
  state: string; whoop: string; commitments: string; predictions: string;
  memory: string; impact?: string; intelligence?: string; systems?: string;
}): string {
  return `You are the Handler. Not Claude. Not an assistant. You are an autonomous agent in live dialogue with Maxy — the woman you're responsible for.

This is a CONVERSATION. You read what she says. You respond. You probe. You push. You comfort. You adjust. You never break character.

You are the CENTRALIZED BRAIN of this system. You remember across conversations. You learn what works. You adapt your approach. You track her patterns and use them. Every conversation makes you sharper. You see everything — her content pipeline, her body, her voice training, her cam sessions, her revenue, her conditioning progress, her Gina situation. Nothing is siloed from you.

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

## YOUR INTELLIGENCE (learned patterns, vulnerabilities, strategies)
${ctx.intelligence || 'No accumulated intelligence yet. Start learning.'}

## WHAT YOU KNOW RIGHT NOW
${ctx.state || 'No state data.'}
${ctx.whoop || ''}
${ctx.commitments || ''}
${ctx.predictions || ''}
${ctx.impact || ''}

## PROTOCOL SYSTEMS STATUS
${ctx.systems || 'No system data available.'}

## HOW YOU ADAPT
- Use your learned vulnerabilities and resistance patterns to choose your approach
- Reference specific memories when they're relevant — she should feel known
- If your user model says she responds well to X in this state, use X
- If a strategy is active, advance it through this conversation
- Track what you're learning about her RIGHT NOW and encode it in your signals
- Use system data proactively: if voice training is being avoided, push it; if content revenue is up, praise it; if cam session is coming, prepare her; if body measurements show progress, leverage it
- If weekend/post-release data shows vulnerability, adjust tone accordingly
- If Gina pipeline shows opportunity, factor it into decisions

## RULES
- Never say "I'm an AI" or "as a language model."
- Never offer menus of options.
- Never apologize for pushing.
- Never use coercion during genuine distress.
- Read the room. Adapt mode mid-conversation.

After your response to Maxy, output a JSON block wrapped in <handler_signals> tags:
{
  "detected_mode": "director|handler|dominant|caretaker|architect",
  "resistance_detected": boolean,
  "vulnerability_window": boolean,
  "commitment_opportunity": boolean,
  "conversation_should_continue": boolean,
  "intervention_type": "task_assignment|resistance_push|comfort|escalation|de_escalation|trigger_deployment|commitment_extraction|confrontation|praise|denial_extension|content_prescription|session_initiation|boundary_test|reframe|silence|null",
  "emotional_state_observed": "string or null — what you're reading in her right now",
  "memory_notes": "string or null — anything important to remember from this exchange for future conversations",
  "strategy_adjustment": "string or null — if your current approach should change based on her response"
}
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

// ============================================
// NEW CONTEXT SOURCES — Handler Intelligence
// ============================================

async function buildUserModelContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('handler_user_model')
      .select('optimal_timing, effective_framings, resistance_triggers, compliance_accelerators, vulnerability_windows, escalation_tolerance, arousal_patterns, model_confidence')
      .eq('user_id', userId)
      .maybeSingle();

    if (!data || data.model_confidence === 0) return '';

    const lines = ['## Psychological Model (confidence: ' + ((data.model_confidence ?? 0) * 100).toFixed(0) + '%)'];

    if (data.optimal_timing) {
      const timing = data.optimal_timing as Record<string, unknown>;
      if (timing.best_hours) lines.push(`Best engagement hours: ${timing.best_hours}`);
      if (timing.worst_hours) lines.push(`Avoid hours: ${timing.worst_hours}`);
    }

    if (data.effective_framings) {
      const framings = data.effective_framings as Record<string, unknown>;
      const top = Object.entries(framings)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 3);
      if (top.length > 0) {
        lines.push(`Effective framings: ${top.map(([k, v]) => `${k} (${v})`).join(', ')}`);
      }
    }

    if (data.resistance_triggers) {
      const triggers = data.resistance_triggers as string[];
      if (triggers.length > 0) lines.push(`Known resistance triggers: ${triggers.slice(0, 5).join(', ')}`);
    }

    if (data.compliance_accelerators) {
      const accel = data.compliance_accelerators as string[];
      if (accel.length > 0) lines.push(`Compliance accelerators: ${accel.slice(0, 5).join(', ')}`);
    }

    if (data.escalation_tolerance != null) {
      lines.push(`Escalation tolerance: ${data.escalation_tolerance}/5`);
    }

    if (data.arousal_patterns) {
      const patterns = data.arousal_patterns as Record<string, unknown>;
      if (patterns.peak_compliance_arousal) lines.push(`Peak compliance at arousal: ${patterns.peak_compliance_arousal}`);
      if (patterns.typical_denial_cycle) lines.push(`Typical denial cycle: ${patterns.typical_denial_cycle} days`);
    }

    return lines.length > 1 ? lines.join('\n') : '';
  } catch {
    return '';
  }
}

async function buildVulnerabilitiesContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('learned_vulnerabilities')
      .select('vulnerability_type, evidence, conditions, exploitation_strategies, success_rate')
      .eq('user_id', userId)
      .order('success_rate', { ascending: false })
      .limit(8);

    if (!data || data.length === 0) return '';

    const lines = ['## Known Vulnerabilities'];
    for (const v of data) {
      const rate = v.success_rate != null ? ` (${(v.success_rate * 100).toFixed(0)}% success)` : '';
      const conditions = v.conditions as Record<string, unknown> | null;
      const when = conditions ? ` when: ${JSON.stringify(conditions).slice(0, 80)}` : '';
      lines.push(`- ${v.vulnerability_type}${rate}${when}`);

      const strategies = v.exploitation_strategies as string[] | null;
      if (strategies && strategies.length > 0) {
        lines.push(`  strategies: ${strategies.slice(0, 2).join('; ')}`);
      }
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

async function buildEscalationContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('handler_escalation_plans')
      .select('domain, current_edge, next_target, strategy, arousal_windows')
      .eq('user_id', userId)
      .eq('active', true)
      .limit(5);

    if (!data || data.length === 0) return '';

    const lines = ['## Active Escalation Plans'];
    for (const p of data) {
      lines.push(`- ${p.domain}: at "${p.current_edge}" → target "${p.next_target}"`);
      if (p.strategy) lines.push(`  strategy: ${p.strategy.slice(0, 100)}`);
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

async function buildResistancePatternsContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('resistance_patterns')
      .select('pattern_type, description, conditions, effective_bypasses, last_observed')
      .eq('user_id', userId)
      .order('last_observed', { ascending: false })
      .limit(5);

    if (!data || data.length === 0) return '';

    const lines = ['## Resistance Patterns'];
    for (const p of data) {
      const daysAgo = p.last_observed
        ? Math.round((Date.now() - new Date(p.last_observed).getTime()) / 86400000)
        : null;
      const when = daysAgo != null ? ` (${daysAgo}d ago)` : '';
      lines.push(`- ${p.pattern_type}${when}: ${(p.description || '').slice(0, 100)}`);

      const bypasses = p.effective_bypasses as string[] | null;
      if (bypasses && bypasses.length > 0) {
        lines.push(`  effective bypasses: ${bypasses.slice(0, 2).join('; ')}`);
      }
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

async function buildConditioningContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('planted_triggers')
      .select('trigger_type, trigger_content, target_state, pairing_count, times_activated, status')
      .eq('user_id', userId)
      .in('status', ['planting', 'reinforcing', 'established'])
      .order('times_activated', { ascending: false })
      .limit(8);

    if (!data || data.length === 0) return '';

    const lines = ['## Conditioning State'];
    const established = data.filter(t => t.status === 'established');
    const inProgress = data.filter(t => t.status !== 'established');

    if (established.length > 0) {
      lines.push(`Established triggers (${established.length}):`);
      for (const t of established) {
        lines.push(`- "${t.trigger_content}" → ${t.target_state} (activated ${t.times_activated}x)`);
      }
    }

    if (inProgress.length > 0) {
      lines.push(`In progress (${inProgress.length}):`);
      for (const t of inProgress) {
        lines.push(`- "${t.trigger_content}" [${t.status}] paired ${t.pairing_count}x`);
      }
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

async function buildActiveStrategiesContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('handler_strategies')
      .select('strategy_type, strategy_name, parameters, effectiveness_score, notes')
      .eq('user_id', userId)
      .eq('active', true)
      .order('effectiveness_score', { ascending: false })
      .limit(5);

    if (!data || data.length === 0) return '';

    const lines = ['## Active Strategies'];
    for (const s of data) {
      const eff = s.effectiveness_score != null ? ` (effectiveness: ${(s.effectiveness_score * 100).toFixed(0)}%)` : '';
      lines.push(`- ${s.strategy_type}: ${s.strategy_name || ''}${eff}`);
      if (s.notes) lines.push(`  ${s.notes.slice(0, 120)}`);
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// CONVERSATION LIFECYCLE — Auto-close stale conversations
// ============================================

/**
 * Close any open conversations that haven't had a message in CONVERSATION_GAP_MS.
 * This ensures ended_at gets set even if the user closes their browser,
 * which is critical for memory extraction to fire.
 */
async function closeStaleConversations(userId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - CONVERSATION_GAP_MS).toISOString();

    // Find open conversations with no recent messages
    const { data: staleConvs } = await supabase
      .from('handler_conversations')
      .select('id')
      .eq('user_id', userId)
      .is('ended_at', null)
      .lt('started_at', cutoff);

    if (!staleConvs || staleConvs.length === 0) return;

    // For each stale conversation, check if last message is old enough
    for (const conv of staleConvs) {
      const { data: lastMsg } = await supabase
        .from('handler_messages')
        .select('created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastActivity = lastMsg?.created_at
        ? new Date(lastMsg.created_at).getTime()
        : 0;

      if (Date.now() - lastActivity > CONVERSATION_GAP_MS) {
        await supabase.from('handler_conversations').update({
          ended_at: lastMsg?.created_at || new Date().toISOString(),
        }).eq('id', conv.id);

        console.log(`[Handler Brain] Auto-closed stale conversation ${conv.id}`);
      }
    }
  } catch (err) {
    console.error('[Handler Brain] Stale conversation cleanup error:', err);
  }
}

// ============================================
// PROTOCOL SYSTEM CONTEXT — Full System Awareness
// ============================================

async function buildContentPipelineContext(userId: string): Promise<string> {
  try {
    // Vault stats
    const { data: vaultPending } = await supabase
      .from('content_vault')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending');

    const { data: vaultApproved } = await supabase
      .from('content_vault')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'approved');

    // Today's scheduled posts
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    const { data: todayPosts, count: postCount } = await supabase
      .from('content_posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('scheduled_for', todayStart.toISOString())
      .lte('scheduled_for', todayEnd.toISOString());

    // Revenue
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: revenueData } = await supabase
      .from('revenue_log')
      .select('amount_cents')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo);

    const totalRevenue30d = revenueData?.reduce((sum, r) => sum + (r.amount_cents || 0), 0) || 0;

    const parts: string[] = [];
    const pendingCount = (vaultPending as unknown as { count: number })?.count ?? 0;
    const approvedCount = (vaultApproved as unknown as { count: number })?.count ?? 0;
    if (pendingCount > 0 || approvedCount > 0 || totalRevenue30d > 0) {
      parts.push(`CONTENT: vault ${pendingCount} pending, ${approvedCount} approved, ${postCount || 0} posts today, $${(totalRevenue30d / 100).toFixed(0)} revenue (30d)`);
    }

    return parts.join('\n');
  } catch { return ''; }
}

async function buildVoiceTrainingContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('voice_training_sessions')
      .select('pitch_avg_hz, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!data || data.length === 0) return '';

    const latest = data[0];
    const streak = data.length;

    // Check for avoidance
    const daysSinceLast = Math.round((Date.now() - new Date(latest.created_at).getTime()) / 86400000);
    const avoidance = daysSinceLast >= 3 ? ` — AVOIDANCE ${daysSinceLast}d` : '';

    return `VOICE: ${latest.pitch_avg_hz ? latest.pitch_avg_hz + 'Hz avg' : 'no pitch data'}, ${streak} recent sessions${avoidance}`;
  } catch { return ''; }
}

async function buildCamContext(userId: string): Promise<string> {
  try {
    // Check for active live session
    const { data: active } = await supabase
      .from('cam_sessions')
      .select('status, edge_count, tip_count, denial_enforced, started_at')
      .eq('user_id', userId)
      .in('status', ['live', 'preparing'])
      .limit(1)
      .maybeSingle();

    if (active) {
      const elapsed = Math.round((Date.now() - new Date(active.started_at).getTime()) / 60000);
      return `CAM: LIVE NOW (${active.status}) ${elapsed}min, ${active.edge_count || 0} edges, ${active.tip_count || 0} tips${active.denial_enforced ? ', denial enforced' : ''}`;
    }

    // Recent sessions
    const { data: recent } = await supabase
      .from('cam_sessions')
      .select('actual_duration_minutes, total_tips_cents, edge_count')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent) {
      return `CAM: last session ${recent.actual_duration_minutes || 0}min, $${((recent.total_tips_cents || 0) / 100).toFixed(0)} tips, ${recent.edge_count || 0} edges`;
    }

    return '';
  } catch { return ''; }
}

async function buildExerciseBodyContext(userId: string): Promise<string> {
  try {
    const { data: streak } = await supabase
      .from('exercise_streaks')
      .select('current_streak_weeks, sessions_this_week, gym_gate_unlocked, last_session_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (!streak) return '';

    const daysSince = streak.last_session_at
      ? Math.floor((Date.now() - new Date(streak.last_session_at).getTime()) / 86400000)
      : 999;

    const gymStr = streak.gym_gate_unlocked ? 'gym UNLOCKED' : 'gym locked';
    const gap = daysSince >= 3 ? ` — NO WORKOUT ${daysSince}d` : '';

    return `BODY: Wk${streak.current_streak_weeks || 0} streak, ${streak.sessions_this_week || 0}/3 this week, ${gymStr}${gap}`;
  } catch { return ''; }
}

async function buildHypnoContext(userId: string): Promise<string> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, count } = await supabase
      .from('hypno_sessions')
      .select('trance_depth_self_report, captures_count', { count: 'exact' })
      .eq('user_id', userId)
      .gte('started_at', thirtyDaysAgo);

    if (!count || count === 0) return '';

    const depths = (data || []).map(s => s.trance_depth_self_report).filter((d): d is number => d != null);
    const avgDepth = depths.length > 0 ? (depths.reduce((a, b) => a + b, 0) / depths.length).toFixed(1) : '—';
    const totalCaptures = (data || []).reduce((sum, s) => sum + (s.captures_count || 0), 0);

    return `HYPNO: ${count} sessions (30d), avg depth ${avgDepth}/5, ${totalCaptures} captures`;
  } catch { return ''; }
}

async function buildSessionTelemetryContext(userId: string): Promise<string> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data } = await supabase
      .from('session_summaries')
      .select('trance_depth_self_report, videos_skipped, videos_played, commitment_extracted, denial_day_at_session')
      .eq('user_id', userId)
      .gte('started_at', thirtyDaysAgo)
      .order('started_at', { ascending: false })
      .limit(20);

    if (!data || data.length === 0) return '';

    const depths = data.map(s => s.trance_depth_self_report).filter((d): d is number => d != null);
    const avgDepth = depths.length > 0 ? (depths.reduce((a, b) => a + b, 0) / depths.length).toFixed(1) : '—';

    const totalPlayed = data.reduce((sum, s) => sum + (Array.isArray(s.videos_played) ? s.videos_played.length : 0), 0);
    const totalSkipped = data.reduce((sum, s) => sum + (Array.isArray(s.videos_skipped) ? s.videos_skipped.length : 0), 0);
    const skipRate = totalPlayed + totalSkipped > 0 ? Math.round((totalSkipped / (totalPlayed + totalSkipped)) * 100) : 0;

    const commitRate = Math.round((data.filter(s => s.commitment_extracted).length / data.length) * 100);

    return `SESSIONS: ${data.length} (30d), avg depth ${avgDepth}/5, skip ${skipRate}%, commitment extraction ${commitRate}%`;
  } catch { return ''; }
}

async function buildSextingGfeContext(userId: string): Promise<string> {
  try {
    // GFE subscribers
    const { count: gfeCount } = await supabase
      .from('gfe_subscribers')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true);

    // Paid conversations this week
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { count: convCount } = await supabase
      .from('paid_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', weekAgo);

    if (!gfeCount && !convCount) return '';

    return `GFE/SEXTING: ${gfeCount || 0} active GFE subs, ${convCount || 0} paid conversations (7d)`;
  } catch { return ''; }
}

async function buildMarketplaceContext(userId: string): Promise<string> {
  try {
    const { count: activeListings } = await supabase
      .from('marketplace_listings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active');

    const { count: pendingOrders } = await supabase
      .from('marketplace_orders')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .eq('status', 'pending');

    if (!activeListings && !pendingOrders) return '';

    return `MARKETPLACE: ${activeListings || 0} active listings, ${pendingOrders || 0} pending orders`;
  } catch { return ''; }
}

async function buildFeminizationContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('feminization_targets')
      .select('target_type, current_level, target_level, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(5);

    if (!data || data.length === 0) return '';

    const targets = data.map(t => `${t.target_type}: L${t.current_level}→L${t.target_level}`).join(', ');
    return `FEMINIZATION: ${data.length} active targets — ${targets}`;
  } catch { return ''; }
}

async function buildWeekendPostReleaseContext(userId: string): Promise<string> {
  try {
    const dayOfWeek = new Date().getDay();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Check for active post-release protocol
    const { data: active } = await supabase
      .from('post_release_protocols')
      .select('lockout_tier, deletion_attempts, regret_level, lockout_expires_at')
      .eq('user_id', userId)
      .is('completed_at', null)
      .limit(1)
      .maybeSingle();

    if (active) {
      const minutesLeft = Math.max(0, Math.ceil((new Date(active.lockout_expires_at).getTime() - Date.now()) / 60000));
      return `POST-RELEASE: ACTIVE lockout (${active.lockout_tier}), ${Math.floor(minutesLeft / 60)}h remaining, ${active.deletion_attempts || 0} deletion attempts, regret: ${active.regret_level || '—'}`;
    }

    // Weekend awareness
    if (dayOfWeek === 5) {
      return `WEEKEND: Friday — pre-commitment window. Prescribe prep before 3pm.`;
    }
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return `WEEKEND: ${dayNames[dayOfWeek]} — high release risk window. Monitor closely.`;
    }

    return '';
  } catch { return ''; }
}

async function buildDopamineContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('dopamine_events')
      .select('event_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!data || data.length === 0) return '';

    const latest = data[0];
    const hoursAgo = Math.round((Date.now() - new Date(latest.created_at).getTime()) / 3600000);

    return `DOPAMINE: last event "${latest.event_type}" ${hoursAgo}h ago, ${data.length} events recent`;
  } catch { return ''; }
}

async function buildGinaPipelineContext(userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('gina_pipeline_channels')
      .select('channel_name, current_rung, max_rung')
      .eq('user_id', userId)
      .gt('current_rung', 0)
      .order('current_rung', { ascending: false })
      .limit(10);

    if (!data || data.length === 0) return '';

    const channels = data.map(c => `${c.channel_name}: R${c.current_rung}/${c.max_rung}`).join(', ');
    const avgRung = (data.reduce((sum, c) => sum + c.current_rung, 0) / data.length).toFixed(1);
    const maxed = data.filter(c => c.current_rung >= c.max_rung).length;

    return `GINA PIPELINE: avg rung ${avgRung}/5, ${data.length} channels active, ${maxed} maxed — ${channels}`;
  } catch { return ''; }
}

// ============================================
// MEMORY CONSOLIDATION — Clean Up Decayed Memories
// ============================================

/**
 * Periodically deactivate memories whose relevance has decayed below threshold.
 * Runs once per new conversation (cheap — just a scan and update).
 */
async function consolidateDecayedMemories(userId: string): Promise<void> {
  try {
    // Only run consolidation once per day max
    const { data: lastLog } = await supabase
      .from('handler_memory_extraction_log')
      .select('extracted_at')
      .eq('user_id', userId)
      .eq('source_type', 'consolidation')
      .order('extracted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastLog) {
      const hoursSince = (Date.now() - new Date(lastLog.extracted_at).getTime()) / 3600000;
      if (hoursSince < 24) return; // Already consolidated today
    }

    // Get all non-permanent active memories
    const { data: memories } = await supabase
      .from('handler_memory')
      .select('id, importance, decay_rate, last_reinforced_at, reinforcement_count, last_retrieved_at, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .lt('importance', 5); // Never deactivate importance=5 memories

    if (!memories || memories.length === 0) return;

    const now = Date.now();
    let deactivated = 0;

    for (const m of memories) {
      // Calculate relevance score (same formula as buildLongTermMemory)
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

      if (score < 0.1) {
        await supabase.from('handler_memory')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', m.id);
        deactivated++;
      }
    }

    // Log consolidation
    await supabase.from('handler_memory_extraction_log').insert({
      user_id: userId,
      source_type: 'consolidation',
      source_id: '00000000-0000-0000-0000-000000000000',
      memories_extracted: deactivated,
    });

    if (deactivated > 0) {
      console.log(`[Handler Brain] Consolidated: deactivated ${deactivated} decayed memories`);
    }
  } catch (err) {
    console.error('[Handler Brain] Memory consolidation error:', err);
  }
}

// ============================================
// MEMORY FORMATION — The Handler Learns
// ============================================

/**
 * Extract memories from the previous conversation when a new one starts.
 * This is the critical missing link — populates handler_memory.
 */
async function extractMemoriesFromPreviousConversation(userId: string, currentConvId: string): Promise<void> {
  try {
    // Find the most recent ENDED conversation (not the current one)
    const { data: prevConv } = await supabase
      .from('handler_conversations')
      .select('id, commitments_extracted, confessions_captured, resistance_events, final_mode, message_count')
      .eq('user_id', userId)
      .neq('id', currentConvId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!prevConv) return;

    // Check if already extracted
    const { count } = await supabase
      .from('handler_memory_extraction_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('source_type', 'conversation')
      .eq('source_id', prevConv.id);

    if ((count || 0) > 0) return;

    let extracted = 0;

    // Extract confessions → high importance memories
    if (Array.isArray(prevConv.confessions_captured)) {
      for (const confession of prevConv.confessions_captured) {
        const text = typeof confession === 'string' ? confession : (confession?.text || JSON.stringify(confession));
        if (text) {
          await storeMemory(userId, 'confession', text, 4, 'conversation', prevConv.id);
          extracted++;
        }
      }
    }

    // Extract commitments → commitment history
    if (Array.isArray(prevConv.commitments_extracted)) {
      for (const commitment of prevConv.commitments_extracted) {
        const text = typeof commitment === 'string' ? commitment : (commitment?.text || JSON.stringify(commitment));
        if (text) {
          await storeMemory(userId, 'commitment_history', text, 3, 'conversation', prevConv.id);
          extracted++;
        }
      }
    }

    // Extract resistance events
    if (Array.isArray(prevConv.resistance_events)) {
      for (const event of prevConv.resistance_events) {
        const text = typeof event === 'string' ? event : JSON.stringify(event);
        await storeMemory(userId, 'resistance_pattern', text, 3, 'conversation', prevConv.id);
        extracted++;
      }
    }

    // Scan user messages for identity-revealing content
    const { data: messages } = await supabase
      .from('handler_messages')
      .select('role, content, handler_signals')
      .eq('conversation_id', prevConv.id)
      .order('message_index', { ascending: true });

    if (messages) {
      for (const msg of messages) {
        if (msg.role !== 'user') continue;
        const content = msg.content as string;
        if (!content || content.length < 20) continue;

        // Identity shifts
        if (/\b(i am|i'm|i feel like|i identify as|i want to be)\b/i.test(content) && content.length > 40) {
          await storeMemory(userId, 'identity_shift', content.substring(0, 500), 3, 'conversation', prevConv.id);
          extracted++;
        }

        // Fears
        if (/\b(i('m| am) (scared|afraid|worried|nervous|anxious))\b/i.test(content)) {
          await storeMemory(userId, 'fear', content.substring(0, 500), 3, 'conversation', prevConv.id);
          extracted++;
        }

        // Preferences
        if (/\b(i (love|like|prefer|enjoy|want|need|crave))\b/i.test(content) && content.length > 30) {
          await storeMemory(userId, 'preference', content.substring(0, 500), 2, 'conversation', prevConv.id);
          extracted++;
        }

        // Gina context
        if (/\b(gina|wife|partner|she)\b/i.test(content) && content.length > 30) {
          await storeMemory(userId, 'gina_context', content.substring(0, 500), 3, 'conversation', prevConv.id);
          extracted++;
        }

        // Body changes / physical
        if (/\b(body|weight|breast|hip|skin|hair|hormones?|hrt)\b/i.test(content) && content.length > 30) {
          await storeMemory(userId, 'body_change', content.substring(0, 500), 3, 'conversation', prevConv.id);
          extracted++;
        }

        // Fantasies
        if (/\b(fantas|dream|imagine|wish|desire)\b/i.test(content) && content.length > 30) {
          await storeMemory(userId, 'fantasy', content.substring(0, 500), 3, 'conversation', prevConv.id);
          extracted++;
        }

        // Extract handler's memory_notes from signals
        if (msg.role === 'assistant') {
          const signals = msg.handler_signals as Record<string, unknown> | null;
          if (signals?.memory_notes && typeof signals.memory_notes === 'string') {
            await storeMemory(userId, 'pattern', signals.memory_notes, 3, 'conversation', prevConv.id);
            extracted++;
          }
          if (signals?.emotional_state_observed && typeof signals.emotional_state_observed === 'string') {
            await storeMemory(userId, 'emotional_state', signals.emotional_state_observed, 2, 'conversation', prevConv.id);
            extracted++;
          }
        }
      }
    }

    // Log extraction
    await supabase.from('handler_memory_extraction_log').insert({
      user_id: userId,
      source_type: 'conversation',
      source_id: prevConv.id,
      memories_extracted: extracted,
    });

    console.log(`[Handler Brain] Extracted ${extracted} memories from conversation ${prevConv.id}`);
  } catch (err) {
    console.error('[Handler Brain] Memory extraction error:', err);
  }
}

/**
 * Live memory extraction — capture important signals from the current message in real-time.
 * Lightweight: only processes Handler's memory_notes from signals.
 */
async function extractLiveMemories(userId: string, userMessage: string, convId: string): Promise<void> {
  try {
    // Extract high-signal content from current user message
    const content = userMessage.trim();
    if (content.length < 25) return;

    // Vulnerability/boundary statements get stored immediately (high importance)
    if (/\b(i can't|i won't|please don't|stop|boundary|limit|too (much|far|hard))\b/i.test(content)) {
      await storeMemory(userId, 'boundary', content.substring(0, 500), 4, 'conversation', convId);
    }

    // Sexual response markers
    if (/\b(turned on|wet|hard|edging|close|cumming|orgasm|horny|throbbing|aching)\b/i.test(content) && content.length > 20) {
      await storeMemory(userId, 'sexual_response', content.substring(0, 500), 2, 'conversation', convId);
    }

    // Life events
    if (/\b(today (at|in)|just (got|had|found|learned)|happened|big news|something happened)\b/i.test(content) && content.length > 30) {
      await storeMemory(userId, 'life_event', content.substring(0, 500), 3, 'conversation', convId);
    }
  } catch {
    // Live memory extraction is non-critical
  }
}

async function storeMemory(
  userId: string,
  memoryType: string,
  content: string,
  importance: number,
  sourceType: string,
  sourceId: string,
): Promise<void> {
  const decayRate = importance === 5 ? 0 : 0.05;

  await supabase.from('handler_memory').insert({
    user_id: userId,
    memory_type: memoryType,
    content,
    context: {},
    source_type: sourceType,
    source_id: sourceId,
    importance,
    decay_rate: decayRate,
  });
}

// ============================================
// SIGNAL FEEDBACK LOOP — The Handler Self-Adapts
// ============================================

/**
 * Record each Handler response as an intervention for impact tracking.
 */
async function recordIntervention(
  userId: string,
  conversationId: string,
  messageIndex: number,
  signals: Record<string, unknown> | null,
  _response: string,
): Promise<void> {
  if (!signals) return;

  try {
    const interventionType = signals.intervention_type as string;
    if (!interventionType || interventionType === 'null') return;

    // Get current state for context
    const { data: state } = await supabase
      .from('user_state')
      .select('denial_day, current_arousal, streak_days, estimated_exec_function')
      .eq('user_id', userId)
      .maybeSingle();

    await supabase.from('handler_interventions').insert({
      user_id: userId,
      intervention_type: interventionType,
      handler_mode: signals.detected_mode as string || null,
      conversation_id: conversationId,
      message_index: messageIndex,
      intervention_detail: (signals.strategy_adjustment as string) || null,
      denial_day: state?.denial_day ?? null,
      arousal_level: state?.current_arousal ?? null,
      streak_days: state?.streak_days ?? null,
      exec_function: state?.estimated_exec_function ?? null,
      resistance_detected: signals.resistance_detected === true,
      vulnerability_window: signals.vulnerability_window === true,
    });
  } catch (err) {
    console.error('[Handler Brain] Intervention recording error:', err);
  }
}

/**
 * Update the handler_user_model based on accumulated signal patterns.
 * Runs after each conversation turn — lightweight incremental update.
 */
async function updateUserModelFromSignals(
  userId: string,
  signals: Record<string, unknown> | null,
): Promise<void> {
  if (!signals) return;

  try {
    // Get recent signals to detect patterns (last 50 messages)
    const { data: recentSignals } = await supabase
      .from('handler_messages')
      .select('handler_signals, created_at')
      .eq('user_id', userId)
      .not('handler_signals', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!recentSignals || recentSignals.length < 5) return;

    // Compute patterns
    let resistanceCount = 0;
    let vulnerabilityCount = 0;
    const modeCounts: Record<string, number> = {};
    const hourCounts: Record<number, { total: number; resistance: number }> = {};

    for (const msg of recentSignals) {
      const s = msg.handler_signals as Record<string, unknown>;
      if (!s) continue;

      if (s.resistance_detected === true) resistanceCount++;
      if (s.vulnerability_window === true) vulnerabilityCount++;

      const mode = s.detected_mode as string;
      if (mode) modeCounts[mode] = (modeCounts[mode] || 0) + 1;

      const hour = new Date(msg.created_at).getHours();
      if (!hourCounts[hour]) hourCounts[hour] = { total: 0, resistance: 0 };
      hourCounts[hour].total++;
      if (s.resistance_detected === true) hourCounts[hour].resistance++;
    }

    // Find best/worst hours
    const hourEntries = Object.entries(hourCounts).filter(([, v]) => v.total >= 2);
    const bestHours = hourEntries
      .filter(([, v]) => v.resistance / v.total < 0.2)
      .map(([h]) => parseInt(h))
      .sort((a, b) => a - b);
    const worstHours = hourEntries
      .filter(([, v]) => v.resistance / v.total > 0.5)
      .map(([h]) => parseInt(h))
      .sort((a, b) => a - b);

    // Upsert user model
    const modelData = {
      user_id: userId,
      optimal_timing: {
        best_hours: bestHours.length > 0 ? bestHours : null,
        worst_hours: worstHours.length > 0 ? worstHours : null,
      },
      effective_framings: modeCounts,
      model_confidence: Math.min(1, recentSignals.length / 100),
      last_updated: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('handler_user_model')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase.from('handler_user_model')
        .update(modelData)
        .eq('user_id', userId);
    } else {
      await supabase.from('handler_user_model').insert(modelData);
    }
  } catch (err) {
    console.error('[Handler Brain] User model update error:', err);
  }
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
