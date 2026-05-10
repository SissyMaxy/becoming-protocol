/**
 * AftercareFlow — neutral comedown screen.
 *
 * Two modes:
 * - tutorial: 30-second teach-by-doing flow shown in onboarding step 8.
 *             Same component, shorter timer, completion marks the
 *             onboarding step rather than logging a real aftercare row.
 * - full:    invoked when the user types the safeword anywhere, or hits
 *            "Begin aftercare" on a card. (Real-aftercare logging is
 *            stubbed in this build — see report.)
 *
 * Copy is intentionally plain. No persona voice, no kink language.
 */

import { useEffect, useState } from 'react';

interface AftercareFlowProps {
  mode: 'tutorial' | 'full';
  onComplete: () => void;
  onCancel?: () => void;
}

const TUTORIAL_DURATION_SEC = 30;
const FULL_DURATION_SEC = 180;

const STEPS: { headline: string; body: string }[] = [
  {
    headline: 'You are returning to neutral.',
    body: 'Persona is paused. The next minutes are quiet on purpose.',
  },
  {
    headline: 'Breathe in for four.',
    body: 'Hold for four. Out for six. The numbers are small enough to do without thinking.',
  },
  {
    headline: 'Notice three things in the room.',
    body: 'Anything: the colour of a wall, a sound, the temperature on your skin.',
  },
  {
    headline: 'Drink water.',
    body: 'A glass of water is part of the protocol. Not a metaphor — actually drink some.',
  },
  {
    headline: 'You are okay.',
    body: 'When the timer ends you can choose to return, or stay in neutral as long as you need.',
  },
];

export function AftercareFlow({ mode, onComplete, onCancel }: AftercareFlowProps) {
  const totalSec = mode === 'tutorial' ? TUTORIAL_DURATION_SEC : FULL_DURATION_SEC;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => Math.min(totalSec, e + 1)), 1000);
    return () => clearInterval(t);
  }, [totalSec]);

  const stepIdx = Math.min(STEPS.length - 1, Math.floor((elapsed / totalSec) * STEPS.length));
  const step = STEPS[stepIdx];
  const remaining = Math.max(0, totalSec - elapsed);
  const finished = elapsed >= totalSec;

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timer = minutes > 0
    ? `${minutes}:${seconds.toString().padStart(2, '0')}`
    : `${seconds}s`;

  return (
    <div
      data-testid="aftercare-flow"
      style={{
        minHeight: mode === 'tutorial' ? 'auto' : '100vh',
        background: '#f5f1eb',
        color: '#3a3530',
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 480, width: '100%' }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#8a7e6e',
            marginBottom: 24,
          }}
        >
          {mode === 'tutorial' ? 'Aftercare — sample run' : 'Aftercare'}
        </p>

        <h2 style={{ fontSize: 22, fontWeight: 500, marginBottom: 16, lineHeight: 1.3 }}>
          {step.headline}
        </h2>

        <p style={{ fontSize: 15, lineHeight: 1.6, color: '#5e564d', marginBottom: 32 }}>
          {step.body}
        </p>

        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              height: 4,
              background: '#e3dccf',
              borderRadius: 2,
              overflow: 'hidden',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(elapsed / totalSec) * 100}%`,
                background: '#a89878',
                transition: 'width 1s linear',
              }}
            />
          </div>
          <p
            style={{
              fontSize: 12,
              color: '#8a7e6e',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {finished ? 'You can continue when you\'re ready.' : `${timer} left`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          {onCancel && !finished && (
            <button
              onClick={onCancel}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                color: '#8a7e6e',
                border: '1px solid #c8bfae',
                borderRadius: 6,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Stop and exit
            </button>
          )}
          <button
            onClick={onComplete}
            disabled={!finished}
            style={{
              padding: '10px 24px',
              background: finished ? '#5e564d' : '#c8bfae',
              color: '#f5f1eb',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: finished ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              opacity: finished ? 1 : 0.7,
            }}
          >
            {mode === 'tutorial'
              ? finished ? 'Done — that\'s aftercare' : 'Continue'
              : finished ? 'Return' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
