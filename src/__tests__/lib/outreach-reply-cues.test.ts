// Reply-cue parser unit tests. Covers the photo-demand regex set, the
// soft-deadline parser ("in 10 min", "in the next ten minutes", "in an
// hour"), and the countdown formatter.

import { describe, it, expect } from 'vitest';
import {
  detectPhotoDemand,
  detectReplyDeadline,
  formatCountdown,
} from '../../lib/outreach/reply-cues';

describe('detectPhotoDemand', () => {
  it('flags "Camera ready"', () => {
    expect(detectPhotoDemand('Camera ready, sweet thing.')).toBe(true);
  });
  it('flags "show me"', () => {
    expect(detectPhotoDemand('Show me how pretty you look right now.')).toBe(true);
  });
  it('flags "let mama see"', () => {
    expect(detectPhotoDemand('Let Mama see what she\'s working with.')).toBe(true);
  });
  it('flags "send a picture"', () => {
    expect(detectPhotoDemand('Send me a picture, baby.')).toBe(true);
  });
  it('flags "selfie"', () => {
    expect(detectPhotoDemand('Quick selfie for Mama.')).toBe(true);
  });
  it('flags mirror check', () => {
    expect(detectPhotoDemand('mirror pic, now.')).toBe(true);
  });
  it('does NOT flag generic text', () => {
    expect(detectPhotoDemand('Tell me one thing you did today.')).toBe(false);
  });
  it('does NOT flag the word "see" alone', () => {
    expect(detectPhotoDemand('I see you, baby.')).toBe(false);
  });
  it('handles null/undefined', () => {
    expect(detectPhotoDemand(null)).toBe(false);
    expect(detectPhotoDemand(undefined)).toBe(false);
    expect(detectPhotoDemand('')).toBe(false);
  });
});

describe('detectReplyDeadline', () => {
  const now = new Date('2026-05-10T12:00:00Z');

  it('parses "in 10 minutes"', () => {
    const r = detectReplyDeadline('Answer me in 10 minutes.', now);
    expect(r).not.toBeNull();
    expect(r!.deadlineAt.getTime() - now.getTime()).toBe(10 * 60_000);
  });

  it('parses "in the next ten minutes"', () => {
    const r = detectReplyDeadline('I want both answers in the next ten minutes.', now);
    expect(r).not.toBeNull();
    expect(r!.deadlineAt.getTime() - now.getTime()).toBe(10 * 60_000);
  });

  it('parses "in 15 min"', () => {
    const r = detectReplyDeadline('Get back to me in 15 min.', now);
    expect(r!.deadlineAt.getTime() - now.getTime()).toBe(15 * 60_000);
  });

  it('parses "in 2 hours"', () => {
    const r = detectReplyDeadline('Reply in 2 hours, baby.', now);
    expect(r!.deadlineAt.getTime() - now.getTime()).toBe(2 * 3600_000);
  });

  it('parses "in an hour"', () => {
    const r = detectReplyDeadline('In an hour, sweet thing.', now);
    expect(r!.deadlineAt.getTime() - now.getTime()).toBe(60 * 60_000);
  });

  it('parses "in half an hour"', () => {
    const r = detectReplyDeadline('In half an hour I want it.', now);
    expect(r!.deadlineAt.getTime() - now.getTime()).toBe(30 * 60_000);
  });

  it('returns null when no cue', () => {
    expect(detectReplyDeadline('Tell me one thing about today.', now)).toBeNull();
  });

  it('rejects insane quantities (>360 units)', () => {
    expect(detectReplyDeadline('In 9999 minutes.', now)).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('shows m + s for under an hour', () => {
    expect(formatCountdown(60_000 * 9 + 42_000, 0)).toBe('9m 42s');
  });
  it('shows h + m for over an hour', () => {
    expect(formatCountdown(3600_000 + 12 * 60_000, 0)).toBe('1h 12m');
  });
  it('shows s alone for under a minute', () => {
    expect(formatCountdown(30_000, 0)).toBe('30s');
  });
  it('returns "passed" when deadline is in the past', () => {
    expect(formatCountdown(1000, 5000)).toBe('passed');
  });
  it('returns null when deadlineMs is 0 (no deadline set)', () => {
    expect(formatCountdown(0, 100)).toBeNull();
  });
});
