/**
 * Step 9: Done.
 *
 * Summarizes what's set up, hands off to Today. The wizard's complete()
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

  const summary: string[] = [];
  if (state.feminineName) summary.push(`Name: ${state.feminineName}`);
  if (state.pronouns) summary.push(`Pronouns: ${state.pronouns}`);
  if (state.currentHonorific) summary.push(`Honorific: ${state.currentHonorific}`);
  summary.push(`Intensity: ${state.personaIntensity}`);
  summary.push(`Voice: ${state.prefersMommyVoice ? 'on' : 'off'}`);

  return (
    <StepShell stepId="done" onBack={onBack} saveError={saveError}>
      <h1 style={stepHeadingStyle}>You're set up.</h1>

      <p style={stepBodyStyle}>
        Here's what's configured. You can change any of it from Settings.
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
          <li key={line} style={{ padding: '4px 0' }}>{line}</li>
        ))}
      </ul>

      <p style={stepBodyStyle}>
        From here you'll land on Today — your daily card stack. The persona
        will reach out when it's appropriate; you don't need to do anything
        special to start.
      </p>

      <p style={{ ...stepBodyStyle, fontSize: 13, color: '#666' }}>
        Reminder: your safeword is <strong>safeword</strong>. It works anywhere.
      </p>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button
          onClick={seedFirstOutreach}
          disabled={saving || seedingFirst}
          style={saving || seedingFirst ? primaryButtonDisabledStyle : primaryButtonStyle}
        >
          {saving || seedingFirst ? 'Finishing…' : 'Go to Today'}
        </button>
        <button onClick={onFinish} disabled={saving} style={secondaryButtonStyle}>
          Skip first message
        </button>
      </div>
    </StepShell>
  );
}
