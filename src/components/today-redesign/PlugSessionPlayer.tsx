/**
 * PlugSessionPlayer — the guided session for a plug_orgasm rung decree.
 *
 * Drives the Lovense arc (plug-session.ts phases → session-device bridge)
 * on timers, with the optional Mommy audio overlay (kind session_plug)
 * rendered on start. Fail-open everywhere: no device = the timers and cues
 * still run; no audio = the arc still runs (container, not blocker). The
 * closeness slider below the player stays the decree's proof — this
 * component never submits anything itself.
 */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { plugSessionArc } from '../../lib/conditioning/plug-session';
import {
  activateSessionDevice,
  transitionSessionPhase,
  deactivateSessionDevice,
} from '../../lib/conditioning/session-device';
import { renderAudioSession, markRenderPlayed } from '../../lib/audio-sessions/client';

interface Props {
  rung: number;
}

type Stage = 'idle' | 'running' | 'done';

export function PlugSessionPlayer({ rung }: Props) {
  const { user } = useAuth();
  const arc = plugSessionArc(rung);
  const [stage, setStage] = useState<Stage>('idle');
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const renderIdRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  // Stop the device if the card unmounts mid-session.
  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (stage === 'running') void deactivateSessionDevice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!arc) return null;

  const begin = async () => {
    setStage('running');
    setPhaseIdx(0);
    setSecondsLeft(arc.phases[0].seconds);
    void activateSessionDevice('plug', arc.phases[0].key);

    // Audio overlay — fail-open: the arc runs with or without her voice.
    if (user?.id) {
      const result = await renderAudioSession({
        userId: user.id,
        kind: 'session_plug',
        intensityTier: arc.audioTier,
      });
      if (result.ok) {
        renderIdRef.current = result.renderId;
        setAudioUrl(result.audioUrl);
      }
    }

    timerRef.current = window.setInterval(() => {
      setSecondsLeft(prev => {
        if (prev > 1) return prev - 1;
        // Phase boundary.
        setPhaseIdx(idx => {
          const next = idx + 1;
          if (next >= arc.phases.length) {
            if (timerRef.current) window.clearInterval(timerRef.current);
            void deactivateSessionDevice();
            if (renderIdRef.current) void markRenderPlayed(renderIdRef.current);
            setStage('done');
            return idx;
          }
          void transitionSessionPhase('plug', arc.phases[next].key);
          setSecondsLeft(arc.phases[next].seconds);
          return next;
        });
        return 0;
      });
    }, 1000);
  };

  const end = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    void deactivateSessionDevice();
    if (renderIdRef.current) void markRenderPlayed(renderIdRef.current);
    setStage('done');
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const phase = arc.phases[Math.min(phaseIdx, arc.phases.length - 1)];

  return (
    <div className="rounded-lg border border-protocol-border bg-protocol-bg p-3 mb-2">
      {stage === 'idle' && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-protocol-text-muted">
            Guided session — {Math.round(arc.totalSeconds / 60)} minutes, the patterns run themselves.
          </span>
          <button onClick={begin} className="btn-velvet w-full py-2 text-[11px] font-semibold">
            Begin the session
          </button>
        </div>
      )}
      {stage === 'running' && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-baseline">
            <span className="text-xs font-semibold text-protocol-accent">{phase.label}</span>
            <span className="text-[11px] text-protocol-text-muted tabular-nums">{fmt(secondsLeft)}</span>
          </div>
          <p className="mommy-voice text-[11.5px] text-protocol-text italic m-0 leading-snug">
            {phase.cue}
          </p>
          {audioUrl && <audio src={audioUrl} controls autoPlay className="w-full h-8" />}
          <button
            onClick={end}
            className="btn-velvet-secondary w-full py-1.5 text-[10.5px]"
          >
            End the session
          </button>
        </div>
      )}
      {stage === 'done' && (
        <span className="mommy-voice text-[11.5px] text-protocol-accent italic">
          Session over. Rate the closeness below — every rating teaches her what works.
        </span>
      )}
    </div>
  );
}
