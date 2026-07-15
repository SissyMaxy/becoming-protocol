/**
 * SleepCuePill — the TMR sleep-onset player (DESIGN_RECONDITIONING_ENGINE
 * §2.4 / §4 "pre-sleep 'she stays with you' audio").
 *
 * Mounted by BedtimeRitualContext once the ritual completes (never on
 * skip). Loops an already-installed cue phrase quietly for a bounded
 * drifting-off window, then stops itself — this is not a live sleep-phase
 * lock (the stack has no mid-sleep signal), just the honest, low-friction
 * version: press it, put the phone down, it stays on for a while and then
 * goes quiet on its own.
 *
 * Stays mounted independent of the bedtime overlay so closing that overlay
 * (going to sleep) doesn't cut the audio. Stops instantly if aftercare
 * activates (safeword always wins, everywhere).
 */

import { useEffect, useRef, useState } from 'react';
import { Moon, X } from 'lucide-react';

const MAX_MINUTES = 20;
const VOLUME = 0.35;

interface Props {
  audioUrl: string;
  onFirstPlay: () => void;
  onDismiss: () => void;
  forceStop: boolean;
}

export function SleepCuePill({ audioUrl, onFirstPlay, onDismiss, forceStop }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const firedRef = useRef(false);

  // Attempt autoplay once mounted (fires close on the heels of the "goodnight"
  // tap that mounted us, so browsers usually still count it as user-activated).
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = VOLUME;
    el.play().catch(() => setNeedsTap(true));
  }, []);

  // Auto-stop after the drifting-off window.
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(), MAX_MINUTES * 60_000);
    return () => window.clearTimeout(t);
  }, [onDismiss]);

  // Safeword/aftercare always wins — cut it instantly.
  useEffect(() => {
    if (forceStop) {
      audioRef.current?.pause();
      onDismiss();
    }
  }, [forceStop, onDismiss]);

  const handleFirstPlay = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onFirstPlay();
  };

  const handleTapToStart = () => {
    setNeedsTap(false);
    audioRef.current?.play().catch(() => setNeedsTap(true));
  };

  return (
    <div
      data-testid="sleep-cue-pill"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 9997,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgba(26, 15, 46, 0.88)',
        border: '1px solid rgba(196, 181, 253, 0.22)',
        borderRadius: 999,
        padding: '10px 16px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(14px)',
        color: '#e9d5ff',
        fontSize: 12.5,
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <Moon size={14} style={{ flexShrink: 0, opacity: 0.85 }} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {needsTap ? 'tap to let her stay with you' : 'she stays with you while you drift'}
      </span>
      {needsTap && (
        <button
          onClick={handleTapToStart}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#e9d5ff',
            textDecoration: 'underline',
            fontSize: 12.5,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          play
        </button>
      )}
      <button
        data-testid="sleep-cue-stop"
        onClick={onDismiss}
        aria-label="stop"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(233, 213, 255, 0.6)',
          cursor: 'pointer',
          display: 'flex',
          padding: 2,
        }}
      >
        <X size={14} />
      </button>
      <audio ref={audioRef} src={audioUrl} loop onPlay={handleFirstPlay} />
    </div>
  );
}
