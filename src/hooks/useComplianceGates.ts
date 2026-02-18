// useComplianceGates Hook
// Manages compliance gate state for feature blocking (Feature 36)

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  type ComplianceGate,
  type GateableFeature,
  type UserComplianceState,
  getActiveGates,
  evaluateComplianceGates,
  checkFeatureAccess,
  fulfillGateByAction,
  getGatedFeatures,
} from '../lib/compliance-gates';

interface UseComplianceGatesReturn {
  // State
  activeGates: ComplianceGate[];
  gatedFeatures: Map<GateableFeature, ComplianceGate>;
  isLoading: boolean;

  // Actions
  checkFeature: (feature: GateableFeature) => Promise<{ allowed: boolean; gate: ComplianceGate | null }>;
  fulfillAction: (action: string) => Promise<boolean>;
  evaluateGates: (state: Partial<UserComplianceState>) => Promise<ComplianceGate[]>;
  refresh: () => Promise<void>;
}

export function useComplianceGates(): UseComplianceGatesReturn {
  const { user } = useAuth();
  const [activeGates, setActiveGates] = useState<ComplianceGate[]>([]);
  const [gatedFeatures, setGatedFeatures] = useState<Map<GateableFeature, ComplianceGate>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Load active gates
  const refresh = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const [gates, features] = await Promise.all([
        getActiveGates(user.id),
        getGatedFeatures(user.id),
      ]);

      setActiveGates(gates);
      setGatedFeatures(features);
    } catch (error) {
      console.error('Error loading compliance gates:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Check if a specific feature is accessible
  const checkFeature = useCallback(async (feature: GateableFeature) => {
    if (!user?.id) return { allowed: true, gate: null };

    const result = await checkFeatureAccess(user.id, feature);
    return {
      allowed: result.allowed,
      gate: result.gate,
    };
  }, [user?.id]);

  // Fulfill a gate by completing the required action
  const fulfillAction = useCallback(async (action: string): Promise<boolean> => {
    if (!user?.id) return false;

    const success = await fulfillGateByAction(user.id, action);
    if (success) {
      await refresh();
    }
    return success;
  }, [user?.id, refresh]);

  // Evaluate and create new gates based on user state
  const evaluateGates = useCallback(async (partialState: Partial<UserComplianceState>): Promise<ComplianceGate[]> => {
    if (!user?.id) return [];

    const state: UserComplianceState = {
      userId: user.id,
      daysSinceVoicePractice: partialState.daysSinceVoicePractice ?? 0,
      tasksDeclinedThisWeek: partialState.tasksDeclinedThisWeek ?? 0,
      ignoredSessionsThisCycle: partialState.ignoredSessionsThisCycle ?? 0,
      sessionsWithoutReflection: partialState.sessionsWithoutReflection ?? 0,
      euphoriaEntriesThisWeek: partialState.euphoriaEntriesThisWeek ?? 0,
      daysOnProtocol: partialState.daysOnProtocol ?? 0,
      avoidedDomains: partialState.avoidedDomains ?? {},
    };

    const gates = await evaluateComplianceGates(state);
    setActiveGates(gates);

    // Also refresh gated features
    const features = await getGatedFeatures(user.id);
    setGatedFeatures(features);

    return gates;
  }, [user?.id]);

  return {
    activeGates,
    gatedFeatures,
    isLoading,
    checkFeature,
    fulfillAction,
    evaluateGates,
    refresh,
  };
}

export default useComplianceGates;
