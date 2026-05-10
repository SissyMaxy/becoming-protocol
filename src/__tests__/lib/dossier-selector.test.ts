/**
 * dossier-selector — covers the selection rules that drive the drip cron.
 * Tests are pure (no DB) so a regression in the selector is caught before
 * shipping.
 */

import { describe, it, expect } from 'vitest';
import {
  selectNextDossierQuestion,
  escalationToIntensity,
  type DossierQuestionRow,
  type DossierResponseSnapshot,
  type UserStateSnapshot,
} from '../../lib/persona/dossier-selector';

function q(overrides: Partial<DossierQuestionRow> = {}): DossierQuestionRow {
  return {
    id: 'q1',
    question_key: 'k1',
    category: 'name',
    question_text: 'what is your name',
    placeholder: null,
    expected_response_kind: 'text',
    choices: null,
    phase_min: 0,
    intensity_min: 'gentle',
    priority: 50,
    importance: 3,
    tone: 'soft',
    input_length: 'short',
    active: true,
    ...overrides,
  };
}

function answeredFor(question: DossierQuestionRow, ts = new Date().toISOString()): DossierResponseSnapshot {
  return {
    question_id: question.id,
    category: question.category,
    answered_at: ts,
    skipped: false,
    delivered_at: ts,
    updated_at: ts,
  };
}

function skippedFor(question: DossierQuestionRow, ts = new Date().toISOString()): DossierResponseSnapshot {
  return {
    question_id: question.id,
    category: question.category,
    answered_at: null,
    skipped: true,
    delivered_at: ts,
    updated_at: ts,
  };
}

function deliveredFor(question: DossierQuestionRow, ts = new Date().toISOString()): DossierResponseSnapshot {
  return {
    question_id: question.id,
    category: question.category,
    answered_at: null,
    skipped: false,
    delivered_at: ts,
    updated_at: ts,
  };
}

const phase0: UserStateSnapshot = { current_phase: 0, escalation_level: 1 };
const phase3: UserStateSnapshot = { current_phase: 3, escalation_level: 4 };

describe('escalationToIntensity', () => {
  it('1-2 -> gentle, 3-4 -> firm, 5+ -> cruel', () => {
    expect(escalationToIntensity(1)).toBe('gentle');
    expect(escalationToIntensity(2)).toBe('gentle');
    expect(escalationToIntensity(3)).toBe('firm');
    expect(escalationToIntensity(4)).toBe('firm');
    expect(escalationToIntensity(5)).toBe('cruel');
  });
});

describe('selectNextDossierQuestion — gates', () => {
  it('drops questions with phase_min > current_phase', () => {
    const onlyDeep = q({ id: 'q-deep', phase_min: 5 });
    const r = selectNextDossierQuestion([onlyDeep], [], phase0);
    expect(r.pick).toBeNull();
    expect(r.reason).toBe('no_questions_pass_gates');
  });

  it('phase-1 user never gets a phase-5-only question (gate is hard)', () => {
    const phase1: UserStateSnapshot = { current_phase: 1, escalation_level: 2 };
    const reachable = q({ id: 'q-easy', phase_min: 0, priority: 100 });
    const gated = q({ id: 'q-gated', phase_min: 5, priority: 1 });
    const r = selectNextDossierQuestion([reachable, gated], [], phase1);
    expect(r.pick?.id).toBe('q-easy');
  });

  it('drops questions with intensity_min > current intensity', () => {
    const cruelOnly = q({ id: 'q-cruel', intensity_min: 'cruel' });
    const r = selectNextDossierQuestion([cruelOnly], [], phase0);
    expect(r.pick).toBeNull();
  });

  it('admits firm-tier questions for an escalation_level=3 user', () => {
    const firmQ = q({ id: 'q-firm', intensity_min: 'firm' });
    const r = selectNextDossierQuestion([firmQ], [], phase3);
    expect(r.pick?.id).toBe('q-firm');
  });
});

