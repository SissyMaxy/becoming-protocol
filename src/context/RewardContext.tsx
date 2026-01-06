import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type {
  UserRewardState,
  UserAchievement,
  UserAnchor,
  SessionGateStatus,
  ArousalSession,
  LevelUpEvent,
  AchievementUnlockedEvent,
  NarrationMilestoneEvent,
  PointSource,
  AnchorInput,
  SessionStartInput,
  SessionCompleteInput,
  AchievementCheckContext,
} from '../types/rewards';
import {
  getOrCreateRewardState,
  addPoints as addPointsApi,
  updateStreak,
  checkAndResetWeek,
  calculateLevel,
} from '../lib/rewards';
import {
  checkAndAwardAchievements,
  getUserAchievements,
} from '../lib/achievements';
import {
  incrementNarration as incrementNarrationApi,
  resetDailyNarration,
} from '../lib/narration';
import {
  getSessionGateStatus as getSessionGateStatusApi,
  startSession as startSessionApi,
  completeSession as completeSessionApi,
  abandonSession as abandonSessionApi,
  getCurrentSession,
} from '../lib/sessions';
import {
  getAnchors,
  addAnchor as addAnchorApi,
  toggleAnchor as toggleAnchorApi,
  updateAnchorEffectiveness as updateAnchorEffectivenessApi,
  deleteAnchor as deleteAnchorApi,
} from '../lib/anchors';
import { supabase } from '../lib/supabase';

// ============================================
// TYPES
// ============================================

interface RewardContextType {
  // State
  rewardState: UserRewardState | null;
  achievements: UserAchievement[];
  anchors: UserAnchor[];
  sessionGate: SessionGateStatus | null;
  currentSession: ArousalSession | null;
  isLoading: boolean;

  // Events
  levelUpEvent: LevelUpEvent | null;
  achievementUnlockedEvent: AchievementUnlockedEvent | null;
  narrationMilestoneEvent: NarrationMilestoneEvent | null;

  // Computed values
  levelInfo: {
    level: number;
    title: string;
    xpInLevel: number;
    xpForNextLevel: number;
    progress: number;
  } | null;
  streakMultiplier: number;

  // Point actions
  addPoints: (
    points: number,
    source: PointSource,
    sourceId?: string,
    details?: Record<string, unknown>
  ) => Promise<{ newTotal: number; levelUp?: LevelUpEvent }>;

  // Narration actions
  incrementNarration: () => Promise<{
    newCount: number;
    milestoneReached?: number;
    pointsAwarded?: number;
  }>;

  // Achievement actions
  checkAchievements: (context?: AchievementCheckContext) => Promise<UserAchievement[]>;

  // Session actions
  refreshSessionGate: () => Promise<void>;
  startSession: (input: SessionStartInput) => Promise<ArousalSession>;
  completeSession: (
    sessionId: string,
    input: SessionCompleteInput
  ) => Promise<{ session: ArousalSession; pointsAwarded: number }>;
  abandonSession: (sessionId: string) => Promise<void>;

  // Anchor actions
  addAnchor: (input: AnchorInput) => Promise<UserAnchor>;
  toggleAnchor: (anchorId: string, isActive: boolean) => Promise<void>;
  updateAnchorEffectiveness: (anchorId: string, rating: number) => Promise<void>;
  deleteAnchor: (anchorId: string) => Promise<void>;
  refreshAnchors: () => Promise<void>;

  // State management
  refreshRewardState: () => Promise<void>;
  syncStreakFromProtocol: (streak: number) => Promise<void>;

  // Event dismissals
  dismissLevelUp: () => void;
  dismissAchievementUnlocked: () => void;
  dismissNarrationMilestone: () => void;
}

const RewardContext = createContext<RewardContextType | undefined>(undefined);

// ============================================
// PROVIDER
// ============================================

