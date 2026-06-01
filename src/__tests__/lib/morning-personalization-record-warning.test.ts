// Regression for the "Record Tomorrow" milestone — historically two bugs:
//   1. longestStreak was sampled from the recent-5 ended streaks (not all-time),
//      so a long old streak that rolled out of the window made the record
//      visibly shrink.
//   2. The warning fired one day early — at currentDay === longestStreak - 1,
//      meaning "tomorrow" only TIED the record, never beat it.
// Fixed in src/lib/morning-personalization.ts.

import { describe, it, expect } from 'vitest';
import { generateWarnings } from '../../lib/morning-personalization';

const noForecast = null;

describe('morning-personalization — Record Tomorrow milestone', () => {
  it('does NOT fire on the day before the record (would only tie)', () => {
    const warnings = generateWarnings(
      { currentDay: 9, avgStreak: 4, longestStreak: 10, isActive: true },
      noForecast,
    );
    expect(warnings.some(w => w.title === 'Record Tomorrow')).toBe(false);
  });

  it('fires on the day equal to the record (tomorrow truly beats it)', () => {
    const warnings = generateWarnings(
      { currentDay: 10, avgStreak: 4, longestStreak: 10, isActive: true },
      noForecast,
    );
    const milestone = warnings.find(w => w.title === 'Record Tomorrow');
    expect(milestone).toBeDefined();
    expect(milestone?.message).toBe('One more day to beat your 10 day record.');
  });

  it('rolls into New Record once currentDay exceeds the prior record', () => {
    const warnings = generateWarnings(
      { currentDay: 11, avgStreak: 4, longestStreak: 10, isActive: true },
      noForecast,
    );
    expect(warnings.some(w => w.title === 'Record Tomorrow')).toBe(false);
    const newRecord = warnings.find(w => w.title === 'New Record');
    expect(newRecord).toBeDefined();
    expect(newRecord?.message).toBe('11 days — past your 10 day record.');
  });

  it('suppresses milestone entirely when there is no historical record', () => {
    const warnings = generateWarnings(
      { currentDay: 0, avgStreak: 0, longestStreak: 0, isActive: false },
      noForecast,
    );
    expect(warnings.some(w => w.title === 'Record Tomorrow')).toBe(false);
    expect(warnings.some(w => w.title === 'New Record')).toBe(false);
  });
});
