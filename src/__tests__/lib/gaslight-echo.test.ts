import { describe, it, expect } from 'vitest';
import {
  echoCount,
  echoSendTimes,
  isEchoDue,
  ECHO_MIN_DAYS,
  ECHO_MAX_DAYS,
} from '../../lib/gaslight-echo';

// Regression guard for gaslight cluster echoes (wish: Gaslight cluster echoes, mig 608).

const DAY = 86400_000;
const CID = '3b2e8147-aaaa-bbbb-cccc-000000000001';

describe('echoCount', () => {
  it('always returns 2 or 3', () => {
    for (const id of [CID, 'abc', '', 'ffffffff-0000-0000-0000-000000000000', 'z'.repeat(40)]) {
      const n = echoCount(id);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('is deterministic for the same id', () => {
    expect(echoCount(CID)).toBe(echoCount(CID));
  });
});

describe('echoSendTimes', () => {
  const delivered = new Date('2026-06-01T12:00:00Z');

  it('schedules echoCount echoes within the 3-10 day window', () => {
    const times = echoSendTimes(delivered, CID);
    expect(times.length).toBe(echoCount(CID));
    for (const t of times) {
      const days = (t.getTime() - delivered.getTime()) / DAY;
      expect(days).toBeGreaterThanOrEqual(ECHO_MIN_DAYS - 0.0001);
      expect(days).toBeLessThanOrEqual(ECHO_MAX_DAYS + 0.0001);
    }
  });

  it('produces strictly increasing send times', () => {
    const times = echoSendTimes(delivered, CID, 3);
    for (let i = 1; i < times.length; i++) {
      expect(times[i].getTime()).toBeGreaterThan(times[i - 1].getTime());
    }
  });

  it('is deterministic for the same inputs', () => {
    const a = echoSendTimes(delivered, CID, 3).map((d) => d.getTime());
    const b = echoSendTimes(delivered, CID, 3).map((d) => d.getTime());
    expect(a).toEqual(b);
  });

  it('handles a single echo by centering it in the window', () => {
    const times = echoSendTimes(delivered, CID, 1);
    expect(times.length).toBe(1);
    const days = (times[0].getTime() - delivered.getTime()) / DAY;
    expect(days).toBeGreaterThanOrEqual(ECHO_MIN_DAYS);
    expect(days).toBeLessThanOrEqual(ECHO_MAX_DAYS);
  });
});

describe('isEchoDue', () => {
  it('is false before send_after and true after', () => {
    const now = new Date('2026-06-05T00:00:00Z');
    expect(isEchoDue(new Date(now.getTime() + DAY), now)).toBe(false);
    expect(isEchoDue(new Date(now.getTime() - DAY), now)).toBe(true);
  });

  it('accepts ISO strings', () => {
    const now = new Date('2026-06-05T00:00:00Z');
    expect(isEchoDue('2026-06-04T00:00:00Z', now)).toBe(true);
  });
});
