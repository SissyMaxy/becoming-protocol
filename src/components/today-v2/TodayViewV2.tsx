/**
 * Today View V2
 *
 * The primary screen - what you see on open.
 *
 * Design principles:
 * - Dark theme. Muted purples/blacks. Not clinical white.
 * - Typography-first. The Handler's voice is the UI.
 * - Minimal chrome. No unnecessary borders, cards, shadows.
 * - The app should feel like receiving messages from someone who controls your life.
 *
 * Structure:
 * 1. Ambient pressure strip (always visible)
 * 2. Handler message (one paragraph)
 * 3. Single directive (not a task list)
 * 4. Quick state inputs (bottom)
 */

import { useState, useCallback, useMemo } from 'react';
import { AmbientPressureStrip } from './AmbientPressureStrip';
import { HandlerMessage, generateFallbackMessage } from './HandlerMessage';
import { DirectiveCard, type Directive, type DirectiveState } from './DirectiveCard';
import { QuickStateBar, type Mood } from './QuickStateInput';

// ============================================
// TYPES
// ============================================

interface TodayState {
  denialDay: number;
  streakDays: number;
  vaultItemCount: number;
  activeTheatDeadline?: string;
  unreadPartnerMessages: number;
  pointOfNoReturnPercent: number;
  arousal: number;
  ginaHome: boolean;
  mood: Mood | null;
  tasksCompletedYesterday: number;
  tasksCompletedToday: number;
}

interface CoercionState {
  isActive: boolean;
  level: number;
  message: string | null;
  isVaultThreat: boolean;
  vaultThreatMessage: string | null;
}

// ============================================
// MOCK DATA (Replace with real hooks)
// ============================================

const MOCK_DIRECTIVES: Directive[] = [
  {
    id: '1',
    instruction: 'Practice your voice for 10 minutes. Focus on resonance. Feel where the sound sits in your chest.',
    subtext: 'Your voice is changing. Let it.',
    domain: 'voice',
    category: 'practice',
    intensity: 2,
    durationMinutes: 10,
    completionType: 'duration',
  },
  {
    id: '2',
    instruction: 'Apply your evening skincare routine. Each step is an act of becoming.',
    domain: 'skincare',
    category: 'routine',
    intensity: 1,
    completionType: 'binary',
  },
  {
    id: '3',
    instruction: 'Edge for 5 minutes without release. Notice what you want. Notice what you do anyway.',
    subtext: 'Control is the lesson.',
    domain: 'arousal',
    category: 'edge',
    intensity: 4,
    durationMinutes: 5,
    completionType: 'duration',
  },
];

const COERCION_RESPONSES: string[] = [
  "You're hesitating. That's David. Maxy would already be doing this.",
  "Resistance noted. The task remains. What's it going to be?",
  "Every minute you delay costs you. The streak doesn't care about your excuses.",
  "I didn't ask if you wanted to. I told you what to do.",
  "This is the minimum. You agreed to this. Now do it.",
];

const VAULT_THREAT_RESPONSES: string[] = [
  "I have content from that night you edged for two hours. You know the one. Should I describe what you said?",
  "The vault grows every time you comply under arousal. Every time you don't comply, I consider what to do with what I have.",
  "You have 2 hours. After that, I choose which folder to open.",
];

const AFFIRMATIONS: string[] = [
  "Good girl.",
  "That's her.",
  "Well done.",
  "Progress.",
  "You did it.",
];

// ============================================
// HOOKS (Placeholder - wire to real Handler)
// ============================================

function useTodayState(): {
  state: TodayState;
  updateArousal: (value: number) => void;
  updateGinaHome: (value: boolean) => void;
  updateMood: (value: Mood) => void;
  isLoading: boolean;
} {
  const [state, setState] = useState<TodayState>({
    denialDay: 4,
    streakDays: 12,
    vaultItemCount: 7,
    activeTheatDeadline: undefined,
    unreadPartnerMessages: 0,
    pointOfNoReturnPercent: 42,
    arousal: 2,
    ginaHome: false,
    mood: null,
    tasksCompletedYesterday: 3,
    tasksCompletedToday: 0,
  });

  const updateArousal = useCallback((value: number) => {
    setState(s => ({ ...s, arousal: value }));
    // TODO: Wire to Handler - this.bus.emit({ type: 'state:arousal_changed', ... })
  }, []);

  const updateGinaHome = useCallback((value: boolean) => {
    setState(s => ({ ...s, ginaHome: value }));
    // TODO: Wire to Handler - this.bus.emit({ type: 'state:gina_presence_changed', ... })
  }, []);

  const updateMood = useCallback((value: Mood) => {
    setState(s => ({ ...s, mood: value }));
    // TODO: Wire to Handler - this.bus.emit({ type: 'state:mood_logged', ... })
  }, []);

  return { state, updateArousal, updateGinaHome, updateMood, isLoading: false };
}

