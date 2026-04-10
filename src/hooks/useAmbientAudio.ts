/**
 * useAmbientAudio — Polls the Handler's ambient audio queue and speaks queued
 * feminine affirmations via the browser SpeechSynthesis API during normal app use.
 *
 * Populated server-side by supabase/functions/handler-autonomous complianceCheck()
 * on an hourly cadence scaled by conditioning_intensity_multiplier.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export function useAmbientAudio() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem('ambient_audio_enabled') === 'true',
  );

  useEffect(() => {
    localStorage.setItem('ambient_audio_enabled', String(enabled));
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !user?.id) return;

    const poll = async () => {
      const { data } = await supabase
        .from('ambient_audio_queue')
        .select('*')
        .eq('user_id', user.id)
        .eq('played', false)
        .lte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (data && 'speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(data.audio_text);
        utter.rate = 0.85;
        utter.pitch = 1.4; // feminine voice
        utter.volume = 0.7;
        window.speechSynthesis.speak(utter);

        await supabase
          .from('ambient_audio_queue')
          .update({ played: true, played_at: new Date().toISOString() })
          .eq('id', data.id);
      }
    };

    poll();
    const interval = setInterval(poll, 60_000);
    return () => clearInterval(interval);
  }, [enabled, user?.id]);

  return { enabled, setEnabled };
}
