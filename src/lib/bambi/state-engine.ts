/**
 * Bambi State Engine
 *
 * Trance depth tracking, trigger conditioning, content audit.
 * Bambi is a depth of Maxy — not a separate identity.
 * The Handler gains trance as a second resistance bypass channel.
 */

import { supabase } from '../supabase';
import type {
  BambiSessionType,
  EntryMethod,
  PostSessionState,
  TriggerCategory,
  TriggerSource,
  ContentSource,
  ContentUsageRecommendation,
  BambiState,
  ConditioningTrigger,
  ContentLibraryAudit,
  TriggerEffectiveness,
  BambiSessionSummary,
  BambiDashboardData,
  ContentRecommendation,
} from '../../types/bambi';

// ============================================
// SESSION LOGGING
// ============================================

export interface LogBambiSessionInput {
  userId: string;
  sessionType: BambiSessionType;
  entryMethod?: EntryMethod;
  contentRef?: string;
  depthEstimate?: number;
  maxyAlignmentScore?: number;
  triggersUsed?: string[];
  triggersRespondedTo?: string[];
  newTriggersInstalled?: string[];
  arousalAtStart?: number;
  denialDay?: number;
  handlerInvoked?: boolean;
  handlerGoal?: string;
  notes?: string;
}

export async function logBambiSession(input: LogBambiSessionInput): Promise<string | null> {
  const { data, error } = await supabase
    .from('bambi_states')
    .insert({
      user_id: input.userId,
      session_type: input.sessionType,
      entry_method: input.entryMethod || null,
      content_ref: input.contentRef || null,
      depth_estimate: input.depthEstimate || 0,
      maxy_alignment_score: input.maxyAlignmentScore || 5,
      triggers_used: input.triggersUsed || [],
      triggers_responded_to: input.triggersRespondedTo || [],
      new_triggers_installed: input.newTriggersInstalled || [],
      arousal_at_start: input.arousalAtStart ?? null,
      denial_day: input.denialDay ?? null,
      handler_invoked: input.handlerInvoked || false,
      handler_goal: input.handlerGoal || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[BambiEngine] Failed to log session:', error.message);
    return null;
  }

  const sessionId = data?.id || null;

  // Process triggers (fire-and-forget)
  const triggersUsed = input.triggersUsed || [];
  const triggersRespondedTo = input.triggersRespondedTo || [];
  const newTriggersInstalled = input.newTriggersInstalled || [];

  for (const trigger of triggersUsed) {
    updateTriggerExposure(input.userId, trigger).catch(err => {
      console.warn('[BambiEngine] Trigger exposure update failed:', err);
    });
  }

  for (const trigger of triggersRespondedTo) {
    recordTriggerResponse(input.userId, trigger).catch(err => {
      console.warn('[BambiEngine] Trigger response record failed:', err);
    });
  }

  for (const trigger of newTriggersInstalled) {
    registerTrigger(input.userId, trigger, 'maxy_specific', 'other_hypno', true).catch(err => {
      console.warn('[BambiEngine] Trigger registration failed:', err);
    });
  }

  return sessionId;
}

// ============================================
// SESSION END
// ============================================

export interface EndSessionData {
  depthEstimate?: number;
  arousalAtEnd?: number;
  postSessionState?: PostSessionState;
  handlerGoalAchieved?: boolean;
  notes?: string;
}

export async function endBambiSession(
  sessionId: string,
  endData: EndSessionData
): Promise<void> {
  const updateFields: Record<string, unknown> = {
    session_end: new Date().toISOString(),
  };

  if (endData.depthEstimate !== undefined) updateFields.depth_estimate = endData.depthEstimate;
  if (endData.arousalAtEnd !== undefined) updateFields.arousal_at_end = endData.arousalAtEnd;
  if (endData.postSessionState) updateFields.post_session_state = endData.postSessionState;
  if (endData.handlerGoalAchieved !== undefined) updateFields.handler_goal_achieved = endData.handlerGoalAchieved;
  if (endData.notes) updateFields.notes = endData.notes;

  const { error } = await supabase
    .from('bambi_states')
    .update(updateFields)
    .eq('id', sessionId);

  if (error) {
    console.error('[BambiEngine] Failed to end session:', error.message);
  }
}

// ============================================
// TRIGGER MANAGEMENT
// ============================================

export async function registerTrigger(
  userId: string,
  triggerPhrase: string,
  category: TriggerCategory,
  source: TriggerSource,
  servesMaxy: boolean,
  conflictNotes?: string
): Promise<void> {
  const { error } = await supabase
    .from('conditioning_triggers')
    .upsert({
      user_id: userId,
      trigger_phrase: triggerPhrase,
      trigger_category: category,
      source,
      serves_maxy: servesMaxy,
      conflict_notes: conflictNotes || null,
      first_exposure_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,trigger_phrase' });

  if (error) {
    console.error('[BambiEngine] Failed to register trigger:', error.message);
  }
}

export async function updateTriggerExposure(
  userId: string,
  triggerPhrase: string
): Promise<void> {
  // Try to increment existing trigger
  const { data: existing } = await supabase
    .from('conditioning_triggers')
    .select('id, total_exposures')
    .eq('user_id', userId)
    .eq('trigger_phrase', triggerPhrase)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('conditioning_triggers')
      .update({
        total_exposures: (existing.total_exposures || 0) + 1,
        last_tested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    // Create with unknown category if trigger doesn't exist yet
    await supabase
      .from('conditioning_triggers')
      .insert({
        user_id: userId,
        trigger_phrase: triggerPhrase,
        trigger_category: 'maxy_specific',
        source: 'other_hypno',
        total_exposures: 1,
        first_exposure_at: new Date().toISOString(),
        last_tested_at: new Date().toISOString(),
      });
  }
}

export async function recordTriggerResponse(
  userId: string,
  triggerPhrase: string
): Promise<void> {
  const { data: existing } = await supabase
    .from('conditioning_triggers')
    .select('id, total_exposures, successful_responses')
    .eq('user_id', userId)
    .eq('trigger_phrase', triggerPhrase)
    .maybeSingle();

  if (existing) {
    const newExposures = (existing.total_exposures || 0) + 1;
    const newResponses = (existing.successful_responses || 0) + 1;
    const responseRate = newExposures > 0 ? newResponses / newExposures : 0;

    // Calculate installation depth from response rate
    let installationDepth = 0;
    if (responseRate >= 0.8) installationDepth = 9;
    else if (responseRate >= 0.6) installationDepth = 6;
    else if (responseRate >= 0.4) installationDepth = 4;
    else if (responseRate >= 0.2) installationDepth = 2;

    await supabase
      .from('conditioning_triggers')
      .update({
        total_exposures: newExposures,
        successful_responses: newResponses,
        installation_depth: installationDepth,
        last_tested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    // Create new trigger with first successful response
    await supabase
      .from('conditioning_triggers')
      .insert({
        user_id: userId,
        trigger_phrase: triggerPhrase,
        trigger_category: 'maxy_specific',
        source: 'other_hypno',
        total_exposures: 1,
        successful_responses: 1,
        installation_depth: 2,
        first_exposure_at: new Date().toISOString(),
        last_tested_at: new Date().toISOString(),
      });
  }
}

// ============================================
// HANDLER TRIGGER INVOCATION
// ============================================

export async function grantHandlerInvocation(
  userId: string,
  triggerPhrase: string
): Promise<void> {
  await supabase
    .from('conditioning_triggers')
    .update({
      handler_can_invoke: true,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('trigger_phrase', triggerPhrase);
}

export async function revokeHandlerInvocation(
  userId: string,
  triggerPhrase: string
): Promise<void> {
  await supabase
    .from('conditioning_triggers')
    .update({
      handler_can_invoke: false,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('trigger_phrase', triggerPhrase);
}

export async function getHandlerInvokableTriggers(
  userId: string
): Promise<ConditioningTrigger[]> {
  const { data, error } = await supabase
    .from('conditioning_triggers')
    .select('*')
    .eq('user_id', userId)
    .eq('handler_can_invoke', true)
    .eq('active', true)
    .order('installation_depth', { ascending: false });

  if (error) {
    console.warn('[BambiEngine] Failed to get invokable triggers:', error.message);
    return [];
  }

  return (data || []) as ConditioningTrigger[];
}

export async function invokeForHandler(
  userId: string,
  triggerPhrase: string,
  goal: string
): Promise<string | null> {
  // Verify trigger is handler-invokable
  const { data: trigger } = await supabase
    .from('conditioning_triggers')
    .select('id, handler_can_invoke, handler_invocation_count')
    .eq('user_id', userId)
    .eq('trigger_phrase', triggerPhrase)
    .maybeSingle();

  if (!trigger || !trigger.handler_can_invoke) {
    console.warn('[BambiEngine] Trigger not invokable:', triggerPhrase);
    return null;
  }

  // Update invocation stats
  await supabase
    .from('conditioning_triggers')
    .update({
      handler_invocation_count: (trigger.handler_invocation_count || 0) + 1,
      last_handler_invocation_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', trigger.id);

  // Create bambi session
  const sessionId = await logBambiSession({
    userId,
    sessionType: 'handler_invoked',
    entryMethod: 'trigger_phrase',
    handlerInvoked: true,
    handlerGoal: goal,
    triggersUsed: [triggerPhrase],
  });

  return sessionId;
}

// ============================================
// CONTENT AUDIT
// ============================================

export interface AuditContentInput {
  userId: string;
  contentIdentifier: string;
  contentSource?: ContentSource;
  maxyAlignment: number;
  usefulElements?: string[];
  conflictingElements?: string[];
  triggersPresent?: string[];
  recommendedUsage?: ContentUsageRecommendation;
  handlerPreFrame?: string;
  handlerPostFrame?: string;
}

export async function auditContent(input: AuditContentInput): Promise<void> {
  const { error } = await supabase
    .from('content_library_audit')
    .upsert({
      user_id: input.userId,
      content_identifier: input.contentIdentifier,
      content_source: input.contentSource || null,
      maxy_alignment: input.maxyAlignment,
      useful_elements: input.usefulElements || [],
      conflicting_elements: input.conflictingElements || [],
      triggers_present: input.triggersPresent || [],
      recommended_usage: input.recommendedUsage || null,
      handler_pre_frame: input.handlerPreFrame || null,
      handler_post_frame: input.handlerPostFrame || null,
    }, { onConflict: 'user_id,content_identifier' });

  if (error) {
    console.error('[BambiEngine] Failed to audit content:', error.message);
  }
}

// ============================================
// CONTENT RECOMMENDATION
// ============================================

export interface SessionContext {
  currentDepth: number;
  arousalLevel: number;
  denialDay: number;
  handlerGoal?: string;
}

export async function getContentRecommendation(
  userId: string,
  _sessionContext: SessionContext
): Promise<ContentRecommendation[]> {
  const { data, error } = await supabase
    .from('content_library_audit')
    .select('*')
    .eq('user_id', userId)
    .gte('maxy_alignment', 5)
    .not('recommended_usage', 'eq', 'avoid')
    .order('maxy_alignment', { ascending: false })
    .order('times_used', { ascending: true })
    .limit(3);

  if (error || !data) {
    console.warn('[BambiEngine] Content recommendation query failed:', error?.message);
    return [];
  }

  return data.map(content => ({
    content: content as ContentLibraryAudit,
    preFrame: content.handler_pre_frame,
    postFrame: content.handler_post_frame,
  }));
}

// ============================================
// DASHBOARD DATA
// ============================================

export async function getBambiDashboardData(userId: string): Promise<BambiDashboardData> {
  const [
    summaryResult,
    topTriggersResult,
    maxyTriggersResult,
    conflictTriggersResult,
    invokableResult,
    recentSessionsResult,
  ] = await Promise.all([
    supabase
      .from('bambi_session_summary')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('trigger_effectiveness')
      .select('*')
      .eq('user_id', userId)
      .order('response_rate', { ascending: false })
      .limit(10),
    supabase
      .from('conditioning_triggers')
      .select('*')
      .eq('user_id', userId)
      .eq('serves_maxy', true)
      .eq('active', true)
      .order('installation_depth', { ascending: false }),
    supabase
      .from('conditioning_triggers')
      .select('*')
      .eq('user_id', userId)
      .eq('serves_maxy', false)
      .eq('active', true),
    supabase
      .from('conditioning_triggers')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('handler_can_invoke', true)
      .eq('active', true),
    supabase
      .from('bambi_states')
      .select('*')
      .eq('user_id', userId)
      .order('session_start', { ascending: false })
      .limit(5),
  ]);

  const summary = summaryResult.data as BambiSessionSummary | null;

  return {
    sessionSummary: summary,
    topTriggers: (topTriggersResult.data || []) as TriggerEffectiveness[],
    maxyAlignedTriggers: (maxyTriggersResult.data || []) as ConditioningTrigger[],
    conflictingTriggers: (conflictTriggersResult.data || []) as ConditioningTrigger[],
    handlerInvokableCount: invokableResult.count || 0,
    averageSessionDepth: summary?.avg_depth || 0,
    recentSessions: (recentSessionsResult.data || []) as BambiState[],
  };
}
