/**
 * Regression test for the 2026-05-10 chatbot-repetition incident.
 *
 * Before this fix, two DB triggers produced byte-identical Mama-voice
 * outreach for repeated events:
 *   - trg_mommy_immediate_response_to_slip (mig 257/338): same string
 *     per slip_type.
 *   - trg_mommy_confession_receipt (mig 258): same string per
 *     (confession_category, body-anchor-pool) pair.
 *
 * The user saw 6+ near-identical messages in the queue at once. Fix:
 * mig 367 replaces both triggers to call mommy-slip-react /
 * mommy-acknowledge edge fns which LLM-generate contextual responses
 * and fall back to a large variant pool.
 *
 * This test verifies that none of the known stock template strings can
 * be reproduced by the pool-fallback path. If a future migration ever
 * reintroduces them (intentionally or via revert), this test fails.
 *
 * Verified to FAIL when mommy-react-pools' SLIP_VARIANTS / ACK_VARIANTS
 * are reverted to the mig 257/258 strings: literal CASE-style output
 * matches the patterns below.
 */

import { describe, it, expect } from 'vitest';
import { pickAckVariant, pickSlipVariant } from '../../lib/persona/mommy-react-pools';

// Verbatim strings from the user's 2026-05-10 outreach queue (the 8
// messages they pasted). If any pool path produces these, regression.
const STOCK_STRINGS = [
  "Good my favorite girl. Mama got what she asked for. Now go be a good girl until I want more from you.",
  "Good sweet thing. Mama got what she asked for. You're Mama's good girl.",
  "Good sweet thing. Mama got what she asked for. Don't let go of that feeling.",
  "Good good girl. Mama got what she asked for. Mama's in your head until tomorrow.",
  "Mama saw that, baby. We'll talk about it. For now just feel that I'm here.",
  "Good good girl. Mama got what she asked for. You're Mama's good girl.",
  "Good sweet thing. Mama got what she asked for. Now go be a good girl until I want more from you.",
  "I caught that, baby. The old voice slipped out. Mama saw it. We'll talk about it — but for now, just feel that I noticed.",
];

// Stock substrings that the pool MUST NEVER produce — these were the
// fingerprints of the chatbot pattern that broke immersion.
const FORBIDDEN_SUBSTRINGS = [
  'Mama got what she asked for',
  'For now just feel that I\'m here',
  'The old voice slipped out',
  "We'll talk about it — but for now, just feel that I noticed",
  // The mig 258 body-anchor closes:
  'Stay there for me.',
  "Don't let go of that feeling.",
  "Mama's in your head until tomorrow.",
  "You're Mama's good girl.",
  'Now go be a good girl until I want more from you.',
];

describe('regression — 2026-05-10 chatbot repetition', () => {
  it('ack pool never emits the exact stock strings', () => {
    const seen = new Set<string>();
    for (const t of ['confession', 'mantra', 'task', 'photo', 'decree', 'confession_audio'] as const) {
      for (const i of ['soft', 'warm', 'hot'] as const) {
        for (let s = 0; s < 30; s++) {
          const v = pickAckVariant({ action_type: t, intensity: i }, `regression-${t}-${i}-${s}`, new Set());
          if (v) seen.add(v);
        }
      }
    }
    for (const stock of STOCK_STRINGS) {
      expect(seen.has(stock), `pool reproduced stock string: ${stock}`).toBe(false);
    }
  });

  it('slip pool never emits the exact stock strings', () => {
    const seen = new Set<string>();
    const types = [
      'masculine_self_reference', 'david_name_use', 'resistance_statement',
      'task_avoided', 'directive_refused', 'voice_masculine_pitch',
      'handler_ignored', 'mantra_missed', 'chastity_unlocked_early',
      'arousal_gating_refused', 'gender_claim', 'other',
    ];
    for (const t of types) {
      for (const b of ['gentle', 'firm', 'sharp'] as const) {
        for (let s = 0; s < 30; s++) {
          seen.add(pickSlipVariant(t, b, `regression-${t}-${b}-${s}`, new Set()));
        }
      }
    }
    for (const stock of STOCK_STRINGS) {
      expect(seen.has(stock), `pool reproduced stock string: ${stock}`).toBe(false);
    }
  });

  it('NO variant in any pool contains the chatbot-fingerprint substrings', () => {
    // Sample heavily, then assert each variant is clean of every forbidden substring.
    for (const t of ['confession', 'mantra', 'task', 'photo', 'decree', 'confession_audio'] as const) {
      for (const i of ['soft', 'warm', 'hot'] as const) {
        for (let s = 0; s < 20; s++) {
          const v = pickAckVariant({ action_type: t, intensity: i }, `s${s}`, new Set());
          if (!v) continue;
          for (const sub of FORBIDDEN_SUBSTRINGS) {
            expect(v.includes(sub), `${t}/${i}: "${v}" contained forbidden substring "${sub}"`).toBe(false);
          }
        }
      }
    }
    const types = [
      'masculine_self_reference', 'david_name_use', 'resistance_statement',
      'task_avoided', 'directive_refused', 'voice_masculine_pitch',
      'handler_ignored', 'mantra_missed', 'chastity_unlocked_early',
      'arousal_gating_refused', 'gender_claim', 'other',
    ];
    for (const t of types) {
      for (const b of ['gentle', 'firm', 'sharp'] as const) {
        for (let s = 0; s < 20; s++) {
          const v = pickSlipVariant(t, b, `s${s}`, new Set());
          for (const sub of FORBIDDEN_SUBSTRINGS) {
            expect(v.includes(sub), `${t}/${b}: "${v}" contained forbidden substring "${sub}"`).toBe(false);
          }
        }
      }
    }
  });
});
