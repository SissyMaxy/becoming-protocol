/**
 * useOutreachAudio — single audio element shared across outreach cards.
 *
 * One element per surface (each card list mounts the hook once). Tap a
 * card's play button → the previous one stops, this one starts. Tap stop →
 * it pauses and resets. Designed to be cheap: no preloading, no streaming,
 * just plays the cached audio_url that the render edge function uploaded.
 *
 * Caller passes the row id that's playing so the UI can highlight it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function useOutreachAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio();
      a.addEventListener('ended', () => setPlayingId(null));
      a.addEventListener('error', () => setPlayingId(null));
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  const play = useCallback((id: string, url: string) => {
    const a = ensureAudio();
    if (playingId === id) {
      a.pause();
      a.currentTime = 0;
      setPlayingId(null);
      return;
    }
    a.pause();
    a.src = url;
    a.currentTime = 0;
    setPlayingId(id);
    a.play().catch(() => setPlayingId(null));
  }, [ensureAudio, playingId]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayingId(null);
  }, []);

  // Tear down on unmount so we don't leak an audio element if the card
  // surface gets unmounted while a clip is playing.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  return { play, stop, playingId };
}
