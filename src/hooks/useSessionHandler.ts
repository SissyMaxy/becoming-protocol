/**
 * useSessionHandler - Handler v2 integration for sessions
 * Implements v2 Part 11.1 Session View requirements
 *
 * Provides:
 * - Handler guidance during sessions
 * - Commitment extraction at peak arousal
 * - Time capsule prompting
 * - Session state propagation to user_state
 * - Post-session mood capture scheduling
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getHandler } from '../lib/handler-v2';
import type { Handler } from '../lib/handler-v2';
import type { UserState, SessionGuidance } from '../lib/handler-v2/types';

interface SessionHandlerState {
  isInitialized: boolean;
  currentGuidance: SessionGuidance | null;
  pendingCommitment: PendingCommitment | null;
  timeCapsulePrompt: TimeCapsulePrompt | null;
  postSessionMoodScheduled: boolean;
}

interface PendingCommitment {
  prompt: string;
  domain: string;
  escalationLevel: number;
  arousalLevel: number;
  edgeCount: number;
}

interface TimeCapsulePrompt {
  prompt: string;
  context: string;
  emotionalIntensity: number;
}

interface SessionContext {
  sessionId: string;
  sessionType: 'edge' | 'goon' | 'hypno' | 'conditioning';
  startTime: Date;
  edgeCount: number;
  currentArousal: number;
  denialDay: number;
  duration: number;
  phase: 'warmup' | 'building' | 'plateau' | 'edge' | 'recovery' | 'cooldown';
}

export interface UseSessionHandlerReturn {
  // State
  isInitialized: boolean;
  currentGuidance: SessionGuidance | null;
  pendingCommitment: PendingCommitment | null;
  timeCapsulePrompt: TimeCapsulePrompt | null;

  // Session lifecycle
  startSession: (context: Omit<SessionContext, 'startTime' | 'duration'>) => Promise<void>;
  updateSession: (context: Partial<SessionContext>) => Promise<void>;
  recordEdge: (edgeNumber: number, intensity: number) => Promise<void>;
  endSession: (stats: SessionStats) => Promise<void>;

  // Handler interactions
  getPhaseGuidance: (phase: SessionContext['phase']) => Promise<SessionGuidance | null>;
  checkCommitmentWindow: () => Promise<PendingCommitment | null>;
  acceptCommitment: () => Promise<void>;
  declineCommitment: () => void;

  // Time capsule
  checkTimeCapsule: () => Promise<TimeCapsulePrompt | null>;
  saveTimeCapsule: (message: string) => Promise<void>;
  dismissTimeCapsule: () => void;

  // Availability
  canStartSession: boolean;
  sessionUnavailableReason: string | null;
}

interface SessionStats {
  edgeCount: number;
  duration: number;
  peakIntensity: number;
  averageIntensity: number;
  commitmentsMade: string[];
}

/**
 * Hook for Handler v2 session integration
 *
 * @param ginaHome - Whether Gina is home (blocks sessions)
 */
