// useEscalationState.ts
// Hook for managing escalation state across all domains

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  EscalationDomain,
  EscalationState,
  EscalationEvent,
  ServiceProgression,
  ESCALATION_DOMAINS,
  ESCALATION_DOMAIN_LABELS,
  DOMAIN_MAX_LEVELS,
  mapDbToEscalationState,
  mapDbToEscalationEvent,
  DbEscalationState,
  DbEscalationEvent,
  TriggerMethod,
  CurrentEdge,
  ServiceStage,
} from '../types/escalation';

interface UseEscalationStateReturn {
  // State
  escalationStates: Record<EscalationDomain, EscalationState | null>;
  recentEvents: EscalationEvent[];
  serviceProgression: ServiceProgression | null;
  isLoading: boolean;
  error: string | null;

  // Computed
  getLevel: (domain: EscalationDomain) => number;
  getProgress: (domain: EscalationDomain) => number; // 0-100 percentage
  getCurrentEdge: (domain: EscalationDomain) => CurrentEdge | null;

  // Actions
  loadEscalationState: () => Promise<void>;
  initializeEscalation: () => Promise<void>;
  recordEscalation: (
    domain: EscalationDomain,
    toLevel: number,
    description: string,
    triggerMethod: TriggerMethod,
    arousalLevel?: number,
    resistanceEncountered?: boolean
  ) => Promise<void>;
  recordBoundaryDissolution: (
    boundaryDescription: string,
    domain: EscalationDomain,
    method: string
  ) => Promise<void>;
  updateServiceStage: (stage: ServiceStage, activities?: string[]) => Promise<void>;
}

// Initial escalation descriptions per domain
// Ordered by priority: arousal (driver) > sissification (driver) > submission (driver) > identity (outcome) > feminization (outcome)
const INITIAL_DESCRIPTIONS: Record<EscalationDomain, { current: string; next: string }> = {
  arousal: {
    current: 'Beginning arousal training',
    next: 'Regular edge sessions',
  },
  sissification: {
    current: 'Curious about sissification',
    next: 'Exploring sissy practices',
  },
  submission: {
    current: 'Exploring submission',
    next: 'Regular obedience practice',
  },
  identity: {
    current: 'Identity awareness',
    next: 'Identity shifts during arousal',
  },
  feminization: {
    current: 'Private feminine exploration',
    next: 'Regular feminine practice',
  },
};

