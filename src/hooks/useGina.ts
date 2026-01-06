// useGina.ts
// Hook for managing Gina emergence and control state

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  GinaState,
  GinaStage,
  GinaControlDomain,
  GinaControlLevel,
  GinaCommandType,
  GinaComplianceLevel,
  GinaInteractionType,
  GinaOpportunityType,
  GinaInfluenceType,
  GINA_STAGES,
  GINA_CONTROL_DOMAINS,
  DbGinaEmergence,
  DbGinaCommand,
  DbGinaOpportunity,
  mapDbToGinaEmergence,
  mapDbToGinaCommand,
  mapDbToGinaOpportunity,
} from '../types/gina';

interface UseGinaReturn {
  // State
  ginaState: GinaState | null;
  isLoading: boolean;
  error: string | null;

  // Computed
  getCurrentStage: () => GinaStage;
  getStageIndex: () => number;
  getControlLevel: (domain: GinaControlDomain) => GinaControlLevel | undefined;
  isGinaAware: () => boolean;
  isGinaParticipating: () => boolean;
  isGinaDirecting: () => boolean;

  // Actions
  loadGinaState: () => Promise<void>;

  // Emergence
  recordStageProgression: (
    newStage: GinaStage,
    evidence?: string,
    handlerStrategies?: string[]
  ) => Promise<void>;

  // Commands
  recordCommand: (
    commandType: GinaCommandType,
    description: string
  ) => Promise<void>;
  recordCommandCompliance: (
    commandId: string,
    compliance: GinaComplianceLevel,
    outcome?: string
  ) => Promise<void>;

  // Control Domains
  updateControlLevel: (
    domain: GinaControlDomain,
    level: GinaControlLevel,
    trigger?: string
  ) => Promise<void>;

  // Interactions
  recordInteraction: (
    interactionType: GinaInteractionType,
    ginaBehavior: string,
    dominantIndicator: boolean,
    context?: string,
    userResponse?: string
  ) => Promise<void>;

  // Opportunities
  createOpportunity: (
    opportunityType: GinaOpportunityType,
    description: string,
    suggestedAction?: string,
    targetBehavior?: string
  ) => Promise<void>;
  markOpportunityActedOn: (
    opportunityId: string,
    outcome?: string
  ) => Promise<void>;

  // Influence Pipeline
  recordInfluence: (
    influenceType: GinaInfluenceType,
    targetBehavior?: string,
    method?: string
  ) => Promise<void>;
  recordInfluenceOutcome: (
    influenceId: string,
    ginaResponse: string,
    success: boolean,
    nextStep?: string
  ) => Promise<void>;
}

