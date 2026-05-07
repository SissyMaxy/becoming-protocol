// Tests for src/lib/letters/auto-archive.ts — the auto-archive policy matrix.
//
// Pure function. No DB. Asserts every (source × affect × ack) combination
// in the spec against shouldAutoArchive.

import { describe, it, expect } from 'vitest';
import { shouldAutoArchive } from '../../lib/letters/auto-archive';

const ALL_AFFECTS = [
  'hungry', 'delighted', 'watching', 'patient', 'aching',
  'amused', 'possessive', 'indulgent', 'restless',
] as const;

const ARCHIVING_PRAISE_AFFECTS = new Set(['delighted', 'possessive']);

describe('shouldAutoArchive', () => {
  describe('mommy_praise', () => {
    for (const affect of ALL_AFFECTS) {
      const expected = ARCHIVING_PRAISE_AFFECTS.has(affect);
      it(`affect=${affect} → ${expected}`, () => {
        expect(shouldAutoArchive({ source: 'mommy_praise', affect_snapshot: affect })).toBe(expected);
      });
    }

    it('null affect → false (no warmth signal)', () => {
      expect(shouldAutoArchive({ source: 'mommy_praise', affect_snapshot: null })).toBe(false);
    });
  });

  describe('mommy_bedtime', () => {
    for (const affect of ALL_AFFECTS) {
      it(`affect=${affect} → true (bedtime always archives)`, () => {
        expect(shouldAutoArchive({ source: 'mommy_bedtime', affect_snapshot: affect })).toBe(true);
      });
    }

    it('null affect → still true (bedtime archives regardless)', () => {
      expect(shouldAutoArchive({ source: 'mommy_bedtime', affect_snapshot: null })).toBe(true);
    });
  });

  describe('mommy_recall', () => {
    for (const affect of ALL_AFFECTS) {
      it(`pending + affect=${affect} → false (waits for ack)`, () => {
        expect(shouldAutoArchive({
          source: 'mommy_recall', affect_snapshot: affect, status: 'pending',
        })).toBe(false);
      });
    }

    it('status=delivered → true', () => {
      expect(shouldAutoArchive({
        source: 'mommy_recall', affect_snapshot: 'patient', status: 'delivered',
      })).toBe(true);
    });

    it('delivered_at set (status missing) → true', () => {
      expect(shouldAutoArchive({
        source: 'mommy_recall', affect_snapshot: null, delivered_at: '2026-04-30T10:00:00Z',
      })).toBe(true);
    });

    it('status=expired → false (not really an ack)', () => {
      expect(shouldAutoArchive({
        source: 'mommy_recall', affect_snapshot: 'hungry', status: 'expired',
      })).toBe(false);
    });
  });

  describe('mommy_mantra (stub-ready)', () => {
    it('pending → false', () => {
      expect(shouldAutoArchive({
        source: 'mommy_mantra', affect_snapshot: 'patient', status: 'pending',
      })).toBe(false);
    });

    it('delivered → true', () => {
      expect(shouldAutoArchive({
        source: 'mommy_mantra', affect_snapshot: 'patient', status: 'delivered',
      })).toBe(true);
    });
  });

  describe('mommy_tease (not in policy)', () => {
    for (const affect of ALL_AFFECTS) {
      it(`pending + affect=${affect} → false`, () => {
        expect(shouldAutoArchive({
          source: 'mommy_tease', affect_snapshot: affect, status: 'pending',
        })).toBe(false);
      });
      it(`delivered + affect=${affect} → false (still not auto-archived; user can pin)`, () => {
        expect(shouldAutoArchive({
          source: 'mommy_tease', affect_snapshot: affect, status: 'delivered',
        })).toBe(false);
      });
    }
  });

  describe('non-Mommy / unknown sources', () => {
    it('handler_dream → false', () => {
      expect(shouldAutoArchive({
        source: 'handler_dream', affect_snapshot: 'delighted', status: 'delivered',
      })).toBe(false);
    });

    it('null source → false', () => {
      expect(shouldAutoArchive({ source: null, affect_snapshot: 'delighted' })).toBe(false);
    });

    it('empty string source → false', () => {
      expect(shouldAutoArchive({ source: '', affect_snapshot: 'delighted' })).toBe(false);
    });
  });

  describe('case insensitivity (defensive)', () => {
    it('MOMMY_PRAISE (uppercase) → matches policy', () => {
      expect(shouldAutoArchive({ source: 'MOMMY_PRAISE', affect_snapshot: 'delighted' })).toBe(true);
    });

    it('Mommy_Bedtime (mixed) → archives', () => {
      expect(shouldAutoArchive({ source: 'Mommy_Bedtime', affect_snapshot: null })).toBe(true);
    });
  });
});
