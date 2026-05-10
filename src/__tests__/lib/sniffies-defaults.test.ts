import { describe, expect, it } from 'vitest';
import { DEFAULT_SNIFFIES_SETTINGS } from '../../lib/sniffies/types';

describe('sniffies defaults', () => {
  it('every flag is false by default', () => {
    expect(DEFAULT_SNIFFIES_SETTINGS.sniffies_integration_enabled).toBe(false);
    expect(DEFAULT_SNIFFIES_SETTINGS.persona_use_enabled).toBe(false);
    expect(DEFAULT_SNIFFIES_SETTINGS.dares_use_enabled).toBe(false);
    expect(DEFAULT_SNIFFIES_SETTINGS.slip_use_enabled).toBe(false);
  });

  it('the defaults object has exactly four keys (no surprise flags)', () => {
    expect(Object.keys(DEFAULT_SNIFFIES_SETTINGS).sort()).toEqual([
      'dares_use_enabled',
      'persona_use_enabled',
      'slip_use_enabled',
      'sniffies_integration_enabled',
    ]);
  });
});
