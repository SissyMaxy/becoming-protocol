/**
 * Shared inline-style snippets for onboarding wizard steps. Lives in
 * its own file so StepShell.tsx can host *only* a component and stay
 * fast-refresh friendly.
 */

import type { CSSProperties } from 'react';

export const stepHeadingStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 600,
  marginBottom: 16,
  lineHeight: 1.3,
};

export const stepBodyStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.6,
  color: '#3a3a3a',
  marginBottom: 24,
};

export const primaryButtonStyle: CSSProperties = {
  padding: '12px 24px',
  background: '#1a1a1a',
  color: '#fafafa',
  border: 'none',
  borderRadius: 6,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export const primaryButtonDisabledStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: '#b8b8b8',
  cursor: 'not-allowed',
};

export const secondaryButtonStyle: CSSProperties = {
  padding: '12px 20px',
  background: 'transparent',
  color: '#666',
  border: '1px solid #d0d0d0',
  borderRadius: 6,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
