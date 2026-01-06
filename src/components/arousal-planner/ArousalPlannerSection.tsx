/**
 * Arousal Planner Section
 * Main container for arousal planning in TodayView
 */

import { useState, useEffect } from 'react';
import { Flame, ChevronDown, ChevronUp } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useArousalPlanner } from '../../hooks/useArousalPlanner';
import { useArousalState } from '../../hooks/useArousalState';
import { DailyPlanHeader } from './DailyPlanHeader';
import { ScheduledSessionCard } from './ScheduledSessionCard';
import { CheckInCard } from './CheckInCard';
import { CheckInModal } from './CheckInModal';
import { MilestoneTracker } from './MilestoneTracker';
import { NextUpBanner } from './NextUpBanner';
import { GeneratePlanButton } from './GeneratePlanButton';
import type { ArousalState, PhysicalSign } from '../../types/arousal';
import type { PrescriptionContext, ArousalCheckIn, PlannedEdgeSession } from '../../types/arousal-planner';

interface ArousalPlannerSectionProps {
  isLocked?: boolean;
  chastityHoursToday?: number;
}

export function ArousalPlannerSection({
  isLocked = false,
  chastityHoursToday = 0,
}: ArousalPlannerSectionProps) {
  const { isBambiMode } = useBambiMode();
  const { currentState, metrics } = useArousalState();
  const {
    todaysPlan,
    nextScheduledItem,
    nextItemType,
    isLoading,
    prescriptionPreview,
    generatePlan,
    previewPrescription,
    startSession,
    completeSession,
    skipSession,
    submitCheckIn,
    completeMilestone,
  } = useArousalPlanner();

  // Local state
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeCheckIn, setActiveCheckIn] = useState<ArousalCheckIn | null>(null);
  const [startingSessionId, setStartingSessionId] = useState<string | null>(null);
  const [completingSessionId, setCompletingSessionId] = useState<string | null>(null);
  const [skippingSessionId, setSkippingSessionId] = useState<string | null>(null);
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Build prescription context
  const denialDays = metrics?.currentStreakDays || 0;
  const context: PrescriptionContext = {
    userId: '',
    currentState,
    denialDays,
    isChastityLocked: isLocked,
    chastityHoursToday,
    recentEdgeSessions: [],
    recentCheckIns: [],
    optimalMinDays: metrics?.optimalMinDays || 5,
    optimalMaxDays: metrics?.optimalMaxDays || 14,
    averageSweetSpotEntryDay: metrics?.averageSweetSpotEntryDay || 5,
  };

  // Generate preview on mount if no plan exists
  useEffect(() => {
    if (!todaysPlan && !isLoading) {
      previewPrescription(context);
    }
  }, [todaysPlan, isLoading]);

  // Handlers
  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    try {
      await generatePlan(context);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartSession = async (sessionId: string) => {
    setStartingSessionId(sessionId);
    try {
      await startSession(sessionId);
    } finally {
      setStartingSessionId(null);
    }
  };

  const handleCompleteSession = async (session: PlannedEdgeSession) => {
    // For now, use target values as actual values
    // In production, this would open a completion modal
    setCompletingSessionId(session.id);
    try {
      await completeSession(
        session.id,
        session.targetEdges,
        session.targetDurationMinutes,
        currentState,
        4 // Default satisfaction
      );
    } finally {
      setCompletingSessionId(null);
    }
  };

  const handleSkipSession = async (sessionId: string) => {
    setSkippingSessionId(sessionId);
    try {
      await skipSession(sessionId);
    } finally {
      setSkippingSessionId(null);
    }
  };

  const handleSubmitCheckIn = async (
    arousalLevel: number,
    stateReported: ArousalState,
    achingIntensity?: number,
    physicalSigns?: PhysicalSign[],
    notes?: string
  ) => {
    if (!activeCheckIn) return;

    setIsSubmittingCheckIn(true);
    try {
      await submitCheckIn(
        activeCheckIn.id,
        arousalLevel,
        stateReported,
        achingIntensity,
        physicalSigns,
        notes
      );
      setActiveCheckIn(null);
    } finally {
      setIsSubmittingCheckIn(false);
    }
  };

  // If no plan yet, show generate button
  if (!todaysPlan) {
    return (
      <div className="mb-6">
        <GeneratePlanButton
          onGenerate={handleGeneratePlan}
          preview={prescriptionPreview}
          isGenerating={isGenerating}
        />
      </div>
    );
  }

  // Get pending/completed items
  const pendingSessions = todaysPlan.sessions.filter(
    s => s.status === 'scheduled' || s.status === 'started'
  );
  const completedSessions = todaysPlan.sessions.filter(s => s.status === 'completed');
  const pendingCheckIns = todaysPlan.checkIns.filter(c => c.status === 'scheduled');
  const completedCheckIns = todaysPlan.checkIns.filter(c => c.status === 'completed');

  return (
    <div className="mb-6 space-y-4">
      {/* Section header with collapse toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between px-4 py-2 rounded-lg ${
          isBambiMode ? 'hover:bg-pink-50' : 'hover:bg-protocol-surface'
        }`}
      >
        <div className="flex items-center gap-2">
          <Flame className={`w-5 h-5 ${isBambiMode ? 'text-purple-500' : 'text-purple-400'}`} />
          <span className={`font-semibold ${
            isBambiMode ? 'text-gray-800' : 'text-protocol-text'
          }`}>
            Arousal Plan
          </span>
          <span className={`text-sm ${
            isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
          }`}>
            ({todaysPlan.overallProgress}%)
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className={`w-5 h-5 ${isBambiMode ? 'text-gray-400' : 'text-gray-500'}`} />
        ) : (
          <ChevronDown className={`w-5 h-5 ${isBambiMode ? 'text-gray-400' : 'text-gray-500'}`} />
        )}
      </button>

      {isExpanded && (
        <>
          {/* Plan header */}
          <DailyPlanHeader
            planIntensity={todaysPlan.plan.planIntensity}
            denialDay={todaysPlan.plan.denialDayAtGeneration}
            isLocked={todaysPlan.plan.chastityLockedAtGeneration}
            totalEdges={todaysPlan.plan.totalTargetEdges}
            totalMinutes={todaysPlan.plan.totalTargetDurationMinutes}
            completionPercentage={todaysPlan.overallProgress}
          />

          {/* Next up banner */}
          {nextScheduledItem && (
            <NextUpBanner
              nextItem={nextScheduledItem}
              nextItemType={nextItemType}
              onStartSession={
                nextItemType === 'session'
                  ? () => handleStartSession((nextScheduledItem as PlannedEdgeSession).id)
                  : undefined
              }
              onOpenCheckIn={
                nextItemType === 'check_in'
                  ? () => setActiveCheckIn(nextScheduledItem as ArousalCheckIn)
                  : undefined
              }
            />
          )}

          {/* Milestones */}
          {todaysPlan.milestones.length > 0 && (
            <MilestoneTracker
              milestones={todaysPlan.milestones}
              onAchieve={completeMilestone}
            />
          )}

          {/* Pending sessions */}
          {pendingSessions.length > 0 && (
            <div className="space-y-3">
              <p className={`text-xs uppercase tracking-wider font-semibold px-1 ${
                isBambiMode ? 'text-purple-500' : 'text-purple-400'
              }`}>
                Scheduled Sessions ({pendingSessions.length})
              </p>
              {pendingSessions.map((session) => (
                <ScheduledSessionCard
                  key={session.id}
                  session={session}
                  onStart={() => handleStartSession(session.id)}
                  onComplete={() => handleCompleteSession(session)}
                  onSkip={() => handleSkipSession(session.id)}
                  isStarting={startingSessionId === session.id}
                  isCompleting={completingSessionId === session.id}
                  isSkipping={skippingSessionId === session.id}
                  isNext={nextItemType === 'session' && nextScheduledItem?.id === session.id}
                />
              ))}
            </div>
          )}

          {/* Pending check-ins */}
          {pendingCheckIns.length > 0 && (
            <div className="space-y-2">
              <p className={`text-xs uppercase tracking-wider font-semibold px-1 ${
                isBambiMode ? 'text-blue-500' : 'text-blue-400'
              }`}>
                Scheduled Check-Ins ({pendingCheckIns.length})
              </p>
              {pendingCheckIns.map((checkIn) => (
                <CheckInCard
                  key={checkIn.id}
                  checkIn={checkIn}
                  onOpenModal={() => setActiveCheckIn(checkIn)}
                  isNext={nextItemType === 'check_in' && nextScheduledItem?.id === checkIn.id}
                />
              ))}
            </div>
          )}

          {/* Completed sessions */}
          {completedSessions.length > 0 && (
            <div className="space-y-3">
              <p className={`text-xs uppercase tracking-wider font-semibold px-1 ${
                isBambiMode ? 'text-green-500' : 'text-green-400'
              }`}>
                Completed Sessions ({completedSessions.length})
              </p>
              {completedSessions.map((session) => (
                <ScheduledSessionCard
                  key={session.id}
                  session={session}
                  onStart={() => {}}
                  onComplete={() => {}}
                  onSkip={() => {}}
                />
              ))}
            </div>
          )}

          {/* Completed check-ins */}
          {completedCheckIns.length > 0 && (
            <div className="space-y-2">
              <p className={`text-xs uppercase tracking-wider font-semibold px-1 ${
                isBambiMode ? 'text-green-500' : 'text-green-400'
              }`}>
                Completed Check-Ins ({completedCheckIns.length})
              </p>
              {completedCheckIns.map((checkIn) => (
                <CheckInCard
                  key={checkIn.id}
                  checkIn={checkIn}
                  onOpenModal={() => {}}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Check-in modal */}
      {activeCheckIn && (
        <CheckInModal
          checkInType={activeCheckIn.checkInType}
          onSubmit={handleSubmitCheckIn}
          onClose={() => setActiveCheckIn(null)}
          isSubmitting={isSubmittingCheckIn}
        />
      )}
    </div>
  );
}
