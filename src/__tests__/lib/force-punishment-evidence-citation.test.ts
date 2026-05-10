/**
 * Regression test: enqueuePunishment must quote the triggering slip's
 * source_text into the punishment description so the user/Handler sees
 * literal evidence, not a templated rule application.
 *
 * Rule under test (feedback_handler_must_cite_evidence): punishments
 * without quoting the trigger read as fabricated. When triggered_by_slip_ids
 * is non-empty AND the matching slip_log rows have non-empty source_text,
 * the description MUST start with `Because you wrote "<quote>"`.
 *
 * When no slip ids or no source_text, the description falls back to the
 * raw template — never blocks the enqueue.
 *
 * Mocks the supabase client at the import boundary so this stays a pure
 * unit test (no integration creds required).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();
const fromMock = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

beforeEach(() => {
  insertMock.mockReset();
  fromMock.mockReset();
});

function makeSupabaseStubs(opts: {
  slipQuotes?: Array<{ source_text: string }>;
  insertReturnId?: string | null;
}) {
  const slipQuotes = opts.slipQuotes ?? [];
  const newId = opts.insertReturnId ?? 'punish-1';
  fromMock.mockImplementation((table: string) => {
    if (table === 'slip_log') {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn().mockReturnValue(builder);
      builder.in = vi.fn().mockReturnValue(builder);
      builder.limit = vi.fn().mockResolvedValue({ data: slipQuotes, error: null });
      return builder;
    }
    if (table === 'punishment_queue') {
      const builder: Record<string, unknown> = {};
      builder.insert = vi.fn((row: Record<string, unknown>) => {
        insertMock(row);
        const after: Record<string, unknown> = {};
        after.select = vi.fn().mockReturnValue(after);
        after.single = vi.fn().mockResolvedValue({ data: { id: newId }, error: null });
        return after;
      });
      return builder;
    }
    // Other tables (chastity_sessions for applyDenialExtension) — return a
    // builder that resolves to empty so the enqueue path doesn't crash.
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn().mockReturnValue(builder);
    builder.update = vi.fn().mockReturnValue(builder);
    builder.insert = vi.fn().mockReturnValue(builder);
    builder.eq = vi.fn().mockReturnValue(builder);
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    return builder;
  });
}

describe('enqueuePunishment — evidence citation', () => {
  it('quotes the triggering slip source_text into the description', async () => {
    makeSupabaseStubs({
      slipQuotes: [{ source_text: "I'm a man" }],
    });
    const { enqueuePunishment } = await import('../../lib/force/punishment-queue');
    await enqueuePunishment('user-1', 'mantra_200', {
      triggered_by_slip_ids: ['slip-a'],
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const inserted = insertMock.mock.calls[0][0] as { description: string };
    expect(inserted.description).toMatch(/^Because you wrote "I'm a man"\./);
  });

  it('combines up to two quotes with "and"', async () => {
    makeSupabaseStubs({
      slipQuotes: [
        { source_text: 'David' },
        { source_text: 'I refuse' },
      ],
    });
    const { enqueuePunishment } = await import('../../lib/force/punishment-queue');
    await enqueuePunishment('user-1', 'public_slip_post', {
      triggered_by_slip_ids: ['slip-a', 'slip-b'],
    });
    const inserted = insertMock.mock.calls[0][0] as { description: string };
    expect(inserted.description).toMatch(/"David" and "I refuse"/);
  });

  it('clips quotes longer than 120 chars', async () => {
    const long = 'I am a man and I refuse this protocol and I cannot stand it anymore — this is a very long resistance statement that exceeds the cap';
    makeSupabaseStubs({ slipQuotes: [{ source_text: long }] });
    const { enqueuePunishment } = await import('../../lib/force/punishment-queue');
    await enqueuePunishment('user-1', 'mantra_50', {
      triggered_by_slip_ids: ['slip-a'],
    });
    const inserted = insertMock.mock.calls[0][0] as { description: string };
    expect(inserted.description).toMatch(/…"/);
  });

  it('falls back to template description when no slip ids', async () => {
    makeSupabaseStubs({});
    const { enqueuePunishment, TEMPLATES } = await import('../../lib/force/punishment-queue');
    await enqueuePunishment('user-1', 'mantra_50', {});
    const inserted = insertMock.mock.calls[0][0] as { description: string };
    expect(inserted.description).toBe(TEMPLATES.mantra_50.description);
  });

  it('falls back to template description when slip_log rows have empty source_text', async () => {
    makeSupabaseStubs({ slipQuotes: [{ source_text: '' }, { source_text: '   ' }] });
    const { enqueuePunishment, TEMPLATES } = await import('../../lib/force/punishment-queue');
    await enqueuePunishment('user-1', 'mantra_50', {
      triggered_by_slip_ids: ['slip-x'],
    });
    const inserted = insertMock.mock.calls[0][0] as { description: string };
    expect(inserted.description).toBe(TEMPLATES.mantra_50.description);
  });
});
