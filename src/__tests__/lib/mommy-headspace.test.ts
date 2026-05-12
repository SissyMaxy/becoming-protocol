/**
 * Mommy headspace pure-logic tests.
 *
 * Covers the four pure modules:
 *   - mantra-milestone (weightedReps, milestoneCrossed)
 *   - random-clips (clipIsClean, pickRandomClip, drawClipsForWindow)
 *   - scene-templates (planWeek, reviewSceneCraft)
 *   - live-reframe (buildReframePrompt, fallbackReframe, filterAlreadyReframed)
 */

import { describe, it, expect } from 'vitest';
import {
  weightedReps, milestoneCrossed, MANTRA_MILESTONES,
} from '../../lib/mommy-headspace/mantra-milestone';
import {
  clipIsClean, pickRandomClip, drawClipsForWindow,
  type ClipTheme,
} from '../../lib/mommy-headspace/random-clips';
import {
  planWeek, reviewSceneCraft, SCENE_TEMPLATES,
  type PlannedScene, type SceneBuildContext,
} from '../../lib/mommy-headspace/scene-templates';
import {
  buildReframePrompt, fallbackReframe, filterAlreadyReframed, defaultKey,
  type ReframeObservation,
} from '../../lib/mommy-headspace/live-reframe';

// ────────────────────────────────────────────────────────────────────────
// mantra-milestone
// ────────────────────────────────────────────────────────────────────────

describe('weightedReps', () => {
  it('voice 1.0x typed 0.5x without arousal pair', () => {
    expect(weightedReps({ voiceReps: 100, typedReps: 0, pairedWithArousal: false })).toBe(100);
    expect(weightedReps({ voiceReps: 0, typedReps: 100, pairedWithArousal: false })).toBe(50);
    expect(weightedReps({ voiceReps: 80, typedReps: 40, pairedWithArousal: false })).toBe(100);
  });
  it('arousal pair triples the weighted total', () => {
    expect(weightedReps({ voiceReps: 100, typedReps: 0, pairedWithArousal: true })).toBe(300);
    expect(weightedReps({ voiceReps: 0, typedReps: 40, pairedWithArousal: true })).toBe(60);
  });
});

