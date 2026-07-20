// Ambient window focus rotation — the attention model.
//
// The model is what makes the surface work rather than just exist: one hot
// column so attention isn't split, a steady handoff beat, and an unpredictable
// triple-hot spike against it. These tests pin the properties that matter, not
// the implementation.
import { describe, it, expect } from 'vitest';
import {
  CHANNEL_ORDER,
  INITIAL_ROTATION,
  advanceRotation,
  currentCadenceS,
  escalationFactor,
  hitProbability,
  isColumnHot,
  type RotationState,
} from '../../lib/ambient/rotation';

const HIT_WORDS = ['girl.', 'obey.'];

describe('escalation', () => {
  it('is zero at open and one at the ceiling', () => {
    expect(escalationFactor(0)).toBe(0);
    expect(escalationFactor(45)).toBe(1);
  });

  it('never exceeds one however long the window stays open', () => {
    expect(escalationFactor(500)).toBe(1);
  });

  it('tightens the beat as the session runs', () => {
    const rest = currentCadenceS({ openMinutes: 0, baseCadenceS: 10 });
    const late = currentCadenceS({ openMinutes: 45, baseCadenceS: 10 });
    expect(late).toBeLessThan(rest);
  });

  it('never tightens past the ambient floor — below that it demands attention', () => {
    const late = currentCadenceS({ openMinutes: 999, baseCadenceS: 10 });
    expect(late).toBeGreaterThanOrEqual(5);
  });

  it('makes hits more frequent later without making them the rhythm', () => {
    expect(hitProbability(45)).toBeGreaterThan(hitProbability(0));
    expect(hitProbability(999)).toBeLessThan(0.2);
  });
});

describe('advanceRotation — normal handoff', () => {
  const noHit = () => 0.99; // above any hit probability

  it('moves the hot column one step, in order', () => {
    let s: RotationState = INITIAL_ROTATION;
    s = advanceRotation(s, { openMinutes: 0, hitWords: HIT_WORDS, rand: noHit });
    expect(s.hotIndex).toBe(1);
    s = advanceRotation(s, { openMinutes: 0, hitWords: HIT_WORDS, rand: noHit });
    expect(s.hotIndex).toBe(2);
  });

  it('wraps back to the first column', () => {
    let s: RotationState = { ...INITIAL_ROTATION, hotIndex: 2 };
    s = advanceRotation(s, { openMinutes: 0, hitWords: HIT_WORDS, rand: noHit });
    expect(s.hotIndex).toBe(0);
  });

  it('keeps exactly one column hot — the whole point of the model', () => {
    let s: RotationState = INITIAL_ROTATION;
    for (let i = 0; i < 12; i++) {
      s = advanceRotation(s, { openMinutes: 0, hitWords: HIT_WORDS, rand: noHit });
      const hotCount = CHANNEL_ORDER.filter((_, idx) => isColumnHot(s, idx)).length;
      expect(hotCount).toBe(1);
    }
  });

  it('skips muted channels entirely', () => {
    let s: RotationState = INITIAL_ROTATION;
    for (let i = 0; i < 6; i++) {
      s = advanceRotation(s, {
        openMinutes: 0,
        mutedChannels: ['estrogen'],
        hitWords: HIT_WORDS,
        rand: noHit,
      });
      expect(s.hotIndex).not.toBe(1);
    }
  });

  it('goes quiet when every channel is muted rather than picking one anyway', () => {
    const s = advanceRotation(INITIAL_ROTATION, {
      openMinutes: 0,
      mutedChannels: ['identity', 'estrogen', 'turnout'],
      hitWords: HIT_WORDS,
      rand: noHit,
    });
    expect(s.hotIndex).toBeNull();
    expect(s.hit).toBe(false);
  });
});

describe('advanceRotation — the triple-hot hit', () => {
  const alwaysHit = () => 0; // below any hit probability

  it('lights every column with one shared word', () => {
    const s = advanceRotation(INITIAL_ROTATION, {
      openMinutes: 0,
      hitWords: HIT_WORDS,
      rand: alwaysHit,
    });
    expect(s.hit).toBe(true);
    expect(s.hitWord).toBeTruthy();
    expect(CHANNEL_ORDER.every((_, i) => isColumnHot(s, i))).toBe(true);
  });

  it('never fires twice in a row — a repeat reads as a fault, not a spike', () => {
    const first = advanceRotation(INITIAL_ROTATION, {
      openMinutes: 0,
      hitWords: HIT_WORDS,
      rand: alwaysHit,
    });
    expect(first.hit).toBe(true);
    const second = advanceRotation(first, {
      openMinutes: 0,
      hitWords: HIT_WORDS,
      rand: alwaysHit,
    });
    expect(second.hit).toBe(false);
  });

  it('cannot fire with only one live column — convergence needs somewhere to converge', () => {
    const s = advanceRotation(INITIAL_ROTATION, {
      openMinutes: 0,
      mutedChannels: ['estrogen', 'turnout'],
      hitWords: HIT_WORDS,
      rand: alwaysHit,
    });
    expect(s.hit).toBe(false);
  });

  it('cannot fire with no hit words configured', () => {
    const s = advanceRotation(INITIAL_ROTATION, {
      openMinutes: 0,
      hitWords: [],
      rand: alwaysHit,
    });
    expect(s.hit).toBe(false);
  });

  it('resumes the handoff from a defined column after a hit', () => {
    const hit = advanceRotation(INITIAL_ROTATION, {
      openMinutes: 0,
      hitWords: HIT_WORDS,
      rand: alwaysHit,
    });
    const after = advanceRotation(hit, {
      openMinutes: 0,
      hitWords: HIT_WORDS,
      rand: () => 0.99,
    });
    expect(after.hit).toBe(false);
    expect(after.hotIndex).not.toBeNull();
  });
});