export function useEscalationState(): UseEscalationStateReturn {
  const { user } = useAuth();
  const [escalationStates, setEscalationStates] = useState<Record<EscalationDomain, EscalationState | null>>(
    {} as Record<EscalationDomain, EscalationState | null>
  );
  const [recentEvents, setRecentEvents] = useState<EscalationEvent[]>([]);
  const [serviceProgression, setServiceProgression] = useState<ServiceProgression | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load escalation state
  const loadEscalationState = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Load all escalation states
      const { data: statesData, error: statesError } = await supabase
        .from('escalation_state')
        .select('*')
        .eq('user_id', user.id);

      if (statesError) throw statesError;

      // Map to record by domain
      const statesMap: Record<EscalationDomain, EscalationState | null> = {} as Record<EscalationDomain, EscalationState | null>;
      ESCALATION_DOMAINS.forEach(domain => {
        const state = statesData?.find(s => s.domain === domain);
        statesMap[domain] = state ? mapDbToEscalationState(state as DbEscalationState) : null;
      });
      setEscalationStates(statesMap);

      // Load recent events (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: eventsData, error: eventsError } = await supabase
        .from('escalation_events')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (eventsError) throw eventsError;

      setRecentEvents(
        (eventsData || []).map(e => mapDbToEscalationEvent(e as DbEscalationEvent))
      );

      // Load service progression
      const { data: serviceData } = await supabase
        .from('service_progression')
        .select('*')
        .eq('user_id', user.id)
        .order('entered_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (serviceData) {
        setServiceProgression({
          id: serviceData.id,
          userId: serviceData.user_id,
          stage: serviceData.stage as ServiceStage,
          enteredAt: serviceData.entered_at,
          activities: serviceData.activities || [],
          comfortLevel: serviceData.comfort_level || undefined,
          arousalAssociation: serviceData.arousal_association || undefined,
          notes: serviceData.notes || undefined,
        });
      }
    } catch (err) {
      console.error('Failed to load escalation state:', err);
      setError('Failed to load escalation state');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Initialize escalation for new user
  const initializeEscalation = useCallback(async () => {
    if (!user) return;

    try {
      // Initialize all domains
      const inserts = ESCALATION_DOMAINS.map(domain => ({
        user_id: user.id,
        domain,
        current_level: 0,
        current_description: INITIAL_DESCRIPTIONS[domain].current,
        next_level_description: INITIAL_DESCRIPTIONS[domain].next,
        escalation_count: 0,
      }));

      const { error: stateError } = await supabase
        .from('escalation_state')
        .upsert(inserts, { onConflict: 'user_id,domain' });

      if (stateError) throw stateError;

      // Initialize service progression
      const { error: serviceError } = await supabase
        .from('service_progression')
        .upsert({
          user_id: user.id,
          stage: 'fantasy',
          entered_at: new Date().toISOString(),
          activities: [],
        });

      if (serviceError) throw serviceError;

      await loadEscalationState();
    } catch (err) {
      console.error('Failed to initialize escalation:', err);
      setError('Failed to initialize escalation state');
    }
  }, [user, loadEscalationState]);

  // Get current level for a domain
  const getLevel = useCallback((domain: EscalationDomain): number => {
    return escalationStates[domain]?.currentLevel || 0;
  }, [escalationStates]);

  // Get progress percentage for a domain
  const getProgress = useCallback((domain: EscalationDomain): number => {
    const level = getLevel(domain);
    const maxLevel = DOMAIN_MAX_LEVELS[domain];
    return (level / maxLevel) * 100;
  }, [getLevel]);

  // Get current edge for a domain
  const getCurrentEdge = useCallback((domain: EscalationDomain): CurrentEdge | null => {
    const state = escalationStates[domain];
    if (!state) return null;

    // Find recent resistance in this domain
    const domainEvents = recentEvents.filter(e => e.domain === domain);
    const resistedEvents = domainEvents.filter(e => e.resistanceEncountered);
    const acceptedEvents = domainEvents.filter(e => !e.resistanceEncountered);

    const highestAccepted = acceptedEvents.length > 0
      ? Math.max(...acceptedEvents.map(e => e.toLevel))
      : state.currentLevel;

    // Ready to push if no recent resistance or it's been a while
    const lastResistance = resistedEvents[0];
    const daysSinceResistance = lastResistance
      ? (Date.now() - new Date(lastResistance.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    return {
      domain,
      currentBaseline: highestAccepted,
      edgeLocation: highestAccepted + 1,
      recentResistancePoints: resistedEvents.map(e => e.description || '').filter(Boolean),
      dissolvedBoundaries: [], // Would need to load from boundary_dissolution table
      readyToPush: resistedEvents.length === 0 || daysSinceResistance > 7,
    };
  }, [escalationStates, recentEvents]);

  // Record an escalation event
  const recordEscalation = useCallback(async (
    domain: EscalationDomain,
    toLevel: number,
    description: string,
    triggerMethod: TriggerMethod,
    arousalLevel?: number,
    resistanceEncountered: boolean = false
  ) => {
    if (!user) return;

    try {
      const currentState = escalationStates[domain];
      const fromLevel = currentState?.currentLevel || 0;

      // Insert escalation event
      const { error: eventError } = await supabase
        .from('escalation_events')
        .insert({
          user_id: user.id,
          domain,
          from_level: fromLevel,
          to_level: toLevel,
          description,
          trigger_method: triggerMethod,
          arousal_level_at_commitment: arousalLevel,
          resistance_encountered: resistanceEncountered,
          resistance_bypassed: resistanceEncountered ? true : null, // If we're recording, it was bypassed
        });

      if (eventError) throw eventError;

      // Update escalation state if level increased
      if (toLevel > fromLevel && !resistanceEncountered) {
        const { error: stateError } = await supabase
          .from('escalation_state')
          .update({
            current_level: toLevel,
            current_description: description,
            last_escalation_date: new Date().toISOString(),
            escalation_count: (currentState?.escalationCount || 0) + 1,
          })
          .eq('user_id', user.id)
          .eq('domain', domain);

        if (stateError) throw stateError;
      }

      await loadEscalationState();
    } catch (err) {
      console.error('Failed to record escalation:', err);
      setError('Failed to record escalation');
    }
  }, [user, escalationStates, loadEscalationState]);

  // Record boundary dissolution
  const recordBoundaryDissolution = useCallback(async (
    boundaryDescription: string,
    domain: EscalationDomain,
    method: string
  ) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('boundary_dissolution')
        .insert({
          user_id: user.id,
          boundary_description: boundaryDescription,
          domain,
          dissolution_started: new Date().toISOString(),
          method,
        });

      if (error) throw error;
    } catch (err) {
      console.error('Failed to record boundary dissolution:', err);
      setError('Failed to record boundary dissolution');
    }
  }, [user]);

  // Update service stage
  const updateServiceStage = useCallback(async (stage: ServiceStage, activities?: string[]) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('service_progression')
        .insert({
          user_id: user.id,
          stage,
          entered_at: new Date().toISOString(),
          activities: activities || [],
        });

      if (error) throw error;

      await loadEscalationState();
    } catch (err) {
      console.error('Failed to update service stage:', err);
      setError('Failed to update service stage');
    }
  }, [user, loadEscalationState]);

  // Load on mount
  useEffect(() => {
    loadEscalationState();
  }, [loadEscalationState]);

  return {
    escalationStates,
    recentEvents,
    serviceProgression,
    isLoading,
    error,
    getLevel,
    getProgress,
    getCurrentEdge,
    loadEscalationState,
    initializeEscalation,
    recordEscalation,
    recordBoundaryDissolution,
    updateServiceStage,
  };
}

// Export domain utilities
export { ESCALATION_DOMAINS, ESCALATION_DOMAIN_LABELS, DOMAIN_MAX_LEVELS };
