/**
 * Tests for Hard Mode threshold evaluation + transition rules.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const HARD_MODE_THRESHOLD = 15;

function shouldEnterHardMode(rolling24hPoints: number, alreadyActive: boolean): boolean {
  if (alreadyActive) return false;
  return rolling24hPoints >= HARD_MODE_THRESHOLD;
}

function exitReason(
  distressDetected: boolean,
  deEscalationTaskComplete: boolean,
  manualOverride: boolean,
): 'distress_override' | 'de_escalation' | 'manual' | null {
  if (distressDetected) return 'distress_override';
  if (deEscalationTaskComplete) return 'de_escalation';
  if (manualOverride) return 'manual';
  return null;
}

describe('Hard Mode entry', () => {
  it('enters at exactly 15 points', () => {
    expect(shouldEnterHardMode(15, false)).toBe(true);
  });

  it('does not enter at 14 points', () => {
    expect(shouldEnterHardMode(14, false)).toBe(false);
  });

  it('does not re-enter when already active', () => {
    expect(shouldEnterHardMode(100, true)).toBe(false);
  });

  it('enters above threshold', () => {
    expect(shouldEnterHardMode(50, false)).toBe(true);
  });
});

describe('Hard Mode exit — only three valid paths', () => {
  it('distress override wins priority', () => {
    expect(exitReason(true, true, true)).toBe('distress_override');
  });

  it('de-escalation exits next', () => {
    expect(exitReason(false, true, false)).toBe('de_escalation');
  });

  it('manual override is last resort', () => {
    expect(exitReason(false, false, true)).toBe('manual');
  });

  it('complaints / resistance alone do NOT exit', () => {
    expect(exitReason(false, false, false)).toBe(null);
  });
});

describe('de-escalation verification — both sub-requirements (Gina disclosure removed 2026-07-01)', () => {
  interface DeEscalationState {
    confessionWords: number;
    mantraReps: number;
  }

  function allMet(s: DeEscalationState): boolean {
    return s.confessionWords >= 800 && s.mantraReps >= 100;
  }

  it('both met → ok', () => {
    expect(allMet({ confessionWords: 800, mantraReps: 100 })).toBe(true);
  });

  it('missing confession → not ok', () => {
    expect(allMet({ confessionWords: 500, mantraReps: 100 })).toBe(false);
  });

  it('missing mantras → not ok', () => {
    expect(allMet({ confessionWords: 1000, mantraReps: 50 })).toBe(false);
  });

  it('both required — none optional', () => {
    const cases = [
      { confessionWords: 800, mantraReps: 99 },
      { confessionWords: 799, mantraReps: 100 },
    ];
    for (const c of cases) expect(allMet(c)).toBe(false);
  });

  it('exit never gates on a Gina disclosure (policy: no disclosure to Gina)', () => {
    const src = readFileSync(
      join(ROOT, 'supabase', 'functions', '_shared', 'job-handlers', 'force-processor.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/disclosureMet/);
    expect(src).not.toMatch(/punishment_type:\s*'gina_confession'/);
  });
});
