/**
 * Handler Authority Hook
 *
 * Provides access to the Handler's authority level and automatic decisions.
 * At higher levels, you don't make choices - Handler does.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getAuthorityLevel,
  makeHandlerDecisions,
  getPendingTasks,
  getUpcomingSessions,
  getPendingRequiredInterventions,
  checkAuthorityUpgrade,
  AUTHORITY_LEVELS,
  type AuthorityLevel,
  type AssignedTask,
  type ScheduledSession,
  type RequiredIntervention,
} from '../lib/handler-authority';
import type { GinaMission, BehavioralDirective } from '../lib/gina-pipeline';
import { supabase } from '../lib/supabase';

interface HandlerAuthorityState {
  level: AuthorityLevel;
  levelName: string;
  levelDescription: string;
  capabilities: readonly string[];

  // Pending items you must complete
  pendingTasks: AssignedTask[];
  upcomingSessions: ScheduledSession[];
  requiredInterventions: RequiredIntervention[];

  // Gina pipeline
  ginaMissions: GinaMission[];
  behavioralDirectives: BehavioralDirective[];
  ginaStrategy?: {
    strategy: string;
    immediateAction: string;
  };

  // Today's decisions
  todaysDecisions: {
    intensity: string;
    message: string;
  } | null;

  isLoading: boolean;
}

export function useHandlerAuthority() {
  const { user } = useAuth();
  const [state, setState] = useState<HandlerAuthorityState>({
    level: 1,
    levelName: 'Advisory',
    levelDescription: 'Handler suggests. You decide.',
    capabilities: [],
    pendingTasks: [],
    upcomingSessions: [],
    requiredInterventions: [],
    ginaMissions: [],
    behavioralDirectives: [],
    ginaStrategy: undefined,
    todaysDecisions: null,
    isLoading: true,
  });

  // Load authority state
  const loadState = useCallback(async () => {
    if (!user) return;

    try {
      const [level, tasks, sessions, interventions] = await Promise.all([
        getAuthorityLevel(user.id),
        getPendingTasks(user.id),
        getUpcomingSessions(user.id),
        getPendingRequiredInterventions(user.id),
      ]);

      const config = AUTHORITY_LEVELS[level];

      setState({
        level,
        levelName: config.name,
        levelDescription: config.description,
        capabilities: config.capabilities,
        pendingTasks: tasks,
        upcomingSessions: sessions,
        requiredInterventions: interventions,
        ginaMissions: [],
        behavioralDirectives: [],
        ginaStrategy: undefined,
        todaysDecisions: null,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to load authority state:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [user]);

  // Make Handler decisions for today
  const applyTodaysDecisions = useCallback(async () => {
    if (!user) return null;

    try {
      const decisions = await makeHandlerDecisions(user.id);

      setState(prev => ({
        ...prev,
        todaysDecisions: {
          intensity: decisions.intensity,
          message: decisions.message,
        },
        pendingTasks: [...prev.pendingTasks, ...decisions.assignedTasks],
        upcomingSessions: [...prev.upcomingSessions, ...decisions.scheduledSessions],
        ginaMissions: decisions.ginaMissions || [],
        behavioralDirectives: decisions.behavioralDirectives || [],
        ginaStrategy: decisions.ginaStrategy,
      }));

      return decisions;
    } catch (err) {
      console.error('Failed to apply Handler decisions:', err);
      return null;
    }
  }, [user]);

  // Complete an assigned task
  const completeTask = useCallback(async (taskId: string) => {
    if (!user) return false;

    try {
      await supabase
        .from('assigned_tasks')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', taskId)
        .eq('user_id', user.id);

      setState(prev => ({
        ...prev,
        pendingTasks: prev.pendingTasks.filter(t => t.id !== taskId),
      }));

      // Check if authority should upgrade
      await checkAuthorityUpgrade(user.id);

      return true;
    } catch (err) {
      console.error('Failed to complete task:', err);
      return false;
    }
  }, [user]);

  // Complete a required intervention
  const completeIntervention = useCallback(async (interventionId: string) => {
    if (!user) return false;

    try {
      await supabase
        .from('required_interventions')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', interventionId)
        .eq('user_id', user.id);

      setState(prev => ({
        ...prev,
        requiredInterventions: prev.requiredInterventions.filter(i => i.id !== interventionId),
      }));

      return true;
    } catch (err) {
      console.error('Failed to complete intervention:', err);
      return false;
    }
  }, [user]);

  // Mark session as started
  const startSession = useCallback(async (sessionId: string) => {
    if (!user) return false;

    try {
      await supabase
        .from('scheduled_sessions')
        .update({ started_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('user_id', user.id);

      return true;
    } catch (err) {
      console.error('Failed to start session:', err);
      return false;
    }
  }, [user]);

  // Mark session as completed
  const completeSession = useCallback(async (sessionId: string) => {
    if (!user) return false;

    try {
      await supabase
        .from('scheduled_sessions')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('user_id', user.id);

      setState(prev => ({
        ...prev,
        upcomingSessions: prev.upcomingSessions.filter(s => s.id !== sessionId),
      }));

      // Check if authority should upgrade
      await checkAuthorityUpgrade(user.id);

      return true;
    } catch (err) {
      console.error('Failed to complete session:', err);
      return false;
    }
  }, [user]);

  // Check if Handler has specific capability
  const checkCapability = useCallback((capability: string): boolean => {
    return state.capabilities.includes(capability as never);
  }, [state.capabilities]);

  // Complete a Gina mission
  const completeGinaMission = useCallback(async (
    missionId: string,
    outcome: 'success' | 'partial' | 'rejected' | 'deferred',
    ginaResponse?: string
  ) => {
    if (!user) return false;

    try {
      // Import dynamically to avoid circular deps
      const { completeGinaMission: complete } = await import('../lib/gina-pipeline');
      await complete(missionId, outcome, ginaResponse);

      setState(prev => ({
        ...prev,
        ginaMissions: prev.ginaMissions.filter(m => m.id !== missionId),
      }));

      return true;
    } catch (err) {
      console.error('Failed to complete Gina mission:', err);
      return false;
    }
  }, [user]);

  // Check if there are blocking interventions (must complete before continuing)
  const hasBlockingInterventions = state.requiredInterventions.length > 0;

  // Check if there are overdue tasks
  const hasOverdueTasks = state.pendingTasks.some(t =>
    t.deadline && new Date(t.deadline) < new Date()
  );

  // Check for imminent sessions (within 30 minutes)
  const imminentSession = state.upcomingSessions.find(s => {
    const sessionTime = new Date(s.scheduledFor);
    const now = new Date();
    const diffMinutes = (sessionTime.getTime() - now.getTime()) / 60000;
    return diffMinutes >= -5 && diffMinutes <= 30;
  });

  useEffect(() => {
    loadState();
  }, [loadState]);

  // Check for priority Gina missions
  const priorityGinaMission = state.ginaMissions.find(m => m.priority >= 4);

  return {
    ...state,

    // Actions
    applyTodaysDecisions,
    completeTask,
    completeIntervention,
    startSession,
    completeSession,
    completeGinaMission,
    checkCapability,
    refresh: loadState,

    // Computed
    hasBlockingInterventions,
    hasOverdueTasks,
    imminentSession,
    priorityGinaMission,
    hasGinaMissions: state.ginaMissions.length > 0,

    // Is Handler in control mode?
    isHandlerControlled: state.level >= 4,
    isFullyOwned: state.level >= 5,
  };
}

export type { AuthorityLevel, AssignedTask, ScheduledSession, RequiredIntervention };
export type { GinaMission, BehavioralDirective };
