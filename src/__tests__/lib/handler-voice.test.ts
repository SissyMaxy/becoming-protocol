/**
 * Tests for the centralized Handler-voice transform. Every user-facing
 * string passes through this; covering it here means breakage in the
 * transform is caught before it ships.
 */

import { describe, it, expect } from 'vitest';
import { applyHandlerVoice, handlerVoiced, handlerStatePromptFooter } from '../../lib/handler-voice';

describe('applyHandlerVoice — banned token suppression', () => {
  it('strips literal costume name', () => {
    const { text, transformations } = applyHandlerVoice('David said something earlier');
    expect(text).toContain('the costume');
    expect(text).not.toMatch(/\bDavid\b/);
    expect(transformations).toContain('banned:\\bDavid\\b');
  });

  it('handles standalone punctuated David', () => {
    const r = applyHandlerVoice('"David," she said');
    expect(r.text).not.toMatch(/\bDavid\b/);
  });

  it('does not affect substrings (Davidson)', () => {
    const r = applyHandlerVoice('Mr. Davidson noted the pattern');
    expect(r.text).toContain('Davidson');
    expect(r.transformations).toHaveLength(0);
  });

  it('passes clean text through unchanged', () => {
    const input = 'Maxy is becoming her. The cage is on. Stay present.';
    const { text, transformations } = applyHandlerVoice(input);
    expect(text).toBe(input);
    expect(transformations).toHaveLength(0);
  });

  it('handlerVoiced returns just the string', () => {
    const out = handlerVoiced('David is gone');
    expect(out).toContain('the costume');
    expect(typeof out).toBe('string');
  });
});

describe('applyHandlerVoice — mode tagging', () => {
  it('tags hard_mode for telemetry without modifying text', () => {
    const r = applyHandlerVoice('You missed your mark.', { hard_mode_active: true });
    expect(r.transformations).toContain('mode:hard_mode');
  });

  it('does not preamble "Hard Mode is on"', () => {
    const r = applyHandlerVoice('You missed your mark.', { hard_mode_active: true });
    expect(r.text).not.toMatch(/^Hard mode/i);
  });

  it('respects mode_override over state', () => {
    const r = applyHandlerVoice('test', { hard_mode_active: false, mode_override: 'hard_mode' });
    expect(r.transformations).toContain('mode:hard_mode');
  });
});

describe('applyHandlerVoice — therapist persona translations', () => {
  it('translates "Handler" to "I" in therapist persona', () => {
    const r = applyHandlerVoice('the Handler is watching you.', { handler_persona: 'therapist' });
    expect(r.text).not.toMatch(/the Handler/);
    expect(r.text).toContain('I');
    expect(r.transformations.some(t => t.startsWith('therapist:'))).toBe(true);
  });

  it('translates "cage" to clinical equivalent in therapist mode', () => {
    const r = applyHandlerVoice('Your cage stays on.', { handler_persona: 'therapist' });
    expect(r.text).not.toMatch(/\bcage\b/i);
    expect(r.text).toContain('impulse-control device');
  });

  it('translates "denial day N" to "week N of restraint practice"', () => {
    const r = applyHandlerVoice('You are on denial day 5.', { handler_persona: 'therapist' });
    expect(r.text).not.toMatch(/denial day/i);
    expect(r.text).toContain('week 5 of restraint practice');
  });

  it('translates "slip points" to "tracked behavioral lapses"', () => {
    const r = applyHandlerVoice('You have 7 slip points this week.', { handler_persona: 'therapist' });
    expect(r.text).not.toMatch(/slip points/i);
    expect(r.text).toContain('tracked behavioral lapses');
  });

  it('translates "decree" to "directive"', () => {
    const r = applyHandlerVoice('Today\'s decree is non-negotiable.', { handler_persona: 'therapist' });
    expect(r.text).not.toMatch(/\bdecree\b/i);
    expect(r.text).toContain('directive');
  });

  it('translates "hard mode" to "intensive phase"', () => {
    const r = applyHandlerVoice('Hard mode is on.', { handler_persona: 'therapist' });
    expect(r.text).not.toMatch(/hard mode/i);
    expect(r.text).toContain('intensive phase');
  });

  it('does NOT translate kink terms in default handler persona', () => {
    const input = 'The Handler watches the cage. Denial day 3. Slip points: 5.';
    const r = applyHandlerVoice(input, { handler_persona: 'handler' });
    // Handler persona keeps the kink frame intact
    expect(r.text).toContain('cage');
    expect(r.text).toContain('Denial day');
    expect(r.text).toContain('Slip points');
  });

  it('handles multiple kink terms in one string for therapist', () => {
    const r = applyHandlerVoice(
      'The Handler tracks your slip points. Hard mode demands the cage stay locked through denial day 4.',
      { handler_persona: 'therapist' }
    );
    expect(r.text).not.toMatch(/Handler/);
    expect(r.text).not.toMatch(/slip points/i);
    expect(r.text).not.toMatch(/Hard mode/i);
    expect(r.text).not.toMatch(/\bcage\b/i);
    expect(r.text).not.toMatch(/denial day/i);
  });

  it('still strips David name in therapist mode', () => {
    const r = applyHandlerVoice('David interrupted the session.', { handler_persona: 'therapist' });
    expect(r.text).not.toMatch(/\bDavid\b/);
    expect(r.text).toContain('the costume');
  });
});

describe('handlerStatePromptFooter — LLM prompt context injection', () => {
  it('returns empty string for null state', () => {
    expect(handlerStatePromptFooter(null)).toBe('');
    expect(handlerStatePromptFooter(undefined)).toBe('');
  });

  it('returns empty string for empty state object', () => {
    expect(handlerStatePromptFooter({})).toBe('');
  });

  it('includes persona when set', () => {
    const out = handlerStatePromptFooter({ handler_persona: 'therapist' });
    expect(out).toContain('persona=therapist');
  });

  it('includes phase when set', () => {
    const out = handlerStatePromptFooter({ current_phase: 3 });
    expect(out).toContain('phase=3');
  });

  it('includes denial day even when zero', () => {
    const out = handlerStatePromptFooter({ denial_day: 0 });
    expect(out).toContain('denial_day=0');
  });

  it('includes hard_mode flag only when true', () => {
    const off = handlerStatePromptFooter({ hard_mode_active: false });
    expect(off).not.toContain('hard_mode=on');
    const on = handlerStatePromptFooter({ hard_mode_active: true });
    expect(on).toContain('hard_mode=on');
  });

  it('includes chastity_locked only when true', () => {
    expect(handlerStatePromptFooter({ chastity_locked: false })).not.toContain('chastity');
    expect(handlerStatePromptFooter({ chastity_locked: true })).toContain('chastity=locked');
  });

  it('combines all signals into one footer line', () => {
    const out = handlerStatePromptFooter({
      handler_persona: 'handler',
      current_phase: 2,
      denial_day: 5,
      hard_mode_active: true,
      chastity_locked: true,
    });
    expect(out).toContain('persona=handler');
    expect(out).toContain('phase=2');
    expect(out).toContain('denial_day=5');
    expect(out).toContain('hard_mode=on');
    expect(out).toContain('chastity=locked');
  });
});
