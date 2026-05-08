import { describe, it, expect } from 'vitest';
import { planRituals, type CredentialsForPlacement } from '../../lib/calendar/place-rituals';

const baseCred: CredentialsForPlacement = {
  morning_ritual_local_time: '06:30',
  morning_ritual_duration_min: 15,
  evening_reflection_local_time: '21:00',
  evening_reflection_duration_min: 10,
  events_enabled: true,
};

describe('planRituals', () => {
  it('returns nothing when events are disabled', () => {
    const planned = planRituals({
      credentials: { ...baseCred, events_enabled: false },
      existing: [],
      todayLocalStartIso: '2026-05-06T00:00:00.000Z',
      daysAhead: 7,
      timeZone: 'UTC',
    });
    expect(planned).toEqual([]);
  });

  it('plans morning + evening for each day in the window', () => {
    const planned = planRituals({
      credentials: baseCred,
      existing: [],
      todayLocalStartIso: '2026-05-06T00:00:00.000Z',
      daysAhead: 7,
      timeZone: 'UTC',
    });
    // 7 days × 2 events = 14
    expect(planned.length).toBe(14);
    const types = planned.map((p) => p.event_type);
    expect(types.filter((t) => t === 'morning_ritual').length).toBe(7);
    expect(types.filter((t) => t === 'evening_reflection').length).toBe(7);
  });

  it('skips days that already have a managed event of that type', () => {
    const planned = planRituals({
      credentials: baseCred,
      existing: [
        { event_type: 'morning_ritual', starts_at: '2026-05-06T06:30:00.000Z' },
        { event_type: 'evening_reflection', starts_at: '2026-05-08T21:00:00.000Z' },
      ],
      todayLocalStartIso: '2026-05-06T00:00:00.000Z',
      daysAhead: 7,
      timeZone: 'UTC',
    });
    // 7 days × 2 - 2 already-placed = 12
    expect(planned.length).toBe(12);
    // The 2026-05-06 morning should be missing.
    const may6Morning = planned.find(
      (p) => p.event_type === 'morning_ritual' && p.startsAtIso.startsWith('2026-05-06'),
    );
    expect(may6Morning).toBeUndefined();
    // The 2026-05-08 evening should be missing.
    const may8Evening = planned.find(
      (p) => p.event_type === 'evening_reflection' && p.startsAtIso.startsWith('2026-05-08'),
    );
    expect(may8Evening).toBeUndefined();
  });

  it('respects custom morning + evening times and durations', () => {
    const planned = planRituals({
      credentials: {
        ...baseCred,
        morning_ritual_local_time: '07:15',
        morning_ritual_duration_min: 30,
        evening_reflection_local_time: '22:00',
        evening_reflection_duration_min: 5,
      },
      existing: [],
      todayLocalStartIso: '2026-05-06T00:00:00.000Z',
      daysAhead: 1,
      timeZone: 'UTC',
    });
    expect(planned.length).toBe(2);
    const morning = planned.find((p) => p.event_type === 'morning_ritual')!;
    const evening = planned.find((p) => p.event_type === 'evening_reflection')!;
    expect(morning.startsAtIso).toBe('2026-05-06T07:15:00.000Z');
    // 30 min later
    expect(morning.endsAtIso).toBe('2026-05-06T07:45:00.000Z');
    expect(evening.startsAtIso).toBe('2026-05-06T22:00:00.000Z');
    expect(evening.endsAtIso).toBe('2026-05-06T22:05:00.000Z');
  });

  it('emits ISO start times in the user timezone', () => {
    // 06:30 local in Asia/Tokyo (UTC+9) = 21:30 UTC the previous day.
    const planned = planRituals({
      credentials: baseCred,
      existing: [],
      todayLocalStartIso: '2026-05-06T00:00:00.000Z',
      daysAhead: 1,
      timeZone: 'Asia/Tokyo',
    });
    const morning = planned.find((p) => p.event_type === 'morning_ritual')!;
    // The user's local "May 6 at 06:30" maps to "May 5 21:30 UTC".
    // (2026-05-06 starts at 00:00 UTC, but the Tokyo day for that instant is 2026-05-06,
    // so 06:30 Tokyo on May 6 = 21:30 UTC on May 5.)
    expect(morning.startsAtIso).toBe('2026-05-05T21:30:00.000Z');
  });
});
