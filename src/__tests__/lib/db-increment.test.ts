import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase client module before importing the unit under test.
vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from '../../lib/supabase';
import { incrementCounter } from '../../lib/db-increment';

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

/** A chainable read builder whose terminal .maybeSingle() resolves `result`. */
function readBuilder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  b.select = vi.fn(() => b);
  b.eq = vi.fn(() => b);
  b.maybeSingle = vi.fn(() => Promise.resolve(result));
  return b;
}

/** A chainable write builder; awaiting it resolves `result`. Captures the update payload. */
function writeBuilder(result: { error: unknown }, captured: { payload?: Record<string, unknown> }) {
  const b: Record<string, unknown> = {};
  b.update = vi.fn((payload: Record<string, unknown>) => { captured.payload = payload; return b; });
  b.eq = vi.fn(() => b);
  b.then = (resolve: (r: { error: unknown }) => void) => resolve(result);
  return b;
}

describe('incrementCounter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the current value and writes current + by (does NOT overwrite to 1)', async () => {
    const captured: { payload?: Record<string, unknown> } = {};
    mockFrom
      .mockReturnValueOnce(readBuilder({ data: { times_referenced: 5 }, error: null }))
      .mockReturnValueOnce(writeBuilder({ error: null }, captured));

    const next = await incrementCounter('memory_implants', 'times_referenced', { id: 'imp-1' });

    // The regression: the old bug overwrote the counter to 1. This must be 6.
    expect(next).toBe(6);
    expect(captured.payload).toEqual({ times_referenced: 6 });
  });

  it('treats a null/missing current value as 0', async () => {
    const captured: { payload?: Record<string, unknown> } = {};
    mockFrom
      .mockReturnValueOnce(readBuilder({ data: { violations: null }, error: null }))
      .mockReturnValueOnce(writeBuilder({ error: null }, captured));

    const next = await incrementCounter('covenant', 'violations', { user_id: 'u1', active: true });
    expect(next).toBe(1);
    expect(captured.payload).toEqual({ violations: 1 });
  });

  it('honors a custom positive increment (e.g. extend denial minimum by N days)', async () => {
    const captured: { payload?: Record<string, unknown> } = {};
    mockFrom
      .mockReturnValueOnce(readBuilder({ data: { minimum_days: 10 }, error: null }))
      .mockReturnValueOnce(writeBuilder({ error: null }, captured));

    const next = await incrementCounter('denial_cycles', 'minimum_days', { id: 'c1' }, 7);
    expect(next).toBe(17);
  });

  it('refuses non-positive increments (cannot be used to game state downward)', async () => {
    const next = await incrementCounter('denial_state', 'total_denial_days', { user_id: 'u1' }, -5);
    expect(next).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns null when no row matches', async () => {
    mockFrom.mockReturnValueOnce(readBuilder({ data: null, error: null }));
    const next = await incrementCounter('goals', 'total_completions', { id: 'missing' });
    expect(next).toBeNull();
  });

  it('returns null and does not write when the read errors', async () => {
    mockFrom.mockReturnValueOnce(readBuilder({ data: null, error: { message: 'boom' } }));
    const next = await incrementCounter('goals', 'total_completions', { id: 'g1' });
    expect(next).toBeNull();
    // only the read builder was requested; no write attempted
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });
});
