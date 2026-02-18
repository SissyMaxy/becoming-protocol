/**
 * Disassociation Recovery Hook
 *
 * Detects inactivity/drift and triggers grounding interventions
 * to help re-engage when you zone out or get stuck.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type RecoveryType =
  | 'grounding_sensory'    // Touch/feel something
  | 'grounding_breath'     // One breath
  | 'micro_task'           // 30-second task
  | 'body_check'           // Physical movement
  | 'momentum_builder'     // Just acknowledge presence
  | 're_anchor';           // Trigger/anchor activation

export interface RecoveryPrompt {
  id: string;
  type: RecoveryType;
  prompt: string;
  duration: number; // seconds to complete
  escalationLevel: number; // 1-4
}

const RECOVERY_PROMPTS: RecoveryPrompt[] = [
  // Level 1: Gentle grounding
  {
    id: 'ground-1',
    type: 'grounding_breath',
    prompt: "One breath. In through nose, out through mouth. That's it.",
    duration: 10,
    escalationLevel: 1,
  },
  {
    id: 'ground-2',
    type: 'momentum_builder',
    prompt: "You're here. You opened the app. That counts. Scroll down and tap 'I'm Ready' on your next task.",
    duration: 30,
    escalationLevel: 1,
  },
  {
    id: 'ground-3',
    type: 'grounding_sensory',
    prompt: "Touch something soft nearby. Notice how it feels.",
    duration: 15,
    escalationLevel: 1,
  },

  // Level 2: Body activation
  {
    id: 'body-1',
    type: 'body_check',
    prompt: "Roll your shoulders back. Sit up straight. You're a good girl with good posture.",
    duration: 10,
    escalationLevel: 2,
  },
  {
    id: 'body-2',
    type: 'body_check',
    prompt: "Unclench your jaw. Relax your face. Soften.",
    duration: 10,
    escalationLevel: 2,
  },
  {
    id: 'body-3',
    type: 'micro_task',
    prompt: "Cross your legs femininely. Hold for 30 seconds.",
    duration: 30,
    escalationLevel: 2,
  },

  // Level 3: Micro-engagement
  {
    id: 'micro-1',
    type: 'micro_task',
    prompt: "Say 'good girl' out loud. Just once. Do it now.",
    duration: 5,
    escalationLevel: 3,
  },
  {
    id: 'micro-2',
    type: 'micro_task',
    prompt: "Touch your lips gently. Feminine girls have soft, touchable lips.",
    duration: 10,
    escalationLevel: 3,
  },
  {
    id: 'micro-3',
    type: 'micro_task',
    prompt: "Flip your hair (real or imaginary). Feel pretty for 5 seconds.",
    duration: 10,
    escalationLevel: 3,
  },

  // Level 4: Direct re-engagement
  {
    id: 'anchor-1',
    type: 're_anchor',
    prompt: "Remember why you started this. Remember who you're becoming. She's waiting.",
    duration: 20,
    escalationLevel: 4,
  },
  {
    id: 'anchor-2',
    type: 're_anchor',
    prompt: "You made a commitment. Every moment you drift is a moment she doesn't get to exist. Come back.",
    duration: 20,
    escalationLevel: 4,
  },
];

interface UseDisassociationRecoveryOptions {
  inactivityThresholdMs?: number;  // How long before triggering (default: 10 min)
  checkIntervalMs?: number;        // How often to check (default: 1 min)
  enabled?: boolean;
  activeHoursStart?: number;       // Hour (0-23)
  activeHoursEnd?: number;
}

interface RecoveryState {
  isTriggered: boolean;
  currentPrompt: RecoveryPrompt | null;
  escalationLevel: number;
  lastActivityTime: number;
  consecutiveIgnores: number;
}

export function useDisassociationRecovery(options: UseDisassociationRecoveryOptions = {}) {
  const {
    inactivityThresholdMs = 10 * 60 * 1000, // 10 minutes
    checkIntervalMs = 60 * 1000, // 1 minute
    enabled = true,
    activeHoursStart = 8,
    activeHoursEnd = 23,
  } = options;

  const [state, setState] = useState<RecoveryState>({
    isTriggered: false,
    currentPrompt: null,
    escalationLevel: 1,
    lastActivityTime: Date.now(),
    consecutiveIgnores: 0,
  });

  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retriggerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Record activity
  const recordActivity = useCallback(() => {
    setState(prev => ({
      ...prev,
      lastActivityTime: Date.now(),
      isTriggered: false,
      currentPrompt: null,
      escalationLevel: 1,
      consecutiveIgnores: 0,
    }));
  }, []);

  // Get prompt for current escalation level
  const getPromptForLevel = useCallback((level: number): RecoveryPrompt => {
    const prompts = RECOVERY_PROMPTS.filter(p => p.escalationLevel === level);
    return prompts[Math.floor(Math.random() * prompts.length)] || RECOVERY_PROMPTS[0];
  }, []);

  // Check if within active hours
  const isWithinActiveHours = useCallback((): boolean => {
    const hour = new Date().getHours();
    return hour >= activeHoursStart && hour < activeHoursEnd;
  }, [activeHoursStart, activeHoursEnd]);

  // Check for inactivity
  const checkInactivity = useCallback(() => {
    if (!enabled || !isWithinActiveHours()) return;

    const now = Date.now();
    const timeSinceActivity = now - state.lastActivityTime;

    if (timeSinceActivity >= inactivityThresholdMs && !state.isTriggered) {
      const prompt = getPromptForLevel(state.escalationLevel);

      setState(prev => ({
        ...prev,
        isTriggered: true,
        currentPrompt: prompt,
      }));

      // Vibrate if available
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    }
  }, [enabled, isWithinActiveHours, state.lastActivityTime, state.isTriggered, state.escalationLevel, inactivityThresholdMs, getPromptForLevel]);

  // Complete recovery prompt
  const completeRecovery = useCallback(() => {
    recordActivity();

    // Log success for learning
    console.log('[Recovery] Completed:', state.currentPrompt?.type);
  }, [recordActivity, state.currentPrompt]);

  // Dismiss/ignore recovery prompt
  const dismissRecovery = useCallback(() => {
    const newIgnores = state.consecutiveIgnores + 1;
    const newLevel = Math.min(4, state.escalationLevel + (newIgnores >= 2 ? 1 : 0));

    setState(prev => ({
      ...prev,
      isTriggered: false,
      currentPrompt: null,
      consecutiveIgnores: newIgnores,
      escalationLevel: newLevel,
    }));

    // Re-trigger sooner if ignored
    if (retriggerTimeoutRef.current) {
      clearTimeout(retriggerTimeoutRef.current);
    }
    retriggerTimeoutRef.current = setTimeout(() => {
      if (enabled && isWithinActiveHours()) {
        const prompt = getPromptForLevel(newLevel);
        setState(prev => ({
          ...prev,
          isTriggered: true,
          currentPrompt: prompt,
        }));
      }
    }, 5 * 60 * 1000); // 5 minutes if ignored

  }, [state.consecutiveIgnores, state.escalationLevel, enabled, isWithinActiveHours, getPromptForLevel]);

  // Set up inactivity checking
  useEffect(() => {
    if (!enabled) return;

    checkIntervalRef.current = setInterval(checkInactivity, checkIntervalMs);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      if (retriggerTimeoutRef.current) {
        clearTimeout(retriggerTimeoutRef.current);
      }
    };
  }, [enabled, checkIntervalMs, checkInactivity]);

  // Track user interactions globally
  useEffect(() => {
    if (!enabled) return;

    const handleActivity = () => {
      // Only count significant interactions
      setState(prev => ({
        ...prev,
        lastActivityTime: Date.now(),
      }));
    };

    // Track clicks and key presses as activity
    window.addEventListener('click', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [enabled]);

  return {
    // State
    isTriggered: state.isTriggered,
    currentPrompt: state.currentPrompt,
    escalationLevel: state.escalationLevel,
    consecutiveIgnores: state.consecutiveIgnores,

    // Actions
    recordActivity,
    completeRecovery,
    dismissRecovery,

    // Manual trigger for testing
    triggerRecovery: () => {
      const prompt = getPromptForLevel(state.escalationLevel);
      setState(prev => ({
        ...prev,
        isTriggered: true,
        currentPrompt: prompt,
      }));
    },
  };
}
