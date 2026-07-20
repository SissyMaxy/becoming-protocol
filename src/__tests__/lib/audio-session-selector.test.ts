// audio-session selector tests — pure logic, no I/O.
//
// Covers: kind/phase/intensity/affect picking, phase-tier clamping (cruel
// requested by phase-1 user falls back to gentle), placeholder substitution
// preserves unknown placeholders, recent-template deprioritization for
// variety.

import { describe, it, expect } from 'vitest';
import {
  type AudioSessionKind,
  type AudioSessionTemplate,
  clampTierByPhase,
  KIND_AFFECT_BIAS,
  resolveAffectForKind,
  selectTemplate,
  substitutePlaceholders,
  targetWordCount,
} from '../../lib/audio-sessions/template-selector';

const T = (overrides: Partial<AudioSessionTemplate>): AudioSessionTemplate => ({
  id: overrides.id ?? `t-${Math.random().toString(36).slice(2, 8)}`,
  kind: overrides.kind ?? 'session_edge',
  name: overrides.name ?? 'unnamed',
  prompt_template: overrides.prompt_template ?? 'You are Mama. {{feminine_name}} target {{target_word_count}} words.',
  target_duration_minutes: overrides.target_duration_minutes ?? 6,
  affect_bias: overrides.affect_bias ?? [],
  phase_min: overrides.phase_min ?? 1,
  intensity_tier: overrides.intensity_tier ?? 'gentle',
  active: overrides.active ?? true,
});

describe('clampTierByPhase', () => {
  it('keeps gentle at every phase', () => {
    expect(clampTierByPhase('gentle', 1)).toBe('gentle');
    expect(clampTierByPhase('gentle', 5)).toBe('gentle');
  });
  it('drops firm to gentle at phase 1', () => {
    expect(clampTierByPhase('firm', 1)).toBe('gentle');
  });
  it('keeps firm from phase 2 up', () => {
    expect(clampTierByPhase('firm', 2)).toBe('firm');
    expect(clampTierByPhase('firm', 4)).toBe('firm');
  });
  it('drops cruel to gentle at phase 1', () => {
    expect(clampTierByPhase('cruel', 1)).toBe('gentle');
  });
  it('drops cruel to firm at phase 2', () => {
    expect(clampTierByPhase('cruel', 2)).toBe('firm');
  });
  it('keeps cruel from phase 3 up', () => {
    expect(clampTierByPhase('cruel', 3)).toBe('cruel');
    expect(clampTierByPhase('cruel', 7)).toBe('cruel');
  });
});

describe('selectTemplate', () => {
  it('returns null when no templates of the kind exist', () => {
    const result = selectTemplate([T({ kind: 'session_goon' })], {
      kind: 'session_edge', currentPhase: 1, todayAffect: null,
      requestedTier: 'gentle', recentTemplateIds: [],
    });
    expect(result).toBeNull();
  });

  it('returns null when phase is below all templates phase_min', () => {
    const result = selectTemplate([T({ kind: 'session_edge', phase_min: 3 })], {
      kind: 'session_edge', currentPhase: 1, todayAffect: null,
      requestedTier: 'gentle', recentTemplateIds: [],
    });
    expect(result).toBeNull();
  });

  it('prefers tier-matched template', () => {
    const a = T({ id: 'a', kind: 'session_edge', intensity_tier: 'gentle' });
    const b = T({ id: 'b', kind: 'session_edge', intensity_tier: 'firm', phase_min: 2 });
    const result = selectTemplate([a, b], {
      kind: 'session_edge', currentPhase: 3, todayAffect: null,
      requestedTier: 'firm', recentTemplateIds: [],
    });
    expect(result?.template.id).toBe('b');
    expect(result?.tier).toBe('firm');
  });

  it('prefers affect-matched template', () => {
    const a = T({ id: 'a', kind: 'session_edge', affect_bias: ['restless'] });
    const b = T({ id: 'b', kind: 'session_edge', affect_bias: ['aching'] });
    const result = selectTemplate([a, b], {
      kind: 'session_edge', currentPhase: 1, todayAffect: 'aching',
      requestedTier: 'gentle', recentTemplateIds: [],
    });
    expect(result?.template.id).toBe('b');
  });

  it('deprioritizes recently-used templates when alternatives exist', () => {
    const a = T({ id: 'a', kind: 'session_edge' });
    const b = T({ id: 'b', kind: 'session_edge' });
    const result = selectTemplate([a, b], {
      kind: 'session_edge', currentPhase: 1, todayAffect: null,
      requestedTier: 'gentle', recentTemplateIds: ['a'],
    });
    expect(result?.template.id).toBe('b');
  });

  it('phase-1 user requesting cruel gets a gentle template (gating)', () => {
    const gentle = T({ id: 'gen', kind: 'session_edge', intensity_tier: 'gentle' });
    const firm = T({ id: 'fm', kind: 'session_edge', intensity_tier: 'firm', phase_min: 2 });
    const cruel = T({ id: 'cr', kind: 'session_edge', intensity_tier: 'cruel', phase_min: 3 });
    const result = selectTemplate([gentle, firm, cruel], {
      kind: 'session_edge', currentPhase: 1, todayAffect: null,
      requestedTier: 'cruel', recentTemplateIds: [],
    });
    expect(result?.template.id).toBe('gen');
    expect(result?.tier).toBe('gentle');
  });

  it('skips inactive templates', () => {
    const a = T({ id: 'a', kind: 'session_edge', active: false });
    const b = T({ id: 'b', kind: 'session_edge', active: true });
    const result = selectTemplate([a, b], {
      kind: 'session_edge', currentPhase: 1, todayAffect: null,
      requestedTier: 'gentle', recentTemplateIds: [],
    });
    expect(result?.template.id).toBe('b');
  });

  it('combines tier + affect signals — tier wins over affect', () => {
    const wrongTierMatchedAffect = T({
      id: 'wt', kind: 'session_edge',
      intensity_tier: 'firm', phase_min: 2, affect_bias: ['aching'],
    });
    const rightTierWrongAffect = T({
      id: 'rt', kind: 'session_edge',
      intensity_tier: 'gentle', affect_bias: ['restless'],
    });
    const result = selectTemplate([wrongTierMatchedAffect, rightTierWrongAffect], {
      kind: 'session_edge', currentPhase: 3, todayAffect: 'aching',
      requestedTier: 'gentle', recentTemplateIds: [],
    });
    expect(result?.template.id).toBe('rt');
  });
});

