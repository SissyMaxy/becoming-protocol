// ============================================
// useCamSession — Full cam session lifecycle hook
// Manages prep → live → end, tips, prompts, recording, announcements
// ============================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import type {
  CamSession,
  CamTip,
  HandlerPrompt,
  TipGoal,
  TipLevel,
  CamSessionSummary,
  PromptType,
  HighlightType,
} from '../types/cam';
import { buildCamSessionSummary } from '../types/cam';
import {
  startPrep,
  goLive,
  endLive,
  incrementEdgeCount,
  logHandlerAction,
  getSessionElapsedSeconds,
  getActiveLiveSession,
} from '../lib/cam/session';
import {
  processTip,
  getSessionTips,
  getSessionTipTotal,
  checkTipGoals,
  TIP_LEVELS,
} from '../lib/cam/tips';
import type { ProcessedTip } from '../lib/cam/tips';
import {
  sendPrompt,
  acknowledgePrompt,
  getSessionPrompts,
  getUnacknowledgedPrompts,
  addHighlight,
  generateAutoPrompt,
} from '../lib/cam/handler-control';
import type { AutoPromptContext, DeviceOverride } from '../lib/cam/handler-control';
import {
  createRecordingState,
  startRecording,
  stopRecording,
  createRecordingUrl,
} from '../lib/cam/recording';
import type { RecordingState } from '../lib/cam/recording';
import type { CamAnnouncement } from '../lib/cam/announcements';
import {
  buildPrepReminder,
  buildGoLiveAnnouncement,
  buildTipGoalAnnouncement,
  buildSessionEndedAnnouncement,
} from '../lib/cam/announcements';
import { runPostSessionPipeline } from '../lib/cam/post-session';

// ============================================
// Hook Interface
// ============================================

export type CamPhase = 'idle' | 'preparing' | 'live' | 'ending' | 'summary';

interface UseCamSessionReturn {
  // Session state
  session: CamSession | null;
  phase: CamPhase;
  isLoading: boolean;
  error: string | null;

  // Live metrics
  elapsedSeconds: number;
  tipTotal: { totalTokens: number; totalUsd: number; tipCount: number };
  edgeCount: number;
  tips: CamTip[];
  tipGoals: TipGoal[];

  // Handler prompts
  prompts: HandlerPrompt[];
  unacknowledgedPrompts: HandlerPrompt[];
  latestPrompt: HandlerPrompt | null;

  // Recording
  recordingState: RecordingState;

  // Announcements
  announcements: CamAnnouncement[];
  dismissAnnouncement: (index: number) => void;

  // Summary
  summary: CamSessionSummary | null;

  // Actions — Lifecycle
  startPreparation: (sessionId: string, denialDay?: number) => Promise<void>;
  goLive: (streamUrl?: string) => Promise<void>;
  endSession: () => Promise<void>;

  // Actions — Tips
  recordTip: (tipData: {
    tipperUsername?: string;
    tipperPlatform?: string;
    tokenAmount: number;
    tipAmountUsd?: number;
  }) => Promise<ProcessedTip | null>;

  // Actions — Handler
  ackPrompt: (promptId: string) => Promise<void>;
  sendCustomPrompt: (text: string) => Promise<void>;

  // Actions — Session
  recordEdge: () => Promise<void>;
  markHighlight: (type: HighlightType, description: string) => Promise<void>;

  // Actions — Recording
  startRec: (stream: MediaStream) => Promise<void>;
  stopRec: () => Promise<string | null>;

  // Device override (for Handler to send directly)
  pendingDeviceOverride: DeviceOverride | null;
  clearDeviceOverride: () => void;

  // Fake goal denial response (shown when isFake goal reached)
  fakeGoalResponse: { label: string; response: string } | null;
  dismissFakeGoalResponse: () => void;
}

// ============================================
// Hook Implementation
// ============================================