describe('selectNextDossierQuestion — answered + skip cooldown', () => {
  it('skips questions already answered', () => {
    const a = q({ id: 'q-answered' });
    const b = q({ id: 'q-open', priority: 99 });
    const r = selectNextDossierQuestion([a, b], [answeredFor(a)], phase0);
    expect(r.pick?.id).toBe('q-open');
  });

  it('skipped questions don\'t reappear within 14 days', () => {
    const a = q({ id: 'q-skipped', priority: 1 });
    const b = q({ id: 'q-other', priority: 99 });
    const recent = new Date(Date.now() - 7 * 86400_000).toISOString();
    const r = selectNextDossierQuestion([a, b], [skippedFor(a, recent)], phase0);
    expect(r.pick?.id).toBe('q-other');
  });

  it('skipped questions DO reappear after 14 days', () => {
    const a = q({ id: 'q-old-skip', priority: 1 });
    const b = q({ id: 'q-other', priority: 99 });
    const longAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
    const r = selectNextDossierQuestion([a, b], [skippedFor(a, longAgo)], phase0);
    expect(r.pick?.id).toBe('q-old-skip');
  });

  it('returns no pick when everything is answered or skipped', () => {
    const a = q({ id: 'qa' });
    const b = q({ id: 'qb' });
    const recent = new Date().toISOString();
    const r = selectNextDossierQuestion([a, b], [answeredFor(a), skippedFor(b, recent)], phase0);
    expect(r.pick).toBeNull();
    expect(r.reason).toBe('all_answered_or_skipped');
  });
});

describe('selectNextDossierQuestion — coverage + recency bias', () => {
  it('prefers categories with fewer answered questions (coverage bias)', () => {
    const nameAnswered = q({ id: 'name-1', category: 'name', priority: 10 });
    const ginaUnanswered = q({ id: 'gina-1', category: 'gina', priority: 50 });
    const r = selectNextDossierQuestion(
      [nameAnswered, ginaUnanswered, q({ id: 'name-2', category: 'name', priority: 5 })],
      [answeredFor(nameAnswered)],
      phase0,
    );
    // Even though name-2 has the lowest priority, gina has fewer answers
    // (0 vs 1) so coverage bias picks the gina question first.
    expect(r.pick?.id).toBe('gina-1');
  });

  it('within an equally-uncovered cohort, lowest priority wins', () => {
    const a = q({ id: 'a', category: 'gina', priority: 99 });
    const b = q({ id: 'b', category: 'gina', priority: 1 });
    const c = q({ id: 'c', category: 'gina', priority: 50 });
    const r = selectNextDossierQuestion([a, b, c], [], phase0);
    expect(r.pick?.id).toBe('b');
  });

  it('avoids the most-recently-delivered category when an alternative exists', () => {
    const recentCat = q({ id: 'rcat', category: 'gina', priority: 1 });
    const altCat = q({ id: 'altcat', category: 'name', priority: 50 });
    const just = new Date().toISOString();
    const r = selectNextDossierQuestion(
      [recentCat, altCat],
      [deliveredFor(recentCat, just)],
      phase0,
    );
    expect(r.pick?.id).toBe('altcat');
  });

  it('falls through to recent category if no alternative category exists', () => {
    const lastDelivered = q({ id: 'last', category: 'gina', priority: 1 });
    const sameCatOther = q({ id: 'same-cat', category: 'gina', priority: 5 });
    const just = new Date().toISOString();
    const r = selectNextDossierQuestion(
      [lastDelivered, sameCatOther],
      // lastDelivered is the most recently delivered category but
      // hasn't been answered/skipped, so it's still eligible. Recency
      // avoidance has nowhere to swap to since both eligible questions
      // share the same category.
      [deliveredFor(lastDelivered, just)],
      phase0,
    );
    expect(r.pick?.category).toBe('gina');
    // Lowest priority wins inside the cohort.
    expect(r.pick?.id).toBe('last');
  });
});

describe('selectNextDossierQuestion — empty + edge cases', () => {
  it('returns empty_catalog when no questions exist', () => {
    const r = selectNextDossierQuestion([], [], phase0);
    expect(r.pick).toBeNull();
    expect(r.reason).toBe('empty_catalog');
  });

  it('respects active=false', () => {
    const inactive = q({ id: 'inactive', active: false, priority: 1 });
    const active = q({ id: 'active', priority: 99 });
    const r = selectNextDossierQuestion([inactive, active], [], phase0);
    expect(r.pick?.id).toBe('active');
  });
});