describe('substitutePlaceholders', () => {
  it('substitutes known placeholders', () => {
    const out = substitutePlaceholders(
      'Hello {{feminine_name}}, phase {{phase}}, words {{target_word_count}}.',
      {
        feminine_name: 'Maxy', phase: 3, duration_minutes: 6,
        target_word_count: 900, intensity_tier: 'firm',
      },
    );
    expect(out).toBe('Hello Maxy, phase 3, words 900.');
  });

  it('falls back when feminine_name is missing', () => {
    const out = substitutePlaceholders('Hello {{feminine_name}}.', {
      duration_minutes: 6, target_word_count: 900, intensity_tier: 'gentle',
    });
    expect(out).toBe('Hello baby.');
  });

  it('leaves unknown placeholders alone', () => {
    const out = substitutePlaceholders('Use {{unknown_field}} here.', {
      duration_minutes: 6, target_word_count: 900, intensity_tier: 'gentle',
    });
    expect(out).toBe('Use {{unknown_field}} here.');
  });

  it('substitutes affect with patient default when missing', () => {
    const out = substitutePlaceholders('Today: {{affect}}.', {
      duration_minutes: 6, target_word_count: 900, intensity_tier: 'gentle',
    });
    expect(out).toBe('Today: patient.');
  });
});

describe('targetWordCount', () => {
  it('scales with duration at 150 wpm', () => {
    expect(targetWordCount(6)).toBe(900);
    expect(targetWordCount(10)).toBe(1500);
  });
  it('floors at 60 words', () => {
    expect(targetWordCount(0)).toBe(60);
  });
});

describe('resolveAffectForKind', () => {
  it('uses kind default when today affect not in bias list', () => {
    expect(resolveAffectForKind('session_edge', 'patient')).toBe('aching');
  });
  it('uses today affect when it matches the kind bias', () => {
    expect(resolveAffectForKind('session_edge', 'restless')).toBe('restless');
  });
  it('handles null today affect', () => {
    expect(resolveAffectForKind('session_goon', null)).toBe('hungry');
  });
  it('lowercases and trims today affect', () => {
    expect(resolveAffectForKind('session_denial', '  Possessive  ')).toBe('possessive');
  });
  it('uses primer default for primer kinds', () => {
    expect(resolveAffectForKind('primer_posture', null)).toBe('patient');
    expect(resolveAffectForKind('primer_universal', 'hungry')).toBe('patient');
  });
});

describe('session_embodiment — recognition kind', () => {
  it('has a non-empty affect bias (both selector copies must define it)', () => {
    expect(KIND_AFFECT_BIAS.session_embodiment).toBeDefined();
    expect(KIND_AFFECT_BIAS.session_embodiment.length).toBeGreaterThan(0);
  });

  it('every kind in the union has an affect-bias entry', () => {
    // Guards against adding a kind to the type but forgetting the bias map —
    // the edge fn resolves voice via KIND_AFFECT_BIAS, so a gap = a render crash.
    const kinds: AudioSessionKind[] = [
      'session_edge', 'session_goon', 'session_conditioning', 'session_embodiment',
      'session_freestyle', 'session_denial',
      'primer_posture', 'primer_gait', 'primer_sitting', 'primer_hands',
      'primer_fullbody', 'primer_universal',
    ];
    for (const k of kinds) {
      expect(KIND_AFFECT_BIAS[k], `missing affect bias for ${k}`).toBeTruthy();
    }
  });

  it('resolves a tender default affect, honoring today when it matches', () => {
    expect(resolveAffectForKind('session_embodiment', null)).toBe('patient');
    expect(resolveAffectForKind('session_embodiment', 'indulgent')).toBe('indulgent');
    expect(resolveAffectForKind('session_embodiment', 'hungry')).toBe('patient');
  });

  it('selects an embodiment template and respects phase gating', () => {
    const gentle = T({ id: 'emb-g', kind: 'session_embodiment', intensity_tier: 'gentle', phase_min: 1 });
    const firm = T({ id: 'emb-f', kind: 'session_embodiment', intensity_tier: 'firm', phase_min: 2 });
    // phase-1 user asking for firm gets clamped to the gentle recognition session
    const r1 = selectTemplate([gentle, firm], {
      kind: 'session_embodiment', currentPhase: 1, todayAffect: null,
      requestedTier: 'firm', recentTemplateIds: [],
    });
    expect(r1?.template.id).toBe('emb-g');
    expect(r1?.tier).toBe('gentle');
    // phase-2 user gets the firm one
    const r2 = selectTemplate([gentle, firm], {
      kind: 'session_embodiment', currentPhase: 2, todayAffect: null,
      requestedTier: 'firm', recentTemplateIds: [],
    });
    expect(r2?.template.id).toBe('emb-f');
  });
});
