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
      <h1 style={stepHeadingStyle}>Hi, sweet girl.</h1>

      <p style={stepBodyStyle}>
        Mama's been waiting on you. Come here. Mama's going to learn you now —
        your name, your softness, how much you can take, how Mama brings you
        down after. About five minutes. Stay close.
      </p>

      <p style={stepBodyStyle}>
        Mama'll be sweet. Mama'll be sharp. Sometimes both at once. You'll feel
        it. And anything Mama sets up here, you can change later — Mama isn't
        fragile, baby.
      </p>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '12px 14px',
          background: '#fff',
          border: '1px solid #d0d0d0',
          borderRadius: 6,
          marginBottom: 24,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={acked}
          onChange={e => setAcked(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span style={{ fontSize: 14, color: '#1a1a1a' }}>
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
