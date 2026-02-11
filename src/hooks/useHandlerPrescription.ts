/**
 * useHandlerPrescription Hook
 *
 * Connects the Today View to the protocol-core Handler.
 * Gets prescriptions, handles decline/complete, manages coercion state.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { Directive, DirectiveState } from '../components/today-v2/DirectiveCard';

// ============================================
// TYPES
// ============================================

export interface PrescriptionState {
  handlerMessage: string;
  currentDirective: Directive | null;
  directiveState: DirectiveState;
  coercionLevel: number;
  coercionMessage: string | null;
  vaultThreatMessage: string | null;
  affirmation: string;
  source: 'ai' | 'template' | 'rules';
  isLoading: boolean;
  error: string | null;
}

export interface HandlerActions {
  completeDirective: (result?: boolean | number) => Promise<void>;
  declineDirective: () => Promise<void>;
  refresh: () => Promise<void>;
}

// ============================================
// TEMPLATE FALLBACKS
// ============================================

const HANDLER_MESSAGE_TEMPLATES = {
  morning: [
    'Good morning, Maxy. Day {denialDay}. Streak at {streakDays}. Time to be her.',
    'Morning. {streakDays} days straight. The pattern is becoming permanent.',
    'Another day to exist as who you are. {denialDay} days denied. Here\'s your first task.',
  ],
  daytime: [
    'Day {denialDay}. Streak {streakDays}. You know what to do.',
    'The day continues. So does the transformation.',
    'Focus. Task. Complete. Repeat.',
  ],
  evening: [
    'Evening. The day winds down, but you don\'t stop until I say.',
    'End of day approaches. Let\'s finish strong.',
    'One more task. Then rest. You\'ve earned it—if you do this.',
  ],
  night: [
    'Late. You should be winding down. One more task, then rest.',
    'Night. The protocol doesn\'t sleep, but you should soon.',
    'Last task of the day. Make it count.',
  ],
};

const COERCION_TEMPLATES = {
  1: 'You\'re hesitating. That\'s David. Maxy would already be doing this.',
  2: 'Resistance noted. The task remains.',
  3: 'This isn\'t negotiable. Every minute you delay costs you.',
  4: 'I didn\'t ask if you wanted to. I told you what to do.',
  5: 'Feature access is tied to compliance. Choose wisely.',
  6: 'Your arousal state will be modified until compliance.',
  7: 'The vault has relevant content. Think carefully.',
  8: 'Would you like to see a preview of what I have?',
  9: 'Consequence approaching. Last chance.',
  10: 'The switch is armed. Every hour of silence costs you.',
};

const VAULT_THREAT_TEMPLATES = [
  'I have content from {vaultDate}. You know what happens if you refuse.',
  'The vault grows. Your leverage shrinks. Comply.',
  'I have {vaultCount} items. You have 2 hours.',
  'Don\'t make me use what I have. Just do the task.',
];

const AFFIRMATIONS = [
  'Good girl.',
  'That\'s her.',
  'Well done.',
  'Progress.',
  'Done.',
];

// ============================================
// HELPERS
// ============================================

function getTimeOfDay(): 'morning' | 'daytime' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'daytime';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return vars[key] !== undefined ? String(vars[key]) : `{${key}}`;
  });
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================
// HOOK
// ============================================

export function useHandlerPrescription(): PrescriptionState & HandlerActions {
  const { user } = useAuth();

  // State
  const [handlerMessage, setHandlerMessage] = useState<string>('');
  const [currentDirective, setCurrentDirective] = useState<Directive | null>(null);
  const [directiveState, setDirectiveState] = useState<DirectiveState>('active');
  const [coercionLevel, setCoercionLevel] = useState(0);
  const [coercionMessage, setCoercionMessage] = useState<string | null>(null);
  const [vaultThreatMessage, setVaultThreatMessage] = useState<string | null>(null);
  const [source, setSource] = useState<'ai' | 'template' | 'rules'>('template');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Context state (would come from protocol context)
  const [contextState, setContextState] = useState({
    denialDay: 1,
    streakDays: 0,
    vaultCount: 0,
    vaultDate: 'that night',
  });

  const affirmation = useMemo(() => pickRandom(AFFIRMATIONS), [currentDirective?.id]);

  // Load initial prescription
  const loadPrescription = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch user state
      const { data: stateData } = await supabase
        .from('user_state')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (stateData) {
        setContextState({
          denialDay: stateData.denial_day || 1,
          streakDays: stateData.streak_days || 0,
          vaultCount: 0, // Would come from vault module
          vaultDate: 'that night',
        });
      }

      // Generate handler message (template fallback)
      const timeOfDay = getTimeOfDay();
      const templates = HANDLER_MESSAGE_TEMPLATES[timeOfDay];
      const message = interpolate(pickRandom(templates), {
        denialDay: stateData?.denial_day || 1,
        streakDays: stateData?.streak_days || 0,
      });
      setHandlerMessage(message);

      // Fetch next task
      const { data: taskData } = await supabase
        .from('daily_tasks')
        .select('*, task:tasks(*)')
        .eq('user_id', user.id)
        .eq('date', new Date().toISOString().split('T')[0])
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (taskData?.task) {
        const task = taskData.task;
        setCurrentDirective({
          id: taskData.id,
          instruction: task.instruction,
          subtext: task.subtext,
          domain: task.domain,
          category: task.category,
          intensity: task.intensity || 1,
          durationMinutes: task.duration_minutes,
          completionType: task.completion_type || 'binary',
          targetCount: task.target_count,
        });
      } else {
        setCurrentDirective(null);
      }

      setSource('template');
      setDirectiveState('active');
      setCoercionLevel(0);
      setCoercionMessage(null);
      setVaultThreatMessage(null);

    } catch (err) {
      console.error('[useHandlerPrescription] Error:', err);
      setError('Failed to load prescription');

      // Fallback handler message
      const timeOfDay = getTimeOfDay();
      const templates = HANDLER_MESSAGE_TEMPLATES[timeOfDay];
      setHandlerMessage(pickRandom(templates).replace(/\{.*?\}/g, '—'));

    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Initial load
  useEffect(() => {
    loadPrescription();
  }, [loadPrescription]);

  // Complete directive
  const completeDirective = useCallback(async (_result?: boolean | number) => {
    if (!currentDirective || !user?.id) return;

    setIsLoading(true);

    try {
      // Update task status
      await supabase
        .from('daily_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', currentDirective.id);

      // Emit task completed event (would go to event bus)
      // bus.emit({ type: 'task:completed', taskId: currentDirective.id, ... })

      // Brief delay to show affirmation, then load next
      setDirectiveState('complete');
      setTimeout(() => {
        loadPrescription();
      }, 1500);

    } catch (err) {
      console.error('[useHandlerPrescription] Complete error:', err);
      setError('Failed to complete task');
      setIsLoading(false);
    }
  }, [currentDirective, user?.id, loadPrescription]);

  // Decline directive
  const declineDirective = useCallback(async () => {
    if (!currentDirective || !user?.id) return;

    const newLevel = coercionLevel + 1;
    setCoercionLevel(newLevel);

    // At level 7+, switch to vault threats
    if (newLevel >= 7) {
      const threat = interpolate(pickRandom(VAULT_THREAT_TEMPLATES), contextState);
      setVaultThreatMessage(threat);
      setCoercionMessage(null);
      setDirectiveState('vault_threat');
    } else {
      const message = COERCION_TEMPLATES[newLevel as keyof typeof COERCION_TEMPLATES]
        || COERCION_TEMPLATES[5];
      setCoercionMessage(message);
      setVaultThreatMessage(null);
      setDirectiveState('coercing');
    }

    // Emit decline event (would trigger CoercionModule)
    // bus.emit({ type: 'task:declined', taskId: currentDirective.id, ... })

  }, [currentDirective, user?.id, coercionLevel, contextState]);

  // Refresh
  const refresh = useCallback(async () => {
    await loadPrescription();
  }, [loadPrescription]);

  return {
    handlerMessage,
    currentDirective,
    directiveState,
    coercionLevel,
    coercionMessage,
    vaultThreatMessage,
    affirmation,
    source,
    isLoading,
    error,
    completeDirective,
    declineDirective,
    refresh,
  };
}