export function RewardProvider({ children }: { children: React.ReactNode }) {
  // Core state
  const [rewardState, setRewardState] = useState<UserRewardState | null>(null);
  const [achievements, setAchievements] = useState<UserAchievement[]>([]);
  const [anchors, setAnchors] = useState<UserAnchor[]>([]);
  const [sessionGate, setSessionGate] = useState<SessionGateStatus | null>(null);
  const [currentSession, setCurrentSession] = useState<ArousalSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Events
  const [levelUpEvent, setLevelUpEvent] = useState<LevelUpEvent | null>(null);
  const [achievementUnlockedEvent, setAchievementUnlockedEvent] =
    useState<AchievementUnlockedEvent | null>(null);
  const [narrationMilestoneEvent, setNarrationMilestoneEvent] =
    useState<NarrationMilestoneEvent | null>(null);

  // Computed values
  const levelInfo = rewardState
    ? calculateLevel(rewardState.totalPoints)
    : null;
  const streakMultiplier = rewardState?.currentStreakMultiplier || 1.0;

  // ============================================
  // INITIALIZATION
  // ============================================

  useEffect(() => {
    async function initialize() {
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Check and reset week if needed
        await checkAndResetWeek();

        // Load all reward data in parallel
        const [state, userAchievements, userAnchors, gate, session] = await Promise.all([
          getOrCreateRewardState(),
          getUserAchievements(),
          getAnchors(),
          getSessionGateStatusApi(),
          getCurrentSession(),
        ]);

        setRewardState(state);
        setAchievements(userAchievements);
        setAnchors(userAnchors);
        setSessionGate(gate);
        setCurrentSession(session);

        // Check for daily narration reset
        await resetDailyNarration();
      } catch (error) {
        console.error('Failed to initialize reward context:', error);
      } finally {
        setIsLoading(false);
      }
    }

    initialize();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          initialize();
        } else if (event === 'SIGNED_OUT') {
          // Reset state
          setRewardState(null);
          setAchievements([]);
          setAnchors([]);
          setSessionGate(null);
          setCurrentSession(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ============================================
  // REFRESH FUNCTIONS
  // ============================================

  const refreshRewardState = useCallback(async () => {
    try {
      const state = await getOrCreateRewardState();
      setRewardState(state);
    } catch (error) {
      console.error('Failed to refresh reward state:', error);
    }
  }, []);

  const refreshAnchors = useCallback(async () => {
    try {
      const userAnchors = await getAnchors();
      setAnchors(userAnchors);
    } catch (error) {
      console.error('Failed to refresh anchors:', error);
    }
  }, []);

  const refreshSessionGate = useCallback(async () => {
    try {
      const gate = await getSessionGateStatusApi();
      setSessionGate(gate);
    } catch (error) {
      console.error('Failed to refresh session gate:', error);
    }
  }, []);

  // ============================================
  // POINT ACTIONS
  // ============================================

  const addPoints = useCallback(
    async (
      points: number,
      source: PointSource,
      sourceId?: string,
      details?: Record<string, unknown>
    ) => {
      const result = await addPointsApi(points, source, sourceId, details);

      // Update local state
      await refreshRewardState();

      // Trigger level up event if occurred
      if (result.levelUp) {
        setLevelUpEvent(result.levelUp);
      }

      return { newTotal: result.newTotal, levelUp: result.levelUp };
    },
    [refreshRewardState]
  );

  // Sync streak from ProtocolContext (called when protocol updates streak)
  const syncStreakFromProtocol = useCallback(async (streak: number) => {
    try {
      await updateStreak(streak);
      await refreshRewardState();
    } catch (error) {
      console.error('Failed to sync streak:', error);
    }
  }, [refreshRewardState]);

  // ============================================
  // NARRATION ACTIONS
  // ============================================

  const incrementNarration = useCallback(async () => {
    const result = await incrementNarrationApi();

    // Update local state
    await refreshRewardState();

    // Trigger milestone event if hit
    if (result.milestoneReached && result.pointsAwarded) {
      setNarrationMilestoneEvent({
        milestone: result.milestoneReached,
        pointsAwarded: result.pointsAwarded,
        dailyCount: result.newCount,
      });
    }

    return result;
  }, [refreshRewardState]);

  // ============================================
  // ACHIEVEMENT ACTIONS
  // ============================================

  const checkAchievements = useCallback(
    async (context?: AchievementCheckContext) => {
      // Build context from current state if not provided
      const checkContext: AchievementCheckContext = context || {
        streak: rewardState?.currentStreak,
        level: rewardState?.currentLevel,
        totalPoints: rewardState?.totalPoints,
        narrationCount: rewardState?.lifetimeNarrationCount,
        anchorsCount: anchors.filter(a => a.isActive).length,
      };

      const newAchievements = await checkAndAwardAchievements(checkContext);

      if (newAchievements.length > 0) {
        // Update achievements list
        const allAchievements = await getUserAchievements();
        setAchievements(allAchievements);

        // Refresh reward state (points were awarded)
        await refreshRewardState();

        // Trigger event for first new achievement
        const first = newAchievements[0];
        if (first.achievement) {
          setAchievementUnlockedEvent({
            achievement: first.achievement,
            pointsAwarded: first.pointsAwarded,
          });
        }
      }

      return newAchievements;
    },
    [rewardState, anchors, refreshRewardState]
  );

  // ============================================
  // SESSION ACTIONS
  // ============================================

  const startSession = useCallback(
    async (input: SessionStartInput) => {
      const session = await startSessionApi(input);
      setCurrentSession(session);
      return session;
    },
    []
  );

  const completeSession = useCallback(
    async (sessionId: string, input: SessionCompleteInput) => {
      const result = await completeSessionApi(sessionId, input);
      setCurrentSession(null);

      // Refresh gate status (counters updated)
      await refreshSessionGate();

      // Refresh reward state (points awarded)
      await refreshRewardState();

      // Check achievements
      await checkAchievements();

      return result;
    },
    [refreshSessionGate, refreshRewardState, checkAchievements]
  );

  const abandonSession = useCallback(async (sessionId: string) => {
    await abandonSessionApi(sessionId);
    setCurrentSession(null);
  }, []);

  // ============================================
  // ANCHOR ACTIONS
  // ============================================

  const addAnchor = useCallback(
    async (input: AnchorInput) => {
      const anchor = await addAnchorApi(input);
      await refreshAnchors();

      // Check anchor achievement
      await checkAchievements({
        anchorsCount: anchors.length + 1,
      });

      return anchor;
    },
    [refreshAnchors, checkAchievements, anchors]
  );

  const toggleAnchor = useCallback(
    async (anchorId: string, isActive: boolean) => {
      await toggleAnchorApi(anchorId, isActive);
      await refreshAnchors();
    },
    [refreshAnchors]
  );

  const updateAnchorEffectiveness = useCallback(
    async (anchorId: string, rating: number) => {
      await updateAnchorEffectivenessApi(anchorId, rating);
      await refreshAnchors();
    },
    [refreshAnchors]
  );

  const deleteAnchor = useCallback(
    async (anchorId: string) => {
      await deleteAnchorApi(anchorId);
      await refreshAnchors();
    },
    [refreshAnchors]
  );

  // ============================================
  // EVENT DISMISSALS
  // ============================================

  const dismissLevelUp = useCallback(() => {
    setLevelUpEvent(null);
  }, []);

  const dismissAchievementUnlocked = useCallback(() => {
    setAchievementUnlockedEvent(null);
  }, []);

  const dismissNarrationMilestone = useCallback(() => {
    setNarrationMilestoneEvent(null);
  }, []);

  // ============================================
  // CONTEXT VALUE
  // ============================================

  const value: RewardContextType = {
    // State
    rewardState,
    achievements,
    anchors,
    sessionGate,
    currentSession,
    isLoading,

    // Events
    levelUpEvent,
    achievementUnlockedEvent,
    narrationMilestoneEvent,

    // Computed
    levelInfo,
    streakMultiplier,

    // Actions
    addPoints,
    incrementNarration,
    checkAchievements,
    refreshSessionGate,
    startSession,
    completeSession,
    abandonSession,
    addAnchor,
    toggleAnchor,
    updateAnchorEffectiveness,
    deleteAnchor,
    refreshAnchors,
    refreshRewardState,
    syncStreakFromProtocol,

    // Dismissals
    dismissLevelUp,
    dismissAchievementUnlocked,
    dismissNarrationMilestone,
  };

  return (
    <RewardContext.Provider value={value}>{children}</RewardContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useReward() {
  const context = useContext(RewardContext);
  if (context === undefined) {
    throw new Error('useReward must be used within a RewardProvider');
  }
  return context;
}

// Optional hook that returns null if not in provider (for optional use)
export function useRewardOptional() {
  return useContext(RewardContext);
}
