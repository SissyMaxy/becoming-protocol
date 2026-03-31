/**
 * Directive Executor — Handler Command Queue Processing
 *
 * Processes pending handler directives. Each action type maps to
 * existing system functions. Failed directives never block others.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type DirectiveAction =
  | 'modify_parameter'
  | 'generate_script'
  | 'schedule_session'
  | 'schedule_ambush'
  | 'advance_skill'
  | 'advance_service'
  | 'advance_corruption'
  | 'write_memory'
  | 'prescribe_task'
  | 'modify_schedule'
  | 'send_device_command'
  | 'create_narrative_beat'
  | 'flag_for_review'
  | 'custom';

export type DirectivePriority = 'immediate' | 'normal' | 'low' | 'deferred';
export type DirectiveStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';

export interface HandlerDirective {
  id: string;
  user_id: string;
  action: DirectiveAction;
  target: string | null;
  value: Record<string, unknown> | null;
  priority: DirectivePriority;
  silent: boolean;
  status: DirectiveStatus;
  result: Record<string, unknown> | null;
  error_message: string | null;
  conversation_id: string | null;
  reasoning: string | null;
  created_at: string;
  executed_at: string | null;
}

interface DirectiveResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ============================================
// PRIORITY ORDER FOR QUERY
// ============================================

const PRIORITY_ORDER: Record<DirectivePriority, number> = {
  immediate: 0,
  normal: 1,
  low: 2,
  deferred: 3,
};

// ============================================
// MAIN EXECUTOR
// ============================================

/**
 * Execute all pending directives for a user.
 * Returns count of executed directives and any errors.
 */
export async function executePendingDirectives(userId: string): Promise<{
  executed: number;
  failed: number;
  errors: string[];
}> {
  const result = { executed: 0, failed: 0, errors: [] as string[] };

  // Query pending directives, ordered by priority then creation time
  const { data: directives, error: queryErr } = await supabase
    .from('handler_directives')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (queryErr) {
    console.error('[directive-executor] Failed to query directives:', queryErr);
    result.errors.push(`Query failed: ${queryErr.message}`);
    return result;
  }

  if (!directives || directives.length === 0) return result;

  // Sort by priority (immediate first), then by created_at
  const sorted = [...directives].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority as DirectivePriority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority as DirectivePriority] ?? 1;
    if (pa !== pb) return pa - pb;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  for (const directive of sorted) {
    try {
      // Mark as executing
      await supabase
        .from('handler_directives')
        .update({ status: 'executing' })
        .eq('id', directive.id);

      const execResult = await executeDirective(directive as HandlerDirective);

      if (execResult.success) {
        await supabase
          .from('handler_directives')
          .update({
            status: 'completed',
            result: execResult.data || {},
            executed_at: new Date().toISOString(),
          })
          .eq('id', directive.id);
        result.executed++;
        console.log(`[directive-executor] Completed: ${directive.action} (${directive.id})`);
      } else {
        await supabase
          .from('handler_directives')
          .update({
            status: 'failed',
            error_message: execResult.error || 'Unknown error',
            executed_at: new Date().toISOString(),
          })
          .eq('id', directive.id);
        result.failed++;
        result.errors.push(`${directive.action}(${directive.id}): ${execResult.error}`);
        console.error(`[directive-executor] Failed: ${directive.action} (${directive.id}):`, execResult.error);
      }
    } catch (err) {
      // Catch-all: mark failed, never block other directives
      const errMsg = err instanceof Error ? err.message : String(err);
      await supabase
        .from('handler_directives')
        .update({
          status: 'failed',
          error_message: errMsg,
          executed_at: new Date().toISOString(),
        })
        .eq('id', directive.id);
      result.failed++;
      result.errors.push(`${directive.action}(${directive.id}): ${errMsg}`);
      console.error(`[directive-executor] Exception: ${directive.action} (${directive.id}):`, err);
    }
  }

  return result;
}

// ============================================
// ACTION DISPATCHER
// ============================================

