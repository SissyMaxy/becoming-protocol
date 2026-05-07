import { describe, it, expect } from 'vitest';
import {
  resolveExternalTitle,
  resolveInternalTitle,
  looksLikeNeutralTitle,
  type ManagedEventType,
} from '../../lib/calendar/titles';

describe('calendar title resolver', () => {
  describe('with neutral=true', () => {
    const neutral = true;
    it('returns plain neutral copy for morning_ritual', () => {
      expect(resolveExternalTitle('morning_ritual', neutral)).toBe('Morning routine');
    });
    it('returns plain neutral copy for evening_reflection', () => {
      expect(resolveExternalTitle('evening_reflection', neutral)).toBe('Evening journal');
    });
    it('collapses kink-flavored types into "Personal block"', () => {
      expect(resolveExternalTitle('scheduled_punishment', neutral)).toBe('Personal block');
      expect(resolveExternalTitle('scheduled_reward', neutral)).toBe('Personal block');
      expect(resolveExternalTitle('aftercare_block', neutral)).toBe('Personal block');
      expect(resolveExternalTitle('verification_window', neutral)).toBe('Personal block');
    });
    it('uses generic "Voice practice" for mantra_recitation', () => {
      expect(resolveExternalTitle('mantra_recitation', neutral)).toBe('Voice practice');
    });
    it('every neutral output passes the persona-leak guard', () => {
      const types: ManagedEventType[] = [
        'morning_ritual', 'evening_reflection', 'scheduled_punishment',
        'scheduled_reward', 'aftercare_block', 'mantra_recitation', 'verification_window',
      ];
      for (const t of types) {
        const title = resolveExternalTitle(t, neutral);
        expect(looksLikeNeutralTitle(title), `"${title}" should be neutral`).toBe(true);
      }
    });
  });

  describe('with neutral=false', () => {
    it('returns the internal Mommy-flavored title', () => {
      expect(resolveExternalTitle('morning_ritual', false)).toBe('Mommy — morning ritual');
      expect(resolveExternalTitle('aftercare_block', false)).toBe('Mommy — aftercare block');
    });
  });

  describe('internal titles', () => {
    it('always carry the Mommy attribution regardless of toggle', () => {
      expect(resolveInternalTitle('scheduled_punishment')).toBe('Mommy — scheduled punishment');
    });
  });

  describe('persona-leak guard', () => {
    it('rejects strings containing kink terms', () => {
      expect(looksLikeNeutralTitle('Mommy — morning ritual')).toBe(false);
      expect(looksLikeNeutralTitle('Goon block')).toBe(false);
      expect(looksLikeNeutralTitle('Aftercare break')).toBe(false);
      expect(looksLikeNeutralTitle('Confession 5pm')).toBe(false);
      expect(looksLikeNeutralTitle('Edge session')).toBe(false);
    });
    it('passes vanilla calendar-grade titles', () => {
      expect(looksLikeNeutralTitle('Morning routine')).toBe(true);
      expect(looksLikeNeutralTitle('Evening journal')).toBe(true);
      expect(looksLikeNeutralTitle('Personal block')).toBe(true);
      expect(looksLikeNeutralTitle('Voice practice')).toBe(true);
    });
  });
});
