/**
 * Orchestrated Modals Hook
 *
 * Manages the display of overlapping modal systems through the ModalOrchestrator.
 * Ensures only one modal shows at a time with proper priority ordering.
 */

import { useEffect, useRef } from 'react';
import { useModalOrchestrator } from '../context/ModalOrchestrator';
import { ReminderModal } from '../components/reminders';
import { InterventionNotification } from '../components/handler/InterventionNotification';
import { RecoveryPrompt } from '../components/handler/RecoveryPrompt';
import { InvestmentMilestoneModal } from '../components/investments';
import { AchievementModal, RewardLevelUpModal } from '../components/rewards';
import type { Reminder } from '../types/reminders';
import type { HandlerIntervention } from '../types/handler';
import type { RecoveryPrompt as RecoveryPromptType } from '../hooks/useDisassociationRecovery';
import type { InvestmentMilestoneEvent } from '../types/investments';
import type { AchievementUnlockedEvent, LevelUpEvent } from '../types/rewards';

interface OrchestratedModalsProps {
  // Reminder state
  currentReminder: Reminder | null;
  onRespondReminder: (rating?: number, note?: string) => void;
  onSkipReminder: () => void;
  onDismissReminder: () => void;

  // Intervention state
  currentIntervention: HandlerIntervention | null;
  onCompleteIntervention: () => void;
  onDismissIntervention: () => void;
  onRespondIntervention: (response: 'completed' | 'dismissed' | 'ignored') => void;

  // Recovery state
  recoveryTriggered: boolean;
  recoveryPrompt: RecoveryPromptType | null;
  recoveryEscalationLevel: number;
  recoveryConsecutiveIgnores: number;
  onCompleteRecovery: () => void;
  onDismissRecovery: () => void;

  // Investment milestone state
  investmentMilestone: InvestmentMilestoneEvent | null;
  onDismissInvestmentMilestone: () => void;

  // Achievement state
  achievementEvent: AchievementUnlockedEvent | null;
  onDismissAchievement: () => void;

  // Level up state
  levelUpEvent: LevelUpEvent | null;
  onDismissLevelUp: () => void;
}

