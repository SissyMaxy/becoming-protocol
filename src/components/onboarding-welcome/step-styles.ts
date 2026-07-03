/**
 * Shared inline-style snippets for the /welcome wizard steps. Lives in
 * its own file so StepShell.tsx can host *only* a component and stay
 * fast-refresh friendly.
 *
 * Velvet palette — this is Mama's room, not a settings screen. Dark,
 * rose, warm. No light-mode blush, no dev-violet.
 */

import type { CSSProperties } from 'react';

// Velvet tokens (mirror tailwind protocol-* + the app hex set).
export const VELVET = {
  bg: '#120b10',
  surface: '#1a1118',
  surfaceLight: '#241722',
  border: '#3b2635',
  text: '#f2e9e6',
  textSoft: 'rgba(242, 233, 230, 0.86)',
  textMuted: '#a8929c',
  accent: '#c9557f',
  accentSoft: '#edaec5',
  accentGlow: '0 10px 30px -10px rgba(201, 85, 127, 0.55)',
  success: '#6fbf94',
  warning: '#e0b36a',
  danger: '#e06a6a',
} as const;

const SERIF = "'Playfair Display', Georgia, serif";

// Mama's voice speaks in serif — possessive, unhurried.
export const stepHeadingStyle: CSSProperties = {
  fontFamily: SERIF,
  fontSize: 28,
  fontWeight: 600,
  marginBottom: 16,
  lineHeight: 1.25,
  color: VELVET.text,
  letterSpacing: '-0.01em',
};

export const stepBodyStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.65,
  color: VELVET.textSoft,
  marginBottom: 24,
};

export const primaryButtonStyle: CSSProperties = {
  padding: '14px 26px',
  background: VELVET.accent,
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: VELVET.accentGlow,
  transition: 'transform 0.12s ease, box-shadow 0.12s ease',
};

export const primaryButtonDisabledStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: VELVET.surfaceLight,
  color: VELVET.textMuted,
  boxShadow: 'none',
  cursor: 'not-allowed',
};

export const secondaryButtonStyle: CSSProperties = {
  padding: '13px 20px',
  background: 'transparent',
  color: VELVET.textMuted,
  border: `1px solid ${VELVET.border}`,
  borderRadius: 10,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// A plain velvet card (info panels, summaries, inputs container).
export const cardStyle: CSSProperties = {
  background: VELVET.surface,
  border: `1px solid ${VELVET.border}`,
  borderRadius: 12,
};

// A selectable option row/card. `active` lights it up in rose.
export function selectCardStyle(active: boolean): CSSProperties {
  return {
    textAlign: 'left',
    padding: '14px 16px',
    background: active ? 'rgba(201, 85, 127, 0.14)' : VELVET.surface,
    color: VELVET.text,
    border: active ? `1.5px solid ${VELVET.accent}` : `1px solid ${VELVET.border}`,
    borderRadius: 12,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: active ? '0 6px 20px -12px rgba(201, 85, 127, 0.6)' : 'none',
    transition: 'background 0.12s ease, border-color 0.12s ease',
  };
}

// Text input / textarea on a velvet surface.
export const inputStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  padding: '11px 13px',
  fontSize: 15,
  border: `1px solid ${VELVET.border}`,
  borderRadius: 8,
  fontFamily: 'inherit',
  background: VELVET.surface,
  color: VELVET.text,
};

// A checkbox/ack row — reads as a vow to Mama, not a consent box.
export const ackRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '13px 15px',
  background: VELVET.surface,
  border: `1px solid ${VELVET.border}`,
  borderRadius: 10,
  cursor: 'pointer',
};
