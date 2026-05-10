/**
 * StepShell — shared frame for every wizard step. Neutral palette,
 * step counter, optional back button. Each step renders its own body
 * and CTA inside this frame.
 *
 * Shared styles live in `./step-styles.ts` so this file stays a pure
 * component module (fast-refresh requires that).
 */

import type { ReactNode } from 'react';
import { ONBOARDING_STEPS, type OnboardingStepId } from '../../lib/onboarding/types';

interface StepShellProps {
  stepId: OnboardingStepId;
  children: ReactNode;
  onBack?: () => void;
  saveError?: string | null;
}

export function StepShell({ stepId, children, onBack, saveError }: StepShellProps) {
  const idx = ONBOARDING_STEPS.findIndex(s => s.id === stepId);
  const total = ONBOARDING_STEPS.length;
  const stepNum = idx + 1;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#fafafa',
        color: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e5e5',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        {onBack ? (
          <button
            onClick={onBack}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#666',
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 0,
            }}
          >
            ← Back
          </button>
        ) : <span />}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#888', fontVariantNumeric: 'tabular-nums' }}>
          Step {stepNum} of {total}
        </div>
      </header>

      <div
        style={{
          flex: 1,
          padding: '32px 24px',
          maxWidth: 560,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {children}
      </div>

      {saveError && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            padding: '12px 24px',
            background: '#fdecec',
            borderTop: '1px solid #f5b4b4',
            color: '#8a3a3a',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          {saveError}
        </div>
      )}
    </div>
  );
}