export function useOrchestratedModals({
  currentReminder,
  onRespondReminder,
  onSkipReminder,
  onDismissReminder,
  currentIntervention,
  onCompleteIntervention,
  onDismissIntervention,
  onRespondIntervention,
  recoveryTriggered,
  recoveryPrompt,
  recoveryEscalationLevel,
  recoveryConsecutiveIgnores,
  onCompleteRecovery,
  onDismissRecovery,
  investmentMilestone,
  onDismissInvestmentMilestone,
  achievementEvent,
  onDismissAchievement,
  levelUpEvent,
  onDismissLevelUp,
}: OrchestratedModalsProps) {
  const { showModal, dismissModal, hasModalFromSource } = useModalOrchestrator();

  // Track modal IDs to prevent duplicate registrations
  const modalIds = useRef<Record<string, string | null>>({
    reminder: null,
    intervention: null,
    recovery: null,
    milestone: null,
    achievement: null,
    levelUp: null,
  });

  // Recovery prompt (CRITICAL priority)
  useEffect(() => {
    if (recoveryTriggered && recoveryPrompt && !hasModalFromSource('recovery')) {
      const id = showModal({
        priority: 'critical',
        source: 'recovery',
        component: (
          <RecoveryPrompt
            prompt={recoveryPrompt}
            escalationLevel={recoveryEscalationLevel}
            consecutiveIgnores={recoveryConsecutiveIgnores}
            onComplete={onCompleteRecovery}
            onDismiss={onDismissRecovery}
          />
        ),
        onDismiss: onDismissRecovery,
      });
      modalIds.current.recovery = id;
    } else if (!recoveryTriggered && modalIds.current.recovery) {
      dismissModal(modalIds.current.recovery);
      modalIds.current.recovery = null;
    }
  }, [recoveryTriggered, recoveryPrompt, recoveryEscalationLevel, recoveryConsecutiveIgnores]);

  // Handler intervention (HIGH priority)
  useEffect(() => {
    if (currentIntervention && !hasModalFromSource('intervention')) {
      const id = showModal({
        priority: 'high',
        source: 'intervention',
        component: (
          <InterventionNotification
            intervention={currentIntervention}
            onComplete={onCompleteIntervention}
            onDismiss={onDismissIntervention}
            onResponse={onRespondIntervention}
          />
        ),
        onDismiss: onDismissIntervention,
      });
      modalIds.current.intervention = id;
    } else if (!currentIntervention && modalIds.current.intervention) {
      dismissModal(modalIds.current.intervention);
      modalIds.current.intervention = null;
    }
  }, [currentIntervention]);

  // Reminder modal (MEDIUM priority)
  useEffect(() => {
    if (currentReminder && !hasModalFromSource('reminder')) {
      const id = showModal({
        priority: 'medium',
        source: 'reminder',
        component: (
          <ReminderModal
            reminder={currentReminder}
            onRespond={onRespondReminder}
            onSkip={onSkipReminder}
            onDismiss={onDismissReminder}
          />
        ),
        onDismiss: onDismissReminder,
        autoDismissMs: 60000, // Auto-dismiss after 1 minute
      });
      modalIds.current.reminder = id;
    } else if (!currentReminder && modalIds.current.reminder) {
      dismissModal(modalIds.current.reminder);
      modalIds.current.reminder = null;
    }
  }, [currentReminder]);

  // Investment milestone (MEDIUM priority)
  useEffect(() => {
    if (investmentMilestone && !hasModalFromSource('milestone')) {
      const id = showModal({
        priority: 'medium',
        source: 'milestone',
        component: (
          <InvestmentMilestoneModal
            milestone={investmentMilestone}
            onDismiss={onDismissInvestmentMilestone}
          />
        ),
        onDismiss: onDismissInvestmentMilestone,
        dismissOnBackdrop: true,
      });
      modalIds.current.milestone = id;
    } else if (!investmentMilestone && modalIds.current.milestone) {
      dismissModal(modalIds.current.milestone);
      modalIds.current.milestone = null;
    }
  }, [investmentMilestone]);

  // Achievement unlocked (MEDIUM priority)
  useEffect(() => {
    if (achievementEvent && !hasModalFromSource('achievement')) {
      const id = showModal({
        priority: 'medium',
        source: 'achievement',
        component: (
          <AchievementModal
            achievement={achievementEvent.achievement}
            pointsAwarded={achievementEvent.pointsAwarded}
            onDismiss={onDismissAchievement}
          />
        ),
        onDismiss: onDismissAchievement,
        dismissOnBackdrop: true,
        autoDismissMs: 8000,
      });
      modalIds.current.achievement = id;
    } else if (!achievementEvent && modalIds.current.achievement) {
      dismissModal(modalIds.current.achievement);
      modalIds.current.achievement = null;
    }
  }, [achievementEvent]);

  // Level up (MEDIUM priority)
  useEffect(() => {
    if (levelUpEvent && !hasModalFromSource('levelUp')) {
      const id = showModal({
        priority: 'medium',
        source: 'levelUp',
        component: (
          <RewardLevelUpModal
            newLevel={levelUpEvent.to}
            newTitle={levelUpEvent.newTitle}
            onDismiss={onDismissLevelUp}
          />
        ),
        onDismiss: onDismissLevelUp,
        dismissOnBackdrop: true,
        autoDismissMs: 8000,
      });
      modalIds.current.levelUp = id;
    } else if (!levelUpEvent && modalIds.current.levelUp) {
      dismissModal(modalIds.current.levelUp);
      modalIds.current.levelUp = null;
    }
  }, [levelUpEvent]);
}
