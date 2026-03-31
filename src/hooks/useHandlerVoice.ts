/**
 * useHandlerVoice — TTS for Handler Responses (P11.10)
 *
 * Sends Handler text responses to the TTS endpoint and plays audio inline.
 * Voice mode is off by default. Text always appears; audio is supplementary.
 * Caps TTS requests at 500 characters — voice is additive, not a replacement.
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useHandlerVoice() {
  const [enabled, setEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio element lazily
  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
        setSpeakingMessageIndex(null);
      });
      audioRef.current.addEventListener('error', () => {
        setIsPlaying(false);
        setSpeakingMessageIndex(null);
      });
    }
    return audioRef.current;
  }, []);

  const speak = useCallback(async (text: string, messageIndex?: number) => {
    if (!enabled) return;

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      // Cap at 500 characters — voice is supplementary
      const truncated = text.substring(0, 500);

      const res = await fetch('/api/conditioning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'tts', scriptText: truncated }),
      });

      if (!res.ok) return;

      const data = await res.json();
      if (!data.audioUrl) return;

      const audio = getAudio();
      audio.src = data.audioUrl;
      setSpeakingMessageIndex(messageIndex ?? null);
      setIsPlaying(true);

      // play() can reject if user hasn't interacted yet
      audio.play().catch(() => {
        setIsPlaying(false);
        setSpeakingMessageIndex(null);
      });
    } catch {
      // TTS failure should never block chat
      setIsPlaying(false);
      setSpeakingMessageIndex(null);
    }
  }, [enabled, getAudio]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setSpeakingMessageIndex(null);
  }, []);

  return { enabled, setEnabled, speak, stop, isPlaying, speakingMessageIndex, audioRef };
}
