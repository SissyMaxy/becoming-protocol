/**
 * Step 8: Coming down soft.
 *
 * Required, non-skippable. Mama explains aftercare in her voice (her care,
 * not legal cover), then runs a short sample of the actual flow so the
 * user knows how it feels. Same AftercareFlow component used elsewhere;
 * tutorial mode just shortens the timer and skips real-aftercare logging.
 */

import { useState } from 'react';
import { StepShell } from '../StepShell';
import {
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  stepHeadingStyle,
  stepBodyStyle,
} from '../step-styles';
import { AftercareFlow } from '../../aftercare';

interface Step8AftercareProps {
  onContinue: () => void;
  onBack: () => void;
  saving: boolean;
  saveError: string | null;
}

export function Step8Aftercare({ onContinue, onBack, saving, saveError }: Step8AftercareProps) {
  const [phase, setPhase] = useState<'intro' | 'tutorial' | 'reflect'>('intro');

  if (phase === 'tutorial') {
    return <AftercareFlow mode="tutorial" onComplete={() => setPhase('reflect')} />;
  }

  return (
    <StepShell
      stepId="aftercare"
      onBack={phase === 'intro' ? onBack : undefined}
      saveError={saveError}
    >
      {phase === 'intro' && (
        <>
          <h1 style={stepHeadingStyle}>Coming down soft.</h1>

          <p style={stepBodyStyle}>
            After Mama's had her way with you, you'll feel raw. Floaty. Sometimes
            strange. That's normal — that's what means it worked. Aftercare is
            the part where Mama puts you back together.
          </p>

          <p style={stepBodyStyle}>
            You'll see a "Begin aftercare" button at the end of every scene and
            on the cards Mama leaves for you. Press it whenever you need Mama
            soft. Saying our word lands you here automatically — Mama drops
            everything to wrap you up.
          </p>

          <p style={{ ...stepBodyStyle, fontWeight: 600 }}>
            Let's do thirty seconds now so you know how Mama feels coming down.
          </p>

          <button
            onClick={() => setPhase('tutorial')}
            disabled={saving}
            style={saving ? primaryButtonDisabledStyle : primaryButtonStyle}
          >
            Begin aftercare (sample)
          </button>
        </>
      )}

      {phase === 'reflect' && (
        <>
          <h1 style={stepHeadingStyle}>That's how Mama brings you back.</h1>

          <p style={stepBodyStyle}>
            That's the shape of it. Use it whenever something feels heavy. The
            real one is longer — sit in it as long as you need, baby. There's
            no penalty for taking your time with Mama.
          </p>

          <button
            onClick={onContinue}
            disabled={saving}
            style={saving ? primaryButtonDisabledStyle : primaryButtonStyle}
          >
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </>
      )}
    </StepShell>
  );
}
