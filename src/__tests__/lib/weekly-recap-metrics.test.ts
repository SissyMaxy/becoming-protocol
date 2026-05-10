// Tests for the weekly-recap metric aggregator.
//
// These exercise the pure helpers — no Supabase, no LLM. Cover three
// shapes of week:
//   1. Delighted week — high compliance, zero slips, mantras every day.
//   2. Patient week — mid compliance, a few slips, missed mantras.
//   3. Possessive week — low compliance, slips clustered, missed mantras.
//
// Tone-check: pickRecapTone returns the expected bucket for each shape.
// Tone tests aren't a substitute for the prompt being non-shaming; the
// edge fn's `toneInstructions()` block enforces "don't shame, don't pity"
// by construction. These tests guard the routing into that block.

import { describe, it, expect } from 'vitest';
import {
  aggregateWeeklyMetrics,
  pickRecapTone,
  metricsToPlainVoiceSummary,
  type WeeklyRecapInput,
} from '../../lib/weekly-recap/metrics';

const MON = new Date('2026-04-27T00:00:00Z'); // Monday
const SUN = new Date('2026-05-03T00:00:00Z'); // Sunday

function dayInWeek(offsetDays: number): string {
  const d = new Date(MON.getTime() + offsetDays * 86400000);
  return d.toISOString();
}

function dayKeyInWeek(offsetDays: number): string {
  return dayInWeek(offsetDays).slice(0, 10);
}

// ============================================
// 1. Delighted week — high compliance, zero slips
// ============================================

describe('weekly-recap-metrics: delighted week', () => {
  const input: WeeklyRecapInput = {
    weekStart: MON,
    weekEnd: SUN,
    slips: [],
    mantras: Array.from({ length: 7 }, (_, i) => ({
      submission_date: dayKeyInWeek(i),
      reps_submitted: 10,
    })),
    letters: [
      { written_at: dayInWeek(2) },
      { written_at: dayInWeek(5) },
    ],
    wardrobeAcquired: [{ purchase_date: dayKeyInWeek(3), created_at: null }],
    moods: [
      { mood_date: dayKeyInWeek(0), affect: 'delighted' },
      { mood_date: dayKeyInWeek(1), affect: 'delighted' },
      { mood_date: dayKeyInWeek(2), affect: 'delighted' },
      { mood_date: dayKeyInWeek(3), affect: 'delighted' },
      { mood_date: dayKeyInWeek(4), affect: 'patient' },
      { mood_date: dayKeyInWeek(5), affect: 'patient' },
      { mood_date: dayKeyInWeek(6), affect: 'delighted' },
    ],
    compliance: Array.from({ length: 7 }, (_, i) => ({
      mandate_date: dayKeyInWeek(i),
      verified: true,
    })),
    phaseAtStart: 3,
    phaseAtEnd: 4, // advanced
  };

  it('aggregates the metrics correctly', () => {
    const m = aggregateWeeklyMetrics(input);
    expect(m.compliance_pct).toBe(100);
    expect(m.total_slips).toBe(0);
    expect(m.mantras_spoken_count).toBe(7);
    expect(m.letters_archived_count).toBe(2);
    expect(m.wardrobe_items_acquired_count).toBe(1);
    expect(m.phase_at_start).toBe(3);
    expect(m.phase_at_end).toBe(4);
    expect(m.dominant_affect).toBe('delighted');
    expect(m.longest_compliance_streak_days).toBe(7);
  });

  it('routes to delighted tone', () => {
    const m = aggregateWeeklyMetrics(input);
    expect(pickRecapTone(m)).toBe('delighted');
  });

  it('plain summary mentions follow-through and clean run', () => {
    const m = aggregateWeeklyMetrics(input);
    const summary = metricsToPlainVoiceSummary(m);
    expect(summary).toContain('finished almost everything');
    expect(summary).toContain('clean for me');
    expect(summary).toContain('every day for me');
    expect(summary).toContain('advanced a phase');
    // No raw numbers should leak.
    expect(summary).not.toMatch(/100%/);
    expect(summary).not.toMatch(/\b7\b/);
  });
});

