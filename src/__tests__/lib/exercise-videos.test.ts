import { describe, it, expect } from 'vitest';
import { normalizeMove, exerciseVideoUrl } from '../../lib/workout/exercise-videos';
import { bodyProgramDay } from '../../lib/body-program';

describe('exercise videos — visual ID per move', () => {
  it('normalizes parenthetical variants to the canonical move', () => {
    expect(normalizeMove('Glute bridges (wake-up)')).toBe('glute bridges');
    expect(normalizeMove('Hip thrusts (heavy)')).toBe('hip thrusts');
    expect(normalizeMove('Clamshells (wake-up)')).toBe('clamshells');
  });

  it('returns a valid YouTube search URL for every move in a real train day', () => {
    // Friday = Glute focus has the widest exercise spread (warm-up + main + cooldown).
    const order = bodyProgramDay('2026-07-13', '2026-07-17');
    for (const b of order.blocks) {
      const url = exerciseVideoUrl(b.move);
      expect(url).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=/);
      // Query is non-empty and URL-encoded.
      const q = new URL(url).searchParams.get('search_query');
      expect(q && q.length).toBeGreaterThan(3);
    }
  });

  it('never returns an empty link, even for an unknown move', () => {
    const url = exerciseVideoUrl('Some Novel Exercise');
    expect(url).toContain('youtube.com/results');
    expect(new URL(url).searchParams.get('search_query')).toContain('some novel exercise');
  });

  it('covers the warm-up incline treadmill and all cooldown stretches', () => {
    for (const move of ['Incline treadmill', 'Hip flexor stretch', 'Pigeon pose', 'Cat-cow']) {
      expect(exerciseVideoUrl(move)).toMatch(/search_query=[^&]+/);
    }
  });
});
