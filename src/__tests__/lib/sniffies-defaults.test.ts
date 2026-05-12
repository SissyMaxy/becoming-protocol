import { describe, expect, it } from 'vitest';
import { DEFAULT_SNIFFIES_SETTINGS } from '../../lib/sniffies/types';

describe('sniffies defaults', () => {
  it('every privacy gate is false by default', () => {
    expect(DEFAULT_SNIFFIES_SETTINGS.sniffies_integration_enabled).toBe(false);
    expect(DEFAULT_SNIFFIES_SETTINGS.persona_use_enabled).toBe(false);
    expect(DEFAULT_SNIFFIES_SETTINGS.dares_use_enabled).toBe(false);
    expect(DEFAULT_SNIFFIES_SETTINGS.slip_use_enabled).toBe(false);
  });

  it('auto_react_enabled defaults TRUE — the "pause Mama" lever, master switch still gates everything', () => {
    // Privacy floor is held by sniffies_integration_enabled. Once a user
    // opts in to imports, Mama should be aware by default; the user can
    // flip auto_react_enabled to FALSE to pause real-time reactions
    // without losing the imports themselves.
    expect(DEFAULT_SNIFFIES_SETTINGS.auto_react_enabled).toBe(true);
  });

  it('the defaults object has the expected five keys (no surprise flags)', () => {
    expect(Object.keys(DEFAULT_SNIFFIES_SETTINGS).sort()).toEqual([
      'auto_react_enabled',
      'dares_use_enabled',
      'persona_use_enabled',
      'slip_use_enabled',
      'sniffies_integration_enabled',
    ]);
  });
});
