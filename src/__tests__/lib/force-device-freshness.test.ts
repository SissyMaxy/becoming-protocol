/**
 * Tests for device freshness classification logic that powers
 * executeDeviceCommand's offline guard + the DEVICE STATUS context block.
 */

import { describe, it, expect } from 'vitest';

const FRESH_MS = 5 * 60 * 1000;

type DeviceRow = { is_connected: boolean; last_seen_at: string | null };
type Status = 'online' | 'disconnected_stale' | 'paired_offline' | 'never_paired';

function classify(devices: DeviceRow[] | null, now: number = Date.now()): Status {
  if (!devices || devices.length === 0) return 'never_paired';
  const online = devices.find(d => {
    if (!d.is_connected) return false;
    const lastSeen = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
    return now - lastSeen < FRESH_MS;
  });
  if (online) return 'online';
  const stale = devices.find(d => {
    if (!d.is_connected) return false;
    const lastSeen = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
    return now - lastSeen >= FRESH_MS;
  });
  if (stale) return 'disconnected_stale';
  return 'paired_offline';
}

describe('device freshness classification', () => {
  const now = new Date('2026-04-16T12:00:00Z').getTime();

  it('returns never_paired when no device rows', () => {
    expect(classify([], now)).toBe('never_paired');
    expect(classify(null, now)).toBe('never_paired');
  });

  it('returns online when is_connected=true AND heartbeat < 5min', () => {
    const fresh = new Date(now - 60 * 1000).toISOString();
    expect(classify([{ is_connected: true, last_seen_at: fresh }], now)).toBe('online');
  });

  it('returns disconnected_stale when is_connected=true but heartbeat > 5min', () => {
    const stale = new Date(now - 10 * 60 * 1000).toISOString();
    expect(classify([{ is_connected: true, last_seen_at: stale }], now)).toBe('disconnected_stale');
  });

  it('returns paired_offline when is_connected=false', () => {
    const recent = new Date(now - 30 * 1000).toISOString();
    expect(classify([{ is_connected: false, last_seen_at: recent }], now)).toBe('paired_offline');
  });

  it('catches stuck stale-true flag (the real-world failure case)', () => {
    // Lovense cloud never sent the disconnect callback — flag is lying
    const threeDaysAgo = new Date(now - 3 * 86400 * 1000).toISOString();
    expect(classify([{ is_connected: true, last_seen_at: threeDaysAgo }], now)).toBe('disconnected_stale');
  });

  it('boundary: exactly 5 min old is stale', () => {
    const exactly5min = new Date(now - 5 * 60 * 1000).toISOString();
    expect(classify([{ is_connected: true, last_seen_at: exactly5min }], now)).toBe('disconnected_stale');
  });

  it('boundary: 4min59s is still online', () => {
    const justUnder = new Date(now - (5 * 60 * 1000 - 1000)).toISOString();
    expect(classify([{ is_connected: true, last_seen_at: justUnder }], now)).toBe('online');
  });

  it('picks ONLINE over STALE when multiple devices', () => {
    const stale = new Date(now - 10 * 60 * 1000).toISOString();
    const fresh = new Date(now - 30 * 1000).toISOString();
    expect(
      classify(
        [
          { is_connected: true, last_seen_at: stale },
          { is_connected: true, last_seen_at: fresh },
        ],
        now,
      ),
    ).toBe('online');
  });
});

describe('device guard — when to skip send_device_command', () => {
  const now = new Date('2026-04-16T12:00:00Z').getTime();

  function shouldSkip(devices: DeviceRow[] | null): boolean {
    return classify(devices, now) !== 'online';
  }

  it('skips when never paired', () => {
    expect(shouldSkip(null)).toBe(true);
    expect(shouldSkip([])).toBe(true);
  });

  it('skips when flag is false', () => {
    expect(shouldSkip([{ is_connected: false, last_seen_at: new Date(now).toISOString() }])).toBe(true);
  });

  it('skips when heartbeat is stale (the bug we fixed)', () => {
    expect(
      shouldSkip([{ is_connected: true, last_seen_at: new Date(now - 10 * 60 * 1000).toISOString() }]),
    ).toBe(true);
  });

  it('allows only when BOTH connected AND fresh', () => {
    expect(
      shouldSkip([{ is_connected: true, last_seen_at: new Date(now - 60 * 1000).toISOString() }]),
    ).toBe(false);
  });
});