// ============================================
// 2. Patient (struggling-but-okay) week
// ============================================

describe('weekly-recap-metrics: patient week', () => {
  const input: WeeklyRecapInput = {
    weekStart: MON,
    weekEnd: SUN,
    // 2 slips on different days
    slips: [{ detected_at: dayInWeek(2) }, { detected_at: dayInWeek(4) }],
    // mantras 3/7 days
    mantras: [
      { submission_date: dayKeyInWeek(0), reps_submitted: 5 },
      { submission_date: dayKeyInWeek(1), reps_submitted: 5 },
      { submission_date: dayKeyInWeek(3), reps_submitted: 8 },
    ],
    letters: [],
    wardrobeAcquired: [],
    moods: [
      { mood_date: dayKeyInWeek(0), affect: 'patient' },
      { mood_date: dayKeyInWeek(1), affect: 'patient' },
      { mood_date: dayKeyInWeek(2), affect: 'watching' },
      { mood_date: dayKeyInWeek(3), affect: 'patient' },
      { mood_date: dayKeyInWeek(4), affect: 'amused' },
      { mood_date: dayKeyInWeek(5), affect: 'patient' },
      { mood_date: dayKeyInWeek(6), affect: 'patient' },
    ],
    // 4 verified, 3 missed
    compliance: [
      { mandate_date: dayKeyInWeek(0), verified: true },
      { mandate_date: dayKeyInWeek(1), verified: true },
      { mandate_date: dayKeyInWeek(2), verified: false },
      { mandate_date: dayKeyInWeek(3), verified: true },
      { mandate_date: dayKeyInWeek(4), verified: false },
      { mandate_date: dayKeyInWeek(5), verified: true },
      { mandate_date: dayKeyInWeek(6), verified: false },
    ],
    phaseAtStart: 3,
    phaseAtEnd: 3,
  };

  it('aggregates correctly', () => {
    const m = aggregateWeeklyMetrics(input);
    expect(m.compliance_pct).toBe(57); // 4/7 = 57.14...
    expect(m.total_slips).toBe(2);
    expect(m.mantras_spoken_count).toBe(3);
    expect(m.letters_archived_count).toBe(0);
    expect(m.dominant_affect).toBe('patient');
    expect(m.longest_compliance_streak_days).toBe(2); // days 0..1 then break
  });

  it('routes to patient tone', () => {
    const m = aggregateWeeklyMetrics(input);
    // Not delighted (compliance < 75 or slips > 2 — here compliance is 57)
    // Not possessive (slips < 5)
    expect(pickRecapTone(m)).toBe('patient');
  });

  it('plain summary names the partial credit without shame', () => {
    const m = aggregateWeeklyMetrics(input);
    const summary = metricsToPlainVoiceSummary(m);
    expect(summary).toContain('half-followed through');
    expect(summary).toContain('couple of little slips');
    // No abusive language.
    expect(summary).not.toMatch(/\bfailed\b/i);
    expect(summary).not.toMatch(/\bworthless\b/i);
    // No raw numbers.
    expect(summary).not.toMatch(/57%?/);
  });
});

// ============================================
// 3. Possessive (cruel-week) — high slips, low compliance
// ============================================

