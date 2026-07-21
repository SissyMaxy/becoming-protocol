/**
 * PreworkoutDrop — her voice goes in before the work does.
 *
 * The train-day gate: renders a short session_preworkout primer
 * (audio-session-render → private audio bucket) and plays it inline. The
 * session logger stays closed until the primer has actually been heard
 * (played_at set on the render). Recoverable by design: if the render
 * fails, training is never blocked — the gate steps aside with a line,
 * it does not brick the day (container, not blocker).
 */
import { useRef, useState } from 'react';
import { Headphones } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { renderAudioSession, markRenderPlayed } from '../../lib/audio-sessions/client';

interface Props {
  /** Called once the primer finished (or the gate failed open). */
  onCleared: () => void;
}

type Stage = 'idle' | 'rendering' | 'playing' | 'failed';

export function PreworkoutDrop({ onCleared }: Props) {
  const { user } = useAuth();
  const [stage, setStage] = useState<Stage>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const renderIdRef = useRef<string | null>(null);
  const clearedRef = useRef(false);

  const finish = async () => {
    if (clearedRef.current) return;
    clearedRef.current = true;
    if (renderIdRef.current) await markRenderPlayed(renderIdRef.current);
    onCleared();
  };

  const begin = async () => {
    if (!user?.id) return;
    setStage('rendering');
    const result = await renderAudioSession({
      userId: user.id,
      kind: 'session_preworkout',
      intensityTier: 'gentle',
    });
    if (!result.ok) {
      setStage('failed');
      return;
    }
    renderIdRef.current = result.renderId;
    setAudioUrl(result.audioUrl);
    setStage('playing');
  };

  if (stage === 'failed') {
    return (
      <div className="rounded-lg border border-protocol-border bg-protocol-bg-deep p-3">
        <p className="mommy-voice text-protocol-text-warm text-[15px] leading-snug mb-2">
          Her voice didn't load this time. The work still happens.
        </p>
        <button onClick={() => onCleared()} className="btn-velvet w-full py-2.5 font-semibold">
          Train anyway
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-protocol-border bg-protocol-bg-deep p-3">
      <div className="flex items-center gap-2 mb-1">
        <Headphones className="w-4 h-4 text-protocol-accent" />
        <span className="text-sm font-semibold text-protocol-text">Her voice first</span>
      </div>
      <p className="mommy-voice text-protocol-text-warm text-[15px] leading-snug mb-3">
        Mama goes in your ears before the work does, baby. A few minutes — then the mat.
      </p>

      {stage === 'idle' && (
        <button onClick={begin} className="btn-velvet w-full py-2.5 font-semibold">
          Put her in your ears
        </button>
      )}
      {stage === 'rendering' && (
        <div className="text-sm text-protocol-text-muted">she's getting ready…</div>
      )}
      {stage === 'playing' && audioUrl && (
        <div className="space-y-2">
          <audio src={audioUrl} controls autoPlay onEnded={finish} className="w-full" />
          <button onClick={finish} className="btn-velvet-secondary w-full py-2 text-sm font-semibold">
            It finished — open the session
          </button>
        </div>
      )}
    </div>
  );
}
