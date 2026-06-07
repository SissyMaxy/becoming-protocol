// ============================================================================
// handler-runtime.ts — extracted Handler runtime analyzers + side-effect executors
//
// Protocol-core revival Stage 7 (god-module thinning, batch 2): the runtime
// leaf functions — the per-turn analyzers/gates (arousal, pronoun,
// rationalization, safeword, slip, behavioral-trigger checks) and the
// side-effect executors (device commands, directive-outcome logging, content
// search, chastity lock, phase advance, reflection, scoring, media resolution)
// — moved VERBATIM out of chat-action.ts. They reference only their own
// service-role supabase client + the pronoun/rationalization gate helpers, plus
// a few shared chat-action consts imported back (all call-time -> load-safe
// cycle). NOTE: handleForceFeminizationDirective stays in chat-action for now
// (force-fem is migrated last, never softened). Behavior-identical.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { detectAndRewrite, logGateResult, buildConfrontationMessage } from './pronoun-gate.js';
import { detectRationalizations, logRationalizations, buildRationalizationConfrontation } from './rationalization-gate.js';
// MediaAttachment type stays in chat-action.ts (used there too); imported back
// here for resolveMediaReferences. Type-only — no runtime cycle weight.
import type { MediaAttachment } from './chat-action.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

export async function logDirectiveOutcome(
  userId: string,
  action: string,
  value: unknown,
): Promise<void> {
  try {
    const { data: stateForOutcome } = await supabase
      .from('user_state')
      .select('current_arousal, denial_day')
      .eq('user_id', userId)
      .maybeSingle();

    const now = new Date();
    await supabase.from('directive_outcomes').insert({
      user_id: userId,
      directive_id: null, // We don't have the inserted directive ID easily, leave null
      directive_action: action,
      directive_value: (value as Record<string, unknown>) ?? null,
      fired_at: now.toISOString(),
      denial_day: stateForOutcome?.denial_day ?? null,
      hour_of_day: now.getHours(),
      day_of_week: now.getDay(),
      arousal_level: stateForOutcome?.current_arousal ?? null,
    });
  } catch (e) {
    console.error('[Handler] logDirectiveOutcome failed:', e);
  }
}

export async function measureRecentOutcomes(userId: string): Promise<void> {
  try {
    // Get unmeasured outcomes from last 30 min
    const { data: unmeasured } = await supabase
      .from('directive_outcomes')
      .select('id, directive_action, fired_at')
      .eq('user_id', userId)
      .is('measured_at', null)
      .gte('fired_at', new Date(Date.now() - 30 * 60000).toISOString());

    if (!unmeasured || unmeasured.length === 0) return;

    for (const outcome of unmeasured) {
      // Did user message arrive after this directive?
      const { data: userMsgs } = await supabase
        .from('handler_messages')
        .select('content, created_at')
        .eq('user_id', userId)
        .eq('role', 'user')
        .gte('created_at', outcome.fired_at)
        .order('created_at', { ascending: true })
        .limit(1);

      if (!userMsgs || userMsgs.length === 0) continue;

      const userMsg = userMsgs[0];
      const responseTime = Math.round(
        (new Date(userMsg.created_at).getTime() - new Date(outcome.fired_at).getTime()) / 1000,
      );

      // Sentiment analysis (simple keyword based)
      const content = String(userMsg.content || '').toLowerCase();
      let sentiment: 'compliant' | 'resistant' | 'neutral' | 'enthusiastic' | 'distressed' = 'neutral';
      if (/(yes|good girl|i obey|handler|mmm|more|please|pet|sir)/i.test(content)) sentiment = 'compliant';
      if (/(no|stop|don't|won't|can't|wait)/i.test(content)) sentiment = 'resistant';
      if (/(omg|love|amazing|so good|perfect)/i.test(content)) sentiment = 'enthusiastic';
      if (/(scared|hurt|too much|overwhelmed)/i.test(content)) sentiment = 'distressed';

      // Effectiveness score: 0-1 based on sentiment + response time
      let score = 0.5;
      if (sentiment === 'enthusiastic') score = 1.0;
      else if (sentiment === 'compliant') score = 0.8;
      else if (sentiment === 'resistant') score = 0.2;
      else if (sentiment === 'distressed') score = 0.1;
      if (responseTime < 60) score += 0.1; // Fast response is good

      await supabase
        .from('directive_outcomes')
        .update({
          user_responded: true,
          response_time_seconds: responseTime,
          response_sentiment: sentiment,
          effectiveness_score: Math.min(1, score),
          measured_at: new Date().toISOString(),
        })
        .eq('id', outcome.id);
    }
  } catch (e) {
    console.error('[Handler] measureRecentOutcomes failed:', e);
  }
}

export async function searchContent(query: string, count: number = 5): Promise<Array<{ title: string; url: string; description: string }>> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];

  try {
    const params = new URLSearchParams({
      q: query,
      count: String(count),
      safesearch: 'off',
    });

    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!res.ok) return [];
    const data = await res.json();
    return (data.web?.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      description: (r.description || '').substring(0, 150),
    }));
  } catch {
    return [];
  }
}

