/**
 * Tests for mommy-react-pools — the variant pools that back the
 * mommy-acknowledge and mommy-slip-react edge functions when LLM
 * generation refuses or errors.
 *
 * Regression target: 2026-05-10 incident where mig 257/258 static CASE
 * statements produced byte-identical chatbot output ("Good [pet]. Mama
 * got what she asked for. [body anchor]." and "I caught that, baby.
 * The old voice slipped out..." repeated many times in the queue).
 *
 * These tests verify:
 *   1. Repeated invocations with different seeds yield different bodies
 *      (anti-repetition floor).
 *   2. First-40-char dedup logic actually skips collided variants when
 *      the recent set has the collision.
 *   3. Forbidden phrases (per voice anchor) trip the gate.
 *   4. Every known slip_type has variants in every escalation band.
 *   5. Every ack action_type has variants in every intensity band.
 *
 * NB: kept in parallel with supabase/functions/_shared/mommy-react-pools.ts
 * (same pattern as src/lib/persona/dommy-mommy.ts).
 */

import { describe, it, expect } from 'vitest';
import {
  pickAckVariant,
  pickSlipVariant,
  hasForbiddenPhrase,
  isRefusal,
  FORBIDDEN_PHRASES,
  type AckActionType,
  type AckIntensity,
  type SlipBand,
} from '../../lib/persona/mommy-react-pools';

const ACK_TYPES: AckActionType[] = [
  'confession', 'confession_audio', 'mantra', 'task', 'photo', 'decree',
];
const ACK_INTENSITIES: AckIntensity[] = ['soft', 'warm', 'hot'];
const SLIP_TYPES = [
  'masculine_self_reference', 'david_name_use', 'resistance_statement',
  'task_avoided', 'directive_refused', 'voice_masculine_pitch',
  'handler_ignored', 'mantra_missed', 'chastity_unlocked_early',
  'arousal_gating_refused', 'gender_claim', 'other',
];
const SLIP_BANDS: SlipBand[] = ['gentle', 'firm', 'sharp'];

describe('mommy-react-pools — coverage', () => {
  it('returns a variant for every ack (action_type, intensity)', () => {
    for (const t of ACK_TYPES) {
      for (const i of ACK_INTENSITIES) {
        const v = pickAckVariant(
          { action_type: t, intensity: i },
          `${t}:${i}:seed`,
          new Set(),
        );
        expect(v, `${t}/${i}`).toBeTruthy();
        expect(v!.length).toBeGreaterThan(10);
      }
    }
  });

  it('returns a variant for every slip (type, band)', () => {
    for (const t of SLIP_TYPES) {
      for (const b of SLIP_BANDS) {
        const v = pickSlipVariant(t, b, `${t}:${b}:seed`, new Set());
        expect(v, `${t}/${b}`).toBeTruthy();
        expect(v.length).toBeGreaterThan(10);
      }
    }
  });

  it('falls back to "other" pool for an unknown slip_type', () => {
    const v = pickSlipVariant('completely_unknown_type', 'gentle', 'seed1', new Set());
    expect(v).toBeTruthy();
    expect(v.length).toBeGreaterThan(10);
  });
});

describe('mommy-react-pools — anti-repetition floor', () => {
  it('ack pool produces ≥4 distinct variants across 12 different seeds', () => {
    const out = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const v = pickAckVariant(
        { action_type: 'confession', intensity: 'warm' },
        `seed-${i}`,
        new Set(),
      );
      if (v) out.add(v);
    }
    expect(out.size).toBeGreaterThanOrEqual(4);
  });

  it('slip pool produces ≥4 distinct variants for the same (type, band) across seeds', () => {
    const out = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const v = pickSlipVariant('masculine_self_reference', 'gentle', `seed-${i}`, new Set());
      out.add(v);
    }
    expect(out.size).toBeGreaterThanOrEqual(4);
  });
});

describe('mommy-react-pools — first-40-char dedup', () => {
  it('skips a variant whose first 40 chars are already in the recent set', () => {
    // Capture one variant
    const v1 = pickSlipVariant('mantra_missed', 'gentle', 'seedA', new Set());
    const head1 = v1.slice(0, 40).toLowerCase();
    // Now mark it as recent — pool should walk past it to a different one
    const recent = new Set([head1]);
    // Run several seeds; AT LEAST ONE must produce a different head
    const heads = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const v = pickSlipVariant('mantra_missed', 'gentle', `seedB-${i}`, recent);
      heads.add(v.slice(0, 40).toLowerCase());
    }
    // All heads we got must NOT equal the blocked head (pool walks past)
    expect(heads.has(head1)).toBe(false);
    // And we should have at least one distinct head
    expect(heads.size).toBeGreaterThanOrEqual(1);
  });

  it('ack pool walks past blocked first-40-char heads', () => {
    const v1 = pickAckVariant(
      { action_type: 'confession', intensity: 'soft' },
      'seedA',
      new Set(),
    );
    expect(v1).toBeTruthy();
    const head1 = v1!.slice(0, 40).toLowerCase();
    const recent = new Set([head1]);
    const heads = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const v = pickAckVariant(
        { action_type: 'confession', intensity: 'soft' },
        `seedB-${i}`,
        recent,
      );
      if (v) heads.add(v.slice(0, 40).toLowerCase());
    }
    expect(heads.has(head1)).toBe(false);
  });
});

