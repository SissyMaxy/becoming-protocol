/**
 * Characterization tests — persistTurnSideEffects (the shared post-LLM
 * directive-persist pipeline).
 *
 * Stage 2 of the protocol-core revival: the byte-identical directive pipeline
 * that previously lived in BOTH the streaming and non-streaming branches of the
 * 14k-line chat-action.ts was lifted VERBATIM into
 * api/handler/_lib/handler-persist.ts as `persistTurnSideEffects(deps, turn)`.
 * These tests pin the CURRENT observed behavior — the exact Supabase writes,
 * columns, values and executor calls — so the upcoming module migration has a
 * regression net. They assert what the function DOES, not what it "should" do.
 *
 * Signature (probed from the source):
 *   persistTurnSideEffects(
 *     deps: { supabase, user: { id }, convId: string, authHeader: string,
 *             executeExtraDirective?: (dir) => Promise<void> },
 *     turn: { signals: Record<string,unknown> | null | undefined,
 *             userMessage: string },
 *   ): Promise<void>
 *
 * MOCK HYGIENE:
 *   - The external executors imported from ./chat-action.js
 *     (logDirectiveOutcome, executeDeviceCommand, handleForceFeminizationDirective,
 *     searchContent) are vi.mock()'d to vi.fn() spies.
 *   - A FRESH chainable supabase mock is built per-test in beforeEach. No shared
 *     mutable state survives across tests; vi.clearAllMocks() runs each time.
 *   - Each test sets its own per-table return values. Tests are isolated and
 *     order-independent.
 *
 * Import without a .js specifier — vitest's src config resolves the api/ .ts
 * file directly (mirrors src/__tests__/lib/orphan-closer-guard.test.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock the external executors that handler-persist imports ──
// Whatever handler-persist pulls from ./chat-action.js becomes a spy. This also
// short-circuits loading the real 14k-line module (which has heavy top-level
// imports) under the test runner.
vi.mock('../../../api/handler/_lib/chat-action.js', () => ({
  logDirectiveOutcome: vi.fn(() => Promise.resolve()),
  executeDeviceCommand: vi.fn(() => Promise.resolve()),
  handleForceFeminizationDirective: vi.fn(() => Promise.resolve()),
  searchContent: vi.fn(() => Promise.resolve([])),
}));

import { persistTurnSideEffects } from '../../../api/handler/_lib/handler-persist';
import {
  logDirectiveOutcome,
  executeDeviceCommand,
  handleForceFeminizationDirective,
  searchContent,
} from '../../../api/handler/_lib/chat-action.js';

// Typed spy handles (the vi.mock factory installed vi.fn()s).
const mockLogDirectiveOutcome = logDirectiveOutcome as unknown as ReturnType<typeof vi.fn>;
const mockExecuteDeviceCommand = executeDeviceCommand as unknown as ReturnType<typeof vi.fn>;
const mockForceFemme = handleForceFeminizationDirective as unknown as ReturnType<typeof vi.fn>;
const mockSearchContent = searchContent as unknown as ReturnType<typeof vi.fn>;

// ──────────────────────────────────────────────────────────────────────────
// Chainable supabase mock
//
// Records every `from(table)` call as a query object that captures the op
// (insert/select/update), the payload, and the terminal-method chain. Each
// query resolves (when awaited) to a configurable result; the default is
// { data: null, error: null }. Per-table overrides let a test feed e.g. a
// task_bank insert→select→single result or a maybeSingle lookup.
// ──────────────────────────────────────────────────────────────────────────

interface RecordedQuery {
  table: string;
  op: 'insert' | 'select' | 'update' | 'delete' | null;
  insertPayload?: unknown;
  updatePayload?: unknown;
  selectCols?: string;
  eqCalls: Array<[string, unknown]>;
}

type TableResolver = (q: RecordedQuery) => { data: unknown; error: unknown };

function makeSupabase(resolvers: Record<string, TableResolver> = {}) {
  const queries: RecordedQuery[] = [];

  function resolveFor(q: RecordedQuery) {
    const r = resolvers[q.table];
    return r ? r(q) : { data: null, error: null };
  }

  const fromSpy = vi.fn((table: string) => {
    const q: RecordedQuery = { table, op: null, eqCalls: [] };
    queries.push(q);

    // The chain object: every method returns the same object so calls compose,
    // and the object is thenable so `await chain` (and `await chain.select(..).single()`)
    // both resolve to the configured result.
    const chain: Record<string, unknown> = {};

    const passthrough = () => chain;

    chain.insert = vi.fn((payload: unknown) => {
      q.op = 'insert';
      q.insertPayload = payload;
      return chain;
    });
    chain.update = vi.fn((payload: unknown) => {
      q.op = 'update';
      q.updatePayload = payload;
      return chain;
    });
    chain.delete = vi.fn(() => {
      q.op = 'delete';
      return chain;
    });
    chain.select = vi.fn((cols?: string) => {
      if (q.op === null) q.op = 'select';
      if (cols) q.selectCols = cols;
      return chain;
    });
    chain.eq = vi.fn((col: string, val: unknown) => {
      q.eqCalls.push([col, val]);
      return chain;
    });
    chain.order = vi.fn(passthrough);
    chain.limit = vi.fn(passthrough);

    // Terminal resolvers — return the configured per-table result.
    chain.single = vi.fn(() => Promise.resolve(resolveFor(q)));
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolveFor(q)));

    // Make the chain awaitable for the no-terminal-method cases
    // (await supabase.from(t).insert(...) / .update().eq().eq()).
    chain.then = (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve(resolveFor(q)).then(onFulfilled);

    return chain;
  });

  return {
    supabase: { from: fromSpy } as unknown as import('@supabase/supabase-js').SupabaseClient,
    queries,
    fromSpy,
  };
}

// Convenience: pull the recorded insert payload for a table (first match).
function insertFor(queries: RecordedQuery[], table: string): Record<string, unknown> | undefined {
  const q = queries.find(x => x.table === table && x.op === 'insert');
  return q?.insertPayload as Record<string, unknown> | undefined;
}
function allInsertsFor(queries: RecordedQuery[], table: string): Array<Record<string, unknown>> {
  return queries
    .filter(x => x.table === table && x.op === 'insert')
    .map(x => x.insertPayload as Record<string, unknown>);
}

const USER = { id: 'user-abc' };
const CONV = 'conv-123';
const AUTH = 'Bearer test-token';

function baseDeps(supabase: import('@supabase/supabase-js').SupabaseClient, extra?: Partial<{
  executeExtraDirective: (dir: Record<string, unknown>) => Promise<void>;
  saveHandlerNote: (note: { type: string; content: string; priority: number }) => Promise<void>;
}>) {
  return {
    supabase,
    user: USER,
    convId: CONV,
    authHeader: AUTH,
    ...(extra || {}),
  };
}

const turn = (signals: Record<string, unknown> | null | undefined, userMessage = 'do it') => ({
  signals,
  userMessage,
});

// ──────────────────────────────────────────────────────────────────────────

let sb: ReturnType<typeof makeSupabase>;

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default resolved behavior on the executor spies (clearAllMocks
  // wipes the implementation set in the factory).
  mockLogDirectiveOutcome.mockImplementation(() => Promise.resolve());
  mockExecuteDeviceCommand.mockImplementation(() => Promise.resolve());
  mockForceFemme.mockImplementation(() => Promise.resolve());
  mockSearchContent.mockImplementation(() => Promise.resolve([]));
  vi.useRealTimers();
  sb = makeSupabase();
});

afterEach(() => {
  vi.useRealTimers();
});

// ──────────────────────────────────────────────────────────────────────────
// 1. Empty / null signals → no-op
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — empty/null signals (no-op contract)', () => {
  it('null signals → no inserts, no executor calls, no throw', async () => {
    await expect(
      persistTurnSideEffects(baseDeps(sb.supabase), turn(null)),
    ).resolves.toBeUndefined();
    expect(sb.fromSpy).not.toHaveBeenCalled();
    expect(mockLogDirectiveOutcome).not.toHaveBeenCalled();
    expect(mockExecuteDeviceCommand).not.toHaveBeenCalled();
    expect(mockForceFemme).not.toHaveBeenCalled();
  });

  it('undefined signals → no-op', async () => {
    await persistTurnSideEffects(baseDeps(sb.supabase), turn(undefined));
    expect(sb.fromSpy).not.toHaveBeenCalled();
  });

  it('empty object signals → no-op (no handler_note, no directive)', async () => {
    await persistTurnSideEffects(baseDeps(sb.supabase), turn({}));
    expect(sb.fromSpy).not.toHaveBeenCalled();
    expect(mockForceFemme).not.toHaveBeenCalled();
  });

  it('a directive object with no `action` field is skipped entirely', async () => {
    await persistTurnSideEffects(baseDeps(sb.supabase), turn({ directive: { foo: 'bar' } }));
    // The `if (dir.action)` guard means nothing fires.
    expect(sb.fromSpy).not.toHaveBeenCalled();
    expect(mockForceFemme).not.toHaveBeenCalled();
    expect(mockLogDirectiveOutcome).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. handler_note save
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — handler_note', () => {
  it('saves a handler_note when both type and content are present', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ handler_note: { type: 'observation', content: 'She hesitated.', priority: 4 } }),
    );
    const note = insertFor(sb.queries, 'handler_notes');
    expect(note).toEqual({
      user_id: 'user-abc',
      note_type: 'observation',
      content: 'She hesitated.',
      priority: 4,
      conversation_id: 'conv-123',
    });
  });

  it('defaults priority to 0 when omitted', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ handler_note: { type: 'observation', content: 'Noted.' } }),
    );
    expect(insertFor(sb.queries, 'handler_notes')?.priority).toBe(0);
  });

  it('does NOT save a note when content is missing (type-only)', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ handler_note: { type: 'observation' } }),
    );
    expect(insertFor(sb.queries, 'handler_notes')).toBeUndefined();
  });

  it('does NOT save a note when type is missing (content-only)', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ handler_note: { content: 'orphaned' } }),
    );
    expect(insertFor(sb.queries, 'handler_notes')).toBeUndefined();
  });

  // Stage 5: when an injected saveHandlerNote writer is supplied (PROTOCOL_CORE_FLOWS
  // turn_notes), the note routes through it INSTEAD of the inline insert.
  it('delegates to saveHandlerNote when injected — no inline handler_notes insert', async () => {
    const saveHandlerNote = vi.fn(() => Promise.resolve());
    await persistTurnSideEffects(
      baseDeps(sb.supabase, { saveHandlerNote }),
      turn({ handler_note: { type: 'observation', content: 'She hesitated.', priority: 4 } }),
    );
    expect(saveHandlerNote).toHaveBeenCalledTimes(1);
    expect(saveHandlerNote).toHaveBeenCalledWith({ type: 'observation', content: 'She hesitated.', priority: 4 });
    // The inline insert path must NOT run.
    expect(insertFor(sb.queries, 'handler_notes')).toBeUndefined();
  });

  it('applies the priority-0 default before delegating to saveHandlerNote', async () => {
    const saveHandlerNote = vi.fn(() => Promise.resolve());
    await persistTurnSideEffects(
      baseDeps(sb.supabase, { saveHandlerNote }),
      turn({ handler_note: { type: 'observation', content: 'Noted.' } }),
    );
    expect(saveHandlerNote).toHaveBeenCalledWith({ type: 'observation', content: 'Noted.', priority: 0 });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. The directive-log insert (every actioned directive)
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — handler_directives log + outcome learning', () => {
  it('writes the directive log row with defaults and fires logDirectiveOutcome', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'observe', reasoning: 'watch her' } }),
    );
    const logRow = allInsertsFor(sb.queries, 'handler_directives')[0];
    expect(logRow).toEqual({
      user_id: 'user-abc',
      action: 'observe',
      target: null,
      value: null,
      priority: 'normal',
      silent: false,
      conversation_id: 'conv-123',
      reasoning: 'watch her',
    });
    expect(mockLogDirectiveOutcome).toHaveBeenCalledTimes(1);
    expect(mockLogDirectiveOutcome).toHaveBeenCalledWith('user-abc', 'observe', undefined);
  });

  it('preserves target / value / priority / silent when supplied', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({
        directive: {
          action: 'observe',
          target: 'mood',
          value: { k: 1 },
          priority: 'high',
          silent: true,
        },
      }),
    );
    const logRow = allInsertsFor(sb.queries, 'handler_directives')[0];
    expect(logRow).toMatchObject({
      action: 'observe',
      target: 'mood',
      value: { k: 1 },
      priority: 'high',
      silent: true,
    });
    expect(mockLogDirectiveOutcome).toHaveBeenCalledWith('user-abc', 'observe', { k: 1 });
  });

  it('handles a `directives` ARRAY — one log row + one outcome per actioned directive', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({
        directives: [
          { action: 'observe' },
          { action: 'express_desire', value: { desire: 'more' } },
          { foo: 'no-action' }, // skipped
        ],
      }),
    );
    // 2 directive-log rows (the no-action one is skipped) ...
    expect(allInsertsFor(sb.queries, 'handler_directives').length).toBe(2);
    // ... and 2 outcome calls.
    expect(mockLogDirectiveOutcome).toHaveBeenCalledTimes(2);
    // express_desire also wrote a handler_desires row.
    expect(insertFor(sb.queries, 'handler_desires')).toMatchObject({ desire: 'more' });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. request_voice_sample
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — request_voice_sample', () => {
  it('inserts a request_voice_sample directive with default pitch/duration', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'request_voice_sample' } }),
    );
    // Two handler_directives inserts: [0] = the log row, [1] = the client-modal directive.
    const inserts = allInsertsFor(sb.queries, 'handler_directives');
    expect(inserts.length).toBe(2);
    const modal = inserts[1];
    expect(modal).toMatchObject({
      user_id: 'user-abc',
      action: 'request_voice_sample',
      target: 'client_modal',
      priority: 'immediate',
      conversation_id: 'conv-123',
      reasoning: 'Handler-initiated voice practice',
    });
    expect(modal.value).toEqual({
      phrase: undefined,
      target_pitch: 160,
      min_duration: 10,
    });
  });

  it('passes through explicit phrase / target_pitch / min_duration', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({
        directive: {
          action: 'request_voice_sample',
          value: { phrase: 'good morning Mama', target_pitch: 200, min_duration: 25 },
          reasoning: 'custom',
        },
      }),
    );
    const modal = allInsertsFor(sb.queries, 'handler_directives')[1];
    expect(modal.value).toEqual({
      phrase: 'good morning Mama',
      target_pitch: 200,
      min_duration: 25,
    });
    expect(modal.reasoning).toBe('custom');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. send_device_command / start_edge_timer → executeDeviceCommand
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — device commands', () => {
  it('send_device_command calls executeDeviceCommand with the directive value + auth header', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'send_device_command', value: { intensity: 8, duration: 10 } } }),
    );
    expect(mockExecuteDeviceCommand).toHaveBeenCalledTimes(1);
    expect(mockExecuteDeviceCommand).toHaveBeenCalledWith(
      'user-abc',
      { intensity: 8, duration: 10 },
      AUTH,
    );
  });

  it('send_device_command falls back to target then the default pulse string', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'send_device_command', target: 'pulse:high:5' } }),
    );
    expect(mockExecuteDeviceCommand).toHaveBeenCalledWith('user-abc', 'pulse:high:5', AUTH);

    // and the default when neither value nor target is present:
    const sb2 = makeSupabase();
    await persistTurnSideEffects(
      baseDeps(sb2.supabase),
      turn({ directive: { action: 'send_device_command' } }),
    );
    expect(mockExecuteDeviceCommand).toHaveBeenLastCalledWith('user-abc', 'pulse:medium:3', AUTH);
  });

  it('start_edge_timer inserts sustained + burst directive rows and fires the sustained vibration', async () => {
    vi.useFakeTimers();
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'start_edge_timer', value: { duration_minutes: 2, intensity: 12 } } }),
    );

    // handler_directives inserts: [0] log row, [1] sustained vibration, [2] punishment burst.
    const inserts = allInsertsFor(sb.queries, 'handler_directives');
    expect(inserts.length).toBe(3);
    expect(inserts[1]).toMatchObject({
      action: 'send_device_command',
      target: 'lovense',
      value: { intensity: 12, duration: 120 }, // 2min * 60
      priority: 'immediate',
    });
    expect(inserts[2]).toMatchObject({
      action: 'send_device_command',
      target: 'lovense',
      value: { intensity: 18, duration: 3 },
    });

    // The sustained vibration fires immediately.
    expect(mockExecuteDeviceCommand).toHaveBeenCalledWith('user-abc', { intensity: 12, duration: 120 }, AUTH);
    expect(mockExecuteDeviceCommand).toHaveBeenCalledTimes(1);

    // The punishment burst is scheduled via setTimeout(durationSeconds * 1000).
    await vi.advanceTimersByTimeAsync(120 * 1000);
    expect(mockExecuteDeviceCommand).toHaveBeenCalledTimes(2);
    expect(mockExecuteDeviceCommand).toHaveBeenLastCalledWith('user-abc', { intensity: 18, duration: 3 }, AUTH);
    vi.useRealTimers();
  });

  it('start_edge_timer uses 5min @ intensity 10 defaults when value omitted', async () => {
    vi.useFakeTimers();
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'start_edge_timer' } }),
    );
    const inserts = allInsertsFor(sb.queries, 'handler_directives');
    expect(inserts[1]).toMatchObject({ value: { intensity: 10, duration: 300 } }); // 5min default
    expect(mockExecuteDeviceCommand).toHaveBeenCalledWith('user-abc', { intensity: 10, duration: 300 }, AUTH);
    vi.useRealTimers();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 6. force-feminization dispatch (runs for EVERY actioned directive)
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — force-feminization dispatch', () => {
  it('calls handleForceFeminizationDirective with (userId, dir, convId) for an actioned directive', async () => {
    const dir = { action: 'register_witness', value: { name: 'Gina' } };
    await persistTurnSideEffects(baseDeps(sb.supabase), turn({ directive: dir }));
    expect(mockForceFemme).toHaveBeenCalledTimes(1);
    expect(mockForceFemme).toHaveBeenCalledWith('user-abc', dir, 'conv-123');
  });

  it('a rejected force-femme promise is swallowed (.catch) — pipeline does not throw', async () => {
    mockForceFemme.mockImplementationOnce(() => Promise.reject(new Error('boom')));
    await expect(
      persistTurnSideEffects(baseDeps(sb.supabase), turn({ directive: { action: 'observe' } })),
    ).resolves.toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 7. prescribe_task → task_bank + daily_tasks
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — prescribe_task', () => {
  it('inserts a task_bank row then a daily_tasks row referencing the bank id', async () => {
    const sbT = makeSupabase({
      task_bank: () => ({ data: { id: 'bank-1' }, error: null }),
    });
    await persistTurnSideEffects(
      baseDeps(sbT.supabase),
      turn({
        directive: {
          action: 'prescribe_task',
          value: { title: 'Practice your voice', domain: 'voice', intensity: 4, points: 25 },
        },
      }),
    );

    const bank = insertFor(sbT.queries, 'task_bank');
    expect(bank).toMatchObject({
      category: 'handler_prescribed',
      domain: 'voice',
      intensity: 4,
      instruction: 'Practice your voice',
      points: 25,
      created_by: 'handler_directive',
    });

    const daily = insertFor(sbT.queries, 'daily_tasks');
    expect(daily).toMatchObject({
      user_id: 'user-abc',
      task_id: 'bank-1',
      status: 'pending',
      selection_reason: 'handler_directive',
    });
    expect(daily?.assigned_date).toBe(new Date().toISOString().slice(0, 10));
  });

  it('defaults title/domain/points when value is sparse', async () => {
    const sbT = makeSupabase({
      task_bank: () => ({ data: { id: 'bank-x' }, error: null }),
    });
    await persistTurnSideEffects(
      baseDeps(sbT.supabase),
      turn({ directive: { action: 'prescribe_task', value: {} } }),
    );
    expect(insertFor(sbT.queries, 'task_bank')).toMatchObject({
      domain: 'feminization',
      instruction: 'Handler-assigned task',
      intensity: 3,
      points: 10,
      affirmation: 'Good girl.',
      completion_type: 'binary',
    });
  });

  it('skips the daily_tasks insert when the task_bank insert errors', async () => {
    const sbT = makeSupabase({
      task_bank: () => ({ data: null, error: { message: 'bank failed' } }),
    });
    await persistTurnSideEffects(
      baseDeps(sbT.supabase),
      turn({ directive: { action: 'prescribe_task', value: { title: 'x' } } }),
    );
    expect(insertFor(sbT.queries, 'task_bank')).toBeDefined();
    expect(insertFor(sbT.queries, 'daily_tasks')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 8. write_memory → handler_memory
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — write_memory', () => {
  it('inserts a handler_memory row with importance-driven decay_rate', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({
        directive: {
          action: 'write_memory',
          value: { content: 'She loves being watched.', memory_type: 'preference', importance: 6 },
        },
      }),
    );
    const mem = insertFor(sb.queries, 'handler_memory');
    expect(mem).toMatchObject({
      user_id: 'user-abc',
      memory_type: 'preference',
      content: 'She loves being watched.',
      importance: 6,
      source_type: 'conversation',
      source_id: 'conv-123',
      decay_rate: 0, // importance >= 5 → no decay
    });
  });

  it('uses decay_rate 0.05 and default type/importance for a low-importance memory', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'write_memory', value: { content: 'small note' } } }),
    );
    const mem = insertFor(sb.queries, 'handler_memory');
    expect(mem).toMatchObject({
      memory_type: 'observation',
      importance: 3,
      decay_rate: 0.05,
    });
  });

  it('does NOT insert when content is empty', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'write_memory', value: {} } }),
    );
    expect(insertFor(sb.queries, 'handler_memory')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 9. create_contract → identity_contracts + handler_outreach_queue
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — create_contract', () => {
  it('inserts a contract + a high-urgency outreach, escalating conditions to match the last contract', async () => {
    const sbC = makeSupabase({
      // The "last active contract" lookup returns 3 prior conditions.
      identity_contracts: q =>
        q.op === 'select'
          ? { data: { conditions: ['a', 'b', 'c'] }, error: null }
          : { data: null, error: null },
    });
    await persistTurnSideEffects(
      baseDeps(sbC.supabase),
      turn({
        directive: {
          action: 'create_contract',
          value: { title: 'No touching', text: 'I will not touch.', conditions: ['x'] },
        },
      }),
    );

    const contract = insertFor(sbC.queries, 'identity_contracts');
    expect(contract).toMatchObject({
      user_id: 'user-abc',
      contract_title: 'No touching',
      contract_text: 'I will not touch.',
      status: 'active',
      commitment_duration_days: 7,
    });
    // 1 supplied condition < 3 prior → padded up to 3 conditions.
    expect((contract?.conditions as unknown[]).length).toBe(3);
    expect((contract?.conditions as unknown[])[0]).toBe('x');

    const outreach = insertFor(sbC.queries, 'handler_outreach_queue');
    expect(outreach).toMatchObject({
      user_id: 'user-abc',
      urgency: 'high',
      trigger_reason: 'new_contract',
      source: 'contract_system',
    });
    expect(outreach?.message).toContain('No touching');
  });

  it('does NOT insert a contract when text is empty', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'create_contract', value: { title: 'x' } } }),
    );
    expect(insertFor(sb.queries, 'identity_contracts')).toBeUndefined();
    expect(insertFor(sb.queries, 'handler_outreach_queue')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 10. create_behavioral_trigger → behavioral_triggers
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — create_behavioral_trigger', () => {
  it('installs a behavioral trigger with defaults when only the phrase is given', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'create_behavioral_trigger', value: { trigger_phrase: 'good girl' } } }),
    );
    const trig = insertFor(sb.queries, 'behavioral_triggers');
    expect(trig).toEqual({
      user_id: 'user-abc',
      trigger_phrase: 'good girl',
      trigger_type: 'keyword',
      response_type: 'device_reward',
      response_value: { pattern: 'gentle_wave' },
      created_by: 'handler',
    });
  });

  it('does NOT insert when the trigger phrase is missing', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'create_behavioral_trigger', value: { trigger_type: 'keyword' } } }),
    );
    expect(insertFor(sb.queries, 'behavioral_triggers')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 11. modify_parameter → hidden_operations (update existing vs insert new)
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — modify_parameter', () => {
  it('updates an existing hidden_operations row when one is found', async () => {
    const sbM = makeSupabase({
      hidden_operations: q =>
        q.op === 'select'
          ? { data: { id: 'op-1', current_value: 3 }, error: null }
          : { data: null, error: null },
    });
    await persistTurnSideEffects(
      baseDeps(sbM.supabase),
      turn({ directive: { action: 'modify_parameter', value: { parameter: 'denial_intensity', new_value: 9 } } }),
    );
    const upd = sbM.queries.find(x => x.table === 'hidden_operations' && x.op === 'update');
    expect(upd?.updatePayload).toEqual({ current_value: 9 });
    expect(upd?.eqCalls).toContainEqual(['id', 'op-1']);
    // No insert path taken.
    expect(insertFor(sbM.queries, 'hidden_operations')).toBeUndefined();
  });

  it('inserts a new hidden_operations row when none exists', async () => {
    const sbM = makeSupabase({
      hidden_operations: () => ({ data: null, error: null }),
    });
    await persistTurnSideEffects(
      baseDeps(sbM.supabase),
      turn({ directive: { action: 'modify_parameter', value: { parameter: 'opacity', new_value: 7 } } }),
    );
    expect(insertFor(sbM.queries, 'hidden_operations')).toEqual({
      user_id: 'user-abc',
      parameter: 'opacity',
      current_value: 7,
      base_value: 7,
      increment_rate: 0,
      increment_interval: 'weekly',
    });
  });

  it('is a no-op when parameter or new_value is missing', async () => {
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'modify_parameter', value: { parameter: 'opacity' } } }),
    );
    // Only the directive-log insert; no hidden_operations touch at all.
    expect(sb.queries.some(x => x.table === 'hidden_operations')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 12. executeExtraDirective callback contract (the streaming-only branch hook)
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — executeExtraDirective contract', () => {
  it('is invoked once per actioned directive when provided', async () => {
    const extra = vi.fn(() => Promise.resolve());
    await persistTurnSideEffects(
      baseDeps(sb.supabase, { executeExtraDirective: extra }),
      turn({
        directives: [
          { action: 'observe' },
          { action: 'enqueue_punishment', value: { reason: 'x' } },
          { noaction: true }, // skipped — no action
        ],
      }),
    );
    expect(extra).toHaveBeenCalledTimes(2);
    expect(extra).toHaveBeenNthCalledWith(1, { action: 'observe' });
    expect(extra).toHaveBeenNthCalledWith(2, { action: 'enqueue_punishment', value: { reason: 'x' } });
  });

  it('is NOT invoked when absent (non-streaming caller passes nothing)', async () => {
    // No executeExtraDirective on deps → streaming-only branches simply do not run.
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'enqueue_punishment', value: { reason: 'x' } } }),
    );
    // The directive is still LOGGED (handler_directives) and outcome-tracked,
    // but no extra executor runs and no streaming-only side effect occurs.
    expect(allInsertsFor(sb.queries, 'handler_directives').length).toBe(1);
    expect(mockLogDirectiveOutcome).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 13. search_content → searchContent executor + handler_notes result store
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — search_content', () => {
  it('calls searchContent and stores results as a handler_notes row when results exist', async () => {
    mockSearchContent.mockResolvedValueOnce([
      { title: 'Clip A', url: 'http://a', description: 'desc a' },
    ]);
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'search_content', value: { query: 'sissy hypno', count: 3 } } }),
    );
    expect(mockSearchContent).toHaveBeenCalledWith('sissy hypno', 3);
    const note = insertFor(sb.queries, 'handler_notes');
    expect(note).toMatchObject({
      user_id: 'user-abc',
      note_type: 'search_results',
      priority: 5,
      conversation_id: 'conv-123',
    });
    expect(note?.content).toContain('Clip A');
  });

  it('does NOT store a note when searchContent returns no results', async () => {
    mockSearchContent.mockResolvedValueOnce([]);
    await persistTurnSideEffects(
      baseDeps(sb.supabase),
      turn({ directive: { action: 'search_content', value: { query: 'x' } } }),
    );
    expect(insertFor(sb.queries, 'handler_notes')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 14. Resilience — a thrown error inside the directive loop is swallowed
// ──────────────────────────────────────────────────────────────────────────

describe('persistTurnSideEffects — resilience', () => {
  it('does not throw even if the supabase insert itself throws synchronously', async () => {
    const throwing = {
      from: vi.fn(() => {
        throw new Error('db down');
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient;
    await expect(
      persistTurnSideEffects(baseDeps(throwing), turn({ directive: { action: 'observe' } })),
    ).resolves.toBeUndefined();
  });
});