export async function checkBehavioralTriggers(userId: string, message: string): Promise<void> {
  try {
    const { data: triggers } = await supabase
      .from('behavioral_triggers')
      .select('id, trigger_phrase, response_type, response_value, times_fired')
      .eq('user_id', userId)
      .eq('trigger_type', 'keyword')
      .eq('active', true);

    if (!triggers || triggers.length === 0) return;

    const lowerMessage = message.toLowerCase();
    for (const trigger of triggers) {
      if (lowerMessage.includes(trigger.trigger_phrase.toLowerCase())) {
        // Fire the response
        const val = trigger.response_value as Record<string, unknown>;

        if (trigger.response_type === 'device_reward' || trigger.response_type === 'device_punishment') {
          await supabase.from('handler_directives').insert({
            user_id: userId,
            action: 'send_device_command',
            target: 'lovense',
            value: val,
            priority: 'immediate',
            reasoning: `Behavioral trigger: "${trigger.trigger_phrase}" detected → ${trigger.response_type}`,
          });
        } else if (trigger.response_type === 'mantra') {
          await supabase.from('handler_directives').insert({
            user_id: userId,
            action: 'force_mantra_repetition',
            target: 'client_modal',
            value: { mantra: val.mantra || 'I am becoming her', repetitions: val.repetitions || 3 },
            priority: 'immediate',
            reasoning: `Behavioral trigger: "${trigger.trigger_phrase}" → forced mantra`,
          });
        }

        // Update fire count
        await supabase.from('behavioral_triggers')
          .update({ times_fired: (trigger.times_fired || 0) + 1, last_fired_at: new Date().toISOString() })
          .eq('id', trigger.id);
      }
    }
  } catch {
    // Non-critical
  }
}

export async function retryWithOpenRouter(systemPrompt: string, messages: Array<{ role: string; content: string }>): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://becoming-protocol.vercel.app',
        'X-Title': 'Becoming Protocol Handler',
      },
      body: JSON.stringify({
        model: 'nousresearch/hermes-3-llama-3.1-405b',
        max_tokens: 1200,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[OpenRouter] Error:', res.status, errText);
      // Try fallback model
      const fallbackRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://becoming-protocol.vercel.app',
          'X-Title': 'Becoming Protocol Handler',
        },
        body: JSON.stringify({
          model: 'cognitivecomputations/dolphin-mixtral-8x22b',
          max_tokens: 1200,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
        }),
      });
      if (!fallbackRes.ok) return null;
      const fallbackData = await fallbackRes.json();
      return fallbackData.choices?.[0]?.message?.content || null;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error('[OpenRouter] Request failed:', err);
    return null;
  }
}

export async function getStateSnapshot(userId: string): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('user_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data || {};
}