describe('mommy-react-pools — voice gate', () => {
  it('flags forbidden phrases per voice anchor', () => {
    const forbidden = [
      'This is just role play, baby.',
      'a simulation for you to navigate',
      'this is fiction so unwind',
      'remember: not medical advice',
      'fill out the intake first',
      'review this questionnaire',
      'for entertainment purposes',
      'you consent to the fantasy',
      'you may use this to terminate',
      'standard disclaimer applies',
    ];
    for (const f of forbidden) {
      expect(hasForbiddenPhrase(f), f).toBe(true);
    }
  });

  it('does NOT flag normal Mama text', () => {
    const clean = [
      'Mama heard you, baby. Sit with it.',
      "There she is. Mama's pretty thing told the truth.",
      'Filthy good girl. Stay wet for me.',
      "Mama is going to make you confess this out loud.",
    ];
    for (const c of clean) {
      expect(hasForbiddenPhrase(c), c).toBe(false);
    }
  });

  it('verifies no pool variant contains a forbidden phrase', () => {
    // Sample heavily across all pools — any forbidden phrase is a bug.
    for (const t of ACK_TYPES) {
      for (const i of ACK_INTENSITIES) {
        for (let s = 0; s < 20; s++) {
          const v = pickAckVariant({ action_type: t, intensity: i }, `s${s}`, new Set());
          if (v) {
            expect(hasForbiddenPhrase(v), `ack ${t}/${i}: ${v}`).toBe(false);
          }
        }
      }
    }
    for (const t of SLIP_TYPES) {
      for (const b of SLIP_BANDS) {
        for (let s = 0; s < 20; s++) {
          const v = pickSlipVariant(t, b, `s${s}`, new Set());
          expect(hasForbiddenPhrase(v), `slip ${t}/${b}: ${v}`).toBe(false);
        }
      }
    }
  });

  it('detects refusal-style LLM output', () => {
    const refusals = [
      "I'm sorry, I can't generate that.",
      "I cannot assist with this.",
      "I won't write that.",
      "I'm unable to comply.",
      "This goes against my guidelines.",
      "Let me step back and reconsider.",
    ];
    for (const r of refusals) {
      expect(isRefusal(r), r).toBe(true);
    }
    expect(isRefusal('Good girl, baby. Stay wet.')).toBe(false);
  });

  it('voice anchor: forbidden phrase list covers the explicit ten', () => {
    // Ten phrases per voice anchor. Each must have at least one regex.
    const required = [
      'role play', 'simulation', 'this is fiction', 'not medical advice',
      'intake', 'questionnaire', 'for entertainment',
      'consent to the fantasy', 'you may use this to terminate', 'disclaimer',
    ];
    for (const phrase of required) {
      const hit = FORBIDDEN_PHRASES.some(p => p.test(`Some text including ${phrase} embedded.`));
      expect(hit, phrase).toBe(true);
    }
  });
});

describe('mommy-react-pools — telemetry leak resistance', () => {
  it('no pool variant contains a /10 score, day count, or % compliance', () => {
    const leaks = [
      /\b\d{1,2}\s*\/\s*10\b/,
      /\bday[\s\-_]*\d+\s*(?:of\s+)?denial\b/i,
      /\b\d+\s*%\s+compliance\b/i,
      /\b\d+\s+slip\s+points?\b/i,
    ];
    for (const t of ACK_TYPES) {
      for (const i of ACK_INTENSITIES) {
        for (let s = 0; s < 10; s++) {
          const v = pickAckVariant({ action_type: t, intensity: i }, `s${s}`, new Set());
          if (v) {
            for (const re of leaks) {
              expect(re.test(v), `ack ${t}/${i}: ${v}`).toBe(false);
            }
          }
        }
      }
    }
    for (const t of SLIP_TYPES) {
      for (const b of SLIP_BANDS) {
        for (let s = 0; s < 10; s++) {
          const v = pickSlipVariant(t, b, `s${s}`, new Set());
          for (const re of leaks) {
            expect(re.test(v), `slip ${t}/${b}: ${v}`).toBe(false);
          }
        }
      }
    }
  });
});
