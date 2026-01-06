// Commitments Hook
// State management for arousal-gated commitments

import { useState, useCallback, useEffect } from 'react';
import { useProtocol } from '../context/ProtocolContext';
import { useArousalState } from './useArousalState';
import {
  getAllCommitmentTypes,
  getUserCommitments,
  getActiveCommitments,
  getAvailableCommitments,
  canMakeCommitment,
  makeCommitment,
  makeCustomCommitment,
  fulfillCommitment,
  breakCommitment,
  getCommitmentStats,
  getArousalCommitmentFraming,
  getPostCommitmentMessage,
} from '../lib/commitments';
import type {
  ArousalGatedCommitment,
  UserCommitment,
  BindingLevel,
  ArousalState,
  CommitmentEvidence,
} from '../types/commitments';

interface UseCommitmentsReturn {
  // Commitments
  allTypes: ArousalGatedCommitment[];
  userCommitments: UserCommitment[];
  activeCommitments: UserCommitment[];
  availableCommitments: ArousalGatedCommitment[];
  isLoading: boolean;
  error: string | null;

  // Stats
  stats: {
    total: number;
    active: number;
    fulfilled: number;
    broken: number;
    permanent: number;
  } | null;

  // Current context
  currentArousalState: ArousalState;
  arousalFraming: string;

  // Making commitment state
  pendingCommitment: ArousalGatedCommitment | null;
  commitmentText: string;
  lastMadeCommitment: UserCommitment | null;
  postCommitmentMessage: string | null;

  // Actions
  refresh: () => Promise<void>;
  checkCanMake: (commitment: ArousalGatedCommitment) => { canMake: boolean; reason?: string };
  startCommitment: (commitment: ArousalGatedCommitment) => void;
  setCommitmentText: (text: string) => void;
  confirmCommitment: (bindingLevel: BindingLevel) => Promise<void>;
  makeCustom: (text: string, bindingLevel: BindingLevel) => Promise<void>;
  fulfill: (commitmentId: string, evidence?: CommitmentEvidence) => Promise<void>;
  break_: (commitmentId: string, reason?: string) => Promise<{ consequence: string }>;
  cancelPending: () => void;
  dismissLastMade: () => void;
}

export function useCommitments(): UseCommitmentsReturn {
  const { progress } = useProtocol();
  const { currentState, metrics } = useArousalState();

  const [allTypes, setAllTypes] = useState<ArousalGatedCommitment[]>([]);
  const [userCommitments, setUserCommitments] = useState<UserCommitment[]>([]);
  const [activeCommitments, setActiveCommitments] = useState<UserCommitment[]>([]);
  const [availableCommitments, setAvailableCommitments] = useState<ArousalGatedCommitment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UseCommitmentsReturn['stats']>(null);

  // Making commitment state
  const [pendingCommitment, setPendingCommitment] = useState<ArousalGatedCommitment | null>(null);
  const [commitmentText, setCommitmentText] = useState('');
  const [lastMadeCommitment, setLastMadeCommitment] = useState<UserCommitment | null>(null);
  const [postCommitmentMessage, setPostCommitmentMessage] = useState<string | null>(null);

  // Map arousal state
  const currentArousalState: ArousalState = (currentState as ArousalState) || 'baseline';
  const arousalFraming = getArousalCommitmentFraming(currentArousalState);

  // Current context
  const context = {
    arousalState: currentArousalState,
    denialDay: metrics?.currentStreakDays || 0,
    phase: progress?.phase?.currentPhase || 1,
  };

  // Refresh all data
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [types, user, active, available, statsData] = await Promise.all([
        getAllCommitmentTypes(),
        getUserCommitments(),
        getActiveCommitments(),
        getAvailableCommitments(context),
        getCommitmentStats(),
      ]);

      setAllTypes(types);
      setUserCommitments(user);
      setActiveCommitments(active);
      setAvailableCommitments(available);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load commitments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [context.arousalState, context.denialDay, context.phase]);

  // Load on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Check if can make a commitment
  const checkCanMake = useCallback(
    (commitment: ArousalGatedCommitment) => {
      return canMakeCommitment(commitment, context);
    },
    [context]
  );

  // Start making a commitment
  const startCommitment = useCallback((commitment: ArousalGatedCommitment) => {
    setPendingCommitment(commitment);
    setCommitmentText(commitment.description);
  }, []);

  // Confirm and make the commitment
  const confirmCommitment = useCallback(
    async (bindingLevel: BindingLevel) => {
      if (!pendingCommitment) return;

      try {
        const made = await makeCommitment(
          pendingCommitment.id,
          commitmentText,
          bindingLevel,
          {
            arousalState: currentArousalState,
            denialDay: metrics?.currentStreakDays,
          }
        );

        setLastMadeCommitment(made);
        setPostCommitmentMessage(getPostCommitmentMessage(bindingLevel));
        setPendingCommitment(null);
        setCommitmentText('');

        await refresh();
      } catch (err) {
        console.error('Failed to make commitment:', err);
        throw err;
      }
    },
    [pendingCommitment, commitmentText, currentArousalState, metrics, refresh]
  );

  // Make a custom commitment
  const makeCustom = useCallback(
    async (text: string, bindingLevel: BindingLevel) => {
      try {
        const made = await makeCustomCommitment(text, bindingLevel, {
          arousalState: currentArousalState,
          denialDay: metrics?.currentStreakDays,
        });

        setLastMadeCommitment(made);
        setPostCommitmentMessage(getPostCommitmentMessage(bindingLevel));

        await refresh();
      } catch (err) {
        console.error('Failed to make custom commitment:', err);
        throw err;
      }
    },
    [currentArousalState, metrics, refresh]
  );

  // Fulfill a commitment
  const fulfill = useCallback(
    async (commitmentId: string, evidence?: CommitmentEvidence) => {
      try {
        await fulfillCommitment(commitmentId, evidence);
        await refresh();
      } catch (err) {
        console.error('Failed to fulfill commitment:', err);
        throw err;
      }
    },
    [refresh]
  );

  // Break a commitment
  const break_ = useCallback(
    async (commitmentId: string, reason?: string): Promise<{ consequence: string }> => {
      try {
        const result = await breakCommitment(commitmentId, reason);
        if (result.success) {
          await refresh();
        }
        return { consequence: result.consequence };
      } catch (err) {
        console.error('Failed to break commitment:', err);
        throw err;
      }
    },
    [refresh]
  );

  const cancelPending = useCallback(() => {
    setPendingCommitment(null);
    setCommitmentText('');
  }, []);

  const dismissLastMade = useCallback(() => {
    setLastMadeCommitment(null);
    setPostCommitmentMessage(null);
  }, []);

  return {
    allTypes,
    userCommitments,
    activeCommitments,
    availableCommitments,
    isLoading,
    error,
    stats,
    currentArousalState,
    arousalFraming,
    pendingCommitment,
    commitmentText,
    lastMadeCommitment,
    postCommitmentMessage,
    refresh,
    checkCanMake,
    startCommitment,
    setCommitmentText,
    confirmCommitment,
    makeCustom,
    fulfill,
    break_,
    cancelPending,
    dismissLastMade,
  };
}
