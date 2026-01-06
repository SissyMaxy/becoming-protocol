// System Triggers Hook
// Easy access to cross-system trigger execution

import { useCallback } from 'react';
import {
  executeSystemTriggers,
  startCompoundSession,
  completeCompoundSession,
  runDailyTriggerChecks,
  type SystemEvent,
  type TriggerResult,
  type CompoundSession,
  type DailyTriggerContext,
  type DailyTriggerResult,
  COMPOUND_SESSIONS,
} from '../lib/system-triggers';

interface UseSystemTriggersReturn {
  // Trigger execution
  trigger: (event: SystemEvent, context?: Record<string, unknown>) => Promise<TriggerResult>;

  // Compound sessions
  sessions: Record<string, CompoundSession>;
  startSession: (sessionName: string) => Promise<{ sessionId: string }>;
  completeSession: (sessionId: string, sessionName: string) => Promise<TriggerResult[]>;

  // Daily checks
  runDailyChecks: (context: DailyTriggerContext) => Promise<DailyTriggerResult>;

  // Quick trigger helpers
  onTaskComplete: () => Promise<TriggerResult>;
  onTaskSkip: () => Promise<TriggerResult>;
  onAllTasksComplete: () => Promise<TriggerResult>;
  onEdgeReached: () => Promise<TriggerResult>;
  onEdgeSessionComplete: () => Promise<TriggerResult>;
  onDenialIncrement: () => Promise<TriggerResult>;
  onHypnoComplete: () => Promise<TriggerResult>;
  onAffirmationSpoken: () => Promise<TriggerResult>;
  onInvestmentMade: (amount: number) => Promise<TriggerResult>;
  onCeremonyComplete: (ceremonyName: string) => Promise<TriggerResult>;
  onCommitmentMade: (bindingLevel: string) => Promise<TriggerResult>;
  onGuyModeEnter: () => Promise<TriggerResult>;
  onGuyModeExit: (durationMinutes: number) => Promise<TriggerResult>;
}

export function useSystemTriggers(): UseSystemTriggersReturn {
  // Core trigger execution
  const trigger = useCallback(
    async (event: SystemEvent, context?: Record<string, unknown>) => {
      return executeSystemTriggers(event, context);
    },
    []
  );

  // Compound session management
  const startSession = useCallback(async (sessionName: string) => {
    return startCompoundSession(sessionName);
  }, []);

  const completeSession = useCallback(
    async (sessionId: string, sessionName: string) => {
      return completeCompoundSession(sessionId, sessionName);
    },
    []
  );

  // Daily checks
  const runDailyChecks = useCallback(
    async (context: DailyTriggerContext) => {
      return runDailyTriggerChecks(context);
    },
    []
  );

  // Quick helpers
  const onTaskComplete = useCallback(() => trigger('task_completed'), [trigger]);
  const onTaskSkip = useCallback(() => trigger('task_skipped'), [trigger]);
  const onAllTasksComplete = useCallback(() => trigger('all_tasks_completed'), [trigger]);
  const onEdgeReached = useCallback(() => trigger('edge_reached'), [trigger]);
  const onEdgeSessionComplete = useCallback(
    () => trigger('edge_session_completed'),
    [trigger]
  );
  const onDenialIncrement = useCallback(
    () => trigger('denial_day_incremented'),
    [trigger]
  );
  const onHypnoComplete = useCallback(() => trigger('hypno_completed'), [trigger]);
  const onAffirmationSpoken = useCallback(
    () => trigger('affirmation_spoken'),
    [trigger]
  );
  const onInvestmentMade = useCallback(
    (amount: number) => trigger('investment_made', { amount }),
    [trigger]
  );
  const onCeremonyComplete = useCallback(
    (ceremonyName: string) => trigger('ceremony_completed', { ceremonyName }),
    [trigger]
  );
  const onCommitmentMade = useCallback(
    (bindingLevel: string) => trigger('commitment_made', { bindingLevel }),
    [trigger]
  );
  const onGuyModeEnter = useCallback(() => trigger('guy_mode_entered'), [trigger]);
  const onGuyModeExit = useCallback(
    (durationMinutes: number) => trigger('guy_mode_exited', { durationMinutes }),
    [trigger]
  );

  return {
    trigger,
    sessions: COMPOUND_SESSIONS,
    startSession,
    completeSession,
    runDailyChecks,
    onTaskComplete,
    onTaskSkip,
    onAllTasksComplete,
    onEdgeReached,
    onEdgeSessionComplete,
    onDenialIncrement,
    onHypnoComplete,
    onAffirmationSpoken,
    onInvestmentMade,
    onCeremonyComplete,
    onCommitmentMade,
    onGuyModeEnter,
    onGuyModeExit,
  };
}
