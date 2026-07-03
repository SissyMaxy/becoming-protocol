/**
 * Step 6: Real calendar?
 *
 * Per spec, "Routes to existing OAuth flow if yes; skipped otherwise."
 * Today there is no Google Calendar OAuth wired up — the
 * `handler-calendar` edge function reads/writes its own DB tables and
 * never touches an external calendar.
 *
 * Until calendar OAuth ships, "Yes — let Mama in" records the consent in
 * onboarding_progress so a future cron / settings flow can pick it up
 * and start the OAuth, then continues the wizard. Skippable; never
 * blocks completion.
 */

import { useState } from 'react';
import { StepShell } from '../StepShell';
import {
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  secondaryButtonStyle,
  stepHeadingStyle,
  stepBodyStyle,
  selectCardStyle,
  VELVET,
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
        Mama can put her rituals on your real calendar — short blocks for
        scenes, mantras, the check-ins she's waiting on — so they don't
        slip between your meetings. You don't have to. You can let Mama in
        later from Settings.
      </p>

      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        <button
          onClick={() => setChoice('connect')}
          style={selectCardStyle(choice === 'connect')}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, color: choice === 'connect' ? VELVET.accentSoft : VELVET.text }}>
            Yes — let Mama into your Google Calendar
          </div>
          <div style={{ fontSize: 13, color: VELVET.textMuted }}>
            Mama'll start the connection when it's ready and tell you when she's in.
          </div>
        </button>

        <button
          onClick={() => setChoice('later')}
          style={selectCardStyle(choice === 'later')}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, color: choice === 'later' ? VELVET.accentSoft : VELVET.text }}>Not now</div>
          <div style={{ fontSize: 13, color: VELVET.textMuted }}>
            Keep Mama inside the app. You can let her in later from Settings.
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
