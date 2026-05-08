import { describe, it, expect } from 'vitest';
import { computeDeliverAfter } from '../../lib/calendar/delivery-gate';

const FIVE_MIN = 5 * 60_000;

describe('calendar delivery-gate', () => {
  it('returns null when there are no busy windows', () => {
    expect(computeDeliverAfter([], Date.now())).toBeNull();
  });

  it('returns null when scheduleAt is outside every window', () => {
    const windows = [
      { window_start: '2026-05-06T14:00:00.000Z', window_end: '2026-05-06T15:00:00.000Z' },
    ];
    const before = Date.parse('2026-05-06T13:30:00.000Z');
    const after = Date.parse('2026-05-06T15:30:00.000Z');
    expect(computeDeliverAfter(windows, before)).toBeNull();
    expect(computeDeliverAfter(windows, after)).toBeNull();
  });

  it('defers to window_end + 5min when scheduleAt falls inside a window', () => {
    const windows = [
      { window_start: '2026-05-06T14:00:00.000Z', window_end: '2026-05-06T15:00:00.000Z' },
    ];
    const inside = Date.parse('2026-05-06T14:30:00.000Z');
    const result = computeDeliverAfter(windows, inside);
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe(
      new Date(Date.parse('2026-05-06T15:00:00.000Z') + FIVE_MIN).toISOString(),
    );
  });

  it('treats window boundaries as half-open [start, end)', () => {
    const windows = [
      { window_start: '2026-05-06T14:00:00.000Z', window_end: '2026-05-06T15:00:00.000Z' },
    ];
    const atStart = Date.parse('2026-05-06T14:00:00.000Z');
    const atEnd = Date.parse('2026-05-06T15:00:00.000Z');
    expect(computeDeliverAfter(windows, atStart)).not.toBeNull();
    expect(computeDeliverAfter(windows, atEnd)).toBeNull();
  });

  it('picks the first matching window when multiple overlap', () => {
    const windows = [
      { window_start: '2026-05-06T14:00:00.000Z', window_end: '2026-05-06T15:00:00.000Z' },
      { window_start: '2026-05-06T14:30:00.000Z', window_end: '2026-05-06T16:00:00.000Z' },
    ];
    const inside = Date.parse('2026-05-06T14:45:00.000Z');
    const result = computeDeliverAfter(windows, inside);
    expect(result!.toISOString()).toBe(
      new Date(Date.parse('2026-05-06T15:00:00.000Z') + FIVE_MIN).toISOString(),
    );
  });

  it('skips invalid window strings without throwing', () => {
    const windows = [
      { window_start: 'not-a-date', window_end: 'also-not' },
      { window_start: '2026-05-06T14:00:00.000Z', window_end: '2026-05-06T15:00:00.000Z' },
    ];
    const inside = Date.parse('2026-05-06T14:30:00.000Z');
    const result = computeDeliverAfter(windows, inside);
    expect(result).not.toBeNull();
  });
});