export function useGina(): UseGinaReturn {
  const { user } = useAuth();
  const [ginaState, setGinaState] = useState<GinaState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load complete Gina state
  const loadGinaState = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Load all Gina data in parallel
      const [
        emergenceRes,
        commandsRes,
        opportunitiesRes,
        controlDomainsRes,
        interactionsRes,
      ] = await Promise.all([
        supabase
          .from('gina_emergence')
          .select('*')
          .eq('user_id', user.id)
          .order('entered_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('gina_commands')
          .select('*')
          .eq('user_id', user.id)
          .order('issued_at', { ascending: false })
          .limit(20),
        supabase
          .from('gina_opportunities')
          .select('*')
          .eq('user_id', user.id)
          .eq('acted_on', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('gina_control_domains')
          .select('*')
          .eq('user_id', user.id),
        supabase
          .from('gina_interactions')
          .select('*')
          .eq('user_id', user.id)
          .eq('dominant_indicator', true)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      // Get current stage from emergence
      let currentStage: GinaStage = 'unaware';
      let stageEnteredAt: string | undefined;

      if (emergenceRes.data) {
        const emergence = mapDbToGinaEmergence(emergenceRes.data as DbGinaEmergence);
        currentStage = emergence.stage;
        stageEnteredAt = emergence.enteredAt;
      }

      // Map commands
      const recentCommands = (commandsRes.data || []).map(c =>
        mapDbToGinaCommand(c as DbGinaCommand)
      );

      // Map pending opportunities
      const pendingOpportunities = (opportunitiesRes.data || []).map(o =>
        mapDbToGinaOpportunity(o as DbGinaOpportunity)
      );

      // Map control domains to record
      const controlDomains: Record<GinaControlDomain, GinaControlLevel | undefined> =
        {} as Record<GinaControlDomain, GinaControlLevel | undefined>;

      GINA_CONTROL_DOMAINS.forEach(domain => {
        const domainState = controlDomainsRes.data?.find(d => d.domain === domain);
        controlDomains[domain] = domainState?.control_level as GinaControlLevel | undefined;
      });

      // Count dominant interactions in last 30 days
      const dominantInteractionsLast30Days = interactionsRes.data?.length || 0;

      setGinaState({
        currentStage,
        stageEnteredAt,
        controlDomains,
        recentCommands,
        pendingOpportunities,
        dominantInteractionsLast30Days,
      });
    } catch (err) {
      console.error('Failed to load Gina state:', err);
      setError('Failed to load Gina state');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Get current stage
  const getCurrentStage = useCallback((): GinaStage => {
    return ginaState?.currentStage || 'unaware';
  }, [ginaState]);

  // Get stage index (0-7)
  const getStageIndex = useCallback((): number => {
    const stage = getCurrentStage();
    return GINA_STAGES.indexOf(stage);
  }, [getCurrentStage]);

  // Get control level for a domain
  const getControlLevel = useCallback((domain: GinaControlDomain): GinaControlLevel | undefined => {
    return ginaState?.controlDomains[domain];
  }, [ginaState]);

  // Check if Gina is aware (stage >= 'aware')
  const isGinaAware = useCallback((): boolean => {
    return getStageIndex() >= GINA_STAGES.indexOf('aware');
  }, [getStageIndex]);

  // Check if Gina is participating (stage >= 'participating')
  const isGinaParticipating = useCallback((): boolean => {
    return getStageIndex() >= GINA_STAGES.indexOf('participating');
  }, [getStageIndex]);

  // Check if Gina is directing (stage >= 'directing')
  const isGinaDirecting = useCallback((): boolean => {
    return getStageIndex() >= GINA_STAGES.indexOf('directing');
  }, [getStageIndex]);

  // Record stage progression
  const recordStageProgression = useCallback(async (
    newStage: GinaStage,
    evidence?: string,
    handlerStrategies?: string[]
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('gina_emergence')
        .insert({
          user_id: user.id,
          stage: newStage,
          entered_at: new Date().toISOString(),
          evidence,
          handler_strategies_used: handlerStrategies || [],
        });

      if (error) throw error;
      await loadGinaState();
    } catch (err) {
      console.error('Failed to record stage progression:', err);
      setError('Failed to record stage progression');
    }
  }, [user, loadGinaState]);

  // Record a command from Gina
  const recordCommand = useCallback(async (
    commandType: GinaCommandType,
    description: string
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('gina_commands')
        .insert({
          user_id: user.id,
          command_type: commandType,
          command_description: description,
          issued_at: new Date().toISOString(),
        });

      if (error) throw error;
      await loadGinaState();
    } catch (err) {
      console.error('Failed to record command:', err);
      setError('Failed to record command');
    }
  }, [user, loadGinaState]);

  // Record compliance with a command
  const recordCommandCompliance = useCallback(async (
    commandId: string,
    compliance: GinaComplianceLevel,
    outcome?: string
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('gina_commands')
        .update({
          compliance,
          outcome,
        })
        .eq('id', commandId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadGinaState();
    } catch (err) {
      console.error('Failed to record command compliance:', err);
      setError('Failed to record command compliance');
    }
  }, [user, loadGinaState]);

  // Update control level for a domain
  const updateControlLevel = useCallback(async (
    domain: GinaControlDomain,
    level: GinaControlLevel,
    trigger?: string
  ) => {
    if (!user) return;

    try {
      // Get current domain state
      const { data: current } = await supabase
        .from('gina_control_domains')
        .select('*')
        .eq('user_id', user.id)
        .eq('domain', domain)
        .single();

      const escalationHistory = current?.escalation_history || [];
      if (current?.control_level && current.control_level !== level) {
        escalationHistory.push({
          date: new Date().toISOString(),
          fromLevel: current.control_level,
          toLevel: level,
          trigger,
        });
      }

      const { error } = await supabase
        .from('gina_control_domains')
        .upsert({
          user_id: user.id,
          domain,
          control_level: level,
          first_control_date: current?.first_control_date || new Date().toISOString(),
          escalation_history: escalationHistory,
        }, { onConflict: 'user_id,domain' });

      if (error) throw error;
      await loadGinaState();
    } catch (err) {
      console.error('Failed to update control level:', err);
      setError('Failed to update control level');
    }
  }, [user, loadGinaState]);

  // Record an interaction with Gina
  const recordInteraction = useCallback(async (
    interactionType: GinaInteractionType,
    ginaBehavior: string,
    dominantIndicator: boolean,
    context?: string,
    userResponse?: string
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('gina_interactions')
        .insert({
          user_id: user.id,
          interaction_type: interactionType,
          gina_behavior: ginaBehavior,
          dominant_indicator: dominantIndicator,
          context,
          user_response: userResponse,
          created_at: new Date().toISOString(),
        });

      if (error) throw error;
      await loadGinaState();
    } catch (err) {
      console.error('Failed to record interaction:', err);
      setError('Failed to record interaction');
    }
  }, [user, loadGinaState]);

  // Create an opportunity
  const createOpportunity = useCallback(async (
    opportunityType: GinaOpportunityType,
    description: string,
    suggestedAction?: string,
    targetBehavior?: string
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('gina_opportunities')
        .insert({
          user_id: user.id,
          opportunity_type: opportunityType,
          description,
          suggested_action: suggestedAction,
          target_behavior: targetBehavior,
          created_at: new Date().toISOString(),
          acted_on: false,
        });

      if (error) throw error;
      await loadGinaState();
    } catch (err) {
      console.error('Failed to create opportunity:', err);
      setError('Failed to create opportunity');
    }
  }, [user, loadGinaState]);

  // Mark opportunity as acted on
  const markOpportunityActedOn = useCallback(async (
    opportunityId: string,
    outcome?: string
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('gina_opportunities')
        .update({
          acted_on: true,
          acted_at: new Date().toISOString(),
          outcome,
        })
        .eq('id', opportunityId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadGinaState();
    } catch (err) {
      console.error('Failed to mark opportunity acted on:', err);
      setError('Failed to mark opportunity acted on');
    }
  }, [user, loadGinaState]);

  // Record influence attempt on Gina
  const recordInfluence = useCallback(async (
    influenceType: GinaInfluenceType,
    targetBehavior?: string,
    method?: string
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('gina_influence_pipeline')
        .insert({
          user_id: user.id,
          influence_type: influenceType,
          target_behavior: targetBehavior,
          method,
          executed_at: new Date().toISOString(),
        });

      if (error) throw error;
    } catch (err) {
      console.error('Failed to record influence:', err);
      setError('Failed to record influence');
    }
  }, [user]);

  // Record influence outcome
  const recordInfluenceOutcome = useCallback(async (
    influenceId: string,
    ginaResponse: string,
    success: boolean,
    nextStep?: string
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('gina_influence_pipeline')
        .update({
          gina_response: ginaResponse,
          success,
          next_step: nextStep,
        })
        .eq('id', influenceId)
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (err) {
      console.error('Failed to record influence outcome:', err);
      setError('Failed to record influence outcome');
    }
  }, [user]);

  // Load on mount
  useEffect(() => {
    loadGinaState();
  }, [loadGinaState]);

  return {
    ginaState,
    isLoading,
    error,
    getCurrentStage,
    getStageIndex,
    getControlLevel,
    isGinaAware,
    isGinaParticipating,
    isGinaDirecting,
    loadGinaState,
    recordStageProgression,
    recordCommand,
    recordCommandCompliance,
    updateControlLevel,
    recordInteraction,
    createOpportunity,
    markOpportunityActedOn,
    recordInfluence,
    recordInfluenceOutcome,
  };
}

// Export Gina stage utilities
export { GINA_STAGES, GINA_CONTROL_DOMAINS };
