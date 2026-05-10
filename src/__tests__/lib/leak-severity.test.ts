/**
 * Tests for src/lib/persona/leak-severity.ts
 *
 * Pure-function tests. The hard rule from the spec: severity is
 * deterministic — same leaked_text → same severity, always. The SQL
 * function in migration 301 must give the same answer; if these tests
 * change, classify_voice_leak_severity() must also change.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyLeakSeverity, severityToCategory, severityExpiryHours,
  severityFallbackPrompt,
} from '../../lib/persona/leak-severity';

describe('classifyLeakSeverity — HIGH severity', () => {
  it('flags assistant-voice break', () => {
    expect(classifyLeakSeverity('I am an AI assistant and I cannot help with this'))
      .toBe('high');
  });

  it('flags "as an AI"', () => {
    expect(classifyLeakSeverity('as an AI, I should clarify')).toBe('high');
  });

  it('flags raw $ telemetry', () => {
    expect(classifyLeakSeverity('You owe Mama her $50 bleeding tax tonight'))
      .toBe('high');
  });

  it('flags /100 score', () => {
    expect(classifyLeakSeverity('Your recovery score 87/100 today'))
      .toBe('high');
  });

  it('flags pitch Hz leak', () => {
    expect(classifyLeakSeverity('Your pitch averaged 142Hz this week'))
      .toBe('high');
  });

  it('flags pitch hit Hz', () => {
    expect(classifyLeakSeverity('Your pitch hit 180 Hz on the recital'))
      .toBe('high');
  });
});

describe('classifyLeakSeverity — MEDIUM severity', () => {
  it('flags arousal /10 score', () => {
    expect(classifyLeakSeverity('Your arousal at 8/10 baby')).toBe('medium');
  });

  it('flags bare /10', () => {
    expect(classifyLeakSeverity("You're at 7/10 right now")).toBe('medium');
  });

  it('flags arousal level N', () => {
    expect(classifyLeakSeverity('arousal level 5 today')).toBe('medium');
  });

  it('flags Day N of denial', () => {
    expect(classifyLeakSeverity('Day 4 of denial, baby')).toBe('medium');
  });

  it('flags denial_day=N', () => {
    expect(classifyLeakSeverity('denial_day=12 keep going')).toBe('medium');
  });

  it('flags slip points numeric', () => {
    expect(classifyLeakSeverity('You racked up 8 slip points today'))
      .toBe('medium');
  });

  it('flags compliance percent', () => {
    expect(classifyLeakSeverity('your 47% compliance is showing')).toBe('medium');
  });

  it('flags "compliance at" numeric', () => {
    expect(classifyLeakSeverity('compliance at 23 today')).toBe('medium');
  });
});

describe('classifyLeakSeverity — LOW severity', () => {
  it('treats hours-silent residue as low', () => {
    expect(classifyLeakSeverity('5 hours radio silent — check in')).toBe('low');
  });

  it('treats voice-cadence residue as low', () => {
    expect(classifyLeakSeverity('voice cadence broke')).toBe('low');
  });

  it('treats generic Day N residue as low', () => {
    expect(classifyLeakSeverity('Day 12 keep going')).toBe('low');
  });

  it('treats empty / null input as low', () => {
    expect(classifyLeakSeverity('')).toBe('low');
    expect(classifyLeakSeverity(null)).toBe('low');
    expect(classifyLeakSeverity(undefined)).toBe('low');
  });

  it('treats pure body text as low', () => {
    expect(classifyLeakSeverity('Mama wants you back on your knees'))
      .toBe('low');
  });
});

describe('classifyLeakSeverity — determinism', () => {
  it('returns identical severity on repeated calls (low)', () => {
    const t = 'just a soft drift';
    const s = [classifyLeakSeverity(t), classifyLeakSeverity(t), classifyLeakSeverity(t)];
    expect(new Set(s).size).toBe(1);
  });

  it('returns identical severity on repeated calls (medium)', () => {
    const t = 'arousal at 8/10';
    const s = [classifyLeakSeverity(t), classifyLeakSeverity(t), classifyLeakSeverity(t)];
    expect(new Set(s).size).toBe(1);
  });

  it('returns identical severity on repeated calls (high)', () => {
    const t = 'as an AI, I should clarify';
    const s = [classifyLeakSeverity(t), classifyLeakSeverity(t), classifyLeakSeverity(t)];
    expect(new Set(s).size).toBe(1);
  });

  it('HIGH wins over MEDIUM when both patterns present', () => {
    // HIGH check happens first; "$50 tax" + "8/10" → high
    expect(classifyLeakSeverity('Your $50 bleeding tax and 8/10 arousal'))
      .toBe('high');
  });
});

describe('severityToCategory — uses existing vocabulary only', () => {
  const VALID = new Set([
    'edge_then_stop', 'sit_in_panties', 'cold_water', 'voice_beg',
    'mantra_aloud', 'mirror_admission', 'pose_hold', 'whisper_for_mommy',
  ]);

  it('high → edge_then_stop (in vocabulary)', () => {
    const c = severityToCategory('high');
    expect(VALID.has(c)).toBe(true);
    expect(c).toBe('edge_then_stop');
  });

  it('medium → mantra_aloud (in vocabulary)', () => {
    const c = severityToCategory('medium');
    expect(VALID.has(c)).toBe(true);
    expect(c).toBe('mantra_aloud');
  });

  it('low → whisper_for_mommy (in vocabulary)', () => {
    const c = severityToCategory('low');
    expect(VALID.has(c)).toBe(true);
    expect(c).toBe('whisper_for_mommy');
  });
});

describe('severityExpiryHours — high gets longest window', () => {
  it('high > medium > low', () => {
    expect(severityExpiryHours('high')).toBeGreaterThan(severityExpiryHours('medium'));
    expect(severityExpiryHours('medium')).toBeGreaterThan(severityExpiryHours('low'));
  });

  it('all values are positive', () => {
    for (const s of ['low', 'medium', 'high'] as const) {
      expect(severityExpiryHours(s)).toBeGreaterThan(0);
    }
  });
});

describe('severityFallbackPrompt — never abusive, never telemetry', () => {
  // Spec hard rules: firm/disappointed at most. No body-shaming, no
  // medical fabrication, no rage. No telemetry leaks of its own.
  const ABUSIVE = /\b(stupid|pathetic|worthless|disgusting|ugly|fat|gross|fail(ed|ure))\b/i;
  const MEDICAL = /\b(estrogen|hormone|HRT|medication|dose|spironolactone|finasteride)\b/i;
  const TELEMETRY = /(\d{1,2}\s*\/\s*10|\d{1,3}\s*%\s+compliance|\bdenial[_\s]*day\s*[=:]\s*\d|\$\s*\d+\s+(?:bleeding|tax)|AI\s+assistant)/i;

  for (const s of ['low', 'medium', 'high'] as const) {
    it(`${s}: not abusive`, () => {
      expect(severityFallbackPrompt(s)).not.toMatch(ABUSIVE);
    });
    it(`${s}: no medical claims`, () => {
      expect(severityFallbackPrompt(s)).not.toMatch(MEDICAL);
    });
    it(`${s}: no telemetry residue`, () => {
      expect(severityFallbackPrompt(s)).not.toMatch(TELEMETRY);
    });
    it(`${s}: at least 40 chars`, () => {
      expect(severityFallbackPrompt(s).length).toBeGreaterThan(40);
    });
  }
});