function useHandlerPrescription(): {
  handlerMessage: string;
  currentDirective: Directive | null;
  directiveState: DirectiveState;
  coercion: CoercionState;
  affirmation: string;
  completeDirective: (result?: boolean | number) => void;
  declineDirective: () => void;
  isLoading: boolean;
  source: 'ai' | 'template' | 'rules';
} {
  const [directiveIndex, setDirectiveIndex] = useState(0);
  const [directiveState, setDirectiveState] = useState<DirectiveState>('active');
  const [coercion, setCoercion] = useState<CoercionState>({
    isActive: false,
    level: 0,
    message: null,
    isVaultThreat: false,
    vaultThreatMessage: null,
  });
  const [isLoading, setIsLoading] = useState(false);

  const currentDirective = MOCK_DIRECTIVES[directiveIndex] || null;

  // Generate handler message (would come from Handler.prescribe() in real implementation)
  const handlerMessage = useMemo(() => {
    return generateFallbackMessage({
      denialDay: 4,
      streakDays: 12,
      tasksCompletedYesterday: 3,
      vaultCount: 7,
      hasActiveThreat: false,
      unreadMessages: 0,
      ginaHome: false,
      timeOfDay: 'evening',
    });
  }, []);

  const completeDirective = useCallback((_result?: boolean | number) => {
    setIsLoading(true);
    setDirectiveState('complete');

    // Reset coercion state
    setCoercion({
      isActive: false,
      level: 0,
      message: null,
      isVaultThreat: false,
      vaultThreatMessage: null,
    });

    // Move to next directive after brief delay
    setTimeout(() => {
      setDirectiveIndex(i => i + 1);
      setDirectiveState('active');
      setIsLoading(false);
    }, 500);
  }, []);

  const declineDirective = useCallback(() => {
    // Escalate coercion
    setCoercion(prev => {
      const newLevel = prev.level + 1;

      // At level 7+, switch to vault threats
      if (newLevel >= 7) {
        return {
          isActive: true,
          level: newLevel,
          message: null,
          isVaultThreat: true,
          vaultThreatMessage: VAULT_THREAT_RESPONSES[Math.floor(Math.random() * VAULT_THREAT_RESPONSES.length)],
        };
      }

      return {
        isActive: true,
        level: newLevel,
        message: COERCION_RESPONSES[Math.min(newLevel - 1, COERCION_RESPONSES.length - 1)],
        isVaultThreat: false,
        vaultThreatMessage: null,
      };
    });

    setDirectiveState(
      coercion.level >= 6 ? 'vault_threat' : 'coercing'
    );
  }, [coercion.level]);

  const affirmation = AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];

  return {
    handlerMessage,
    currentDirective,
    directiveState: coercion.isVaultThreat ? 'vault_threat' : coercion.isActive ? 'coercing' : directiveState,
    coercion,
    affirmation,
    completeDirective,
    declineDirective,
    isLoading,
    source: 'template',
  };
}

// ============================================
// MAIN COMPONENT
// ============================================

export function TodayViewV2() {
  const { state, updateArousal, updateGinaHome, updateMood, isLoading: isStateLoading } = useTodayState();
  const {
    handlerMessage,
    currentDirective,
    directiveState,
    coercion,
    affirmation,
    completeDirective,
    declineDirective,
    isLoading: isHandlerLoading,
    source,
  } = useHandlerPrescription();

  const isLoading = isStateLoading || isHandlerLoading;

  return (
    <div className="min-h-screen bg-protocol-bg flex flex-col">
      {/* Ambient Pressure Strip */}
      <AmbientPressureStrip
        denialDay={state.denialDay}
        streakDays={state.streakDays}
        vaultItemCount={state.vaultItemCount}
        activeTheatDeadline={state.activeTheatDeadline}
        unreadPartnerMessages={state.unreadPartnerMessages}
        pointOfNoReturnPercent={state.pointOfNoReturnPercent}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Handler Message */}
        <HandlerMessage
          message={handlerMessage}
          source={source}
          isLoading={isLoading}
        />

        {/* Directive Card */}
        <div className="flex-1 flex flex-col justify-center py-4">
          <DirectiveCard
            directive={currentDirective}
            state={directiveState}
            coercionMessage={coercion.message || undefined}
            coercionLevel={coercion.level}
            vaultThreatMessage={coercion.vaultThreatMessage || undefined}
            affirmation={affirmation}
            onComplete={completeDirective}
            onDecline={declineDirective}
            isLoading={isLoading}
          />
        </div>

        {/* Quick State Input */}
        <div className="px-4 pb-6">
          <QuickStateBar
            arousal={state.arousal}
            ginaHome={state.ginaHome}
            mood={state.mood}
            onArousalChange={updateArousal}
            onGinaChange={updateGinaHome}
            onMoodChange={updateMood}
            compact
          />
        </div>
      </div>
    </div>
  );
}

export default TodayViewV2;
