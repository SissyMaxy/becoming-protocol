import { describe, it, expect } from 'vitest';
import {
  normalizeHypotheses,
  pickSelected,
  scopeToWish,
} from '../../lib/adaptation-panel';

describe('normalizeHypotheses', () => {
  it('accepts a bare array', () => {
    const out = normalizeHypotheses([
      { design: 'A', rationale: 'r', scope: 'in_scope', score: 50 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].design).toBe('A');
  });

  it('accepts a { hypotheses: [...] } envelope', () => {
    const out = normalizeHypotheses({
      hypotheses: [{ design: 'B', score: 30 }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].design).toBe('B');
  });

  it('drops entries with no design text', () => {
    const out = normalizeHypotheses([{ design: '', score: 99 }, { rationale: 'x' }]);
    expect(out).toHaveLength(0);
  });

  it('dedupes on lowercased design', () => {
    const out = normalizeHypotheses([
      { design: 'Same Idea', score: 10 },
      { design: 'same idea', score: 90 },
    ]);
    expect(out).toHaveLength(1);
    // first-seen wins (score 10), dedup happens before sort
    expect(out[0].design).toBe('Same Idea');
  });

  it('sorts by score descending and caps at 3', () => {
    const out = normalizeHypotheses([
      { design: 'a', score: 10 },
      { design: 'b', score: 90 },
      { design: 'c', score: 50 },
      { design: 'd', score: 70 },
    ]);
    expect(out).toHaveLength(3);
    expect(out.map((h) => h.design)).toEqual(['b', 'd', 'c']);
  });

  it('scales 0..1 float scores into 0..100', () => {
    const out = normalizeHypotheses([{ design: 'x', score: 0.8 }]);
    expect(out[0].score).toBe(80);
  });

  it('coerces scope synonyms', () => {
    expect(normalizeHypotheses([{ design: 'a', scope: 'major', score: 1 }])[0].scope).toBe('large');
    expect(normalizeHypotheses([{ design: 'b', scope: 'architectural', score: 1 }])[0].scope).toBe('cross_cutting');
    expect(normalizeHypotheses([{ design: 'c', scope: 'whatever', score: 1 }])[0].scope).toBe('in_scope');
  });

  it('returns empty for garbage input', () => {
    expect(normalizeHypotheses(null)).toEqual([]);
    expect(normalizeHypotheses('nope')).toEqual([]);
    expect(normalizeHypotheses(42)).toEqual([]);
  });
});

describe('pickSelected', () => {
  it('returns the top-ranked (first) hypothesis', () => {
    const hyps = normalizeHypotheses([
      { design: 'low', score: 10 },
      { design: 'high', score: 90 },
    ]);
    expect(pickSelected(hyps)?.design).toBe('high');
  });

  it('returns null for an empty list', () => {
    expect(pickSelected([])).toBeNull();
  });
});

describe('scopeToWish', () => {
  it('does not file for a null selection', () => {
    expect(scopeToWish(null).file).toBe(false);
  });

  it('files high-priority in-scope wish when confident', () => {
    const d = scopeToWish({ design: 'a', rationale: '', scope: 'in_scope', score: 80 });
    expect(d.file).toBe(true);
    expect(d.priority).toBe('high');
    expect(d.needsReview).toBe(false);
    expect(d.reviewNote).toBeNull();
  });

  it('files normal-priority in-scope wish when low confidence', () => {
    const d = scopeToWish({ design: 'a', rationale: '', scope: 'in_scope', score: 40 });
    expect(d.priority).toBe('normal');
    expect(d.needsReview).toBe(false);
  });

  it('flags large scope as needs-review, normal priority, still filed', () => {
    const d = scopeToWish({ design: 'a', rationale: '', scope: 'large', score: 95 });
    expect(d.file).toBe(true);
    expect(d.priority).toBe('normal');
    expect(d.needsReview).toBe(true);
    expect(d.reviewNote).toContain('NEEDS REVIEW (large)');
  });

  it('flags cross-cutting scope as needs-review with auto-ship explicitly not wired', () => {
    const d = scopeToWish({ design: 'a', rationale: '', scope: 'cross_cutting', score: 95 });
    expect(d.needsReview).toBe(true);
    expect(d.reviewNote).toContain('cross-cutting');
    expect(d.reviewNote).toContain('NOT wired');
  });
});