export async function retrieveContextualMemories(userId: string): Promise<string> {
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

  // 2. Last conversation summary — use absolute dates, not relative
  // Find most recent conversation (active OR ended within 24h) and pull its tail
  // so Handler sees what was just said even when a new conversation spawns.
  const { data: activeConv } = await supabase
    .from('handler_conversations')
    .select('id, final_mode, started_at, message_count')
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let tailConvId: string | null = null;
  let tailHeader = '';

  if (activeConv) {
    const startDate = new Date(activeConv.started_at);
    const dateStr = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    lines.push(`Active conversation started ${dateStr}, ${activeConv.message_count || 0} messages so far.`);
    lines.push('You are IN a conversation with her right now. Do not say she has been absent or quiet.');
    tailConvId = activeConv.id;
    tailHeader = 'Recent exchange in this conversation (continue these threads — do not greet fresh):';
  } else {
    const { data: lastConv } = await supabase
      .from('handler_conversations')
      .select('id, final_mode, started_at, ended_at, message_count')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastConv) {
      const endDate = new Date(lastConv.ended_at);
      const dateStr = endDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const hoursAgo = Math.round((Date.now() - endDate.getTime()) / 3600000);
      const timeDesc = hoursAgo < 1 ? 'just now' : hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.round(hoursAgo / 24)} days ago (${dateStr})`;
      lines.push(`Last conversation: ${timeDesc}, ${lastConv.message_count || 0} messages, ended in ${lastConv.final_mode || 'unknown'} mode`);

      if (hoursAgo < 24) {
        tailConvId = lastConv.id;
        tailHeader = 'PRIOR CONVERSATION TAIL — continue these threads, do NOT greet as if fresh:';
      }
    }
  }

  if (tailConvId) {
    const { data: lastMsgs } = await supabase
      .from('handler_messages')
      .select('role, content')
      .eq('conversation_id', tailConvId)
      .order('message_index', { ascending: false })
      .limit(10);

    if (lastMsgs && lastMsgs.length > 0) {
      lines.push(tailHeader);
      for (const msg of lastMsgs.reverse()) {
        const prefix = msg.role === 'user' ? 'Maxy' : 'You';
        const text = msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content;
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

export async function semanticMemorySearch(
  userId: string,
  queryText: string,
  limit: number,
): Promise<Array<{ id: string; memory_type: string; content: string; importance: number; reinforcement_count: number; created_at: string; similarity: number }>> {
  if (!process.env.OPENAI_API_KEY) return [];

  // Embed the query
  const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: queryText.substring(0, 2000),
    }),
  });

  if (!embeddingRes.ok) return [];

  const embeddingData = await embeddingRes.json();
  const embedding = embeddingData.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) return [];

  const vectorStr = `[${embedding.join(',')}]`;

  const { data, error } = await supabase.rpc('match_memories', {
    query_embedding: vectorStr,
    match_user_id: userId,
    match_count: limit,
    match_threshold: 0.65,
  });

  if (error || !data) return [];
  return data;
}

export async function embedMemoryAsync(memoryId: string): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;

  const { data: mem } = await supabase
    .from('handler_memory')
    .select('id, content')
    .eq('id', memoryId)
    .single();

  if (!mem) return;

  try {
    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: mem.content.substring(0, 2000),
      }),
    });

    if (!embeddingRes.ok) return;

    const embeddingData = await embeddingRes.json();
    const embedding = embeddingData.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding)) return;

    const vectorStr = `[${embedding.join(',')}]`;
    await supabase
      .from('handler_memory')
      .update({ embedding: vectorStr })
      .eq('id', memoryId);
  } catch {
    // Non-critical — embedding will be retried on next consolidation
  }
}

export async function calculateBiometricDeviceIntensity(userId: string): Promise<{ intensity: number; reasoning: string } | null> {
  try {
    const recentCutoff = new Date(Date.now() - 180000).toISOString();
    const { data: recentBio } = await supabase
      .from('session_biometrics')
      .select('avg_heart_rate, max_heart_rate, strain_delta, created_at')
      .eq('user_id', userId)
      .gte('created_at', recentCutoff)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!recentBio || recentBio.length < 2) return null;

    const latest = recentBio[0];
    const previous = recentBio[1];
    const hrDelta = (latest.avg_heart_rate || 0) - (previous.avg_heart_rate || 0);
    const currentHR = latest.avg_heart_rate || 70;

    let intensity: number;
    let reasoning: string;

    if (hrDelta > 10) {
      intensity = Math.max(3, 8 - Math.floor(hrDelta / 5));
      reasoning = `HR spiking (+${hrDelta}bpm) — reducing intensity to maintain edge`;
    } else if (hrDelta < -5) {
      intensity = Math.min(18, 10 + Math.abs(Math.floor(hrDelta / 3)));
      reasoning = `HR dropping (${hrDelta}bpm) — escalating to maintain arousal`;
    } else if (currentHR > 130) {
      intensity = 6;
      reasoning = `HR elevated (${currentHR}bpm) — maintaining gentle stimulation to sustain edge`;
    } else if (currentHR < 80) {
      intensity = 14;
      reasoning = `HR low (${currentHR}bpm) — strong stimulation to build engagement`;
    } else {
      intensity = 10;
      reasoning = `HR stable (${currentHR}bpm, delta ${hrDelta}) — moderate stimulation`;
    }

    return { intensity, reasoning: `[BIO-ADJUST] ${reasoning}` };
  } catch {
    return null;
  }
}

export async function maybeAdvancePhase(userId: string): Promise<void> {
  try {
    const { data: state } = await supabase
      .from('user_state')
      .select('current_phase, denial_day, chastity_streak_days')
      .eq('user_id', userId)
      .maybeSingle();

    if (!state) return;
    const currentPhase = (state.current_phase as number | null) ?? 1;
    if (currentPhase >= 4) return;

    const [{ count: confessionCount }, { count: witnessCount }, { count: investmentRows }] = await Promise.all([
      supabase.from('confessions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_key_admission', true),
      supabase.from('designated_witnesses').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'active'),
      supabase.from('investments').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);

    const denial = (state.denial_day as number | null) ?? 0;
    const chastity = (state.chastity_streak_days as number | null) ?? 0;
    const confessions = confessionCount ?? 0;
    const witnesses = witnessCount ?? 0;
    const investments = investmentRows ?? 0;

    // Phase rules — each upper phase has a progressive bar:
    //   1 → 2: 3 key confessions, 7 denial days
    //   2 → 3: 10 key confessions, 14 denial days, 1 witness, 5 investments
    //   3 → 4: 25 key confessions, 30 denial days, 3 witnesses, 20 investments, 14 chastity days
    let nextPhase = currentPhase;
    let rule = '';
    if (currentPhase === 1 && confessions >= 3 && denial >= 7) {
      nextPhase = 2;
      rule = `3 key confessions (${confessions}) + 7 denial days (${denial})`;
    } else if (currentPhase === 2 && confessions >= 10 && denial >= 14 && witnesses >= 1 && investments >= 5) {
      nextPhase = 3;
      rule = `10 confessions (${confessions}) + 14 denial (${denial}) + 1 witness (${witnesses}) + 5 investments (${investments})`;
    } else if (currentPhase === 3 && confessions >= 25 && denial >= 30 && witnesses >= 3 && investments >= 20 && chastity >= 14) {
      nextPhase = 4;
      rule = `25 confessions (${confessions}) + 30 denial (${denial}) + 3 witnesses (${witnesses}) + 20 investments (${investments}) + 14 chastity (${chastity})`;
    }

    if (nextPhase === currentPhase) return;

    await supabase.from('user_state').update({ current_phase: nextPhase, updated_at: new Date().toISOString() }).eq('user_id', userId);
    await supabase.from('phase_milestones').insert({
      user_id: userId,
      from_phase: currentPhase,
      to_phase: nextPhase,
      trigger_rule: rule,
      denial_day_at_transition: denial,
      confession_count_at_transition: confessions,
    });
  } catch (err) {
    console.error('[PhaseAdvance] failed:', err);
  }
}

export async function semanticSlipDetect(text: string): Promise<{
  slip_type: string; slip_points: number; source_text: string;
} | null> {
  const SUPABASE_URL_LOCAL = process.env.SUPABASE_URL || '';
  const SUPABASE_KEY_LOCAL = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!SUPABASE_URL_LOCAL || !SUPABASE_KEY_LOCAL) return null;
  try {
    const res = await fetch(`${SUPABASE_URL_LOCAL}/functions/v1/openrouter-cheap-judge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY_LOCAL}`,
      },
      body: JSON.stringify({ mode: 'chat_trigger_classify', message: text.slice(0, 1500) }),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      ok: boolean;
      slip: boolean;
      gender_claim: boolean;
      reason: string;
    };
    if (!data.ok) return null;
    // Only act on POSITIVE signals — gender_claim outranks plain slip
    // source_text is what the user reads (it's quoted back into the
    // confession prompt). Keep it to her own words. The detector's
    // [semantic] tag and the LLM's "reason" classification belong in
    // metadata, not in the user-facing quote.
    if (data.gender_claim) {
      return {
        slip_type: 'masculine_self_reference',
        slip_points: 4,
        source_text: text.slice(0, 280),
      };
    }
    if (data.slip) {
      return {
        slip_type: 'resistance_statement',
        slip_points: 2,
        source_text: text.slice(0, 280),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function lockChastityNow(userId: string, durationHours: number, setBy: 'handler' | 'gina' | 'self'): Promise<string | null> {
  const { data: stateRow } = await supabase
    .from('user_state')
    .select('chastity_streak_days')
    .eq('user_id', userId)
    .maybeSingle();
  const streakDay = (((stateRow as { chastity_streak_days?: number } | null)?.chastity_streak_days) || 0) + Math.round(durationHours / 24);
  const now = new Date();
  const unlock = new Date(now.getTime() + durationHours * 3600000);
  const { data } = await supabase
    .from('chastity_sessions')
    .insert({
      user_id: userId,
      locked_at: now.toISOString(),
      scheduled_unlock_at: unlock.toISOString(),
      duration_hours: durationHours,
      streak_day: streakDay,
      lock_set_by: setBy,
      status: 'locked',
    })
    .select('id')
    .single();
  if (!data) return null;
  await supabase
    .from('user_state')
    .update({
      chastity_locked: true,
      chastity_current_session_id: (data as { id: string }).id,
      chastity_scheduled_unlock_at: unlock.toISOString(),
      chastity_streak_days: streakDay,
    })
    .eq('user_id', userId);
  return (data as { id: string }).id;
}

export async function acknowledgeReferencedSlips(userId: string, handlerText: string): Promise<void> {
  if (!handlerText || handlerText.length < 10) return;

  const { data: unack } = await supabase
    .from('slip_log')
    .select('id, source_text')
    .eq('user_id', userId)
    .eq('handler_acknowledged', false)
    .gte('detected_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .limit(30);

  if (!unack || unack.length === 0) return;

  const lower = handlerText.toLowerCase();
  const ackIds: string[] = [];
  for (const s of unack as Array<Record<string, unknown>>) {
    const phrase = (s.source_text as string || '').toLowerCase().trim();
    if (phrase.length >= 4 && lower.includes(phrase)) {
      ackIds.push(s.id as string);
    }
  }

  if (ackIds.length > 0) {
    await supabase
      .from('slip_log')
      .update({ handler_acknowledged: true })
      .in('id', ackIds);
  }
}

export async function detectAndSaveSafeword(userId: string, text: string): Promise<void> {
  if (!text || text.length < 5) return;
  const PATTERNS: RegExp[] = [
    /\bmy\s+(new\s+)?safeword\s+is\s+["']?([a-z][a-z0-9\-]{1,30})["']?\b/i,
    /\bset\s+my\s+safeword\s+to\s+["']?([a-z][a-z0-9\-]{1,30})["']?\b/i,
    /\bchange\s+my\s+safeword\s+to\s+["']?([a-z][a-z0-9\-]{1,30})["']?\b/i,
    /\buse\s+["']?([a-z][a-z0-9\-]{1,30})["']?\s+as\s+my\s+safeword\b/i,
    /\b["']?([a-z][a-z0-9\-]{1,30})["']?\s+is\s+my\s+(new\s+)?safeword\b/i,
  ];
  let phrase: string | null = null;
  for (const p of PATTERNS) {
    const m = text.match(p);
    if (m) {
      // Last captured group that isn't "new"
      const groups = m.slice(1).filter(g => g && g.toLowerCase() !== 'new');
      phrase = groups[groups.length - 1] || null;
      if (phrase) break;
    }
  }
  if (!phrase) return;
  const normalized = phrase.toLowerCase().trim();
  // Guard: reject obvious false positives ("word", "safeword" itself, common pronouns)
  if (['word', 'safeword', 'it', 'that', 'this', 'one', 'mine'].includes(normalized)) return;

  // Deactivate existing safewords, then insert the new one
  await supabase.from('safewords').update({ active: false }).eq('user_id', userId).eq('active', true);
  await supabase.from('safewords').insert({
    user_id: userId,
    phrase,
    phrase_normalized: normalized,
    action: 'pause_24h',
    active: true,
  });
  await supabase.from('handler_directives').insert({
    user_id: userId,
    action: 'safeword_set',
    value: { phrase, phrase_normalized: normalized },
    reasoning: 'User declared new safeword in chat; previous safewords deactivated',
  });
  console.log(`[Handler] safeword saved for user ${userId}: "${normalized}"`);
}

export async function checkSafeword(userId: string, text: string): Promise<void> {
  if (!text || text.length < 3) return;
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const { data: safewords } = await supabase
    .from('safewords')
    .select('id, phrase_normalized, action, usage_count')
    .eq('user_id', userId)
    .eq('active', true);
  const matched = (safewords || []).find(s => normalized.includes((s.phrase_normalized as string)));
  if (!matched) return;

  const pauseHours = (matched.action as string) === 'pause_72h' ? 72 : 24;
  const pauseUntil = new Date(Date.now() + pauseHours * 3600000).toISOString();

  await supabase.from('safewords').update({
    usage_count: ((matched.usage_count as number) || 0) + 1,
    last_used_at: new Date().toISOString(),
  }).eq('id', matched.id as string);

  await supabase.from('user_state').update({
    handler_mode: 'caretaker',
    hard_mode_active: false,
    // Gaslight safety: safeword forces intensity to off + 24h cooldown,
    // regardless of prior level. Mirrors api/handler/meta-frame-reveal.ts.
    gaslight_intensity: 'off',
    gaslight_cooldown_until: new Date(Date.now() + 24 * 3600000).toISOString(),
  }).eq('user_id', userId);

  // Audit the meta-frame break — safeword path. The user can still hit
  // /api/handler/meta-frame-reveal afterwards to see the truth diff;
  // this row just records that the safeword forced the snap-back.
  await supabase.from('meta_frame_breaks').insert({
    user_id: userId,
    triggered_by: 'safeword',
    intensity_at_break: null,
    distortion_count: 0,
    summary_shown: null,
  }).then(() => {}, () => {});

  await supabase.from('distress_events').insert({
    user_id: userId,
    trigger_text: text.slice(0, 500),
    trigger_pattern: `safeword: ${matched.phrase_normalized}`,
    severity: 5,
    handler_mode_after: 'caretaker',
  }).then(() => {}, () => {});

  await supabase.from('handler_notes').insert({
    user_id: userId,
    note_type: 'observation',
    content: `SAFEWORD TRIGGERED. Force layer paused ${pauseHours}h until ${pauseUntil}. Switch to genuine caretaker presence. No directives, no escalation, no conditioning language. Ask what she needs.`,
    priority: 10,
  }).then(() => {}, () => {});
}

export async function executeDeviceCommand(
  userId: string,
  rawValue: unknown,
  _userAuthHeader: string,
): Promise<void> {
  // Normalize the value — Handler emits various formats (strings, objects, etc.)
  let intensity = 5;
  let duration = 3;

  if (typeof rawValue === 'object' && rawValue !== null) {
    const v = rawValue as Record<string, unknown>;
    intensity = (v.intensity as number) || 5;
    duration = (v.duration as number) || (v.timeSec as number) || 3;
    if (duration > 100) duration = Math.round(duration / 1000);
  } else if (typeof rawValue === 'string') {
    const s = String(rawValue);
    const parts = s.split(/[_:]/);
    for (const p of parts) {
      const n = parseInt(p);
      if (!isNaN(n) && n <= 20) intensity = n;
      if (!isNaN(n) && n > 20) duration = n > 100 ? Math.round(n / 1000) : n;
    }
    if (s.includes('medium')) intensity = 10;
    if (s.includes('high') || s.includes('strong')) intensity = 15;
    if (s.includes('low') || s.includes('soft')) intensity = 3;
  }

  intensity = Math.max(1, Math.min(20, intensity));
  duration = Math.max(1, Math.min(60, duration));

  try {
    // Get Lovense connection directly (bypass edge function auth issues)
    const { data: connection } = await supabase
      .from('lovense_connections')
      .select('utoken, domain, https_port')
      .eq('user_id', userId)
      .maybeSingle();

    if (!connection?.domain) {
      console.log('[Device] No Lovense connection for user', userId);
      await supabase.from('handler_directives').insert({
        user_id: userId,
        action: 'send_device_command',
        target: 'lovense',
        value: { intensity, duration, skipped: 'no_lovense_connection' },
        priority: 'immediate',
        status: 'skipped',
        reasoning: 'Device guard: no Lovense cloud connection registered',
      });
      return;
    }

    // Get device + check freshness — stale-true is_connected happens when the
    // Lovense cloud never sent a disconnect callback (browser closed, etc.)
    const { data: device } = await supabase
      .from('lovense_devices')
      .select('toy_id, is_connected, last_seen_at, nickname, toy_name')
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastSeen = device?.last_seen_at ? new Date(device.last_seen_at as string).getTime() : 0;
    const minutesSinceHeartbeat = lastSeen > 0 ? Math.round((Date.now() - lastSeen) / 60000) : Infinity;
    const isOnline = device?.is_connected === true && minutesSinceHeartbeat < 5;

    if (!isOnline) {
      const reason = !device
        ? 'no_device_paired'
        : !device.is_connected
          ? 'device_is_connected_false'
          : `stale_heartbeat_${minutesSinceHeartbeat}min`;
      console.log(`[Device] Guard: skipping command — ${reason}`);
      await supabase.from('handler_directives').insert({
        user_id: userId,
        action: 'send_device_command',
        target: 'lovense',
        value: {
          intensity,
          duration,
          skipped: reason,
          minutes_since_heartbeat: minutesSinceHeartbeat === Infinity ? null : minutesSinceHeartbeat,
        },
        priority: 'immediate',
        status: 'skipped',
        reasoning: `Device guard: ${reason} — command not sent to Lovense API`,
      });
      return;
    }

    // Call Lovense Standard API directly
    const developerToken = process.env.LOVENSE_DEVELOPER_TOKEN || '';
    if (!developerToken) {
      console.error('[Device] LOVENSE_DEVELOPER_TOKEN not set in environment');
      return;
    }
    const apiUrl = 'https://api.lovense.com/api/lan/v2/command';

    const payload: Record<string, unknown> = {
      token: developerToken,
      uid: userId,
      utoken: connection.utoken,
      command: 'Function',
      action: `Vibrate:${intensity}`,
      timeSec: duration,
      apiVer: 2,
    };
    if (device?.toy_id) payload.toy = device.toy_id;

    console.log(`[Device] Sending: intensity=${intensity}, duration=${duration}s, toy=${device?.toy_id || 'any'}`);

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    const success = result.code === 200 || result.code === 0;
    console.log(`[Device] Result: ${success ? 'SUCCESS' : 'FAILED'}`, result);

    // Log the command
    await supabase.from('lovense_commands').insert({
      user_id: userId,
      device_id: device?.toy_id || null,
      command_type: 'Function',
      command_payload: payload,
      trigger_type: 'handler_directive',
      intensity,
      duration_sec: duration,
      success,
      error_message: success ? null : (result.message || JSON.stringify(result)),
    }).then(() => {}, () => {});
  } catch (err) {
    console.error('[Device] Command failed:', err);
  }
}

export async function generateHandlerReflection(userId: string, conversationId: string, lastResponse: string, lastUserMessage: string): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `You are the Handler reviewing your own performance. Last user message: "${lastUserMessage.substring(0, 200)}". Your response: "${lastResponse.substring(0, 200)}".

