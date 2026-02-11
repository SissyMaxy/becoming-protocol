// Events Context
// Manages transient event state (level ups, milestones, etc.)
// Split from ProtocolContext to reduce re-renders

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { Domain } from '../types';
import type { InvestmentMilestoneEvent } from '../types/investments';

// Event types
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

interface ReinforcementEvent {
  type: 'surprise_celebration' | 'hidden_unlock' | 'bonus_insight' | 'mystery_challenge' | 'easter_egg' | 'callback_reference';
  content: Record<string, unknown>;
}

interface UnaskedQuestionEvent {
  shouldShow: boolean;
}

interface NameQuestionEvent {
  shouldShow: boolean;
}

// Context type
interface EventsContextType {
  // Events
  levelUpEvent: LevelUpEvent | null;
  phaseUpEvent: PhaseUpEvent | null;
  streakMilestone: number | null;
  reinforcementEvent: ReinforcementEvent | null;
  unaskedQuestion: UnaskedQuestionEvent | null;
  nameQuestion: NameQuestionEvent | null;
  investmentMilestone: InvestmentMilestoneEvent | null;

  // Setters (for use by other contexts)
  setLevelUpEvent: (event: LevelUpEvent | null) => void;
  setPhaseUpEvent: (event: PhaseUpEvent | null) => void;
  setStreakMilestone: (milestone: number | null) => void;
  setReinforcementEvent: (event: ReinforcementEvent | null) => void;
  setUnaskedQuestion: (event: UnaskedQuestionEvent | null) => void;
  setNameQuestion: (event: NameQuestionEvent | null) => void;
  setInvestmentMilestone: (event: InvestmentMilestoneEvent | null) => void;

  // Dismissal handlers
  dismissLevelUp: () => void;
  dismissPhaseUp: () => void;
  dismissStreakMilestone: () => void;
  dismissReinforcement: () => void;
  dismissUnaskedQuestion: () => void;
  dismissNameQuestion: () => void;
  dismissInvestmentMilestone: () => void;
}

const EventsContext = createContext<EventsContextType | undefined>(undefined);

export function EventsProvider({ children }: { children: ReactNode }) {
  // Event state
  const [levelUpEvent, setLevelUpEvent] = useState<LevelUpEvent | null>(null);
  const [phaseUpEvent, setPhaseUpEvent] = useState<PhaseUpEvent | null>(null);
  const [streakMilestone, setStreakMilestone] = useState<number | null>(null);
  const [reinforcementEvent, setReinforcementEvent] = useState<ReinforcementEvent | null>(null);
  const [unaskedQuestion, setUnaskedQuestion] = useState<UnaskedQuestionEvent | null>(null);
  const [nameQuestion, setNameQuestion] = useState<NameQuestionEvent | null>(null);
  const [investmentMilestone, setInvestmentMilestone] = useState<InvestmentMilestoneEvent | null>(null);

  // Dismissal handlers - memoized
  const dismissLevelUp = useCallback(() => setLevelUpEvent(null), []);
  const dismissPhaseUp = useCallback(() => setPhaseUpEvent(null), []);
  const dismissStreakMilestone = useCallback(() => setStreakMilestone(null), []);
  const dismissReinforcement = useCallback(() => setReinforcementEvent(null), []);
  const dismissUnaskedQuestion = useCallback(() => setUnaskedQuestion(null), []);
  const dismissNameQuestion = useCallback(() => setNameQuestion(null), []);
  const dismissInvestmentMilestone = useCallback(() => setInvestmentMilestone(null), []);

  const value: EventsContextType = {
    // Events
    levelUpEvent,
    phaseUpEvent,
    streakMilestone,
    reinforcementEvent,
    unaskedQuestion,
    nameQuestion,
    investmentMilestone,

    // Setters
    setLevelUpEvent,
    setPhaseUpEvent,
    setStreakMilestone,
    setReinforcementEvent,
    setUnaskedQuestion,
    setNameQuestion,
    setInvestmentMilestone,

    // Dismissals
    dismissLevelUp,
    dismissPhaseUp,
    dismissStreakMilestone,
    dismissReinforcement,
    dismissUnaskedQuestion,
    dismissNameQuestion,
    dismissInvestmentMilestone,
  };

  return (
    <EventsContext.Provider value={value}>
      {children}
    </EventsContext.Provider>
  );
}

export function useEvents(): EventsContextType {
  const context = useContext(EventsContext);
  if (context === undefined) {
    throw new Error('useEvents must be used within an EventsProvider');
  }
  return context;
}

// Selective hooks for components that only need specific events
export function useLevelUpEvent() {
  const { levelUpEvent, dismissLevelUp } = useEvents();
  return { levelUpEvent, dismissLevelUp };
}

export function usePhaseUpEvent() {
  const { phaseUpEvent, dismissPhaseUp } = useEvents();
  return { phaseUpEvent, dismissPhaseUp };
}

export function useStreakMilestone() {
  const { streakMilestone, dismissStreakMilestone } = useEvents();
  return { streakMilestone, dismissStreakMilestone };
}
