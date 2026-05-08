/**
 * Tests for the per-affect ElevenLabs voice-settings mapping.
 *
 * The mapping is the only thing that can drift between Mommy moods and
 * audible delivery, so it gets covered tightly: every affect produces
 * settings inside the legal 0–1 range, the steady moods sit higher on
 * stability than the volatile ones, and unknown / nullish inputs fall
 * through to the default profile.
 */

import { describe, it, expect } from 'vitest';
import {
  affectToVoiceSettings,
  isKnownAffect,
  DEFAULT_MOMMY_VOICE_SETTINGS,
  MOMMY_VOICE_SETTINGS_BY_AFFECT,
} from '../../lib/persona/mommy-voice-settings';

const ALL_AFFECTS = [
  'hungry', 'aching', 'delighted', 'indulgent', 'watching',
  'patient', 'amused', 'possessive', 'restless',
] as const;

describe('affectToVoiceSettings — coverage', () => {
  it('returns settings for every known affect', () => {
    for (const a of ALL_AFFECTS) {
      const s = affectToVoiceSettings(a);
      expect(s).toBeDefined();
      expect(s.use_speaker_boost).toBe(true);
    }
  });

  it('every value lies inside [0, 1]', () => {
    for (const a of ALL_AFFECTS) {
      const s = affectToVoiceSettings(a);
      expect(s.stability).toBeGreaterThanOrEqual(0);
      expect(s.stability).toBeLessThanOrEqual(1);
      expect(s.similarity_boost).toBeGreaterThanOrEqual(0);
      expect(s.similarity_boost).toBeLessThanOrEqual(1);
      expect(s.style).toBeGreaterThanOrEqual(0);
      expect(s.style).toBeLessThanOrEqual(1);
    }
  });

  it('returns the default for null / undefined / empty / unknown', () => {
    expect(affectToVoiceSettings(null)).toEqual(DEFAULT_MOMMY_VOICE_SETTINGS);
    expect(affectToVoiceSettings(undefined)).toEqual(DEFAULT_MOMMY_VOICE_SETTINGS);
    expect(affectToVoiceSettings('')).toEqual(DEFAULT_MOMMY_VOICE_SETTINGS);
    expect(affectToVoiceSettings('not-a-real-affect')).toEqual(DEFAULT_MOMMY_VOICE_SETTINGS);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(affectToVoiceSettings('HUNGRY')).toEqual(affectToVoiceSettings('hungry'));
    expect(affectToVoiceSettings('  patient  ')).toEqual(affectToVoiceSettings('patient'));
  });
});

describe('affectToVoiceSettings — mood-to-delivery semantics', () => {
  it('patient and watching are steadier than hungry and restless', () => {
    const patient = affectToVoiceSettings('patient').stability;
    const watching = affectToVoiceSettings('watching').stability;
    const hungry = affectToVoiceSettings('hungry').stability;
    const restless = affectToVoiceSettings('restless').stability;
    expect(patient).toBeGreaterThan(hungry);
    expect(patient).toBeGreaterThan(restless);
    expect(watching).toBeGreaterThan(hungry);
    expect(watching).toBeGreaterThan(restless);
  });

  it('hungry and restless carry more style exaggeration than patient and watching', () => {
    const patient = affectToVoiceSettings('patient').style;
    const watching = affectToVoiceSettings('watching').style;
    const hungry = affectToVoiceSettings('hungry').style;
    const restless = affectToVoiceSettings('restless').style;
    expect(hungry).toBeGreaterThan(patient);
    expect(hungry).toBeGreaterThan(watching);
    expect(restless).toBeGreaterThan(patient);
    expect(restless).toBeGreaterThan(watching);
  });

  it('possessive sits high on similarity_boost (tight, recognizable bite)', () => {
    const possessive = affectToVoiceSettings('possessive').similarity_boost;
    const restless = affectToVoiceSettings('restless').similarity_boost;
    expect(possessive).toBeGreaterThanOrEqual(restless);
  });

  it('every affect produces a distinct setting tuple from at least one other', () => {
    // Sanity check that the mapping isn't collapsed to a single profile.
    const tuples = ALL_AFFECTS.map(a => {
      const s = affectToVoiceSettings(a);
      return `${s.stability}:${s.similarity_boost}:${s.style}`;
    });
    const unique = new Set(tuples);
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe('isKnownAffect', () => {
  it('recognizes every affect in the table', () => {
    for (const a of ALL_AFFECTS) {
      expect(isKnownAffect(a)).toBe(true);
    }
  });

  it('rejects unknown / nullish values', () => {
    expect(isKnownAffect(null)).toBe(false);
    expect(isKnownAffect(undefined)).toBe(false);
    expect(isKnownAffect('')).toBe(false);
    expect(isKnownAffect('horny')).toBe(false);
    expect(isKnownAffect('Hungry')).toBe(false); // case-sensitive on purpose
  });
});

describe('MOMMY_VOICE_SETTINGS_BY_AFFECT — table integrity', () => {
  it('has an entry for every affect in the canonical list', () => {
    for (const a of ALL_AFFECTS) {
      expect(MOMMY_VOICE_SETTINGS_BY_AFFECT[a]).toBeDefined();
    }
  });

  it('has no entries beyond the canonical list', () => {
    const keys = Object.keys(MOMMY_VOICE_SETTINGS_BY_AFFECT);
    for (const k of keys) {
      expect(ALL_AFFECTS).toContain(k);
    }
    expect(keys).toHaveLength(ALL_AFFECTS.length);
  });
});
