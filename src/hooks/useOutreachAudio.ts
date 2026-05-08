/**
 * useOutreachAudio — single audio element shared across outreach cards.
 *
 * Receives the storage object path (or legacy public URL) from the row's
 * audio_url column and signs it on demand (audio bucket is private
 * post-migration 301). One element per surface (each card list mounts the
 * hook once). Tap play → previous stops, this one signs + starts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSignedAssetUrl } from '../lib/storage/signed-url';

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

  const play = useCallback(async (id: string, pathOrUrl: string) => {
    const a = ensureAudio();
    if (playingId === id) {
      a.pause();
      a.currentTime = 0;
      setPlayingId(null);
      return;
    }
    a.pause();
    const url = await getSignedAssetUrl('audio', pathOrUrl, 3600);
    if (!url) {
      setPlayingId(null);
      return;
    }
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
