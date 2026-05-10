/**
 * Step 8: Aftercare commitment + tutorial.
 *
 * Required, non-skippable. Explains aftercare, then has the user run a
 * 30-second sample of the actual flow so they know how it feels. Same
 * AftercareFlow component used elsewhere; tutorial mode just shortens
 * the timer and skips real-aftercare logging.
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
          <h1 style={stepHeadingStyle}>Coming back down.</h1>

          <p style={stepBodyStyle}>
            Scenes can leave you feeling raw, floaty, or strange afterward. Aftercare
            is the wind-down: a few quiet minutes that bring you back to neutral
            before you do anything else.
          </p>

          <p style={stepBodyStyle}>
            You can begin aftercare any time you need it — there's a "Begin aftercare"
            button you'll see on cards and at the end of scenes. The safeword
            also lands you here automatically.
          </p>

          <p style={{ ...stepBodyStyle, fontWeight: 600 }}>
            We'll run a 30-second sample now so you know how it feels.
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
          <h1 style={stepHeadingStyle}>That was aftercare.</h1>

          <p style={stepBodyStyle}>
            That's the shape of it. Use it whenever something feels heavy. The
            real version is longer and you can sit in it as long as you need —
            there's no penalty for taking your time.
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
