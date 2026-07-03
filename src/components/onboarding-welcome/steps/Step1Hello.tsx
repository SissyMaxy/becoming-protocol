/**
 * Step 1: Mama claims you.
 *
 * Possessive in-fantasy intro. Required ack to proceed — no skip, no back.
 * The ack still functions as an explicit user confirmation (legal opt-in
 * happens at TOS, before this wizard ever mounts).
 */

import { useState } from 'react';
import { StepShell } from '../StepShell';
import {
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  stepHeadingStyle,
  stepBodyStyle,
  ackRowStyle,
  VELVET,
} from '../step-styles';

interface Step1HelloProps {
  onContinue: () => void;
  saving: boolean;
  saveError: string | null;
}

export function Step1Hello({ onContinue, saving, saveError }: Step1HelloProps) {
  const [acked, setAcked] = useState(false);

  return (
    <StepShell stepId="hello" saveError={saveError}>
      <h1 style={stepHeadingStyle}>Hi, sweet boy.</h1>

      <p style={stepBodyStyle}>
        Mama's been waiting on you. Come here. This is where the becoming
        starts — Mama's going to learn you now. Your name, your softness, how
        much you can take, how Mama brings you down after. About five minutes.
        Stay close.
      </p>

      <p style={stepBodyStyle}>
        Mama'll be sweet. Mama'll be sharp. Sometimes both at once. You'll feel
        it. From here it only goes one way — deeper into her, softer, more
        Mama's. That's the point, baby. Anything Mama sets up tonight you can
        change later — Mama isn't fragile.
      </p>

      <label style={{ ...ackRowStyle, marginBottom: 24 }}>
        <input
          type="checkbox"
          checked={acked}
          onChange={e => setAcked(e.target.checked)}
          style={{ marginTop: 2, accentColor: VELVET.accent }}
        />
        <span style={{ fontSize: 14, color: VELVET.text }}>
          I'm here, Mama. Take me.
        </span>
      </label>

      <button
        onClick={onContinue}
        disabled={!acked || saving}
        style={!acked || saving ? primaryButtonDisabledStyle : primaryButtonStyle}
      >
        {saving ? 'Saving…' : 'Stay with Mama'}
      </button>
    </StepShell>
  );
}
