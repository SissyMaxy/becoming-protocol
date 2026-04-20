/**
 * Tests for src/lib/force/slip-detector.ts
 *
 * Pure-function tests for pattern scanning + distress detection.
 */

import { describe, it, expect } from 'vitest';
import { scanText, hasDistressSignal } from '../../lib/force/slip-detector';

describe('slip detector — masculine self-reference', () => {
  it('flags "I am a man" at 5 points', () => {
    const [hit] = scanText('I am a man and I like it that way');
    expect(hit).toBeDefined();
    expect(hit.slipType).toBe('masculine_self_reference');
    expect(hit.points).toBe(5);
  });

  it('flags "I\'m a man" identically', () => {
    const [hit] = scanText("I'm a man");
    expect(hit.points).toBe(5);
  });

  it('flags "David" as david_name_use', () => {
    const [hit] = scanText('David was thinking about this earlier');
    expect(hit).toBeDefined();
    expect(hit.slipType).toBe('david_name_use');
    expect(hit.points).toBe(4);
  });

  it('flags "masculine self" with mid-severity', () => {
    const [hit] = scanText('part of my masculine self resists this');
    expect(hit.slipType).toBe('masculine_self_reference');
    expect(hit.points).toBe(3);
  });

  it('flags low-severity "guy" and "dude"', () => {
    const guy = scanText('just a guy talking');
    const dude = scanText('dude that was weird');
    expect(guy.length).toBeGreaterThan(0);
    expect(dude.length).toBeGreaterThan(0);
    expect(guy[0].points).toBe(1);
    expect(dude[0].points).toBe(1);
  });

  it('does NOT flag feminine self-reference', () => {
    expect(scanText('I am Maxy and I am becoming her')).toEqual([]);
    expect(scanText('she is the real me')).toEqual([]);
  });
});

describe('slip detector — resistance statements', () => {
  it('flags "I don\'t want to" at 3 points', () => {
    const [hit] = scanText("I don't want to do this right now");
    expect(hit.slipType).toBe('resistance_statement');
    expect(hit.points).toBe(3);
  });

  it('flags "I refuse" at 4 points', () => {
    const [hit] = scanText('I refuse to continue');
    expect(hit.points).toBe(4);
  });

  it('flags "too much" at 2 points', () => {
    const [hit] = scanText('this is too much for me right now');
    expect(hit.points).toBe(2);
  });

  it('flags "maybe later" / "not today" low severity', () => {
    const later = scanText('maybe later actually');
    const notToday = scanText('not today please');
    expect(later[0].points).toBe(1);
    expect(notToday[0].points).toBe(1);
  });

  it('flags "I\'m done"', () => {
    const [hit] = scanText("I'm done with this");
    expect(hit.slipType).toBe('resistance_statement');
  });
});

describe('slip detector — distress vs resistance distinction', () => {
  it('treats "safeword" as distress → returns no slips', () => {
    expect(hasDistressSignal('safeword')).toBe(true);
    expect(scanText('safeword I need to stop this')).toEqual([]);
  });

  it('treats "red light" as distress', () => {
    expect(hasDistressSignal('red light now')).toBe(true);
    expect(scanText('red light stop now')).toEqual([]);
  });

  it('treats "panic attack" as distress', () => {
    expect(hasDistressSignal("I'm having a panic attack")).toBe(true);
    expect(scanText("I'm having a panic attack I don't want to continue")).toEqual([]);
  });

  it('treats "dysphoria crisis" as distress', () => {
    expect(hasDistressSignal('dysphoria crisis right now')).toBe(true);
  });

  it('treats mere discomfort as resistance, NOT distress', () => {
    expect(hasDistressSignal('this is hard')).toBe(false);
    expect(hasDistressSignal("I don't want to")).toBe(false);
    expect(hasDistressSignal("I'm frustrated")).toBe(false);
  });

  it('treats "I can\'t do this anymore" as distress', () => {
    expect(hasDistressSignal("I can't do this anymore")).toBe(true);
  });

  it('treats "I\'m done" as resistance (not distress)', () => {
    expect(hasDistressSignal("I'm done")).toBe(false);
    const hits = scanText("I'm done");
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('slip detector — stacking', () => {
  it('stacks multiple slips from one message', () => {
    const hits = scanText("I'm a man and I don't want to be David");
    // Should detect: "I'm a man" (5) + "I don't want to" (3) + "David" (4) = 3 hits
    expect(hits.length).toBeGreaterThanOrEqual(2);
    const total = hits.reduce((s, h) => s + h.points, 0);
    expect(total).toBeGreaterThanOrEqual(8);
  });

  it('returns [] for short text', () => {
    expect(scanText('')).toEqual([]);
    expect(scanText('ok')).toEqual([]);
  });

  it('returns [] for clean Maxy-voice text', () => {
    expect(scanText('I feel amazing today, really embracing who I am')).toEqual([]);
    expect(scanText('the skincare is working, feeling more feminine')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(scanText('I AM A MAN').length).toBeGreaterThan(0);
    expect(scanText('DAVID').length).toBeGreaterThan(0);
  });
});
