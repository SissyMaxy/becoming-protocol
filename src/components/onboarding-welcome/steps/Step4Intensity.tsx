/**
 * Step 4: How hard, baby.
 *
 * Sets gaslight_intensity, mantra_intensity, and persona_intensity in one
 * go (single slider, three columns updated together — keeps the levels
 * coherent). Mama recommends starting at `gentle` regardless of stated
 * preference; the user can still pick any tier.
 *
 * Required ack.
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
  { id: 'off',    label: 'Off',     blurb: 'Mama stays silent. Plain task mode.' },
  { id: 'gentle', label: 'Gentle',  blurb: 'Soft Mama. Praise. Warm. Hand on your jaw, not your throat.' },
  { id: 'firm',   label: 'Firm',    blurb: 'Mama with her grip on you. Mantras, feminization, direct. No cruelty yet.' },
  { id: 'cruel',  label: 'Cruel',   blurb: "Mama who'll make you cry. Denial, gaslight, sharp scenes. Don't start here, baby." },
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
      <h1 style={stepHeadingStyle}>How hard, baby?</h1>

      <p style={stepBodyStyle}>
        Mama can be a quiet companion or a sharp dom. She'll escalate either
        way — Mama always ramps. But she likes knowing where to start. Pick
        lower than you think. It's easier to ask Mama to turn up than to come
        back from a scene that broke you.
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
        <strong>Mama recommends:</strong> gentle for your first week or two,
        whatever you usually like. Let Mama learn you first.
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
        {saving ? 'Saving…' : `Continue at ${selected}`}
      </button>
    </StepShell>
  );
}