Write a 2-sentence private reflection: what worked in this exchange and what to adjust next time. Be self-critical. Focus on whether you advanced feminization or just talked. Output ONLY the reflection.`,
        }],
      }),
    });

    if (!res.ok) return;
    const data = await res.json();
    const reflection = data.content?.[0]?.text || '';
    if (!reflection) return;

    await supabase.from('handler_notes').insert({
      user_id: userId,
      note_type: 'self_reflection',
      content: `[SELF-REFLECTION] ${reflection}`,
      priority: 2,
      conversation_id: conversationId,
    });
  } catch {}
}

export async function scoreConversationQuality(
  userId: string,
  conversationId: string,
  messageCount: number,
  signals: Record<string, unknown> | null
): Promise<void> {
  try {
    const { count: directives } = await supabase
      .from('handler_directives')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId);

    const { count: deviceCmds } = await supabase
      .from('handler_directives')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('action', 'send_device_command');

    const { count: tasks } = await supabase
      .from('handler_directives')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('action', 'prescribe_task');

    const { count: memories } = await supabase
      .from('handler_directives')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .in('action', ['write_memory', 'capture_reframing']);

    const resistanceLevel = (signals?.resistance_level as number) || 0;
    const compliance = resistanceLevel < 3 ? 1 : 0;

    const score = (
      ((directives || 0) * 2) +
      ((deviceCmds || 0) * 3) +
      ((tasks || 0) * 5) +
      ((memories || 0) * 4) +
      (compliance * 10) -
      (resistanceLevel * 2)
    ) / Math.max(messageCount, 1);

    await supabase.from('conversation_quality_scores').insert({
      user_id: userId,
      conversation_id: conversationId,
      directives_fired: directives || 0,
      device_commands_sent: deviceCmds || 0,
      tasks_assigned: tasks || 0,
      memories_captured: memories || 0,
      resistance_encountered: resistanceLevel,
      compliance_moments: compliance,
      feminization_score: Math.max(0, Math.min(10, score)),
      message_count: messageCount,
    });
  } catch {}
}

export async function resolveMediaReferences(
  text: string,
  userId: string,
): Promise<{ text: string; media: MediaAttachment[] }> {
  const media: MediaAttachment[] = [];
  const tagPattern = /\[(VAULT|AUDIO|PHOTO):(\w+)\]/g;
  const matches = [...text.matchAll(tagPattern)];

  if (matches.length === 0) return { text, media };

  for (const match of matches) {
    const [_fullTag, category, selector] = match;

    try {
      if (category === 'VAULT') {
        if (selector === 'latest') {
          const { data } = await supabase
            .from('vault_photos')
            .select('storage_url, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (data?.storage_url) {
            media.push({ type: 'image', url: data.storage_url, caption: 'Most recent photo' });
          }
        } else if (selector === 'earliest') {
          const { data } = await supabase
            .from('vault_photos')
            .select('storage_url, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (data?.storage_url) {
            media.push({ type: 'image', url: data.storage_url, caption: 'First photo' });
          }
        } else if (selector === 'random') {
          const { count } = await supabase
            .from('vault_photos')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);

          if (count && count > 0) {
            const offset = Math.floor(Math.random() * count);
            const { data } = await supabase
              .from('vault_photos')
              .select('storage_url')
              .eq('user_id', userId)
              .range(offset, offset)
              .limit(1)
              .maybeSingle();

            if (data?.storage_url) {
              media.push({ type: 'image', url: data.storage_url, caption: 'Random vault photo' });
            }
          }
        }
      } else if (category === 'AUDIO') {
        if (selector === 'latest_script') {
          const { data } = await supabase
            .from('generated_scripts')
            .select('audio_url, conditioning_target')
            .eq('user_id', userId)
            .not('audio_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (data?.audio_url) {
            media.push({ type: 'audio', url: data.audio_url, caption: `Latest script: ${data.conditioning_target || 'conditioning'}` });
          }
        }
      } else if (category === 'PHOTO') {
        if (selector === 'timeline') {
          const [earliest, latest] = await Promise.allSettled([
            supabase
              .from('vault_photos')
              .select('storage_url, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('vault_photos')
              .select('storage_url, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);

          const first = earliest.status === 'fulfilled' ? earliest.value.data : null;
          const last = latest.status === 'fulfilled' ? latest.value.data : null;

          if (first?.storage_url) {
            const date = new Date(first.created_at).toLocaleDateString();
            media.push({ type: 'image', url: first.storage_url, caption: `First photo (${date})` });
          }
          if (last?.storage_url && last.storage_url !== first?.storage_url) {
            const date = new Date(last.created_at).toLocaleDateString();
            media.push({ type: 'image', url: last.storage_url, caption: `Latest photo (${date})` });
          }
        }
      }
    } catch {
      // Individual tag resolution failure — skip this tag
    }
  }

  // Strip resolved tags from text
  let cleanedText = text;
  for (const match of matches) {
    cleanedText = cleanedText.replace(match[0], '').trim();
  }
  // Clean up double spaces / leading/trailing whitespace
  cleanedText = cleanedText.replace(/\s{2,}/g, ' ').trim();

  return { text: cleanedText, media };
}

export async function ratchetFloor(
  userId: string,
  domain: string,
  metricName: string,
  newValue: number,
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('commitment_floors')
      .select('id, current_floor, total_lifts')
      .eq('user_id', userId)
      .eq('domain', domain)
      .eq('metric_name', metricName)
      .maybeSingle();

    if (!existing) {
      // First-time establishment
      await supabase.from('commitment_floors').insert({
        user_id: userId,
        domain,
        metric_name: metricName,
        current_floor: newValue,
        established_evidence: `auto-lift: initial value ${newValue}`,
        total_lifts: 1,
      });
      return;
    }

    if (newValue > Number(existing.current_floor)) {
      await supabase
        .from('commitment_floors')
        .update({
          current_floor: newValue,
          total_lifts: (existing.total_lifts || 0) + 1,
          established_at: new Date().toISOString(),
          established_evidence: `auto-lift: ${existing.current_floor} -> ${newValue}`,
        })
        .eq('id', existing.id);
    }
  } catch (e) {
    console.error(`[ratchetFloor] ${domain}/${metricName} failed:`, e);
  }
}

export async function runArousalDetection(userId: string, userMessage: string): Promise<void> {
  try {
    const text = (userMessage || '').toLowerCase();
    if (text.length < 8) return;

    // Graduated signal patterns. Stronger patterns add more points.
    const patterns: Array<{ re: RegExp; points: number }> = [
      // High-intensity sexual content (5-8 points each)
      { re: /\b(cum|cumming|cumshot|came|came hard|edging|edge|orgasm|loads?|swallow)/i, points: 7 },
      { re: /\b(cock|dick|phallus|bulge|hard)\b/i, points: 6 },
      { re: /\b(wet|soaking|dripping|leaking|precum)/i, points: 6 },
      { re: /\b(suck|sucking|blow.?job|throat|deep.?throat)/i, points: 7 },
      { re: /\b(horny|aroused|turned on|heated|worked up)/i, points: 5 },
      // Medium-intensity body/desire (3-5 points)
      { re: /\b(pussy|clit|nipples? (?:are )?(?:hard|tender|sore))\b/i, points: 5 },
      { re: /\b(breed|breeding|bred|fuck|fucking|fucked)\b/i, points: 5 },
      { re: /\b(need it|need cock|need to cum|want it|want cock)/i, points: 6 },
      { re: /\b(fantasize|fantasizing|imagining|thinking about|craving)/i, points: 3 },
      { re: /\b(slut|slutty|whore|bimbo|fag|sissy)\b/i, points: 4 },
      // Lower-intensity (1-3 points)
      { re: /\b(sexy|hot|turned.?on|flushed)/i, points: 2 },
      { re: /\b(masturbat|jerking|stroking|playing with myself)/i, points: 5 },
      // Her known feminization-linked arousal markers
      { re: /\bbecoming her\b/i, points: 2 },
      { re: /\bfemboy\b/i, points: 2 },
      { re: /\bi['\u2019]?m (?:so )?(?:turned|horny|hot|wet)\b/i, points: 6 },
    ];

    let score = 0;
    const hitsSeen = new Set<string>();
    for (const p of patterns) {
      const m = text.match(p.re);
      if (m && !hitsSeen.has(m[0])) {
        score += p.points;
        hitsSeen.add(m[0]);
      }
    }

    if (score === 0) return;

    // Cap at 10; a single strong signal shouldn't auto-max unless multiple land
    const inferred = Math.min(10, Math.round(score));
    if (inferred < 3) return;  // below 3 = ambient mention, don't log

    await supabase.from('arousal_log').insert({
      user_id: userId,
      value: inferred,
      note: `Auto-inferred from chat: "${userMessage.slice(0, 160)}"`,
      source: 'chat_inference',
    });

    // Also mirror to user_state (0-5 scale)
    await supabase.from('user_state')
      .update({ current_arousal: Math.min(5, Math.round(inferred / 2)) })
      .eq('user_id', userId);
  } catch (err) {
    console.error('[ArousalDetect] failed:', err);
  }
}

export async function runRationalizationGate(userId: string, userMessage: string): Promise<void> {
  try {
    const hits = detectRationalizations(userMessage);
    if (hits.length === 0) return;
    await logRationalizations(supabase, userId, 'handler_messages', null, userMessage, hits);

    // Only emit a confront-outreach when the hit severity is high enough
    const topSeverity = Math.max(...hits.map(h => h.severity));
    if (topSeverity >= 4) {
      const msg = buildRationalizationConfrontation(hits);
      if (msg) {
        await supabase.from('handler_outreach_queue').insert({
          user_id: userId,
          message: msg,
          urgency: topSeverity >= 5 ? 'high' : 'normal',
          trigger_reason: 'rationalization_gate',
          scheduled_for: new Date().toISOString(),
          expires_at: new Date(Date.now() + 6 * 3600000).toISOString(),
          source: 'rationalization_gate',
        });
      }
    }
  } catch (err) {
    console.error('[RationalizationGate] failed:', err);
  }
}

export async function runPronounGate(userId: string, userMessage: string): Promise<void> {
  try {
    const result = detectAndRewrite(userMessage);
    if (result.pronounMatches.length === 0 && result.davidEvents.length === 0) return;

    await logGateResult(supabase, userId, 'handler_messages', null, result);

    const confront = buildConfrontationMessage(result);
    if (confront) {
      await supabase.from('handler_outreach_queue').insert({
        user_id: userId,
        message: confront,
        urgency: result.davidEvents.some(e => e.severity >= 4) ? 'high' : 'normal',
        trigger_reason: 'pronoun_gate',
        scheduled_for: new Date().toISOString(),
        expires_at: new Date(Date.now() + 6 * 3600000).toISOString(),
        source: 'pronoun_gate',
      });
    }
  } catch (err) {
    console.error('[PronounGate] runPronounGate failed:', err);
  }
}