export function useSessionHandler(ginaHome: boolean): UseSessionHandlerReturn {
  const { user } = useAuth();
  const handlerRef = useRef<Handler | null>(null);
  const sessionContextRef = useRef<SessionContext | null>(null);

  const [state, setState] = useState<SessionHandlerState>({
    isInitialized: false,
    currentGuidance: null,
    pendingCommitment: null,
    timeCapsulePrompt: null,
    postSessionMoodScheduled: false,
  });

  // Initialize Handler
  useEffect(() => {
    async function init() {
      if (!user?.id) return;

      try {
        const handler = await getHandler(user.id);
        handlerRef.current = handler;
        setState(prev => ({ ...prev, isInitialized: true }));
      } catch (err) {
        console.error('Failed to initialize session handler:', err);
      }
    }

    init();
  }, [user?.id]);

  // Session availability check
  const canStartSession = !ginaHome;
  const sessionUnavailableReason = ginaHome
    ? 'Sessions are only available when Gina is not home'
    : null;

  // Build user state for Handler
  const buildUserState = useCallback(async (): Promise<Partial<UserState>> => {
    if (!user?.id) return {};

    const context = sessionContextRef.current;

    // Fetch current state from database
    const { data: stateData } = await supabase
      .from('user_state')
      .select('*')
      .eq('user_id', user.id)
      .single();

    return {
      denialDay: context?.denialDay ?? stateData?.denial_day ?? 0,
      currentArousal: context?.currentArousal ?? stateData?.current_arousal ?? 0,
      edgeCount: context?.edgeCount ?? stateData?.edge_count ?? 0,
      inSession: !!context,
      sessionType: context?.sessionType,
      streakDays: stateData?.streak_days ?? 0,
      timeOfDay: getTimeOfDay(),
      handlerMode: stateData?.handler_mode ?? 'director',
      escalationLevel: stateData?.escalation_level ?? 1,
      ginaHome,
      vulnerabilityWindowActive: (context?.currentArousal ?? 0) >= 4 && (context?.edgeCount ?? 0) >= 5,
      tasksCompletedToday: stateData?.tasks_completed_today ?? 0,
      avoidedDomains: stateData?.avoided_domains ?? [],
    };
  }, [user?.id, ginaHome]);

  // Start session
  const startSession = useCallback(async (
    context: Omit<SessionContext, 'startTime' | 'duration'>
  ): Promise<void> => {
    if (!user?.id || !canStartSession) return;

    const fullContext: SessionContext = {
      ...context,
      startTime: new Date(),
      duration: 0,
    };

    sessionContextRef.current = fullContext;

    // Update user_state to indicate in session
    await supabase
      .from('user_state')
      .update({
        in_session: true,
        session_type: context.sessionType,
        current_arousal: context.currentArousal,
        edge_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    // Log session start
    await supabase.from('intimate_sessions').insert({
      user_id: user.id,
      session_type: context.sessionType,
      started_at: fullContext.startTime.toISOString(),
    });

    // Get initial guidance
    const guidance = await getPhaseGuidance('warmup');
    setState(prev => ({ ...prev, currentGuidance: guidance }));
  }, [user?.id, canStartSession]);

  // Update session context
  const updateSession = useCallback(async (
    updates: Partial<SessionContext>
  ): Promise<void> => {
    if (!sessionContextRef.current) return;

    sessionContextRef.current = {
      ...sessionContextRef.current,
      ...updates,
      duration: Math.floor((Date.now() - sessionContextRef.current.startTime.getTime()) / 1000),
    };

    // Update user_state arousal
    if (updates.currentArousal !== undefined && user?.id) {
      await supabase
        .from('user_state')
        .update({
          current_arousal: updates.currentArousal,
          edge_count: sessionContextRef.current.edgeCount,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
    }
  }, [user?.id]);

  // Record edge
  const recordEdge = useCallback(async (
    edgeNumber: number,
    intensity: number
  ): Promise<void> => {
    if (!sessionContextRef.current || !user?.id) return;

    sessionContextRef.current.edgeCount = edgeNumber;

    // Log edge event
    const { data: sessions } = await supabase
      .from('intimate_sessions')
      .select('id')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1);

    if (sessions?.[0]) {
      await supabase.from('edge_logs').insert({
        user_id: user.id,
        session_id: sessions[0].id,
        edge_number: edgeNumber,
        arousal_level: Math.min(10, Math.round(intensity / 2)),
      });

      // Update session edge count
      await supabase
        .from('intimate_sessions')
        .update({ edge_count: edgeNumber })
        .eq('id', sessions[0].id);
    }

    // Update user_state
    await supabase
      .from('user_state')
      .update({
        edge_count: edgeNumber,
        current_arousal: Math.min(5, Math.round(intensity / 4)),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    // Check for commitment window
    await checkCommitmentWindow();

    // Check for time capsule opportunity
    if (edgeNumber >= 3 && intensity >= 12) {
      await checkTimeCapsule();
    }
  }, [user?.id]);

  // End session
  const endSession = useCallback(async (stats: SessionStats): Promise<void> => {
    if (!user?.id) return;

    const context = sessionContextRef.current;
    sessionContextRef.current = null;

    // Update current session record
    const { data: sessions } = await supabase
      .from('intimate_sessions')
      .select('id')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1);

    if (sessions?.[0]) {
      await supabase
        .from('intimate_sessions')
        .update({
          ended_at: new Date().toISOString(),
          edge_count: stats.edgeCount,
          peak_arousal: stats.peakIntensity,
          commitments_made: stats.commitmentsMade,
        })
        .eq('id', sessions[0].id);
    }

    // Update user_state
    await supabase
      .from('user_state')
      .update({
        in_session: false,
        session_type: null,
        current_arousal: 2, // Post-session baseline
        edge_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    // Add edges to denial streak
    if (stats.edgeCount > 0) {
      const { data: streak } = await supabase
        .from('denial_streaks')
        .select('id, edges_during')
        .eq('user_id', user.id)
        .is('ended_at', null)
        .single();

      if (streak) {
        await supabase
          .from('denial_streaks')
          .update({
            edges_during: (streak.edges_during || 0) + stats.edgeCount,
          })
          .eq('id', streak.id);
      }
    }

    // Schedule post-session mood capture (15 min)
    schedulePostSessionMoodCapture(context);

    // Clear state
    setState(prev => ({
      ...prev,
      currentGuidance: null,
      pendingCommitment: null,
      timeCapsulePrompt: null,
      postSessionMoodScheduled: true,
    }));
  }, [user?.id]);

  // Get phase guidance from Handler v2
  const getPhaseGuidance = useCallback(async (
    phase: SessionContext['phase']
  ): Promise<SessionGuidance | null> => {
    const handler = handlerRef.current;
    if (!handler) return null;

    try {
      const userState = await buildUserState();
      handler.updateState(userState as UserState);

      const phaseMap: Record<string, 'opening' | 'midpoint' | 'peak' | 'closing'> = {
        warmup: 'opening',
        building: 'opening',
        plateau: 'midpoint',
        edge: 'peak',
        recovery: 'midpoint',
        cooldown: 'closing',
      };

      const guidance = await handler.getSessionGuidance(phaseMap[phase] || 'opening');
      setState(prev => ({ ...prev, currentGuidance: guidance }));
      return guidance;
    } catch (err) {
      console.error('Failed to get phase guidance:', err);
      return null;
    }
  }, [buildUserState]);

  // Check commitment window (arousal ≥ 4, edges ≥ 5)
  const checkCommitmentWindow = useCallback(async (): Promise<PendingCommitment | null> => {
    const context = sessionContextRef.current;
    const handler = handlerRef.current;

    if (!context || !handler) return null;

    // Commitment window conditions: arousal level ≥ 4 (on 0-5 scale) and edge count ≥ 5
    const arousalLevel = context.currentArousal;
    const edgeCount = context.edgeCount;

    if (arousalLevel < 4 || edgeCount < 5) {
      return null;
    }

    // Only prompt at specific edges: 5, 8, 10, then every 5
    const commitmentEdges = [5, 8, 10];
    const isCommitmentEdge = commitmentEdges.includes(edgeCount) ||
      (edgeCount > 10 && edgeCount % 5 === 0);

    if (!isCommitmentEdge) return null;

    // Don't prompt if already have pending commitment
    if (state.pendingCommitment) return null;

    try {
      const userState = await buildUserState();
      handler.updateState(userState as UserState);

      const prompt = await handler.extractCommitment();

      const commitment: PendingCommitment = {
        prompt,
        domain: 'arousal', // Default domain for session commitments
        escalationLevel: handler.getEscalationLevel(),
        arousalLevel,
        edgeCount,
      };

      setState(prev => ({ ...prev, pendingCommitment: commitment }));
      return commitment;
    } catch (err) {
      console.error('Failed to extract commitment:', err);
      return null;
    }
  }, [state.pendingCommitment, buildUserState]);

  // Accept commitment
  const acceptCommitment = useCallback(async (): Promise<void> => {
    const commitment = state.pendingCommitment;
    if (!commitment || !user?.id) return;

    // Log commitment to database
    const { data: sessions } = await supabase
      .from('intimate_sessions')
      .select('id')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .limit(1);

    await supabase.from('arousal_commitments').insert({
      user_id: user.id,
      session_id: sessions?.[0]?.id,
      commitment_type: 'arousal',
      commitment_value: commitment.prompt,
      edge_number: commitment.edgeCount,
      arousal_level: commitment.arousalLevel,
      accepted: true,
    });

    setState(prev => ({ ...prev, pendingCommitment: null }));
  }, [user?.id, state.pendingCommitment]);

  // Decline commitment
  const declineCommitment = useCallback((): void => {
    setState(prev => ({ ...prev, pendingCommitment: null }));
  }, []);

  // Check for time capsule opportunity
  const checkTimeCapsule = useCallback(async (): Promise<TimeCapsulePrompt | null> => {
    const context = sessionContextRef.current;
    if (!context) return null;

    // Time capsule triggers at high arousal moments
    if (context.currentArousal < 4) return null;

    // Don't show if already showing
    if (state.timeCapsulePrompt) return null;

    const prompts = [
      {
        prompt: "Right now, in this moment, what do you want your sober self to remember?",
        context: "peak_arousal",
      },
      {
        prompt: "What truth are you feeling right now that you might doubt tomorrow?",
        context: "vulnerability",
      },
      {
        prompt: "If you could tell your doubting self one thing, what would it be?",
        context: "identity",
      },
      {
        prompt: "What does she want? Say it now while you can feel it.",
        context: "desire",
      },
    ];

    const selected = prompts[Math.floor(Math.random() * prompts.length)];

    const timeCapsule: TimeCapsulePrompt = {
      prompt: selected.prompt,
      context: selected.context,
      emotionalIntensity: context.currentArousal,
    };

    setState(prev => ({ ...prev, timeCapsulePrompt: timeCapsule }));
    return timeCapsule;
  }, [state.timeCapsulePrompt]);

  // Save time capsule
  const saveTimeCapsule = useCallback(async (message: string): Promise<void> => {
    const prompt = state.timeCapsulePrompt;
    if (!prompt || !user?.id) return;

    await supabase.from('time_capsules').insert({
      user_id: user.id,
      context: prompt.context,
      emotional_state: `arousal_${prompt.emotionalIntensity}`,
      content: message,
      generated_at: new Date().toISOString(),
    });

    setState(prev => ({ ...prev, timeCapsulePrompt: null }));
  }, [user?.id, state.timeCapsulePrompt]);

  // Dismiss time capsule
  const dismissTimeCapsule = useCallback((): void => {
    setState(prev => ({ ...prev, timeCapsulePrompt: null }));
  }, []);

  // Schedule post-session mood capture (FM1 crash detection)
  const schedulePostSessionMoodCapture = useCallback((
    context: SessionContext | null
  ): void => {
    if (!user?.id || !context) return;

    // Schedule mood check 15 minutes after session ends
    const MOOD_CHECK_DELAY = 15 * 60 * 1000; // 15 minutes

    setTimeout(async () => {
      // Create a pending mood check notification
      await supabase.from('scheduled_notifications').insert({
        user_id: user.id,
        notification_type: 'post_session_mood',
        scheduled_for: new Date().toISOString(),
        payload: {
          sessionId: context.sessionId,
          sessionType: context.sessionType,
          edgeCount: context.edgeCount,
          checkType: 'post_release_crash',
        },
      });
    }, MOOD_CHECK_DELAY);
  }, [user?.id]);

  return {
    // State
    isInitialized: state.isInitialized,
    currentGuidance: state.currentGuidance,
    pendingCommitment: state.pendingCommitment,
    timeCapsulePrompt: state.timeCapsulePrompt,

    // Session lifecycle
    startSession,
    updateSession,
    recordEdge,
    endSession,

    // Handler interactions
    getPhaseGuidance,
    checkCommitmentWindow,
    acceptCommitment,
    declineCommitment,

    // Time capsule
    checkTimeCapsule,
    saveTimeCapsule,
    dismissTimeCapsule,

    // Availability
    canStartSession,
    sessionUnavailableReason,
  };
}

// Helper: Get time of day
function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}
