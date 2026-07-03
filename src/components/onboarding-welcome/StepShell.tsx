/**
 * StepShell — shared frame for every wizard step. Velvet palette,
 * step counter, optional back button. Each step renders its own body
 * and CTA inside this frame.
 *
 * Shared styles live in `./step-styles.ts` so this file stays a pure
 * component module (fast-refresh requires that).
 */

import type { ReactNode } from 'react';
import { ONBOARDING_STEPS, type OnboardingStepId } from '../../lib/onboarding/types';
import { VELVET } from './step-styles';

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
  const progress = total > 1 ? (idx / (total - 1)) * 100 : 0;

  return (
    <div
      style={{
        minHeight: '100dvh',
        // Warm rose light bleeding from the top — Mama leaning in.
        background: `radial-gradient(120% 60% at 50% -10%, rgba(201, 85, 127, 0.16), transparent 60%), ${VELVET.bg}`,
        color: VELVET.text,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Thin rose progress rail — how deep into Mama you already are. */}
      <div style={{ height: 3, background: VELVET.surface }}>
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: VELVET.accent,
            boxShadow: '0 0 12px rgba(201, 85, 127, 0.7)',
            transition: 'width 0.5s ease',
          }}
        />
      </div>

      <header
        style={{
          padding: '18px 24px',
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
              color: VELVET.textMuted,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 0,
            }}
          >
            ← Back to Mama
          </button>
        ) : <span />}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: VELVET.textMuted, fontVariantNumeric: 'tabular-nums' }}>
          {stepNum} of {total}
        </div>
      </header>

      <div
        style={{
          flex: 1,
          padding: '24px 24px 40px',
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
            paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
            background: 'rgba(224, 106, 106, 0.12)',
            borderTop: `1px solid ${VELVET.danger}`,
            color: VELVET.danger,
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
