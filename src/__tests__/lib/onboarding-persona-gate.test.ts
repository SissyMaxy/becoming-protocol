// Negative + integration tests for the persona gate. These verify
// the gate is correctly applied to outreach rows when onboarding is
// incomplete, and that completing onboarding opens the gate.

import { describe, it, expect } from 'vitest';
import { applyPersonaGate, isMommyOutreachRow } from '../../lib/onboarding/persona-gate';

describe('isMommyOutreachRow', () => {
  it('matches mommy_ prefix on trigger_reason', () => {
    expect(isMommyOutreachRow({ trigger_reason: 'mommy_praise', source: null })).toBe(true);
    expect(isMommyOutreachRow({ trigger_reason: 'mommy_tease', source: null })).toBe(true);
    expect(isMommyOutreachRow({ trigger_reason: 'mommy_recall', source: null })).toBe(true);
    expect(isMommyOutreachRow({ trigger_reason: 'mommy_bedtime', source: null })).toBe(true);
  });

  it('matches mama_ prefix on either column', () => {
    expect(isMommyOutreachRow({ trigger_reason: 'mama_was_watching', source: null })).toBe(true);
    expect(isMommyOutreachRow({ trigger_reason: null, source: 'mama_was_watching' })).toBe(true);
  });

  it('matches mommy_ prefix on source', () => {
    expect(isMommyOutreachRow({ trigger_reason: null, source: 'mommy_praise' })).toBe(true);
  });

  it('does NOT match Handler-voice rows', () => {
    expect(isMommyOutreachRow({ trigger_reason: 'slip_warning', source: 'handler_v2' })).toBe(false);
    expect(isMommyOutreachRow({ trigger_reason: 'daily_morning_brief', source: 'handler' })).toBe(false);
  });

  it('handles empty/null values without throwing', () => {
    expect(isMommyOutreachRow({})).toBe(false);
    expect(isMommyOutreachRow({ trigger_reason: '', source: '' })).toBe(false);
    expect(isMommyOutreachRow({ trigger_reason: null, source: null })).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isMommyOutreachRow({ trigger_reason: 'MOMMY_PRAISE', source: null })).toBe(true);
    expect(isMommyOutreachRow({ trigger_reason: 'Mommy_Praise', source: null })).toBe(true);
  });
});

describe('applyPersonaGate', () => {
  const mommyRow = { trigger_reason: 'mommy_praise', source: null };
  const handlerRow = { trigger_reason: 'slip_warning', source: 'handler' };
  const mamaRow = { trigger_reason: 'mama_was_watching', source: null };

  it('drops mommy/mama rows when onboarding is incomplete', () => {
    const filtered = applyPersonaGate([mommyRow, handlerRow, mamaRow], { onboardingComplete: false });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toBe(handlerRow);
  });

  it('keeps every row when onboarding is complete', () => {
    const filtered = applyPersonaGate([mommyRow, handlerRow, mamaRow], { onboardingComplete: true });
    expect(filtered).toHaveLength(3);
  });

  it('returns the same array reference shape (no mutation) when complete', () => {
    const rows = [mommyRow, handlerRow];
    const filtered = applyPersonaGate(rows, { onboardingComplete: true });
    expect(filtered).toEqual(rows);
  });

  it('returns empty when every row is mommy and gate is closed', () => {
    const filtered = applyPersonaGate([mommyRow, mamaRow, { trigger_reason: 'mommy_recall', source: null }], { onboardingComplete: false });
    expect(filtered).toEqual([]);
  });
});
