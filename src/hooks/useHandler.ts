// useHandler.ts
// Hook for managing Handler AI state and operations

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  decideIntervention,
  logInfluenceAttempt,
  recordInfluenceResponse,
  type InterventionContext,
  type InterventionDecision,
} from '../lib/handler';

// Re-export for convenience
export type { InterventionContext, InterventionDecision };
import type {
  HandlerState,
  HandlerDailyPlan,
  HandlerUserModel,
  HandlerEscalationPlan,
  LearnedVulnerability,
  InfluenceAttempt,
  StrategyType,
  TriggerStatus,
  DbHandlerStrategy,
  DbPlantedTrigger,
  DbHandlerUserModel,
} from '../types/handler';
import {
  mapDbToHandlerStrategy,
  mapDbToPlantedTrigger,
  mapDbToHandlerUserModel,
} from '../types/handler';
import type { ArousalState } from '../types/arousal';

interface UseHandlerReturn {
  // State
  handlerState: HandlerState | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadHandlerState: () => Promise<void>;

  // Strategy Management
  createStrategy: (
    strategyType: StrategyType,
    parameters: Record<string, unknown>,
    name?: string
  ) => Promise<void>;
  updateStrategyEffectiveness: (strategyId: string, score: number) => Promise<void>;
  deactivateStrategy: (strategyId: string) => Promise<void>;

  // Trigger Management
  plantTrigger: (
    triggerType: string,
    triggerContent: string,
    targetState: string,
    activationConditions?: string
  ) => Promise<void>;
  recordTriggerActivation: (triggerId: string) => Promise<void>;
  updateTriggerStatus: (triggerId: string, status: TriggerStatus) => Promise<void>;

  // Vulnerability Management
  recordVulnerability: (
    vulnerabilityType: string,
    evidence: string,
    conditions?: Record<string, unknown>
  ) => Promise<void>;
  addExploitationStrategy: (vulnerabilityId: string, strategy: string) => Promise<void>;

  // Influence Tracking
  recordInfluenceAttempt: (
    attemptType: string,
    method: string,
    targetBehavior: string,
    content?: Record<string, unknown>
  ) => Promise<void>;
  recordInfluenceOutcome: (attemptId: string, response: string, success: boolean) => Promise<void>;

  // Resistance Patterns
  recordResistancePattern: (
    patternType: string,
    description: string,
    conditions?: Record<string, unknown>
  ) => Promise<void>;
  recordBypassAttempt: (patternId: string, strategy: string, effective: boolean) => Promise<void>;

  // Daily Plans
  createDailyPlan: (plan: Partial<HandlerDailyPlan>) => Promise<void>;
  markPlanExecuted: (planId: string, notes?: string) => Promise<void>;

  // User Model
  updateUserModel: (updates: Partial<HandlerUserModel>) => Promise<void>;

  // Intervention Decision Engine
  checkForIntervention: (
    context: Omit<InterventionContext, 'userId'>
  ) => Promise<InterventionDecision>;
  executeIntervention: (
    decision: InterventionDecision,
    arousalState?: string,
    denialDay?: number
  ) => Promise<string | null>;
  recordInterventionResponse: (
    attemptId: string,
    response: string,
    success: boolean,
    responseTimeSeconds?: number
  ) => Promise<void>;
}

