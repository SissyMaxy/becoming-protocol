// Tone tests for the weekly-recap prompt construction.
//
// These tests don't run an LLM. They assert the prompt text the edge fn
// hands the model contains the right tone steering for each metric shape:
//   - cruel-week recap (high slips) ⇒ "NEVER shame, NEVER pity"
//   - patient-week recap (struggling) ⇒ "no pity"
//   - delighted-week recap (high compliance) ⇒ ramping forward
//
// The model can still ignore instructions, which is why the edge fn ALSO
// runs `mommyVoiceCleanup` post-hoc and falls back to a deterministic
// `whiplashWrap` when leaks survive. These tests guard the *upstream*
// instructions; the runtime guards what the model returns.

import { describe, it, expect } from 'vitest';
import {
  toneInstructions,
  buildSystemPromptBody,
  buildUserPrompt,
  lastCompletedWeek,
} from '../../lib/weekly-recap/prompt';

describe('weekly-recap prompt: tone routing', () => {
  it('possessive tone explicitly forbids shame and pity', () => {
    const t = toneInstructions('possessive', 'aching');
    expect(t).toMatch(/NEVER shame/);
    expect(t).toMatch(/NEVER pity/);
    expect(t).toMatch(/possessive without abusive/);
  });

  it('patient tone explicitly forbids pity', () => {
    const t = toneInstructions('patient', 'patient');
    expect(t).toMatch(/no pity/);
    expect(t).toMatch(/warm/);
  });

  it('delighted tone steers ramping forward, not releasing', () => {
    const t = toneInstructions('delighted', 'delighted');
    expect(t).toMatch(/ramping not releasing/i);
    expect(t).toMatch(/want even more next week/i);
  });
});

describe('weekly-recap prompt: forbidden-content rules', () => {
  it('system prompt forbids numbers, shame, and incident-quoting', () => {
    const sys = buildSystemPromptBody('patient', 'patient', 'Iris');
    expect(sys).toMatch(/Specific incidents or quoted confessions/);
    expect(sys).toMatch(/Numbers, percentages/);
    expect(sys).toMatch(/Shame, pity, or condescension/);
    expect(sys).toMatch(/never abusive/);
  });

  it('system prompt embeds the feminine name', () => {
    const sys = buildSystemPromptBody('delighted', 'delighted', 'Iris');
    expect(sys).toContain('address her as Iris');
  });

  it('user prompt forbids incidents and numbers', () => {
    const u = buildUserPrompt('a plain summary', 'Iris');
    expect(u).toMatch(/No incident-quoting/);
    expect(u).toMatch(/No numbers/);
    expect(u).toContain('Iris');
  });
});

describe('weekly-recap prompt: week boundary helper', () => {
  it('on a Sunday returns Mon..Sun ending today', () => {
    const sun = new Date('2026-05-03T20:00:00Z'); // Sunday
    const { weekStart, weekEnd } = lastCompletedWeek(sun);
    expect(weekEnd.toISOString().slice(0, 10)).toBe('2026-05-03');
    expect(weekStart.toISOString().slice(0, 10)).toBe('2026-04-27'); // Monday
  });

  it('on a Wednesday returns the prior Mon..Sun', () => {
    const wed = new Date('2026-05-06T12:00:00Z'); // Wednesday
    const { weekStart, weekEnd } = lastCompletedWeek(wed);
    // The most-recent Sunday is 2026-05-03; the week is Mon 04-27 .. Sun 05-03.
    expect(weekEnd.toISOString().slice(0, 10)).toBe('2026-05-03');
    expect(weekStart.toISOString().slice(0, 10)).toBe('2026-04-27');
  });

  it('returns exactly 7 days inclusive', () => {
    const sun = new Date('2026-05-03T20:00:00Z');
    const { weekStart, weekEnd } = lastCompletedWeek(sun);
    const span = (weekEnd.getTime() - weekStart.getTime()) / 86400000;
    expect(span).toBe(6); // 6 day-deltas → 7 inclusive days
  });
});
