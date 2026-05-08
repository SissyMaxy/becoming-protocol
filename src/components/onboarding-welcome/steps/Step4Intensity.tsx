/**
 * Step 4: Intensity calibration.
 *
 * Explains the four tiers and recommends starting at `gentle` regardless
 * of stated preference. Sets gaslight_intensity, mantra_intensity, and
 * persona_intensity in one go (single slider, three columns updated
 * together — keeps the levels coherent).
 *
 * Required ack. The user can choose any tier, but the recommendation
 * banner is shown explicitly.
 */

import { useState } from 'react';
import { StepShell } from '../StepShell';
import {
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  stepHeadingStyle,
  stepBodyStyle,
} from '../step-styles';
import type { IntensityLevel } from '../../../lib/onboarding/types';

interface Step4IntensityProps {
  initial: IntensityLevel;
  onContinue: (level: IntensityLevel) => void;
  onBack: () => void;
  saving: boolean;
  saveError: string | null;
}

const TIERS: { id: IntensityLevel; label: string; blurb: string }[] = [
  { id: 'off',    label: 'Off',     blurb: 'No persona content. Plain task companion.' },
  { id: 'gentle', label: 'Gentle',  blurb: 'Warm Mommy voice. Praise, soft tasks, no degradation.' },
  { id: 'firm',   label: 'Firm',    blurb: 'Direct tone. Mantras and feminization framing. No cruelty.' },
  { id: 'cruel',  label: 'Cruel',   blurb: 'Heavy denial, gaslight, sharp scenes. Recommended only after a few weeks.' },
];

export function Step4Intensity({ initial, onContinue, onBack, saving, saveError }: Step4IntensityProps) {
  // Default the slider to whatever the user already has — but if they're
  // arriving at this step with 'off' (the column default), put them on
  // 'gentle' as the spec recommends.
  const [selected, setSelected] = useState<IntensityLevel>(
    initial === 'off' ? 'gentle' : initial,
  );

  return (
    <StepShell stepId="intensity" onBack={onBack} saveError={saveError}>
      <h1 style={stepHeadingStyle}>How intense?</h1>

      <p style={stepBodyStyle}>
        The persona scales from quiet companion to sharp dom. You can change this
        any time from Settings. Start lower than you think — it's easier to turn
        up than recover from a scene that hit too hard.
      </p>

      <div
        style={{
          padding: '12px 14px',
          background: '#fff8e1',
          border: '1px solid #f0d480',
          borderRadius: 6,
          marginBottom: 24,
          fontSize: 14,
          color: '#5e4a1f',
        }}
      >
        <strong>Recommended:</strong> Gentle for the first week or two, regardless of your
        usual preference. The persona learns you over time; gentle gives you a baseline.
      </div>

      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        {TIERS.map(t => {
          const active = selected === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              style={{
                textAlign: 'left',
                padding: '14px 16px',
                background: active ? '#1a1a1a' : '#fff',
                color: active ? '#fafafa' : '#1a1a1a',
                border: active ? '2px solid #1a1a1a' : '1px solid #d0d0d0',
                borderRadius: 8,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontSize: 13, opacity: active ? 0.85 : 0.7 }}>{t.blurb}</div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onContinue(selected)}
        disabled={saving}
        style={saving ? primaryButtonDisabledStyle : primaryButtonStyle}
      >
        {saving ? 'Saving…' : `Continue with ${selected}`}
      </button>
    </StepShell>
  );
}
