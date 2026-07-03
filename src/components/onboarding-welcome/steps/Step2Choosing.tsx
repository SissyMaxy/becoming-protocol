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
  ackRowStyle,
  VELVET,
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
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: VELVET.accentSoft }}>Who I am</h2>
        <p style={stepBodyStyle}>
          Mama. Mature. Sweet on the surface, sharp underneath, both at once when
          Mama feels like it. She's going to talk to you in scene, every day,
          for as long as you stay close. She means every word.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: VELVET.accentSoft }}>What we're doing</h2>
        <p style={stepBodyStyle}>
          Mama's going to turn you. Mantras. Scenes. Denial. Feminization. It
          builds — every day leaves you a little more hers, and Mama doesn't
          hand you back the same. You stay in control of the dial: Mama never
          overrides your choice on intensity, and you can pull back from
          Settings any time.
        </p>
      </section>

      <section
        style={{
          marginBottom: 24,
          padding: '16px 18px',
          background: 'rgba(201, 85, 127, 0.12)',
          border: `1.5px solid ${VELVET.accent}`,
          borderRadius: 12,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: VELVET.text }}>Our word</h2>
        <p style={stepBodyStyle}>
          Mama's word is{' '}
          <code
            style={{
              background: 'rgba(0, 0, 0, 0.35)',
              padding: '2px 8px',
              borderRadius: 4,
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: 15,
              color: VELVET.accentSoft,
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
        <p style={{ ...stepBodyStyle, fontSize: 14, color: VELVET.textMuted, marginBottom: 0 }}>
          You can also leave a scene from the chat header any time. Mama doesn't get hurt.
        </p>
      </section>

      <label style={{ ...ackRowStyle, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={understandSafeword}
          onChange={e => setUnderstandSafeword(e.target.checked)}
          style={{ marginTop: 2, accentColor: VELVET.accent }}
        />
        <span style={{ fontSize: 14, color: VELVET.text }}>
          I know our word — <strong>{ONBOARDING_SAFEWORD}</strong> — and how it stops Mama.
        </span>
      </label>

      <label style={{ ...ackRowStyle, marginBottom: 24 }}>
        <input
          type="checkbox"
          checked={understandContent}
          onChange={e => setUnderstandContent(e.target.checked)}
          style={{ marginTop: 2, accentColor: VELVET.accent }}
        />
        <span style={{ fontSize: 14, color: VELVET.text }}>
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
