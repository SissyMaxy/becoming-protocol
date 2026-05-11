/**
 * Step 9: You're Mama's now.
 *
 * Summarizes what Mama knows, hands off to Today. The wizard's complete()
 * action sets onboarding_completed_at, which opens the persona gate so
 * mommy-* outreach starts surfacing on Today.
 */

import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { StepShell } from '../StepShell';
import {
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  secondaryButtonStyle,
  stepHeadingStyle,
  stepBodyStyle,
} from '../step-styles';
import { ONBOARDING_SAFEWORD } from '../../../lib/onboarding/types';
import type { OnboardingState } from '../../../lib/onboarding/storage';

interface Step9DoneProps {
  state: OnboardingState;
  onFinish: () => void;
  onBack: () => void;
  saving: boolean;
  saveError: string | null;
}

export function Step9Done({ state, onFinish, onBack, saving, saveError }: Step9DoneProps) {
  const [seedingFirst, setSeedingFirst] = useState(false);

  const seedFirstOutreach = async () => {
    setSeedingFirst(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        // Can't seed without auth — just continue.
        await onFinish();
        return;
      }
      // Fire-and-forget: ask mommy-mood to pick today's affect so the
      // first outreach lands with appropriate tone. Failure is non-fatal.
      fetch('/api/mommy/mood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trigger: 'onboarding_complete' }),
      }).catch(() => {});
    } finally {
      await onFinish();
    }
  };

  const summary: { label: string; value: string }[] = [];
  if (state.feminineName) summary.push({ label: 'Your name', value: state.feminineName });
  if (state.pronouns) summary.push({ label: 'Pronouns', value: state.pronouns });
  if (state.currentHonorific) summary.push({ label: 'What Mama calls you', value: state.currentHonorific });
  summary.push({ label: 'How hard', value: state.personaIntensity });
  summary.push({ label: "Mama's voice", value: state.prefersMommyVoice ? 'on' : 'off' });

  return (
    <StepShell stepId="done" onBack={onBack} saveError={saveError}>
      <h1 style={stepHeadingStyle}>You're Mama's now, baby.</h1>

      <p style={stepBodyStyle}>
        Here's what Mama knows about her good girl so far. You can change any of
        it from Settings — Mama isn't going anywhere.
      </p>

      <ul
        style={{
          listStyle: 'none',
          padding: '14px 16px',
          margin: '0 0 24px',
          background: '#fff',
          border: '1px solid #d0d0d0',
          borderRadius: 8,
          fontSize: 14,
          color: '#3a3a3a',
        }}
      >
        {summary.map(line => (
          <li key={line.label} style={{ padding: '4px 0' }}>
            <span style={{ color: '#666' }}>{line.label}:</span> <strong>{line.value}</strong>
          </li>
        ))}
      </ul>

      <p style={stepBodyStyle}>
        From here Mama drops you onto Today — your daily cards. Mama'll reach
        for you when she wants you. You don't need to do anything to start,
        baby. Just stay where Mama can find you.
      </p>

      <p style={{ ...stepBodyStyle, fontSize: 13, color: '#666' }}>
        Our word is <strong>{ONBOARDING_SAFEWORD}</strong>. It works everywhere Mama is.
      </p>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button
          onClick={seedFirstOutreach}
          disabled={saving || seedingFirst}
          style={saving || seedingFirst ? primaryButtonDisabledStyle : primaryButtonStyle}
        >
          {saving || seedingFirst ? 'Finishing…' : 'Go to Mama'}
        </button>
        <button onClick={onFinish} disabled={saving} style={secondaryButtonStyle}>
          Just take me to Today
        </button>
      </div>
    </StepShell>
  );
}