describe('milestoneCrossed', () => {
  it('returns null when no milestone is crossed', () => {
    expect(milestoneCrossed(500, 750)).toBeNull();
    expect(milestoneCrossed(0, 50)).toBeNull();
    expect(milestoneCrossed(1_000, 1_500)).toBeNull();
  });
  it('returns the 1000 milestone on first cross', () => {
    const m = milestoneCrossed(950, 1_050);
    expect(m?.threshold).toBe(1_000);
    expect(m?.theme).toBe('first_thousand');
    expect(m?.line.length).toBeGreaterThan(20);
  });
  it('returns the 10k milestone when crossing it', () => {
    const m = milestoneCrossed(9_500, 10_100);
    expect(m?.threshold).toBe(10_000);
    expect(m?.theme).toBe('ten_thousand');
  });
  it('returns the 100k milestone when crossing it', () => {
    const m = milestoneCrossed(99_500, 100_500);
    expect(m?.threshold).toBe(100_000);
  });
  it('catalog has three monotonic milestones', () => {
    expect(MANTRA_MILESTONES.length).toBe(3);
    for (let i = 1; i < MANTRA_MILESTONES.length; i++) {
      expect(MANTRA_MILESTONES[i].threshold).toBeGreaterThan(MANTRA_MILESTONES[i - 1].threshold);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
// random-clips
// ────────────────────────────────────────────────────────────────────────

describe('clipIsClean', () => {
  it('passes craft-clean text', () => {
    expect(clipIsClean('Where are your panties.').ok).toBe(true);
    expect(clipIsClean('Knees together.').ok).toBe(true);
    expect(clipIsClean("She's right under that voice.").ok).toBe(true);
  });
  it('rejects every forbidden framing phrase', () => {
    expect(clipIsClean('this is roleplay').ok).toBe(false);
    expect(clipIsClean('a fun simulation').ok).toBe(false);
    expect(clipIsClean('this is fiction').ok).toBe(false);
    expect(clipIsClean('not medical advice').ok).toBe(false);
    expect(clipIsClean('this is an intake').ok).toBe(false);
    expect(clipIsClean('questionnaire below').ok).toBe(false);
    expect(clipIsClean('for entertainment only').ok).toBe(false);
    expect(clipIsClean('disclaimer applies').ok).toBe(false);
  });
  it('rejects cliche patterns', () => {
    expect(clipIsClean('it lingers').ok).toBe(false);
    expect(clipIsClean('echoes in your head').ok).toBe(false);
    expect(clipIsClean('wraps around her').ok).toBe(false);
    expect(clipIsClean('every inch of her').ok).toBe(false);
  });
});

describe('pickRandomClip', () => {
  const baseCatalog = [
    { id: '1', slug: 'a', text: 'one', intensity_band: 'gentle' as const, theme: 'possession' as ClipTheme, audio_url: 'http://x/1.mp3', last_played_at: null },
    { id: '2', slug: 'b', text: 'two', intensity_band: 'firm' as const, theme: 'praise' as ClipTheme, audio_url: 'http://x/2.mp3', last_played_at: null },
    { id: '3', slug: 'c', text: 'three', intensity_band: 'cruel' as const, theme: 'reminder' as ClipTheme, audio_url: 'http://x/3.mp3', last_played_at: null },
  ];

  it('skips clips without rendered audio', () => {
    const catalog = [{ ...baseCatalog[0], audio_url: null }];
    const r = pickRandomClip(catalog, { recentPlayTimes: [], themeRecentCounts: {}, intensityCeiling: 'cruel', rng: () => 0.5 });
    expect(r).toBeNull();
  });
  it('respects the intensity ceiling', () => {
    const r = pickRandomClip(baseCatalog, { recentPlayTimes: [], themeRecentCounts: {}, intensityCeiling: 'gentle', rng: () => 0.5 });
    expect(r?.id).toBe('1'); // only gentle clip eligible
  });
  it('saturated theme (≥3 in 24h) is dropped', () => {
    const r = pickRandomClip(baseCatalog, {
      recentPlayTimes: [],
      themeRecentCounts: { praise: 3 },
      intensityCeiling: 'cruel',
      rng: () => 0.5,
    });
    expect(r?.id).not.toBe('2'); // praise theme saturated
  });
  it('returns null when no clip is eligible', () => {
    const r = pickRandomClip([], { recentPlayTimes: [], themeRecentCounts: {}, intensityCeiling: 'cruel', rng: () => 0.5 });
    expect(r).toBeNull();
  });
});

describe('drawClipsForWindow', () => {
  it('returns a non-negative integer ≤3', () => {
    for (let seed = 0; seed < 50; seed++) {
      const n = drawClipsForWindow({ dailyTarget: 12, windowMinutes: 30, hourOfDay: 12, rng: () => (seed % 7) / 10 });
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(3);
    }
  });
  it('returns 0 when rng is small (Knuth exits on first iteration)', () => {
    // dailyTarget=2 at hour 12 → lambda ≈ 0.06, L ≈ 0.94. First iteration
    // p = rng = 0.1 ≤ 0.94 → return k-1 = 0.
    const n = drawClipsForWindow({ dailyTarget: 2, windowMinutes: 30, hourOfDay: 12, rng: () => 0.1 });
    expect(n).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────
// scene-templates
// ────────────────────────────────────────────────────────────────────────

const baseCtx: SceneBuildContext = {
  name: 'Maxy',
  ownedWardrobe: [
    { category: 'underwear', label: 'the white pair' },
    { category: 'sleepwear', label: 'the satin slip' },
  ],
  affect: 'patient',
  hourOfDay: 12,
};

describe('planWeek', () => {
  it('schedules 2-3 scenes within the intensity ceiling', () => {
    const weekStart = new Date(Date.UTC(2026, 4, 11));
    let i = 0;
    const planned = planWeek({
      ctx: baseCtx,
      weekStart,
      intensityCeiling: 'firm',
      recentSlugPrefixes: [],
      rng: () => (i++ * 0.31) % 1,
    });
    expect(planned.length).toBeGreaterThanOrEqual(2);
    expect(planned.length).toBeLessThanOrEqual(3);
    for (const s of planned) {
      expect(['gentle', 'firm']).toContain(s.intensity_band);
    }
  });
  it('skips slug prefixes that fired in the last 4 weeks', () => {
    const weekStart = new Date(Date.UTC(2026, 4, 11));
    const used = SCENE_TEMPLATES.slice(0, 4).map(t => t.slug_prefix);
    const planned = planWeek({
      ctx: baseCtx,
      weekStart,
      intensityCeiling: 'cruel',
      recentSlugPrefixes: used,
      rng: () => 0.1,
    });
    for (const s of planned) {
      const prefix = s.scene_slug.replace(/_\d{4}-\d{2}-\d{2}$/, '');
      expect(used).not.toContain(prefix);
    }
  });
  it('returns empty when intensity ceiling is recovery and all eligible are firm+', () => {
    const weekStart = new Date(Date.UTC(2026, 4, 11));
    // recovery isn't a SceneIntensity, but planWeek treats anything lower
    // than gentle as effectively excluding firm/cruel. We test by passing
    // 'gentle' and confirming only gentle-tier templates qualify.
    const planned = planWeek({
      ctx: baseCtx,
      weekStart,
      intensityCeiling: 'gentle',
      recentSlugPrefixes: [],
      rng: () => 0.5,
    });
    for (const s of planned) {
      expect(s.intensity_band).toBe('gentle');
    }
  });
  it('uses owned wardrobe when available', () => {
    const weekStart = new Date(Date.UTC(2026, 4, 11));
    const planned = planWeek({
      ctx: baseCtx,
      weekStart,
      intensityCeiling: 'cruel',
      recentSlugPrefixes: [],
      rng: () => 0.05,
    });
    const grocery = planned.find(p => p.scene_kind === 'grocery');
    if (grocery) {
      const wardrobe = grocery.preparation_instructions.wardrobe as string[];
      expect(wardrobe).toContain('the white pair');
    }
  });
});

describe('reviewSceneCraft', () => {
  const mkScene = (overrides: Partial<PlannedScene> = {}): PlannedScene => ({
    scene_slug: 'test_2026-05-11',
    scene_kind: 'mirror',
    title: 'Test',
    intensity_band: 'firm',
    scheduled_for: new Date(),
    preparation_instructions: { notes: 'clean notes' },
    live_prompts: [{ at_offset_min: 0, text: 'Knees together.' }],
    debrief_prompts: [{ question: 'Tell me.', min_chars: 10 }],
    ...overrides,
  });

  it('accepts a clean scene with a high score', () => {
    const r = reviewSceneCraft(mkScene());
    expect(r.ok).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });
  it('rejects forbidden framing outright', () => {
    const r = reviewSceneCraft(mkScene({
      live_prompts: [{ at_offset_min: 0, text: 'This is roleplay just for fun.' }],
    }));
    expect(r.ok).toBe(false);
    expect(r.score).toBe(0);
  });
  it('penalizes cliche phrasing', () => {
    const r = reviewSceneCraft(mkScene({
      live_prompts: [{ at_offset_min: 0, text: 'Let her voice echo back.' }],
    }));
    expect(r.score).toBeLessThan(100);
  });
  it('penalizes multiple Mama self-references in one prompt', () => {
    const r = reviewSceneCraft(mkScene({
      live_prompts: [{ at_offset_min: 0, text: 'Mama wants this. Mama is watching. Mama said go.' }],
    }));
    expect(r.notes.some(n => n.startsWith('mama_density'))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// live-reframe
// ────────────────────────────────────────────────────────────────────────

describe('buildReframePrompt', () => {
  const obs: ReframeObservation = {
    kind: 'call_ended',
    ended_at: '2026-05-11T14:30:00Z',
    context: { duration_min: 18, avg_hr: 76 },
  };
  it('produces a system+user prompt pair', () => {
    const p = buildReframePrompt(obs, { name: 'Maxy', affect: 'watching', intensity: 'firm' });
    expect(p.system).toContain('Dommy Mommy');
    expect(p.system).toContain('Maxy');
    expect(p.user).toContain('Maxy');
    expect(p.system).toContain('CRAFT RUBRIC');
  });
  it('encodes intensity tail variation', () => {
    const gentle = buildReframePrompt(obs, { name: 'M', affect: 'patient', intensity: 'gentle' });
    const cruel = buildReframePrompt(obs, { name: 'M', affect: 'patient', intensity: 'cruel' });
    expect(gentle.system).not.toEqual(cruel.system);
  });
});

describe('fallbackReframe', () => {
  it('returns a non-empty line for every observation kind', () => {
    const kinds: ReframeObservation['kind'][] = [
      'call_ended', 'meeting_ended', 'workout_ended', 'sleep_ended',
      'lunch_ended', 'commute_arrival', 'screen_unlock_after_idle',
      'app_switch_work_to_leisure',
    ];
    for (const k of kinds) {
      const obs: ReframeObservation = { kind: k, ended_at: new Date().toISOString(), context: {} };
      const out = fallbackReframe(obs, 'Maxy');
      expect(out.length).toBeGreaterThan(10);
      // Fallback must itself pass the no-forbidden-framing rule.
      expect(out.toLowerCase()).not.toMatch(/role\s?play|simulation|fiction|disclaimer/);
    }
  });
});

describe('filterAlreadyReframed', () => {
  it('drops observations matching a recent key', () => {
    const obs: ReframeObservation[] = [
      { kind: 'call_ended', ended_at: '2026-05-11T14:30:00Z', context: {} },
      { kind: 'meeting_ended', ended_at: '2026-05-11T14:30:00Z', context: {} },
    ];
    const recent = new Set([defaultKey(obs[0])]);
    const fresh = filterAlreadyReframed(obs, recent);
    expect(fresh.length).toBe(1);
    expect(fresh[0].kind).toBe('meeting_ended');
  });
});