export function useHandler(): UseHandlerReturn {
  const { user } = useAuth();
  const [handlerState, setHandlerState] = useState<HandlerState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load complete handler state
  const loadHandlerState = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Load all handler data in parallel
      const [
        strategiesRes,
        triggersRes,
        vulnerabilitiesRes,
        plansRes,
        userModelRes,
        escalationPlansRes,
        influenceRes,
      ] = await Promise.all([
        supabase
          .from('handler_strategies')
          .select('*')
          .eq('user_id', user.id)
          .eq('active', true),
        supabase
          .from('planted_triggers')
          .select('*')
          .eq('user_id', user.id)
          .neq('status', 'dormant'),
        supabase
          .from('learned_vulnerabilities')
          .select('*')
          .eq('user_id', user.id),
        supabase
          .from('handler_daily_plans')
          .select('*')
          .eq('user_id', user.id)
          .eq('plan_date', new Date().toISOString().split('T')[0])
          .maybeSingle(),
        supabase
          .from('handler_user_model')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('handler_escalation_plans')
          .select('*')
          .eq('user_id', user.id)
          .eq('active', true),
        supabase
          .from('influence_attempts')
          .select('*')
          .eq('user_id', user.id)
          .order('timestamp', { ascending: false })
          .limit(20),
      ]);

      // Map strategies
      const activeStrategies = (strategiesRes.data || []).map(s =>
        mapDbToHandlerStrategy(s as DbHandlerStrategy)
      );

      // Map triggers
      const activeTriggers = (triggersRes.data || []).map(t =>
        mapDbToPlantedTrigger(t as DbPlantedTrigger)
      );

      // Map vulnerabilities
      const knownVulnerabilities: LearnedVulnerability[] = (vulnerabilitiesRes.data || []).map(v => ({
        id: v.id,
        userId: v.user_id,
        vulnerabilityType: v.vulnerability_type,
        discoveryDate: v.discovery_date,
        evidence: v.evidence || undefined,
        conditions: v.conditions || undefined,
        exploitationStrategies: v.exploitation_strategies || [],
        successRate: v.success_rate || undefined,
        notes: v.notes || undefined,
      }));

      // Map today's plan
      let todaysPlan: HandlerDailyPlan | undefined;
      if (plansRes.data) {
        const p = plansRes.data;
        todaysPlan = {
          id: p.id,
          userId: p.user_id,
          planDate: p.plan_date,
          plannedInterventions: (p.planned_interventions || []).map((i: Record<string, unknown>) => ({
            time: i.time as string,
            type: i.type as string,
            content: i.content as string,
            targetDomain: i.targetDomain as string | undefined,
            priority: i.priority as number,
          })),
          plannedExperiments: p.planned_experiments || [],
          focusAreas: p.focus_areas || [],
          triggerReinforcementSchedule: p.trigger_reinforcement_schedule || [],
          vulnerabilityWindows: (p.vulnerability_windows || []).map((w: Record<string, unknown>) => ({
            start: w.start as string,
            end: w.end as string,
            type: w.type as string,
            recommendation: w.recommendation as string,
          })),
          createdAt: p.created_at,
          executed: p.executed,
          executionNotes: p.execution_notes || undefined,
        };
      }

      // Map user model
      let userModel: HandlerUserModel | undefined;
      if (userModelRes.data) {
        userModel = mapDbToHandlerUserModel(userModelRes.data as DbHandlerUserModel);
      }

      // Map escalation plans
      const escalationPlans: HandlerEscalationPlan[] = (escalationPlansRes.data || []).map(p => ({
        id: p.id,
        userId: p.user_id,
        domain: p.domain,
        currentEdge: p.current_edge || undefined,
        nextTarget: p.next_target || undefined,
        strategy: p.strategy || undefined,
        estimatedTimeline: p.estimated_timeline || undefined,
        arousalWindows: p.arousal_windows as HandlerEscalationPlan['arousalWindows'],
        createdAt: p.created_at,
        active: p.active,
      }));

      // Map influence attempts
      const recentInfluenceAttempts: InfluenceAttempt[] = (influenceRes.data || []).map(a => ({
        id: a.id,
        userId: a.user_id,
        attemptType: a.attempt_type,
        method: a.method || undefined,
        targetBehavior: a.target_behavior || undefined,
        content: a.content || undefined,
        timestamp: a.timestamp,
        userResponse: a.user_response || undefined,
        success: a.success || undefined,
        userAware: a.user_aware,
        notes: a.notes || undefined,
      }));

      setHandlerState({
        todaysPlan,
        userModel,
        activeStrategies,
        activeTriggers,
        knownVulnerabilities,
        escalationPlans,
        recentInfluenceAttempts,
      });
    } catch (err) {
      console.error('Failed to load handler state:', err);
      setError('Failed to load handler state');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Create new strategy
  const createStrategy = useCallback(async (
    strategyType: StrategyType,
    parameters: Record<string, unknown>,
    name?: string
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('handler_strategies')
        .insert({
          user_id: user.id,
          strategy_type: strategyType,
          strategy_name: name,
          parameters,
          start_date: new Date().toISOString(),
          active: true,
        });

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to create strategy:', err);
      setError('Failed to create strategy');
    }
  }, [user, loadHandlerState]);

  // Update strategy effectiveness
  const updateStrategyEffectiveness = useCallback(async (strategyId: string, score: number) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('handler_strategies')
        .update({ effectiveness_score: score })
        .eq('id', strategyId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to update strategy effectiveness:', err);
      setError('Failed to update strategy');
    }
  }, [user, loadHandlerState]);

  // Deactivate strategy
  const deactivateStrategy = useCallback(async (strategyId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('handler_strategies')
        .update({
          active: false,
          end_date: new Date().toISOString(),
        })
        .eq('id', strategyId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to deactivate strategy:', err);
      setError('Failed to deactivate strategy');
    }
  }, [user, loadHandlerState]);

  // Plant a new trigger
  const plantTrigger = useCallback(async (
    triggerType: string,
    triggerContent: string,
    targetState: string,
    activationConditions?: string
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('planted_triggers')
        .insert({
          user_id: user.id,
          trigger_type: triggerType,
          trigger_content: triggerContent,
          target_state: targetState,
          planted_at: new Date().toISOString(),
          pairing_count: 0,
          activation_conditions: activationConditions,
          times_activated: 0,
          status: 'planting',
        });

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to plant trigger:', err);
      setError('Failed to plant trigger');
    }
  }, [user, loadHandlerState]);

  // Record trigger activation
  const recordTriggerActivation = useCallback(async (triggerId: string) => {
    if (!user) return;

    try {
      // Get current trigger
      const { data: trigger } = await supabase
        .from('planted_triggers')
        .select('times_activated, pairing_count')
        .eq('id', triggerId)
        .eq('user_id', user.id)
        .single();

      if (!trigger) return;

      const { error } = await supabase
        .from('planted_triggers')
        .update({
          times_activated: trigger.times_activated + 1,
          pairing_count: trigger.pairing_count + 1,
        })
        .eq('id', triggerId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to record trigger activation:', err);
      setError('Failed to record trigger activation');
    }
  }, [user, loadHandlerState]);

  // Update trigger status
  const updateTriggerStatus = useCallback(async (triggerId: string, status: TriggerStatus) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('planted_triggers')
        .update({ status })
        .eq('id', triggerId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to update trigger status:', err);
      setError('Failed to update trigger status');
    }
  }, [user, loadHandlerState]);

  // Record a vulnerability
  const recordVulnerability = useCallback(async (
    vulnerabilityType: string,
    evidence: string,
    conditions?: Record<string, unknown>
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('learned_vulnerabilities')
        .insert({
          user_id: user.id,
          vulnerability_type: vulnerabilityType,
          discovery_date: new Date().toISOString(),
          evidence,
          conditions,
          exploitation_strategies: [],
        });

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to record vulnerability:', err);
      setError('Failed to record vulnerability');
    }
  }, [user, loadHandlerState]);

  // Add exploitation strategy to vulnerability
  const addExploitationStrategy = useCallback(async (vulnerabilityId: string, strategy: string) => {
    if (!user) return;

    try {
      // Get current strategies
      const { data: vuln } = await supabase
        .from('learned_vulnerabilities')
        .select('exploitation_strategies')
        .eq('id', vulnerabilityId)
        .eq('user_id', user.id)
        .single();

      if (!vuln) return;

      const strategies = [...(vuln.exploitation_strategies || []), strategy];

      const { error } = await supabase
        .from('learned_vulnerabilities')
        .update({ exploitation_strategies: strategies })
        .eq('id', vulnerabilityId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to add exploitation strategy:', err);
      setError('Failed to add exploitation strategy');
    }
  }, [user, loadHandlerState]);

  // Record influence attempt
  const recordInfluenceAttempt = useCallback(async (
    attemptType: string,
    method: string,
    targetBehavior: string,
    content?: Record<string, unknown>
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('influence_attempts')
        .insert({
          user_id: user.id,
          attempt_type: attemptType,
          method,
          target_behavior: targetBehavior,
          content,
          timestamp: new Date().toISOString(),
          user_aware: false,
        });

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to record influence attempt:', err);
      setError('Failed to record influence attempt');
    }
  }, [user, loadHandlerState]);

  // Record influence outcome
  const recordInfluenceOutcome = useCallback(async (
    attemptId: string,
    response: string,
    success: boolean
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('influence_attempts')
        .update({
          user_response: response,
          success,
        })
        .eq('id', attemptId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to record influence outcome:', err);
      setError('Failed to record influence outcome');
    }
  }, [user, loadHandlerState]);

  // Record resistance pattern
  const recordResistancePattern = useCallback(async (
    patternType: string,
    description: string,
    conditions?: Record<string, unknown>
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('resistance_patterns')
        .insert({
          user_id: user.id,
          pattern_type: patternType,
          description,
          conditions,
          bypass_strategies_tested: [],
          effective_bypasses: [],
          created_at: new Date().toISOString(),
        });

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to record resistance pattern:', err);
      setError('Failed to record resistance pattern');
    }
  }, [user, loadHandlerState]);

  // Record bypass attempt
  const recordBypassAttempt = useCallback(async (
    patternId: string,
    strategy: string,
    effective: boolean
  ) => {
    if (!user) return;

    try {
      // Get current pattern
      const { data: pattern } = await supabase
        .from('resistance_patterns')
        .select('bypass_strategies_tested, effective_bypasses')
        .eq('id', patternId)
        .eq('user_id', user.id)
        .single();

      if (!pattern) return;

      const testedStrategies = [...(pattern.bypass_strategies_tested || [])];
      if (!testedStrategies.includes(strategy)) {
        testedStrategies.push(strategy);
      }

      const effectiveBypasses = [...(pattern.effective_bypasses || [])];
      if (effective && !effectiveBypasses.includes(strategy)) {
        effectiveBypasses.push(strategy);
      }

      const { error } = await supabase
        .from('resistance_patterns')
        .update({
          bypass_strategies_tested: testedStrategies,
          effective_bypasses: effectiveBypasses,
          last_observed: new Date().toISOString(),
        })
        .eq('id', patternId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to record bypass attempt:', err);
      setError('Failed to record bypass attempt');
    }
  }, [user, loadHandlerState]);

  // Create daily plan
  const createDailyPlan = useCallback(async (plan: Partial<HandlerDailyPlan>) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('handler_daily_plans')
        .upsert({
          user_id: user.id,
          plan_date: plan.planDate || new Date().toISOString().split('T')[0],
          planned_interventions: plan.plannedInterventions || [],
          planned_experiments: plan.plannedExperiments || [],
          focus_areas: plan.focusAreas || [],
          trigger_reinforcement_schedule: plan.triggerReinforcementSchedule || [],
          vulnerability_windows: plan.vulnerabilityWindows || [],
          created_at: new Date().toISOString(),
          executed: false,
        }, { onConflict: 'user_id,plan_date' });

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to create daily plan:', err);
      setError('Failed to create daily plan');
    }
  }, [user, loadHandlerState]);

  // Mark plan as executed
  const markPlanExecuted = useCallback(async (planId: string, notes?: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('handler_daily_plans')
        .update({
          executed: true,
          execution_notes: notes,
        })
        .eq('id', planId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to mark plan executed:', err);
      setError('Failed to mark plan executed');
    }
  }, [user, loadHandlerState]);

  // Update user model
  const updateUserModel = useCallback(async (updates: Partial<HandlerUserModel>) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('handler_user_model')
        .upsert({
          user_id: user.id,
          optimal_timing: updates.optimalTiming,
          effective_framings: updates.effectiveFramings,
          resistance_triggers: updates.resistanceTriggers,
          compliance_accelerators: updates.complianceAccelerators,
          vulnerability_windows: updates.vulnerabilityWindows,
          content_preferences: updates.contentPreferences,
          escalation_tolerance: updates.escalationTolerance,
          trigger_responsiveness: updates.triggerResponsiveness,
          arousal_patterns: updates.arousalPatterns,
          model_confidence: updates.modelConfidence || 0.5,
          last_updated: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to update user model:', err);
      setError('Failed to update user model');
    }
  }, [user, loadHandlerState]);

  // Check if handler should intervene based on current context
  const checkForIntervention = useCallback(async (
    context: Omit<InterventionContext, 'userId'>
  ): Promise<InterventionDecision> => {
    if (!user) {
      return {
        shouldIntervene: false,
        priority: 0,
        reasoning: 'Not authenticated',
      };
    }

    try {
      const fullContext: InterventionContext = {
        ...context,
        userId: user.id,
      };
      return await decideIntervention(fullContext);
    } catch (err) {
      console.error('Failed to check for intervention:', err);
      return {
        shouldIntervene: false,
        priority: 0,
        reasoning: `Error: ${err instanceof Error ? err.message : 'Unknown'}`,
      };
    }
  }, [user]);

  // Execute an intervention decision by logging it
  const executeIntervention = useCallback(async (
    decision: InterventionDecision,
    arousalState?: string,
    denialDay?: number
  ): Promise<string | null> => {
    if (!user || !decision.shouldIntervene || !decision.interventionType) {
      return null;
    }

    try {
      const attemptId = await logInfluenceAttempt(user.id, decision.interventionType, {
        method: decision.reasoning,
        targetBehavior: decision.content,
        targetDomain: decision.targetDomain,
        content: { displayContent: decision.content },
        arousalState: arousalState as ArousalState,
        denialDay,
        strategyId: decision.strategyId,
        triggerId: decision.triggerId,
        vulnerabilityId: decision.vulnerabilityId,
        userAware: true, // User sees intervention content
      });

      // Refresh state to include new attempt
      await loadHandlerState();
      return attemptId;
    } catch (err) {
      console.error('Failed to execute intervention:', err);
      setError('Failed to execute intervention');
      return null;
    }
  }, [user, loadHandlerState]);

  // Record the user's response to an intervention
  const recordInterventionResponse = useCallback(async (
    attemptId: string,
    response: string,
    success: boolean,
    responseTimeSeconds?: number
  ): Promise<void> => {
    if (!user) return;

    try {
      await recordInfluenceResponse(attemptId, response, success, responseTimeSeconds);
      await loadHandlerState();
    } catch (err) {
      console.error('Failed to record intervention response:', err);
      setError('Failed to record intervention response');
    }
  }, [user, loadHandlerState]);

  // Load on mount
  useEffect(() => {
    loadHandlerState();
  }, [loadHandlerState]);

  return {
    handlerState,
    isLoading,
    error,
    loadHandlerState,
    createStrategy,
    updateStrategyEffectiveness,
    deactivateStrategy,
    plantTrigger,
    recordTriggerActivation,
    updateTriggerStatus,
    recordVulnerability,
    addExploitationStrategy,
    recordInfluenceAttempt,
    recordInfluenceOutcome,
    recordResistancePattern,
    recordBypassAttempt,
    createDailyPlan,
    markPlanExecuted,
    updateUserModel,
    // Intervention Decision Engine
    checkForIntervention,
    executeIntervention,
    recordInterventionResponse,
  };
}
