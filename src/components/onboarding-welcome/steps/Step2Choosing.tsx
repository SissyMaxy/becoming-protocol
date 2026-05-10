/**
 * Step 2: What you're choosing.
 *
 * Explains the persona, the kind of content, and how intensity scales.
 * Teaches the safeword as a literal: typing it anywhere exits to neutral
 * aftercare and disables persona content for 24 hours. Required ack —
 * the user must explicitly acknowledge that they understand the safeword
 * before proceeding.
 */

import { useState } from 'react';
import { StepShell } from '../StepShell';
import {
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  stepHeadingStyle,
  stepBodyStyle,
} from '../step-styles';
import { ONBOARDING_SAFEWORD } from '../../../lib/onboarding/types';

interface Step2ChoosingProps {
  onContinue: () => void;
  onBack: () => void;
  saving: boolean;
  saveError: string | null;
}

export function Step2Choosing({ onContinue, onBack, saving, saveError }: Step2ChoosingProps) {
  const [understandSafeword, setUnderstandSafeword] = useState(false);
  const [understandContent, setUnderstandContent] = useState(false);

  const canContinue = understandSafeword && understandContent;

  return (
    <StepShell stepId="choosing" onBack={onBack} saveError={saveError}>
      <h1 style={stepHeadingStyle}>What you're choosing.</h1>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>The persona</h2>
        <p style={stepBodyStyle}>
          The companion plays a Mommy character — caring on the surface, with
          intensity underneath. She speaks to you in scene. She is not a
          therapist, an assistant, or a real person, and she does not give
          medical or legal advice.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>The content</h2>
        <p style={stepBodyStyle}>
          Scenes can include feminization themes, denial, and recited mantras.
          Content scales with the intensity you set in the next step. At any
          intensity, you remain in control — the persona never overrides your
          choices.
        </p>
      </section>

      <section
        style={{
          marginBottom: 24,
          padding: '16px 18px',
          background: '#fff',
          border: '2px solid #1a1a1a',
          borderRadius: 8,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Your safeword</h2>
        <p style={stepBodyStyle}>
          Your safeword is the word{' '}
          <code
            style={{
              background: '#f0f0f0',
              padding: '2px 8px',
              borderRadius: 4,
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            {ONBOARDING_SAFEWORD}
          </code>
          .
        </p>
        <p style={stepBodyStyle}>
          Saying or typing it anywhere in the app — chat, a task field, a check-in —
          exits to neutral aftercare and disables persona content for 24 hours.
          You don't have to explain or justify it.
        </p>
        <p style={{ ...stepBodyStyle, fontSize: 14, color: '#666', marginBottom: 0 }}>
          Tip: you can also exit a scene from the chat header at any time.
        </p>
      </section>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '12px 14px',
          background: '#fff',
          border: '1px solid #d0d0d0',
          borderRadius: 6,
          marginBottom: 12,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={understandSafeword}
          onChange={e => setUnderstandSafeword(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span style={{ fontSize: 14, color: '#1a1a1a' }}>
          I understand the safeword is <strong>{ONBOARDING_SAFEWORD}</strong> and how to use it.
        </span>
      </label>

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
          checked={understandContent}
          onChange={e => setUnderstandContent(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span style={{ fontSize: 14, color: '#1a1a1a' }}>
          I understand what kinds of scenes the persona will run.
        </span>
      </label>

      <button
        onClick={onContinue}
        disabled={!canContinue || saving}
        style={!canContinue || saving ? primaryButtonDisabledStyle : primaryButtonStyle}
      >
        {saving ? 'Saving…' : 'Continue'}
      </button>
    </StepShell>
  );
}