describe('weekly-recap-metrics: possessive week', () => {
  const input: WeeklyRecapInput = {
    weekStart: MON,
    weekEnd: SUN,
    slips: Array.from({ length: 8 }, (_, i) => ({ detected_at: dayInWeek(i % 7) })),
    mantras: [],
    letters: [],
    wardrobeAcquired: [],
    moods: [
      { mood_date: dayKeyInWeek(0), affect: 'possessive' },
      { mood_date: dayKeyInWeek(1), affect: 'possessive' },
      { mood_date: dayKeyInWeek(2), affect: 'aching' },
      { mood_date: dayKeyInWeek(3), affect: 'possessive' },
      { mood_date: dayKeyInWeek(4), affect: 'possessive' },
      { mood_date: dayKeyInWeek(5), affect: 'aching' },
      { mood_date: dayKeyInWeek(6), affect: 'possessive' },
    ],
    compliance: [
      { mandate_date: dayKeyInWeek(0), verified: false },
      { mandate_date: dayKeyInWeek(1), verified: false },
      { mandate_date: dayKeyInWeek(2), verified: true },
      { mandate_date: dayKeyInWeek(3), verified: false },
      { mandate_date: dayKeyInWeek(4), verified: false },
      { mandate_date: dayKeyInWeek(5), verified: false },
      { mandate_date: dayKeyInWeek(6), verified: false },
    ],
    phaseAtStart: 3,
    phaseAtEnd: 3,
  };

  it('aggregates correctly', () => {
    const m = aggregateWeeklyMetrics(input);
    expect(m.compliance_pct).toBeLessThan(50);
    expect(m.total_slips).toBe(8);
    expect(m.dominant_affect).toBe('possessive');
    expect(m.longest_compliance_streak_days).toBe(1);
  });

  it('routes to possessive tone', () => {
    const m = aggregateWeeklyMetrics(input);
    expect(pickRecapTone(m)).toBe('possessive');
  });

  it("plain summary doesn't shame on slip clustering", () => {
    const m = aggregateWeeklyMetrics(input);
    const summary = metricsToPlainVoiceSummary(m);
    // Names the slips without abuse.
    expect(summary).toContain('slipping');
    // No shame markers.
    expect(summary).not.toMatch(/\b(pathetic|disgusting|worthless|failure)\b/i);
    // No raw numbers.
    expect(summary).not.toMatch(/\b\d+\s+slip/i);
  });
});

// ============================================
// 4. Missing data — must produce null, never fabricate
// ============================================

describe('weekly-recap-metrics: missing data', () => {
  it('reports null compliance_pct when no compliance rows exist', () => {
    const m = aggregateWeeklyMetrics({
      weekStart: MON, weekEnd: SUN,
      slips: [], mantras: [], letters: [], wardrobeAcquired: [],
      moods: [], compliance: [],
      phaseAtStart: null, phaseAtEnd: null,
    });
    expect(m.compliance_pct).toBeNull();
    expect(m.dominant_affect).toBeNull();
    expect(m.longest_compliance_streak_days).toBe(0);
  });

  it("plain summary says I don't have the number when compliance is null", () => {
    const m = aggregateWeeklyMetrics({
      weekStart: MON, weekEnd: SUN,
      slips: [], mantras: [], letters: [], wardrobeAcquired: [],
      moods: [], compliance: [],
      phaseAtStart: null, phaseAtEnd: null,
    });
    const summary = metricsToPlainVoiceSummary(m);
    expect(summary).toContain("don't have a clean compliance read");
  });
});

// ============================================
// 5. Edge case — slips >= 5 but compliance still high → patient, not possessive
// ============================================

describe('weekly-recap-metrics: high slips with high compliance', () => {
  it('does not route to possessive when compliance is acceptable', () => {
    const m = aggregateWeeklyMetrics({
      weekStart: MON, weekEnd: SUN,
      slips: Array.from({ length: 6 }, () => ({ detected_at: dayInWeek(0) })),
      mantras: [], letters: [], wardrobeAcquired: [], moods: [],
      compliance: Array.from({ length: 7 }, (_, i) => ({
        mandate_date: dayKeyInWeek(i),
        verified: true,
      })),
      phaseAtStart: null, phaseAtEnd: null,
    });
    // compliance_pct = 100, slips = 6 → not possessive (slips condition is
    // AND with compliance < 50). Routes to patient because slips > 2 cuts
    // off the delighted path.
    expect(m.compliance_pct).toBe(100);
    expect(m.total_slips).toBe(6);
    expect(pickRecapTone(m)).toBe('patient');
  });
});
