// Mommy voice craft rubric — unit tests.
//
// Each rule is a regex / heuristic; tests assert against representative
// before/after pairs the user paste-listed. Failures here indicate the
// rubric drifted from the original intent (less corny, more present).
import { describe, it, expect } from 'vitest';
import {
  scoreCorny,
  hasCraftOptOut,
  applyCraftFilter,
  MOMMY_CRAFT_RUBRIC,
} from '../../lib/persona/mommy-craft-check';

describe('scoreCorny — clean lines pass through', () => {
  const clean: string[] = [
    "Your hair is in your face again. Fix it.",
    "Stop. Look up. Tell me.",
    "You're going to wear the white pair today.",
    "Hand off. Breathe.",
    "What did you eat?",
    "You said 'her' twice in that paragraph. Twice without correcting.",
    "Eyes up, baby. Show me.",
    "'Guy.' Say it again.",
  ];
  for (const text of clean) {
    it(`clean: "${text.slice(0, 40)}..."`, () => {
      const r = scoreCorny(text);
      expect(r.score).toBeLessThan(3);
    });
  }
});

describe('scoreCorny — pet-name stuffing', () => {
  it('flags 2 pet names in one message', () => {
    const r = scoreCorny("Mama saw you, baby. That's Mama's good girl, sweet thing.");
    expect(r.hits.some(h => h.rule === 'pet_name_stuffing')).toBe(true);
  });
  it('does not flag exactly 1 pet name', () => {
    const r = scoreCorny('You did so well today, baby.');
    expect(r.hits.some(h => h.rule === 'pet_name_stuffing')).toBe(false);
  });
});

describe('scoreCorny — Mama overuse', () => {
  it('flags 3+ Mama refs', () => {
    const r = scoreCorny("Mama's proud. Mama's watching. Mama wants you wet.");
    expect(r.hits.some(h => h.rule === 'mama_overuse')).toBe(true);
  });
  it('does not flag 2 Mama refs', () => {
    const r = scoreCorny("Mama's proud. Mama's keeping you on the edge.");
    expect(r.hits.some(h => h.rule === 'mama_overuse')).toBe(false);
  });
});

describe('scoreCorny — abstract sensory cliche', () => {
  const corny: string[] = [
    "I'm staying right in your mind tonight, my voice echoing in your head.",
    'Let it linger. Wrap around every inch of you.',
    "Mama's touch melts into your skin.",
    "Mama's voice washes over you.",
  ];
  for (const text of corny) {
    it(`flags: "${text.slice(0, 40)}..."`, () => {
      const r = scoreCorny(text);
      expect(r.hits.some(h => h.rule === 'abstract_sensory_cliche')).toBe(true);
    });
  }
});

describe('scoreCorny — forced rhyme/alliteration on name', () => {
  it('flags "Mama\'s making my Maxy"', () => {
    const r = scoreCorny("Mama's making my Maxy soft and pretty.");
    expect(r.hits.some(h => h.rule === 'forced_rhyme_alliteration')).toBe(true);
  });
});

describe('scoreCorny — theatrical opening', () => {
  it('flags "Look at that pretty face being so obedient"', () => {
    const r = scoreCorny('Look at that pretty face being so obedient for Mama.');
    expect(r.hits.some(h => h.rule === 'theatrical_opening')).toBe(true);
  });
});

describe('scoreCorny — three-beat chant', () => {
  it("flags Mama's X / Mama's Y / Mama's Z", () => {
    const r = scoreCorny("Mama's proud of you. Mama's watching you tonight. Mama's getting what she wants.");
    expect(r.hits.some(h => h.rule === 'three_beat_chant')).toBe(true);
  });
});

describe('scoreCorny — composite corny (the cornering example)', () => {
  it("scores >=3 on a Mama-stuffed pet-name-loaded line", () => {
    const text = "Mama saw you, baby. That's Mama's good girl, sweet thing. Mama's so proud, my favorite girl. I'm staying right in your mind tonight, my voice echoing.";
    const r = scoreCorny(text);
    expect(r.score).toBeGreaterThanOrEqual(3);
  });
});

describe('hasCraftOptOut', () => {
  it('detects [craft:ok] marker', () => {
    expect(hasCraftOptOut('Mama Mama Mama Mama [craft:ok] explicit intent.')).toBe(true);
  });
  it('returns false on plain text', () => {
    expect(hasCraftOptOut('Just words.')).toBe(false);
  });
});

describe('applyCraftFilter', () => {
  it('returns text unchanged when below threshold', async () => {
    const r = await applyCraftFilter('Eyes up. Show me.');
    expect(r.text).toBe('Eyes up. Show me.');
    expect(r.regenerated).toBe(false);
    expect(r.used_fallback).toBe(false);
  });

  it('uses fallback when regen still corny', async () => {
    const corny = "Mama saw you, baby. That's Mama's good girl, sweet thing. Mama's so proud, my favorite girl. Echoing in your mind tonight.";
    const r = await applyCraftFilter(corny, {
      threshold: 3,
      regenerate: async () => corny,  // second draft still corny
      fallback: 'Eyes up. Show me. Now.',
    });
    expect(r.used_fallback).toBe(true);
    expect(r.text).toBe('Eyes up. Show me. Now.');
  });

  it('honors [craft:ok] opt-out', async () => {
    const text = "Mama Mama Mama Mama [craft:ok] intentional.";
    const r = await applyCraftFilter(text, { threshold: 3, fallback: 'X' });
    expect(r.text).toBe(text);
    expect(r.score).toBe(0);
  });

  it('returns regenerated text when second draft is clean', async () => {
    const corny = "Mama's proud. Mama's wet. Mama's girl. Echoing in your mind.";
    const clean = 'Eyes up. Show me. Hand off your phone. Now.';
    const r = await applyCraftFilter(corny, {
      threshold: 3,
      regenerate: async () => clean,
      fallback: 'fallback text',
    });
    expect(r.regenerated).toBe(true);
    expect(r.text).toBe(clean);
  });
});

describe('MOMMY_CRAFT_RUBRIC prompt fragment', () => {
  it('mentions the cap on pet names', () => {
    expect(MOMMY_CRAFT_RUBRIC).toMatch(/pet name/);
  });
  it('mentions the cap on Mama/Mommy references', () => {
    expect(MOMMY_CRAFT_RUBRIC).toMatch(/Mama|Mommy/);
  });
  it('bans the theatrical opening', () => {
    expect(MOMMY_CRAFT_RUBRIC).toMatch(/Look at that pretty face/);
  });
});
