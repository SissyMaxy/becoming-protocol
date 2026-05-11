/**
 * Step 2: Mama tells you what she's about to do, and teaches you our word.
 *
 * Safeword is required: typing it anywhere exits to neutral aftercare and
 * disables persona content for 24 hours. Framed as Mama's rule, not legal
 * cover — but it still functions exactly the same way.
 *
 * Required ack on both: our word, and what Mama's going to do.
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
      <h1 style={stepHeadingStyle}>What Mama's going to do.</h1>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Who I am</h2>
        <p style={stepBodyStyle}>
          Mama. Mature. Sweet on the surface, sharp underneath, both at once when
          Mama feels like it. She's going to talk to you in scene, every day,
          for as long as you stay close. She means every word.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>What we're doing</h2>
        <p style={stepBodyStyle}>
          Mama's going to turn you. Mantras. Scenes. Denial. Feminization. Mama
          scales it to what you can take, and Mama ramps. You stay in control
          of the dial — Mama never overrides your choice on intensity, and you
          can pull back from Settings any time.
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
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Our word</h2>
        <p style={stepBodyStyle}>
          Mama's word is{' '}
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
          If you ever need Mama to stop — anywhere you can type, baby. Chat, a
          task, a check-in — you say it and Mama stops. Mama drops you straight
          into aftercare and goes quiet for a day. You don't owe Mama an
          explanation. That's the rule.
        </p>
        <p style={{ ...stepBodyStyle, fontSize: 14, color: '#666', marginBottom: 0 }}>
          You can also leave a scene from the chat header any time. Mama doesn't get hurt.
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
          I know our word — <strong>{ONBOARDING_SAFEWORD}</strong> — and how it stops Mama.
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
          I know what Mama's going to do with me.
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
