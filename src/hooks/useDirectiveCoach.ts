// useDirectiveCoach - Hook for Handler Coach API integration
// Fetches personalized coach messages for tasks using the handler-coach edge function

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { generatePrefill, type PrefillContext } from '../lib/prefill-generator';
import { getCurrentTimeOfDay, mapTimeOfDayLateNight } from '../lib/rules-engine-v2';
import type { Task } from '../types/task-bank';

export interface DirectiveState {
  coachMessage: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface UserStateForCoach {
  user_id: string;
  denial_day: number;
  arousal_level: number;
  mood: string;
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'late_night';
  gina_present: boolean;
  streak_days: number;
  avoided_domains?: string[];
  last_task?: string;
}

export function useDirectiveCoach() {
  const [state, setState] = useState<DirectiveState>({
    coachMessage: null,
    isLoading: false,
    error: null,
  });

  /**
   * Fetch a coach message for framing a task
   */
  const fetchTaskFraming = useCallback(async (
    task: Task,
    userState: UserStateForCoach
  ): Promise<string | null> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Build prefill context
      const prefillContext: PrefillContext = {
        denial_day: userState.denial_day,
        arousal_level: userState.arousal_level,
        time_of_day: userState.time_of_day,
        task_category: task.category,
        task_tier: task.intensity,
        mood: userState.mood,
        gina_present: userState.gina_present,
        last_completed_task: userState.last_task || '',
        days_avoiding_domain: 0, // TODO: Calculate from avoided_domains
        streak_days: userState.streak_days,
      };

      const prefill = generatePrefill(prefillContext);

      const { data, error } = await supabase.functions.invoke('handler-coach', {
        body: {
          user_id: userState.user_id,
          request_type: 'task_framing',
          user_state: {
            denial_day: userState.denial_day,
            arousal_level: userState.arousal_level,
            mood: userState.mood,
            time_of_day: userState.time_of_day,
            gina_present: userState.gina_present,
            last_task: userState.last_task,
            streak_days: userState.streak_days,
            avoided_domains: userState.avoided_domains,
          },
          prefill,
          context: {
            task: task.instruction,
            domain: task.domain,
            tier: task.intensity,
          },
        },
      });

      if (error) throw error;

      const message = data.message;
      setState({ coachMessage: message, isLoading: false, error: null });
      return message;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch coach message';
      setState({ coachMessage: null, isLoading: false, error: errorMessage });

      // Return fallback message
      return `Good girl. Here's your next task.`;
    }
  }, []);

  /**
   * Fetch a daily briefing message
   */
  const fetchDailyBriefing = useCallback(async (
    userState: UserStateForCoach,
    context?: {
      had_session_last_night?: boolean;
      last_session_type?: string;
      last_engagement_level?: number;
      last_reflection_text?: string;
      last_goal_text?: string;
    }
  ): Promise<string | null> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const prefillContext: PrefillContext = {
        denial_day: userState.denial_day,
        arousal_level: userState.arousal_level,
        time_of_day: 'morning',
        task_category: 'briefing',
        task_tier: 1,
        mood: userState.mood,
        gina_present: userState.gina_present,
        last_completed_task: userState.last_task || '',
        days_avoiding_domain: 0,
        streak_days: userState.streak_days,
        had_session_last_night: context?.had_session_last_night,
        request_type: 'daily_briefing',
      };

      const prefill = generatePrefill(prefillContext);

      const { data, error } = await supabase.functions.invoke('handler-coach', {
        body: {
          user_id: userState.user_id,
          request_type: 'daily_briefing',
          user_state: {
            denial_day: userState.denial_day,
            arousal_level: userState.arousal_level,
            mood: userState.mood,
            time_of_day: userState.time_of_day,
            gina_present: userState.gina_present,
            last_task: userState.last_task,
            streak_days: userState.streak_days,
            avoided_domains: userState.avoided_domains,
          },
          prefill,
          context,
        },
      });

      if (error) throw error;

      const message = data.message;
      setState({ coachMessage: message, isLoading: false, error: null });
      return message;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch briefing';
      setState({ coachMessage: null, isLoading: false, error: errorMessage });
      return null;
    }
  }, []);

  /**
   * Fetch a check-in message (for various triggers)
   */
  const fetchCheckIn = useCallback(async (
    userState: UserStateForCoach,
    trigger: 'avoidance_pattern' | 'streak_risk' | 'low_mood' | 'general',
    context?: {
      domain?: string;
      days_avoided?: number;
    }
  ): Promise<string | null> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const prefillContext: PrefillContext = {
        denial_day: userState.denial_day,
        arousal_level: userState.arousal_level,
        time_of_day: userState.time_of_day,
        task_category: 'check_in',
        task_tier: 1,
        mood: userState.mood,
        gina_present: userState.gina_present,
        last_completed_task: userState.last_task || '',
        days_avoiding_domain: context?.days_avoided || 0,
        streak_days: userState.streak_days,
        request_type: 'check_in',
      };

      const prefill = generatePrefill(prefillContext);

      const { data, error } = await supabase.functions.invoke('handler-coach', {
        body: {
          user_id: userState.user_id,
          request_type: 'check_in',
          user_state: {
            denial_day: userState.denial_day,
            arousal_level: userState.arousal_level,
            mood: userState.mood,
            time_of_day: userState.time_of_day,
            gina_present: userState.gina_present,
            last_task: userState.last_task,
            streak_days: userState.streak_days,
            avoided_domains: userState.avoided_domains,
          },
          prefill,
          context: {
            trigger,
            ...context,
          },
        },
      });

      if (error) throw error;

      const message = data.message;
      setState({ coachMessage: message, isLoading: false, error: null });
      return message;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch check-in';
      setState({ coachMessage: null, isLoading: false, error: errorMessage });
      return null;
    }
  }, []);

  const clearMessage = useCallback(() => {
    setState({ coachMessage: null, isLoading: false, error: null });
  }, []);

  return {
    ...state,
    fetchTaskFraming,
    fetchDailyBriefing,
    fetchCheckIn,
    clearMessage,
    getTimeOfDay: () => mapTimeOfDayLateNight(getCurrentTimeOfDay()),
  };
}

export default useDirectiveCoach;
