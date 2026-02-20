/**
 * useEdgeSession — Core orchestration hook for immersive edge sessions.
 * Manages session lifecycle, DB persistence, wake lock, and state transitions.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { requestWakeLock, releaseWakeLock } from '../lib/wake-lock';
import { addPoints } from '../lib/rewards';
import { useSessionTimer } from './useSessionTimer';
import type {
  SessionConfig,
  ImmersiveSessionState,
  CompletionType,
  PostMood,
} from '../components/session/session-types';
import type { AuctionOption } from '../components/session/session-types';
import {
  createInitialState,
  tickPrep,
  startActivePhase,
  recordEdge as smRecordEdge,
  endRecovery as smEndRecovery,
  requestStop as smRequestStop,
  cancelStop as smCancelStop,
  confirmStop as smConfirmStop,
  // emergencyStop available via session-state-machine if needed
  setPostMood as smSetPostMood,
  setPostNotes as smSetPostNotes,
  advanceToCompletion,
  setCompletionType as smSetCompletionType,
  finalizeSession,
  triggerManualRecovery as smTriggerManualRecovery,
  endCooldown as smEndCooldown,
  shouldTriggerAuction,
  startAuction,
  resolveAuction as smResolveAuction,
} from '../components/session/session-state-machine';

export interface UseEdgeSessionReturn {
  state: ImmersiveSessionState | null;
  timer: { elapsedSec: number; formatted: string };

  // Lifecycle
  startSession: (config: SessionConfig) => Promise<void>;
  endPrep: () => void;
  recordEdge: () => void;
  requestStop: () => void;
  cancelStop: () => void;
  confirmStop: () => void;
  triggerBreathe: () => void;
  setPostMood: (mood: PostMood) => void;
  setPostNotes: (notes: string) => void;
  advanceToCompletion: () => void;
  setCompletionType: (type: CompletionType) => void;
  completeSession: () => Promise<void>;

  // Auction
  resolveAuction: (option: AuctionOption) => void;

  // Computed
  isActive: boolean;
}

const EDGE_DEBOUNCE_MS = 2000;
const COOLDOWN_DURATION_MS = 30000;

export function useEdgeSession(): UseEdgeSessionReturn {
  const { user } = useAuth();
  const [state, setState] = useState<ImmersiveSessionState | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastEdgeTapRef = useRef<number>(0);
  const recoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTimerRunning = state !== null && (state.status === 'active' || state.status === 'cooldown');
  const timer = useSessionTimer(isTimerRunning);

  // ─── Cleanup stale sessions on mount ───
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('edge_sessions')
      .update({ status: 'abandoned', end_reason: 'abandoned', ended_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(() => {});
  }, [user?.id]);

  // ─── Recovery timer effect ───
  useEffect(() => {
    if (!state?.isRecovering || !state.recoveryEndTime) return;

    const remaining = state.recoveryEndTime - Date.now();
    if (remaining <= 0) {
      setState(prev => prev ? smEndRecovery(prev) : null);
      return;
    }

    recoveryTimeoutRef.current = setTimeout(() => {
      setState(prev => prev ? smEndRecovery(prev) : null);
    }, remaining);

    return () => {
      if (recoveryTimeoutRef.current) {
        clearTimeout(recoveryTimeoutRef.current);
        recoveryTimeoutRef.current = null;
      }
    };
  }, [state?.isRecovering, state?.recoveryEndTime]);

  // ─── Cleanup on unmount ───
  useEffect(() => {
    return () => {
      releaseWakeLock(wakeLockRef.current);
      if (recoveryTimeoutRef.current) clearTimeout(recoveryTimeoutRef.current);
      if (prepIntervalRef.current) clearInterval(prepIntervalRef.current);
      if (cooldownTimeoutRef.current) clearTimeout(cooldownTimeoutRef.current);
    };
  }, []);

  // ─── Start Session ───
  const startSession = useCallback(async (config: SessionConfig) => {
    if (!user?.id) return;

    // Create DB record
    const { data, error } = await supabase
      .from('edge_sessions')
      .insert({
        user_id: user.id,
        task_id: config.originTaskId || null,
        session_type: config.sessionType,
        target_edges: config.targetEdges,
        status: 'active',
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('[EdgeSession] Failed to create session:', error);
      return;
    }

    // Request wake lock
    wakeLockRef.current = await requestWakeLock();

    // Initialize state
    const initial = createInitialState(data.id, config);
    setState(initial);
    timer.reset();

    // Start prep countdown
    prepIntervalRef.current = setInterval(() => {
      setState(prev => {
        if (!prev || prev.phase !== 'prep') {
          if (prepIntervalRef.current) clearInterval(prepIntervalRef.current);
          return prev;
        }
        const updated = tickPrep(prev);
        if (updated.prepTimeRemaining <= 0) {
          if (prepIntervalRef.current) clearInterval(prepIntervalRef.current);
        }
        return updated;
      });
    }, 1000);
  }, [user?.id, timer]);

  // ─── End Prep → Active ───
  const endPrep = useCallback(() => {
    if (prepIntervalRef.current) {
      clearInterval(prepIntervalRef.current);
      prepIntervalRef.current = null;
    }
    setState(prev => prev ? startActivePhase(prev) : null);
  }, []);

  // ─── Record Edge ───
  const recordEdge = useCallback(() => {
    const now = Date.now();
    if (now - lastEdgeTapRef.current < EDGE_DEBOUNCE_MS) return;
    lastEdgeTapRef.current = now;

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(100);

    setState(prev => {
      if (!prev || prev.isRecovering || prev.phase !== 'active') return prev;
      let updated = smRecordEdge(prev, timer.elapsedSec);

      // If target reached (phase went to cooldown), start cooldown timer
      if (updated.phase === 'cooldown') {
        cooldownTimeoutRef.current = setTimeout(() => {
          setState(s => s ? smEndCooldown(s) : null);
        }, COOLDOWN_DURATION_MS);
      }

      // Check for auction trigger (only during active phase)
      if (updated.phase === 'active') {
        const pastAuctionEdges = prev.auctionResults.map(r => r.edgeNumber);
        if (shouldTriggerAuction(updated.edgeCount, pastAuctionEdges)) {
          updated = startAuction(updated, updated.edgeCount);
        }
      }

      return updated;
    });
  }, [timer.elapsedSec]);

  // ─── Stop controls ───
  const handleRequestStop = useCallback(() => {
    setState(prev => prev ? smRequestStop(prev) : null);
  }, []);

  const handleCancelStop = useCallback(() => {
    setState(prev => prev ? smCancelStop(prev) : null);
  }, []);

  const handleConfirmStop = useCallback(() => {
    setState(prev => prev ? smConfirmStop(prev) : null);
  }, []);

  // ─── Auction resolution ───
  const handleResolveAuction = useCallback((option: AuctionOption) => {
    setState(prev => {
      if (!prev?.activeAuction) return prev;
      const updated = smResolveAuction(prev, option);

      // If auction ended session, start cooldown timer
      if (updated.phase === 'cooldown' && prev.phase !== 'cooldown') {
        cooldownTimeoutRef.current = setTimeout(() => {
          setState(s => s ? smEndCooldown(s) : null);
        }, COOLDOWN_DURATION_MS);
      }

      return updated;
    });

    // Persist commitment to DB (fire-and-forget)
    if (user?.id && option.commitmentValue !== '0') {
      setState(prev => {
        if (!prev) return prev;
        supabase
          .from('session_commitments')
          .insert({
            user_id: user.id,
            session_id: prev.id,
            commitment_type: option.commitmentType,
            commitment_value: option.commitmentValue,
            label: option.label,
            description: option.description,
            edge_number: prev.activeAuction?.edgeNumber ?? prev.edgeCount,
            denial_day: 0, // populated by caller if needed
          })
          .then(({ error }) => {
            if (error) console.error('[EdgeSession] Commitment save failed:', error);
          });
        return prev;
      });
    }
  }, [user?.id]);

  // ─── Breathe (manual recovery) ───
  const triggerBreathe = useCallback(() => {
    setState(prev => prev ? smTriggerManualRecovery(prev) : null);
  }, []);

  // ─── Post-session capture ───
  const handleSetPostMood = useCallback((mood: PostMood) => {
    setState(prev => prev ? smSetPostMood(prev, mood) : null);
  }, []);

  const handleSetPostNotes = useCallback((notes: string) => {
    setState(prev => prev ? smSetPostNotes(prev, notes) : null);
  }, []);

  const handleAdvanceToCompletion = useCallback(() => {
    setState(prev => prev ? advanceToCompletion(prev) : null);
  }, []);

  // ─── Set completion type ───
  const handleSetCompletionType = useCallback((type: CompletionType) => {
    setState(prev => prev ? smSetCompletionType(prev, type, timer.elapsedSec) : null);
  }, [timer.elapsedSec]);

  // ─── Complete Session (persist to DB) ───
  const completeSession = useCallback(async () => {
    if (!state || !user?.id) return;

    const endedAt = new Date().toISOString();
    const isEmergencyStop = state.completionType === 'emergency_stop';
    const endReason = isEmergencyStop
      ? 'abandoned'
      : state.edgeCount >= state.config.targetEdges
        ? 'goal_reached'
        : 'user_ended';

    // Update edge_sessions row
    await supabase
      .from('edge_sessions')
      .update({
        ended_at: endedAt,
        end_reason: endReason,
        edge_count: state.edgeCount,
        total_duration_sec: timer.elapsedSec,
        edges: state.edges,
        post_mood: state.postMood,
        post_notes: state.postNotes || null,
        completion_type: state.completionType,
        points_awarded: state.pointsAwarded,
        status: isEmergencyStop ? 'abandoned' : 'completed',
      })
      .eq('id', state.id);

    // Award points (skip for emergency stop)
    if (state.pointsAwarded > 0) {
      await addPoints(state.pointsAwarded, 'session_complete', state.id, {
        session_type: state.config.sessionType,
        edge_count: state.edgeCount,
        completion_type: state.completionType,
      });
    }

    // Mark originating task as completed (direct update to avoid double-counting)
    if (state.config.originTaskId) {
      await supabase
        .from('daily_tasks')
        .update({
          status: 'completed',
          completed_at: endedAt,
        })
        .eq('id', state.config.originTaskId)
        .eq('status', 'pending');
    }

    // Log session evidence (fire-and-forget)
    const evidenceDescription = `${state.config.sessionType} session: ${state.edgeCount} edges, ${state.completionType}`;
    supabase
      .from('evidence')
      .insert({
        user_id: user.id,
        date: new Date().toISOString().slice(0, 10),
        type: 'session',
        domain: 'edge_session',
        task_id: state.config.originTaskId || null,
        file_name: `session_${state.id}`,
        file_url: '',
        notes: evidenceDescription,
      })
      .then(({ error: evErr }) => {
        if (evErr) console.error('[EdgeSession] Evidence log failed:', evErr);
      });

    // Release wake lock
    await releaseWakeLock(wakeLockRef.current);
    wakeLockRef.current = null;

    // Finalize state
    setState(prev => prev ? finalizeSession(prev) : null);
  }, [state, user?.id, timer.elapsedSec]);

  return {
    state,
    timer: { elapsedSec: timer.elapsedSec, formatted: timer.formatted },
    startSession,
    endPrep,
    recordEdge,
    requestStop: handleRequestStop,
    cancelStop: handleCancelStop,
    confirmStop: handleConfirmStop,
    triggerBreathe,
    setPostMood: handleSetPostMood,
    setPostNotes: handleSetPostNotes,
    advanceToCompletion: handleAdvanceToCompletion,
    setCompletionType: handleSetCompletionType,
    completeSession,
    resolveAuction: handleResolveAuction,
    isActive: state !== null && state.phase !== 'ended',
  };
}
