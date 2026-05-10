import { describe, expect, it } from 'vitest';
import { evaluateSniffiesGate } from '../../lib/sniffies/gates';

describe('sniffies/gates evaluateSniffiesGate', () => {
  it('returns false when settings is null (no row)', () => {
    expect(evaluateSniffiesGate(null, 'persona')).toBe(false);
    expect(evaluateSniffiesGate(undefined, 'dares')).toBe(false);
  });

  it('returns false when master switch is off', () => {
    const s = {
      sniffies_integration_enabled: false,
      persona_use_enabled: true,
      dares_use_enabled: true,
      slip_use_enabled: true,
    };
    expect(evaluateSniffiesGate(s, 'persona')).toBe(false);
    expect(evaluateSniffiesGate(s, 'dares')).toBe(false);
    expect(evaluateSniffiesGate(s, 'slip')).toBe(false);
  });

  it('returns true when master + relevant granular are both on', () => {
    expect(
      evaluateSniffiesGate(
        {
          sniffies_integration_enabled: true,
          persona_use_enabled: true,
          dares_use_enabled: false,
          slip_use_enabled: false,
        },
        'persona',
      ),
    ).toBe(true);
  });

  it('granular flags do not cross-leak', () => {
    const s = {
      sniffies_integration_enabled: true,
      persona_use_enabled: true,
      dares_use_enabled: false,
      slip_use_enabled: false,
    };
    expect(evaluateSniffiesGate(s, 'persona')).toBe(true);
    expect(evaluateSniffiesGate(s, 'dares')).toBe(false);
    expect(evaluateSniffiesGate(s, 'slip')).toBe(false);
  });

  it('returns false when only the granular flag is on (master off)', () => {
    expect(
      evaluateSniffiesGate(
        { sniffies_integration_enabled: false, persona_use_enabled: true },
        'persona',
      ),
    ).toBe(false);
  });

  it('returns false for an unknown use string', () => {
    expect(
      evaluateSniffiesGate(
        {
          sniffies_integration_enabled: true,
          persona_use_enabled: true,
          dares_use_enabled: true,
          slip_use_enabled: true,
          // @ts-expect-error - testing the default branch
        },
        'arbitrary',
      ),
    ).toBe(false);
  });
});
