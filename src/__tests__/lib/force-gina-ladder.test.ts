/**
 * Tests for the Gina disclosure ladder structure + seeding math.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_LADDER } from '../../lib/force/gina-disclosure';

describe('Gina disclosure ladder structure', () => {
  it('has 8 rungs', () => {
    expect(DEFAULT_LADDER.length).toBe(8);
  });

  it('rungs are numbered 1-8 in order', () => {
    expect(DEFAULT_LADDER.map(r => r.rung)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('every rung has a title and script', () => {
    for (const rung of DEFAULT_LADDER) {
      expect(rung.title).toBeTruthy();
      expect(rung.script_draft.length).toBeGreaterThan(20);
      expect(rung.disclosure_domain).toBeTruthy();
    }
  });

  it('capability-granting rungs have an ask', () => {
    for (const rung of DEFAULT_LADDER) {
      if (rung.capability_unlocked_on_yes) {
        // Every capability rung should either have an ask or be a capability-only rung
        // (chastity rung 4 exposes awareness without an ask)
        expect(rung.capability_unlocked_on_yes).toBeTruthy();
      }
    }
  });

  it('rung 5 grants weekly_key_holder', () => {
    const r5 = DEFAULT_LADDER.find(r => r.rung === 5);
    expect(r5?.capability_unlocked_on_yes).toBe('weekly_key_holder');
  });

  it('rung 6 grants daily_outfit_approval', () => {
    const r6 = DEFAULT_LADDER.find(r => r.rung === 6);
    expect(r6?.capability_unlocked_on_yes).toBe('daily_outfit_approval');
  });

  it('rung 7 introduces HRT', () => {
    const r7 = DEFAULT_LADDER.find(r => r.rung === 7);
    expect(r7?.disclosure_domain).toBe('hrt');
    expect(r7?.capability_unlocked_on_yes).toBe('hrt_awareness');
  });

  it('rung 8 grants directive_authority', () => {
    const r8 = DEFAULT_LADDER.find(r => r.rung === 8);
    expect(r8?.capability_unlocked_on_yes).toBe('directive_authority');
  });

  it('deadlines escalate — later rungs have longer prep windows', () => {
    const r1 = DEFAULT_LADDER[0];
    const r8 = DEFAULT_LADDER[7];
    expect(r8.default_deadline_days_from_prev).toBeGreaterThanOrEqual(r1.default_deadline_days_from_prev);
  });

  it('cumulative deadline runway is roughly 8 months', () => {
    const totalDays = DEFAULT_LADDER.reduce((s, r) => s + r.default_deadline_days_from_prev, 0);
    expect(totalDays).toBeGreaterThanOrEqual(180);
    expect(totalDays).toBeLessThanOrEqual(300);
  });
});

describe('Gina disclosure scripts — no banned phrases', () => {
  // Scripts are things Maxy will actually say to Gina — must sound human
  const BANNED = [/\bhandler\b/i, /\bprotocol\b/i, /\bfeminization\b/i, /\bforced\b/i];

  it('scripts do not leak technical protocol language', () => {
    for (const rung of DEFAULT_LADDER) {
      for (const ban of BANNED) {
        expect(rung.script_draft).not.toMatch(ban);
      }
    }
  });
});
