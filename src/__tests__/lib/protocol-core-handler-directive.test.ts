/**
 * Contract test — Stage 5b (HandlerDirectiveModule).
 *
 * The directive-execution loop was relocated verbatim out of
 * persistTurnSideEffects into HandlerDirectiveModule; the 39 characterization
 * tests in handler-persist.test.ts pin the full behavior via delegation. These
 * tests pin the MODULE's own boundary directly: that it writes the directive-log
 * row, invokes the injected api/ executors, and runs the streaming-only
 * `executeExtraDirective` callback — so the module is safe even if the persist
 * delegation is later refactored.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../../lib/protocol-core/event-bus';
import {
  HandlerDirectiveModule,
  type DirectiveExecutors,
} from '../../lib/protocol-core/modules/handler-directive-module';
import type { SupabaseClient } from '@supabase/supabase-js';

interface Recorded { table: string; op: 'insert' | 'select' | 'update' | null; insertPayload?: unknown; }

function makeSupabase() {
  const queries: Recorded[] = [];
  const from = vi.fn((table: string) => {
    const q: Recorded = { table, op: null };
    queries.push(q);
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.insert = vi.fn((p: unknown) => { q.op = 'insert'; q.insertPayload = p; return chain; });
    chain.select = vi.fn(() => { if (q.op === null) q.op = 'select'; return chain; });
    chain.update = vi.fn(() => { q.op = 'update'; return chain; });
    chain.eq = vi.fn(pass);
    chain.order = vi.fn(pass);
    chain.limit = vi.fn(pass);
    chain.single = vi.fn(() => Promise.resolve({ data: { id: 'bank-1' }, error: null }));
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.then = (onF: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(onF);
    return chain;
  });
  return { supabase: { from } as unknown as SupabaseClient, queries };
}

function makeExecutors(): DirectiveExecutors & { [K in keyof DirectiveExecutors]: ReturnType<typeof vi.fn> } {
  return {
    logDirectiveOutcome: vi.fn(() => Promise.resolve()),
    executeDeviceCommand: vi.fn(() => Promise.resolve()),
    handleForceFeminizationDirective: vi.fn(() => Promise.resolve()),
    searchContent: vi.fn(() => Promise.resolve([])),
  } as DirectiveExecutors & { [K in keyof DirectiveExecutors]: ReturnType<typeof vi.fn> };
}

async function buildModule(db: SupabaseClient) {
  const bus = new EventBus({ db, persistEvents: false });
  bus.setUserId('user-abc');
  const mod = new HandlerDirectiveModule();
  await mod.initialize(bus, db);
  return mod;
}

describe('Stage 5b — HandlerDirectiveModule contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes the directive-log row and fires logDirectiveOutcome + executeDeviceCommand', async () => {
    const sb = makeSupabase();
    const exec = makeExecutors();
    const mod = await buildModule(sb.supabase);

    await mod.runDirectiveLoop({
      directiveList: [{ action: 'send_device_command', value: { intensity: 5 }, reasoning: 'r' }],
      userId: 'user-abc',
      convId: 'conv-1',
      authHeader: 'Bearer t',
      exec,
    });

    const log = sb.queries.find(q => q.table === 'handler_directives' && q.op === 'insert');
    expect(log?.insertPayload).toMatchObject({
      user_id: 'user-abc',
      action: 'send_device_command',
      conversation_id: 'conv-1',
    });
    expect(exec.logDirectiveOutcome).toHaveBeenCalledWith('user-abc', 'send_device_command', { intensity: 5 });
    expect(exec.executeDeviceCommand).toHaveBeenCalledWith('user-abc', { intensity: 5 }, 'Bearer t');
  });

  it('always dispatches the force-feminization helper for any directive', async () => {
    const sb = makeSupabase();
    const exec = makeExecutors();
    const mod = await buildModule(sb.supabase);
    const dir = { action: 'register_witness', value: { name: 'A' } };

    await mod.runDirectiveLoop({
      directiveList: [dir], userId: 'user-abc', convId: 'conv-1', authHeader: '', exec,
    });

    expect(exec.handleForceFeminizationDirective).toHaveBeenCalledWith('user-abc', dir, 'conv-1');
  });

  it('runs the injected streaming-only executeExtraDirective callback per directive', async () => {
    const sb = makeSupabase();
    const exec = makeExecutors();
    const mod = await buildModule(sb.supabase);
    const extra = vi.fn(() => Promise.resolve());

    await mod.runDirectiveLoop({
      directiveList: [{ action: 'enqueue_punishment', value: {} }],
      userId: 'user-abc', convId: 'conv-1', authHeader: '', exec,
      executeExtraDirective: extra,
    });

    expect(extra).toHaveBeenCalledTimes(1);
    expect(extra).toHaveBeenCalledWith({ action: 'enqueue_punishment', value: {} });
  });

  it('skips directives with no action (no directive-log write)', async () => {
    const sb = makeSupabase();
    const exec = makeExecutors();
    const mod = await buildModule(sb.supabase);

    await mod.runDirectiveLoop({
      directiveList: [{ value: { x: 1 } }], userId: 'user-abc', convId: 'c', authHeader: '', exec,
    });

    expect(sb.queries.some(q => q.table === 'handler_directives')).toBe(false);
    expect(exec.handleForceFeminizationDirective).not.toHaveBeenCalled();
  });
});