export async function executeDirective(directive: HandlerDirective): Promise<DirectiveResult> {
  const { action, user_id, target, value } = directive;
  const v = (value || {}) as Record<string, unknown>;

  switch (action) {
    case 'modify_parameter':
      return await execModifyParameter(user_id, v);

    case 'generate_script':
      return await execGenerateScript(user_id, v);

    case 'schedule_session':
      return await execScheduleSession(user_id, v);

    case 'schedule_ambush':
      return await execScheduleAmbush(user_id, v);

    case 'advance_skill':
      return await execAdvanceSkill(user_id, v);

    case 'advance_service':
      return await execAdvanceService(user_id, v);

    case 'advance_corruption':
      return await execAdvanceCorruption(user_id, v);

    case 'write_memory':
      return await execWriteMemory(user_id, v);

    case 'prescribe_task':
      return await execPrescribeTask(user_id, v);

    case 'modify_schedule':
      return await execModifySchedule(user_id, v);

    case 'send_device_command':
      return await execSendDeviceCommand(user_id, v);

    case 'create_narrative_beat':
      return await execCreateNarrativeBeat(user_id, v);

    case 'flag_for_review':
      return await execFlagForReview(user_id, v, directive.conversation_id);

    case 'custom':
      console.log(`[directive-executor] Custom directive logged: ${target}`, v);
      return { success: true, data: { action: 'custom', logged: true, target } };

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

// ============================================
// ACTION IMPLEMENTATIONS
// ============================================

async function execModifyParameter(
  userId: string,
  value: Record<string, unknown>,
): Promise<DirectiveResult> {
  const parameter = value.parameter as string;
  const newValue = value.new_value as number;

  if (!parameter || newValue == null) {
    return { success: false, error: 'Missing parameter or new_value' };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('hidden_operations')
    .select('id, current_value')
    .eq('user_id', userId)
    .eq('parameter', parameter)
    .maybeSingle();

  if (fetchErr) {
    return { success: false, error: `Fetch failed: ${fetchErr.message}` };
  }

  if (existing) {
    const { error: updateErr } = await supabase
      .from('hidden_operations')
      .update({ current_value: newValue })
      .eq('id', existing.id);

    if (updateErr) return { success: false, error: `Update failed: ${updateErr.message}` };
    return { success: true, data: { parameter, previous: existing.current_value, new_value: newValue } };
  } else {
    // Insert new parameter row
    const { error: insertErr } = await supabase
      .from('hidden_operations')
      .insert({
        user_id: userId,
        parameter,
        current_value: newValue,
        increment_rate: 0,
        increment_interval: 'weekly',
      });

    if (insertErr) return { success: false, error: `Insert failed: ${insertErr.message}` };
    return { success: true, data: { parameter, previous: null, new_value: newValue, created: true } };
  }
}

async function execGenerateScript(
  userId: string,
  value: Record<string, unknown>,
): Promise<DirectiveResult> {
  const phase = (value.phase as number) ?? 0;
  const target = (value.target as string) || 'identity';

  // Insert a request into generated_scripts with status pending
  // The conditioning-engine generate_weekly_scripts action will pick it up,
  // or we can generate inline if an API key is available
  const { error } = await supabase
    .from('generated_scripts')
    .insert({
      user_id: userId,
      conditioning_phase: phase,
      conditioning_target: target,
      script_text: '', // Will be filled by generation pipeline
      generation_prompt: `Handler directive: generate ${target} script at phase ${phase}`,
    });

  if (error) return { success: false, error: `Insert failed: ${error.message}` };
  return { success: true, data: { target, phase, queued: true } };
}

async function execScheduleSession(
  userId: string,
  value: Record<string, unknown>,
): Promise<DirectiveResult> {
  const sessionType = (value.session_type as string) || 'conditioning';
  const scheduledAt = (value.scheduled_at as string) || new Date().toISOString();

  const { data, error } = await supabase
    .from('conditioning_sessions_v2')
    .insert({
      user_id: userId,
      session_type: sessionType,
      started_at: scheduledAt,
      completed: false,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: `Insert failed: ${error.message}` };
  return { success: true, data: { session_id: data?.id, session_type: sessionType, scheduled_at: scheduledAt } };
}

async function execScheduleAmbush(
  userId: string,
  value: Record<string, unknown>,
): Promise<DirectiveResult> {
  const ambushType = (value.type as string) || 'surprise_task';
  const scheduledAt = (value.scheduled_at as string) || new Date().toISOString();

  const { data, error } = await supabase
    .from('ambush_events')
    .insert({
      user_id: userId,
      ambush_type: ambushType,
      scheduled_at: scheduledAt,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) return { success: false, error: `Insert failed: ${error.message}` };
  return { success: true, data: { ambush_id: data?.id, type: ambushType, scheduled_at: scheduledAt } };
}

async function execAdvanceSkill(
  userId: string,
  value: Record<string, unknown>,
): Promise<DirectiveResult> {
  const domain = value.domain as string;
  if (!domain) return { success: false, error: 'Missing domain' };

  // Get current level, increment it
  const { data: existing, error: fetchErr } = await supabase
    .from('skill_domains')
    .select('id, current_level')
    .eq('user_id', userId)
    .eq('domain', domain)
    .maybeSingle();

  if (fetchErr) return { success: false, error: `Fetch failed: ${fetchErr.message}` };

  if (existing) {
    const newLevel = (existing.current_level || 0) + 1;
    const { error: updateErr } = await supabase
      .from('skill_domains')
      .update({ current_level: newLevel })
      .eq('id', existing.id);

    if (updateErr) return { success: false, error: `Update failed: ${updateErr.message}` };
    return { success: true, data: { domain, previous_level: existing.current_level, new_level: newLevel } };
  } else {
    const { error: insertErr } = await supabase
      .from('skill_domains')
      .insert({ user_id: userId, domain, current_level: 1 });

    if (insertErr) return { success: false, error: `Insert failed: ${insertErr.message}` };
    return { success: true, data: { domain, previous_level: 0, new_level: 1, created: true } };
  }
}

async function execAdvanceService(
  userId: string,
  value: Record<string, unknown>,
): Promise<DirectiveResult> {
  const newStage = value.new_stage as string;
  if (!newStage) return { success: false, error: 'Missing new_stage' };

  const { data: existing, error: fetchErr } = await supabase
    .from('service_progression')
    .select('id, current_stage')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr) return { success: false, error: `Fetch failed: ${fetchErr.message}` };

  if (existing) {
    const previousStage = existing.current_stage;
    const { error: updateErr } = await supabase
      .from('service_progression')
      .update({ current_stage: newStage, last_advanced_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (updateErr) return { success: false, error: `Update failed: ${updateErr.message}` };
    return { success: true, data: { previous_stage: previousStage, new_stage: newStage } };
  } else {
    return { success: false, error: 'No service_progression row found for user' };
  }
}

async function execAdvanceCorruption(
  userId: string,
  value: Record<string, unknown>,
): Promise<DirectiveResult> {
  const domain = (value.domain as string) || 'general';
  const amount = (value.amount as number) ?? 1;

  // Get current corruption state and increment
  const { data: existing, error: fetchErr } = await supabase
    .from('corruption_state')
    .select('id, corruption_level, domain_levels')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr) return { success: false, error: `Fetch failed: ${fetchErr.message}` };

  if (existing) {
    const domainLevels = (existing.domain_levels || {}) as Record<string, number>;
    domainLevels[domain] = (domainLevels[domain] || 0) + amount;
    const newLevel = (existing.corruption_level || 0) + amount;

    const { error: updateErr } = await supabase
      .from('corruption_state')
      .update({
        corruption_level: newLevel,
        domain_levels: domainLevels,
      })
      .eq('id', existing.id);

    if (updateErr) return { success: false, error: `Update failed: ${updateErr.message}` };
    return { success: true, data: { domain, amount, new_level: newLevel, domain_levels: domainLevels } };
  } else {
    return { success: false, error: 'No corruption_state row found for user' };
  }
}

async function execWriteMemory(
  userId: string,
  value: Record<string, unknown>,
): Promise<DirectiveResult> {
  const memoryType = (value.memory_type as string) || 'observation';
  const content = value.content as string;
  const importance = (value.importance as number) ?? 3;

  if (!content) return { success: false, error: 'Missing content' };

  const { data, error } = await supabase
    .from('handler_memory')
    .insert({
      user_id: userId,
      memory_type: memoryType,
      content,
      importance,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) return { success: false, error: `Insert failed: ${error.message}` };
  return { success: true, data: { memory_id: data?.id, memory_type: memoryType, importance } };
}

async function execPrescribeTask(
  userId: string,
  value: Record<string, unknown>,
): Promise<DirectiveResult> {
  const taskId = value.task_id as string;
  const domain = (value.domain as string) || 'general';

  if (!taskId) return { success: false, error: 'Missing task_id' };

  const { data, error } = await supabase
    .from('daily_tasks')
    .insert({
      user_id: userId,
      task_id: taskId,
      domain,
      prescribed_at: new Date().toISOString(),
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) return { success: false, error: `Insert failed: ${error.message}` };
  return { success: true, data: { daily_task_id: data?.id, task_id: taskId, domain } };
}

async function execModifySchedule(
  userId: string,
  value: Record<string, unknown>,
): Promise<DirectiveResult> {
  // Modify scheduling parameters stored in user config
  const parameter = value.parameter as string;
  const newValue = value.new_value;

  if (!parameter) return { success: false, error: 'Missing parameter' };

  // Store schedule modifications in a generic config table or handler_notes for manual follow-up
  const { error } = await supabase
    .from('handler_notes')
    .insert({
      user_id: userId,
      note_type: 'schedule_modification',
      content: `Modify schedule: ${parameter} = ${JSON.stringify(newValue)}`,
      priority: 3,
    });

  if (error) return { success: false, error: `Insert failed: ${error.message}` };
  return { success: true, data: { parameter, new_value: newValue, method: 'handler_note' } };
}

async function execSendDeviceCommand(
  userId: string,
  value: Record<string, unknown>,
): Promise<DirectiveResult> {
  const intensity = (value.intensity as number) ?? 5;
  const duration = (value.duration as number) ?? 5;
  const pattern = (value.pattern as string) || 'pulse';

  // Invoke the lovense-command edge function
  const { data, error } = await supabase.functions.invoke('lovense-command', {
    body: {
      user_id: userId,
      intensity,
      duration,
      pattern,
      source: 'handler_directive',
    },
  });

  if (error) return { success: false, error: `Edge function failed: ${error.message}` };
  return { success: true, data: { intensity, duration, pattern, response: data } };
}

async function execCreateNarrativeBeat(
  userId: string,
  value: Record<string, unknown>,
): Promise<DirectiveResult> {
  const arcId = value.arc_id as string;
  const beat = value.beat as Record<string, unknown>;

  if (!arcId || !beat) return { success: false, error: 'Missing arc_id or beat' };

  // Get current arc and append beat
  const { data: arc, error: fetchErr } = await supabase
    .from('narrative_arcs')
    .select('id, beats')
    .eq('id', arcId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr) return { success: false, error: `Fetch failed: ${fetchErr.message}` };
  if (!arc) return { success: false, error: `Arc not found: ${arcId}` };

  const beats = Array.isArray(arc.beats) ? [...arc.beats, beat] : [beat];

  const { error: updateErr } = await supabase
    .from('narrative_arcs')
    .update({ beats })
    .eq('id', arc.id);

  if (updateErr) return { success: false, error: `Update failed: ${updateErr.message}` };
  return { success: true, data: { arc_id: arcId, beat_index: beats.length - 1, beat } };
}

async function execFlagForReview(
  userId: string,
  value: Record<string, unknown>,
  conversationId: string | null,
): Promise<DirectiveResult> {
  const content = value.content as string;
  if (!content) return { success: false, error: 'Missing content' };

  const { data, error } = await supabase
    .from('handler_notes')
    .insert({
      user_id: userId,
      note_type: 'context',
      content,
      priority: (value.priority as number) ?? 3,
      conversation_id: conversationId,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: `Insert failed: ${error.message}` };
  return { success: true, data: { note_id: data?.id, content } };
}

// ============================================
// CONTEXT BUILDER
// ============================================

/**
 * Build directive context for Handler awareness.
 * Shows pending count, recent completions, and any failures.
 */
export async function buildDirectiveContext(userId: string): Promise<string> {
  try {
    const [pendingResult, recentResult, failedResult] = await Promise.allSettled([
      supabase
        .from('handler_directives')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'pending'),
      supabase
        .from('handler_directives')
        .select('action, target, status, result, executed_at')
        .eq('user_id', userId)
        .in('status', ['completed', 'failed'])
        .order('executed_at', { ascending: false })
        .limit(5),
      supabase
        .from('handler_directives')
        .select('action, target, error_message, created_at')
        .eq('user_id', userId)
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

    const pendingCount = pendingResult.status === 'fulfilled'
      ? (pendingResult.value.count ?? 0)
      : 0;

    const recent = recentResult.status === 'fulfilled'
      ? (recentResult.value.data || [])
      : [];

    const failed = failedResult.status === 'fulfilled'
      ? (failedResult.value.data || [])
      : [];

    if (pendingCount === 0 && recent.length === 0 && failed.length === 0) return '';

    const lines: string[] = ['## Handler Directives'];

    if (pendingCount > 0) {
      lines.push(`Pending: ${pendingCount} directive${pendingCount > 1 ? 's' : ''} queued`);
    }

    if (recent.length > 0) {
      lines.push('Recent:');
      for (const r of recent) {
        const status = r.status === 'completed' ? 'OK' : 'FAIL';
        const target = r.target ? ` → ${r.target}` : '';
        lines.push(`- [${status}] ${r.action}${target}`);
      }
    }

    if (failed.length > 0) {
      lines.push('Failed (needs attention):');
      for (const f of failed) {
        lines.push(`- ${f.action}${f.target ? ` → ${f.target}` : ''}: ${f.error_message || 'unknown'}`);
      }
    }

    return lines.join('\n');
  } catch (err) {
    console.error('[directive-executor] buildDirectiveContext error:', err);
    return '';
  }
}
