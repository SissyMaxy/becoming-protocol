import { describe, it, expect } from 'vitest';
import { getBucket, getGreetingForBucket, getBookendQuote, getGreeting } from '../../lib/time-of-day';

describe('time-of-day buckets', () => {
  it('classifies morning 05:00–11:59', () => {
    expect(getBucket(5)).toBe('morning');
    expect(getBucket(8)).toBe('morning');
    expect(getBucket(11)).toBe('morning');
  });

  it('classifies afternoon 12:00–16:59', () => {
    expect(getBucket(12)).toBe('afternoon');
    expect(getBucket(15)).toBe('afternoon');
    expect(getBucket(16)).toBe('afternoon');
  });

  it('classifies evening 17:00–20:59', () => {
    expect(getBucket(17)).toBe('evening');
    expect(getBucket(18)).toBe('evening');
    expect(getBucket(20)).toBe('evening');
  });

  it('classifies late 21:00–04:59', () => {
    expect(getBucket(21)).toBe('late');
    expect(getBucket(23)).toBe('late');
    expect(getBucket(0)).toBe('late');
    expect(getBucket(3)).toBe('late');
    expect(getBucket(4)).toBe('late');
  });
});

describe('greeting selection', () => {
  it('uses the matching bucket headline for 5–8pm', () => {
    expect(getGreeting(18)).toBe('Good evening');
  });

  it('rotates the late-night pool deterministically by day index', () => {
    const a = getGreetingForBucket('late', 0);
    const b = getGreetingForBucket('late', 1);
    // pool has multiple entries — consecutive day indices should usually differ
    expect(a).not.toBe('Good morning');
    expect(a).not.toBe('Good afternoon');
    expect(a).not.toBe('Good evening');
    // the pool rotates; same dayIdx returns same value
    expect(getGreetingForBucket('late', 0)).toBe(a);
    expect(getGreetingForBucket('late', 1)).toBe(b);
  });

  it('never returns "Good morning" outside the morning bucket', () => {
    expect(getGreeting(13)).not.toMatch(/morning/i);
    expect(getGreeting(19)).not.toMatch(/morning/i);
    expect(getGreeting(23)).not.toMatch(/morning/i);
    expect(getGreeting(2)).not.toMatch(/morning/i);
  });
});

describe('bookend quote pool', () => {
  it('keeps the morning coffee line in the morning bucket only', () => {
    // The known immersion-breaker line — must not appear outside morning.
    for (let h = 0; h < 24; h++) {
      const bucket = getBucket(h);
      if (bucket === 'morning') continue;
      // scan a year of day indices for this bucket — if "coffee" line appears,
      // the bucket pool was misassigned.
      for (let d = 0; d < 366; d++) {
        const q = getBookendQuote(bucket, d);
        expect(q).not.toMatch(/before coffee/i);
      }
    }
  });

  it('returns a non-empty string for every bucket', () => {
    for (const b of ['morning', 'afternoon', 'evening', 'late'] as const) {
      const q = getBookendQuote(b, 0);
      expect(typeof q).toBe('string');
      expect(q.length).toBeGreaterThan(0);
    }
  });
});
