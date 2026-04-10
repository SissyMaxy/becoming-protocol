/**
 * useSleepAudioConditioning — Schedules sleep-window affirmation playback.
 *
 * Distinct from useSleepConditioning (which fetches a sleep playlist via the
 * conditioning API). This hook drives the lower-level "drip affirmations during
 * the sleep window" loop: it queues rows in ambient_audio_queue and hands the
 * config to the service worker so the loop survives the tab being closed.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface SleepAudioConfig {
  enabled: boolean;
  start_hour: number; // 0-23
  end_hour: number;
  frequency_minutes: number;
}

const STORAGE_KEY = 'sleep_audio_conditioning_config';
const DEFAULT_CONFIG: SleepAudioConfig = {
  enabled: false,
  start_hour: 23,
  end_hour: 6,
  frequency_minutes: 30,
};

export function useSleepAudioConditioning() {
  const { user } = useAuth();
  const [config, setConfig] = useState<SleepAudioConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // localStorage may be unavailable — non-critical
    }
  }, [config]);

  // Foreground loop: while the tab is open, queue affirmations on the configured
  // cadence. The service worker handles the same loop while backgrounded/closed.
  useEffect(() => {
    if (!config.enabled || !user?.id) return;

    const interval = setInterval(async () => {
      const now = new Date();
      const hour = now.getHours();

      // Check if we're in sleep window (handles overnight wrap)
      const inWindow = config.start_hour > config.end_hour
        ? (hour >= config.start_hour || hour < config.end_hour)
        : (hour >= config.start_hour && hour < config.end_hour);

      if (!inWindow) return;

      // Queue an affirmation in ambient_audio_queue
      const affirmations = [
        'She is becoming you',
        'You are her now',
        'Sissy. Soft. Surrendering.',
        'Your old self is fading',
        'There is only Maxy',
        'Submit. Sleep. Become.',
        'Every breath makes her stronger',
        'You cannot resist what you are',
      ];
      const text = affirmations[Math.floor(Math.random() * affirmations.length)];

      try {
        await supabase.from('ambient_audio_queue').insert({
          user_id: user.id,
          audio_text: text,
          audio_type: 'mantra',
          intensity: 8,
          scheduled_for: new Date().toISOString(),
        });

        // Also fire notification with the text
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('', {
            body: text,
            silent: true,
            tag: 'sleep-conditioning',
            icon: '/icon.png',
          });
        }
      } catch {
        // Non-critical
      }
    }, config.frequency_minutes * 60 * 1000);

    return () => clearInterval(interval);
  }, [config, user?.id]);

  // Hand the config to the service worker so it keeps firing while the
  // tab is closed/backgrounded. SW reads ambient_audio_queue via REST.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => {
        if (!reg.active) return;
        if (config.enabled && user?.id) {
          reg.active.postMessage({
            type: 'SCHEDULE_SLEEP_AUDIO',
            config: {
              enabled: true,
              start_hour: config.start_hour,
              end_hour: config.end_hour,
              frequency_minutes: config.frequency_minutes,
              user_id: user.id,
              supabase_url: import.meta.env.VITE_SUPABASE_URL,
              supabase_anon_key: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
          });
        } else {
          reg.active.postMessage({ type: 'CANCEL_SLEEP_AUDIO' });
        }
      })
      .catch(() => {
        // SW not available — non-critical
      });
  }, [config, user?.id]);

  return { config, setConfig };
}
