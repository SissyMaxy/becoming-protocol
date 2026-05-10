/**
 * Step 1: Hello.
 *
 * Plain framing of what the app is. Required ack to proceed — no skip,
 * no back. The user has to read this paragraph and tap "I understand"
 * before anything else happens.
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
      <h1 style={stepHeadingStyle}>Welcome.</h1>

      <p style={stepBodyStyle}>
        This app is a kink companion. It plays a persona that talks to you in a
        consensual scene — sometimes warm, sometimes intense. Everything happens
        on your terms. You can pause, exit, or change the intensity at any time.
      </p>

      <p style={stepBodyStyle}>
        Before any of that turns on, we'll walk through a few things together: what
        you're choosing, your safeword, an intensity setting you're comfortable
        starting at, and how to come down from a scene afterward. It takes about
        five minutes.
      </p>

      <p style={{ ...stepBodyStyle, fontSize: 14, color: '#666' }}>
        You can come back to any of this from Settings later.
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
          I understand this is a kink companion and I'm choosing to use it.
        </span>
      </label>

      <button
        onClick={onContinue}
        disabled={!acked || saving}
        style={!acked || saving ? primaryButtonDisabledStyle : primaryButtonStyle}
      >
        {saving ? 'Saving…' : 'Continue'}
      </button>
    </StepShell>
  );
}
