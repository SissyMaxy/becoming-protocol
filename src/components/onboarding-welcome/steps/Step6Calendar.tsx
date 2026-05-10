/**
 * Step 6: Calendar consent (optional).
 *
 * Per spec, "Routes to existing OAuth flow if yes; skipped otherwise."
 * Today there is no Google Calendar OAuth wired up — the
 * `handler-calendar` edge function reads/writes its own DB tables and
 * never touches an external calendar.
 *
 * Until calendar OAuth ships, "Yes — connect" records the consent in
 * onboarding_progress so a future cron / settings flow can pick it up
 * and start the OAuth, then continues the wizard. This step is
 * explicitly skippable; never blocks completion.
 */

import { useState } from 'react';
import { StepShell } from '../StepShell';
import {
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  secondaryButtonStyle,
  stepHeadingStyle,
  stepBodyStyle,
} from '../step-styles';

interface Step6CalendarProps {
  onContinue: (consent: boolean) => void;
  onSkip: () => void;
  onBack: () => void;
  saving: boolean;
  saveError: string | null;
}

export function Step6Calendar({ onContinue, onSkip, onBack, saving, saveError }: Step6CalendarProps) {
  const [choice, setChoice] = useState<'connect' | 'later' | null>(null);

  return (
    <StepShell stepId="calendar" onBack={onBack} saveError={saveError}>
      <h1 style={stepHeadingStyle}>Real calendar?</h1>

      <p style={stepBodyStyle}>
        The persona can place rituals on your real calendar — short blocks for
        scenes, mantras, or check-ins — so they don't get lost between meetings.
        This is optional, and you can wire it up later from Settings.
      </p>

      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        <button
          onClick={() => setChoice('connect')}
          style={{
            textAlign: 'left',
            padding: '14px 16px',
            background: choice === 'connect' ? '#1a1a1a' : '#fff',
            color: choice === 'connect' ? '#fafafa' : '#1a1a1a',
            border: choice === 'connect' ? '2px solid #1a1a1a' : '1px solid #d0d0d0',
            borderRadius: 8,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
            Yes — connect Google Calendar
          </div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            We'll start the OAuth flow when it's ready, and notify you when it's wired up.
          </div>
        </button>

        <button
          onClick={() => setChoice('later')}
          style={{
            textAlign: 'left',
            padding: '14px 16px',
            background: choice === 'later' ? '#1a1a1a' : '#fff',
            color: choice === 'later' ? '#fafafa' : '#1a1a1a',
            border: choice === 'later' ? '2px solid #1a1a1a' : '1px solid #d0d0d0',
            borderRadius: 8,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Not now</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Keep everything inside the app. You can connect later from Settings.
          </div>
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => onContinue(choice === 'connect')}
          disabled={!choice || saving}
          style={!choice || saving ? primaryButtonDisabledStyle : primaryButtonStyle}
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
        <button onClick={onSkip} disabled={saving} style={secondaryButtonStyle}>
          Skip
        </button>
      </div>
    </StepShell>
  );
}
