// sleep-cue client tests — the missing client half of TMR (§2.4). Pins:
//   1. the hard opt-in gate (no recon_sleep_enabled → no cue, no query even fired)
//   2. rotation order (never-played first, else oldest-played)
//   3. markSleepCuePlayed writes status='played' + played_at

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTonightSleepCue, markSleepCuePlayed } from '../../lib/bedtime/sleep-cue';

function chainable(resolveValue: unknown) {
  const builder: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'not', 'order', 'limit', 'update'];
  for (const m of methods) {
    builder[m] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(resolveValue));
  return builder;
}

describe('getTonightSleepCue', () => {
  it('returns null and never queries the cue table when recon_sleep_enabled is off', async () => {
    const settingsBuilder = chainable({ data: { recon_sleep_enabled: false }, error: null });
    const cueBuilder = chainable({ data: null, error: null });
    const from = vi.fn((table: string) =>
      table === 'life_as_woman_settings' ? settingsBuilder : cueBuilder,
    );
    const sb = { from } as unknown as Parameters<typeof getTonightSleepCue>[0];

    const result = await getTonightSleepCue(sb, 'u-1');

    expect(result).toBeNull();
    expect(cueBuilder.select).not.toHaveBeenCalled();
  });

  it('returns the rotated cue row when the opt-in is on', async () => {
    const settingsBuilder = chainable({ data: { recon_sleep_enabled: true }, error: null });
    const cueBuilder = chainable({
      data: { id: 'cue-1', cue_phrase: 'she is the real me', audio_path: 'sleep-cues/u-1/cue-1.mp3' },
      error: null,
    });
    const from = vi.fn((table: string) =>
      table === 'life_as_woman_settings' ? settingsBuilder : cueBuilder,
    );
    const sb = { from } as unknown as Parameters<typeof getTonightSleepCue>[0];

    const result = await getTonightSleepCue(sb, 'u-1');

    expect(result).toEqual({
      id: 'cue-1',
      cue_phrase: 'she is the real me',
      audio_path: 'sleep-cues/u-1/cue-1.mp3',
    });
    // never-played-first rotation ordering
    expect(cueBuilder.order).toHaveBeenCalledWith('played_at', { ascending: true, nullsFirst: true });
  });
});

describe('markSleepCuePlayed', () => {
  it('writes status=played with a played_at timestamp', async () => {
    const eqMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    const from = vi.fn(() => ({ update: updateMock }));
    const sb = { from } as unknown as Parameters<typeof markSleepCuePlayed>[0];

    await markSleepCuePlayed(sb, 'cue-1');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'played', played_at: expect.any(String) }),
    );
    expect(eqMock).toHaveBeenCalledWith('id', 'cue-1');
  });
});
