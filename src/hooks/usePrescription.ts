import { useState, useEffect, useCallback } from 'react';
import { Intensity, UserProgress, DailyEntry, Domain } from '../types';
import { generatePrescription, Prescription, createLevelLock } from '../lib/ai-prescription';
import { analyzeUser, UserAnalytics, checkLevelUpCriteria, checkPhaseAdvancementCriteria } from '../lib/analytics';

interface LevelLocks {
  [domain: string]: string; // domain -> locked until date
}

interface PrescriptionState {
  prescription: Prescription | null;
  analytics: UserAnalytics | null;
  levelLocks: LevelLocks;
  isLoading: boolean;
  error: string | null;
}

interface LevelUpEvent {
  domain: Domain;
  fromLevel: number;
  toLevel: number;
}

interface PhaseUpEvent {
  fromPhase: number;
  toPhase: number;
  phaseName: string;
}

interface BaselineEvent {
  domain: Domain;
  consecutiveDays: number;
}

export function usePrescription(
  progress: UserProgress | null,
  entries: DailyEntry[]
) {
  const [state, setState] = useState<PrescriptionState>({
    prescription: null,
    analytics: null,
    levelLocks: {},
    isLoading: false,
    error: null
  });

  // Events for modals
  const [levelUpEvent, setLevelUpEvent] = useState<LevelUpEvent | null>(null);
  const [phaseUpEvent, setPhaseUpEvent] = useState<PhaseUpEvent | null>(null);
  const [baselineEvent, setBaselineEvent] = useState<BaselineEvent | null>(null);
  const [streakMilestone, setStreakMilestone] = useState<number | null>(null);

  // Generate prescription for a given intensity
  const generateForIntensity = useCallback((intensity: Intensity) => {
    if (!progress) return null;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const prescription = generatePrescription(
        progress,
        entries,
        intensity,
        state.levelLocks
      );

      const analytics = analyzeUser(progress, entries, state.levelLocks);

      setState(prev => ({
        ...prev,
        prescription,
        analytics,
        isLoading: false
      }));

      return prescription;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to generate prescription'
      }));
      return null;
    }
  }, [progress, entries, state.levelLocks]);

  // Check for level ups after day completion
  const checkForLevelUps = useCallback((
    previousProgress: UserProgress,
    currentProgress: UserProgress
  ) => {
    if (!state.analytics) return;

    // Check each domain for level up
    currentProgress.domainProgress.forEach(current => {
      const previous = previousProgress.domainProgress.find(
        p => p.domain === current.domain
      );

      if (previous && current.level > previous.level) {
        // Level up detected!
        setLevelUpEvent({
          domain: current.domain,
          fromLevel: previous.level,
          toLevel: current.level
        });

        // Create level lock
        const lock = createLevelLock(current.domain);
        setState(prev => ({
          ...prev,
          levelLocks: {
            ...prev.levelLocks,
            [lock.domain]: lock.lockedUntil
          }
        }));
      }
    });

    // Check for phase advancement
    if (currentProgress.phase.currentPhase > previousProgress.phase.currentPhase) {
      const phaseNames: Record<number, string> = {
        1: 'Foundation',
        2: 'Expression',
        3: 'Integration',
        4: 'Embodiment'
      };

      setPhaseUpEvent({
        fromPhase: previousProgress.phase.currentPhase,
        toPhase: currentProgress.phase.currentPhase,
        phaseName: phaseNames[currentProgress.phase.currentPhase] || 'Unknown'
      });
    }
  }, [state.analytics]);

  // Check for new baseline domains
  const checkForBaselines = useCallback(() => {
    if (!state.analytics) return;

    state.analytics.domainStats.forEach(domainStat => {
      // Check if just reached baseline threshold
      if (domainStat.consecutiveDays === 14 && domainStat.isBaseline) {
        setBaselineEvent({
          domain: domainStat.domain,
          consecutiveDays: domainStat.consecutiveDays
        });
      }
    });
  }, [state.analytics]);

  // Check for streak milestones
  const checkStreakMilestones = useCallback(() => {
    if (!progress) return;

    const milestones = [7, 14, 21, 30, 60, 90, 100, 365];
    if (milestones.includes(progress.overallStreak)) {
      setStreakMilestone(progress.overallStreak);
    }
  }, [progress]);

  // Dismiss handlers
  const dismissLevelUp = useCallback(() => setLevelUpEvent(null), []);
  const dismissPhaseUp = useCallback(() => setPhaseUpEvent(null), []);
  const dismissBaseline = useCallback(() => setBaselineEvent(null), []);
  const dismissStreakMilestone = useCallback(() => setStreakMilestone(null), []);

  // Run analytics when progress changes
  useEffect(() => {
    if (progress && entries.length > 0) {
      const analytics = analyzeUser(progress, entries, state.levelLocks);
      setState(prev => ({ ...prev, analytics }));
    }
  }, [progress, entries, state.levelLocks]);

  return {
    // State
    prescription: state.prescription,
    analytics: state.analytics,
    isLoading: state.isLoading,
    error: state.error,

    // Actions
    generateForIntensity,
    checkForLevelUps,
    checkForBaselines,
    checkStreakMilestones,

    // Events
    levelUpEvent,
    phaseUpEvent,
    baselineEvent,
    streakMilestone,

    // Dismiss handlers
    dismissLevelUp,
    dismissPhaseUp,
    dismissBaseline,
    dismissStreakMilestone
  };
}

// Helper hook for checking advancement eligibility
export function useAdvancementCheck(
  progress: UserProgress | null,
  analytics: UserAnalytics | null
) {
  const [eligibleDomains, setEligibleDomains] = useState<Domain[]>([]);
  const [phaseEligible, setPhaseEligible] = useState(false);

  useEffect(() => {
    if (!analytics) {
      setEligibleDomains([]);
      setPhaseEligible(false);
      return;
    }

    // Find domains eligible for level up
    const eligible = analytics.domainStats
      .filter(d => {
        const criteria = checkLevelUpCriteria(d);
        return criteria.eligible;
      })
      .map(d => d.domain);

    setEligibleDomains(eligible);

    // Check phase eligibility
    if (progress && progress.phase.currentPhase < 4) {
      const phaseCriteria = checkPhaseAdvancementCriteria(
        progress.phase.currentPhase,
        progress,
        analytics
      );
      setPhaseEligible(phaseCriteria.eligible);
    } else {
      setPhaseEligible(false);
    }
  }, [analytics, progress]);

  return { eligibleDomains, phaseEligible };
}