export function useCamSession(): UseCamSessionReturn {
  const { user } = useAuth();

  // Core state
  const [session, setSession] = useState<CamSession | null>(null);
  const [phase, setPhase] = useState<CamPhase>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Metrics
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [tipTotal, setTipTotal] = useState({ totalTokens: 0, totalUsd: 0, tipCount: 0 });
  const [tips, setTips] = useState<CamTip[]>([]);
  const [tipGoals, setTipGoals] = useState<TipGoal[]>([]);

  // Prompts
  const [prompts, setPrompts] = useState<HandlerPrompt[]>([]);
  const [unacknowledgedPrompts, setUnacknowledgedPrompts] = useState<HandlerPrompt[]>([]);

  // Recording
  const [recordingState, setRecordingState] = useState<RecordingState>(createRecordingState());

  // Announcements
  const [announcements, setAnnouncements] = useState<CamAnnouncement[]>([]);

  // Summary
  const [summary, setSummary] = useState<CamSessionSummary | null>(null);

  // Device override
  const [pendingDeviceOverride, setPendingDeviceOverride] = useState<DeviceOverride | null>(null);

  // Fake goal denial response
  const [fakeGoalResponse, setFakeGoalResponse] = useState<{ label: string; response: string } | null>(null);

  // Refs for timers
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPromptTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPromptTimeRef = useRef<number>(0);

  // ============================================
  // Lifecycle Actions
  // ============================================

  const startPreparation = useCallback(async (sessionId: string, denialDay?: number) => {
    if (!user?.id) return;
    setIsLoading(true);
    setError(null);

    try {
      const updated = await startPrep(sessionId, { denialDay });
      if (!updated) throw new Error('Failed to start preparation');

      setSession(updated);
      setPhase('preparing');
      setTipGoals(updated.tipGoals || []);

      // Push prep announcement
      setAnnouncements(prev => [...prev, buildPrepReminder(updated)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start prep');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  const handleGoLive = useCallback(async (streamUrl?: string) => {
    if (!session) return;
    setIsLoading(true);
    setError(null);

    try {
      const updated = await goLive(session.id, streamUrl);
      if (!updated) throw new Error('Failed to go live');

      setSession(updated);
      setPhase('live');

      // Push go-live announcement
      setAnnouncements(prev => [...prev, buildGoLiveAnnouncement(updated)]);

      // Start elapsed timer
      elapsedTimerRef.current = setInterval(() => {
        setElapsedSeconds(getSessionElapsedSeconds(updated));
      }, 1000);

      // Start auto-prompt timer (check every 60 seconds)
      lastPromptTimeRef.current = Date.now();
      autoPromptTimerRef.current = setInterval(async () => {
        if (!user?.id || !updated) return;

        const elapsed = getSessionElapsedSeconds(updated);
        const minutesSinceLastPrompt = Math.round(
          (Date.now() - lastPromptTimeRef.current) / 60000
        );

        const ctx: AutoPromptContext = {
          minutesElapsed: Math.round(elapsed / 60),
          tipCount: tipTotal.tipCount,
          totalTokens: tipTotal.totalTokens,
          edgeCount: updated.edgeCount,
          currentViewers: 0, // Would come from stream API
          denialDay: updated.denialDay || 0,
          tipGoalPercent: tipGoals.length > 0
            ? tipTotal.totalTokens / tipGoals[0].targetTokens
            : 0,
          lastPromptMinutesAgo: minutesSinceLastPrompt,
        };

        const autoPrompt = generateAutoPrompt(ctx);
        if (autoPrompt) {
          const prompt = await sendPrompt(
            user.id,
            updated.id,
            autoPrompt.type,
            autoPrompt.text,
            Math.round(elapsed)
          );
          if (prompt) {
            setPrompts(prev => [...prev, prompt]);
            setUnacknowledgedPrompts(prev => [...prev, prompt]);
            lastPromptTimeRef.current = Date.now();
          }
        }
      }, 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to go live');
    } finally {
      setIsLoading(false);
    }
  }, [session, user?.id, tipTotal, tipGoals]);

  const endSession = useCallback(async () => {
    if (!session) return;
    setPhase('ending');
    setIsLoading(true);

    // Stop timers
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    if (autoPromptTimerRef.current) clearInterval(autoPromptTimerRef.current);

    try {
      // Stop recording if active
      let recordingUrl: string | undefined;
      if (recordingState.isRecording) {
        const blob = await stopRecording(recordingState);
        recordingUrl = createRecordingUrl(blob);
        setRecordingState(prev => ({ ...prev, isRecording: false }));
      }

      const updated = await endLive(session.id, recordingUrl);
      if (!updated) throw new Error('Failed to end session');

      setSession(updated);

      // Build summary
      const allTips = await getSessionTips(session.id);
      const allPrompts = await getSessionPrompts(session.id);
      const sessionSummary = buildCamSessionSummary(updated, allTips, allPrompts);

      // Run post-session pipeline (highlight extraction, revenue logging, handler note)
      if (user?.id) {
        try {
          const pipeline = await runPostSessionPipeline(user.id, session.id);
          sessionSummary.handlerNote = pipeline.handlerNote;
          sessionSummary.revenueUsd = pipeline.revenueCents / 100;
        } catch (err) {
          console.warn('[useCamSession] Post-session pipeline failed:', err);
        }
      }

      setSummary(sessionSummary);

      // Push ended announcement
      setAnnouncements(prev => [
        ...prev,
        buildSessionEndedAnnouncement(updated, sessionSummary.totalTokens, sessionSummary.tipCount),
      ]);

      setPhase('summary');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end session');
      setPhase('live'); // Revert to live on error
    } finally {
      setIsLoading(false);
    }
  }, [session, recordingState]);

  // ============================================
  // Tip Actions
  // ============================================

  const recordTip = useCallback(async (tipData: {
    tipperUsername?: string;
    tipperPlatform?: string;
    tokenAmount: number;
    tipAmountUsd?: number;
  }): Promise<ProcessedTip | null> => {
    if (!user?.id || !session) return null;

    try {
      const sessionSeconds = getSessionElapsedSeconds(session);
      const result = await processTip(
        user.id,
        session.id,
        { ...tipData, sessionTimestampSeconds: sessionSeconds },
        session.tipLevels as TipLevel[] || TIP_LEVELS
      );

      // Update local state
      setTips(prev => [...prev, result.tip]);
      setTipTotal(prev => ({
        totalTokens: prev.totalTokens + tipData.tokenAmount,
        totalUsd: prev.totalUsd + (tipData.tipAmountUsd || 0),
        tipCount: prev.tipCount + 1,
      }));

      // Check tip goals
      if (tipGoals.length > 0) {
        const newTotal = tipTotal.totalTokens + tipData.tokenAmount;
        const updatedGoals = checkTipGoals(newTotal, tipGoals);
        setTipGoals(updatedGoals);

        // Announce newly reached goals
        for (const goal of updatedGoals) {
          if (goal.justReached) {
            if (goal.isFake) {
              // Fake goal: show denial response, auto-mark highlight
              setFakeGoalResponse({
                label: goal.label,
                response: goal.fakeResponse || 'Goal reached. Handler says no.',
              });
              // Auto-mark as highlight — fake goal denial is content gold
              const seconds = getSessionElapsedSeconds(session);
              addHighlight(session.id, {
                timestampSeconds: seconds,
                durationSeconds: 30,
                type: 'compliance',
                description: `Fake goal denial: "${goal.label}"`,
              });
            } else {
              setAnnouncements(prev => [
                ...prev,
                buildTipGoalAnnouncement(session.id, goal.label, goal.reward),
              ]);
            }
          }
        }
      }

      // If device should trigger, set override
      if (result.shouldTriggerDevice && result.level) {
        setPendingDeviceOverride({
          pattern: result.level.pattern,
          intensity: result.level.intensity[1],
          durationSeconds: result.level.seconds,
          reason: `Tip: ${tipData.tokenAmount} tokens from ${tipData.tipperUsername || 'anonymous'}`,
        });
      }

      return result;
    } catch (err) {
      console.error('Failed to record tip:', err);
      return null;
    }
  }, [user?.id, session, tipGoals, tipTotal]);

  // ============================================
  // Handler Actions
  // ============================================

  const ackPrompt = useCallback(async (promptId: string) => {
    await acknowledgePrompt(promptId);
    setUnacknowledgedPrompts(prev => prev.filter(p => p.id !== promptId));
    setPrompts(prev => prev.map(p =>
      p.id === promptId ? { ...p, acknowledged: true, acknowledgedAt: new Date().toISOString() } : p
    ));
  }, []);

  const sendCustomPrompt = useCallback(async (text: string) => {
    if (!user?.id || !session) return;
    const seconds = getSessionElapsedSeconds(session);
    const prompt = await sendPrompt(user.id, session.id, 'custom' as PromptType, text, seconds);
    if (prompt) {
      setPrompts(prev => [...prev, prompt]);
      setUnacknowledgedPrompts(prev => [...prev, prompt]);
    }
  }, [user?.id, session]);

  // ============================================
  // Edge & Highlight
  // ============================================

  const recordEdge = useCallback(async () => {
    if (!session) return;
    await incrementEdgeCount(session.id);
    setSession(prev => prev ? { ...prev, edgeCount: prev.edgeCount + 1 } : null);
    await logHandlerAction(session.id, 'edge_recorded', `Edge #${(session.edgeCount || 0) + 1}`);
  }, [session]);

  const markHighlight = useCallback(async (type: HighlightType, description: string) => {
    if (!session) return;
    const seconds = getSessionElapsedSeconds(session);
    const updated = await addHighlight(session.id, {
      timestampSeconds: seconds,
      durationSeconds: 30, // Default 30s clip
      type,
      description,
    });
    if (updated) setSession(updated);
  }, [session]);

  // ============================================
  // Recording
  // ============================================

  const startRec = useCallback(async (stream: MediaStream) => {
    const state = await startRecording(stream);
    setRecordingState(state);
  }, []);

  const stopRec = useCallback(async (): Promise<string | null> => {
    if (!recordingState.isRecording) return null;
    const blob = await stopRecording(recordingState);
    const url = createRecordingUrl(blob);
    setRecordingState(prev => ({ ...prev, isRecording: false }));
    return url;
  }, [recordingState]);

  // ============================================
  // Announcements
  // ============================================

  const dismissAnnouncement = useCallback((index: number) => {
    setAnnouncements(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearDeviceOverride = useCallback(() => {
    setPendingDeviceOverride(null);
  }, []);

  const dismissFakeGoalResponse = useCallback(() => {
    setFakeGoalResponse(null);
  }, []);

  // ============================================
  // Resume active session on mount
  // ============================================

  useEffect(() => {
    if (!user?.id) return;

    getActiveLiveSession(user.id).then(active => {
      if (active) {
        setSession(active);
        setTipGoals(active.tipGoals || []);

        if (active.status === 'preparing') {
          setPhase('preparing');
        } else if (active.status === 'live') {
          setPhase('live');
          setElapsedSeconds(getSessionElapsedSeconds(active));

          // Resume elapsed timer
          elapsedTimerRef.current = setInterval(() => {
            setElapsedSeconds(getSessionElapsedSeconds(active));
          }, 1000);

          // Load existing tips and prompts
          getSessionTips(active.id).then(setTips);
          getSessionTipTotal(active.id).then(setTipTotal);
          getSessionPrompts(active.id).then(setPrompts);
          getUnacknowledgedPrompts(active.id).then(setUnacknowledgedPrompts);
        }
      }
    });

    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      if (autoPromptTimerRef.current) clearInterval(autoPromptTimerRef.current);
    };
  }, [user?.id]);

  return {
    session,
    phase,
    isLoading,
    error,
    elapsedSeconds,
    tipTotal,
    edgeCount: session?.edgeCount ?? 0,
    tips,
    tipGoals,
    prompts,
    unacknowledgedPrompts,
    latestPrompt: unacknowledgedPrompts[unacknowledgedPrompts.length - 1] || null,
    recordingState,
    announcements,
    dismissAnnouncement,
    summary,
    startPreparation,
    goLive: handleGoLive,
    endSession,
    recordTip,
    ackPrompt,
    sendCustomPrompt,
    recordEdge,
    markHighlight,
    startRec,
    stopRec,
    pendingDeviceOverride,
    clearDeviceOverride,
    fakeGoalResponse,
    dismissFakeGoalResponse,
  };
}
