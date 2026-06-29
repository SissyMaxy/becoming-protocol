/**
 * Parity test — Stage 4 canary (compliance reward pulse through protocol-core).
 *
 * The "good boy" → gentle-wave reward that lived inline in BOTH chat transports
 * now runs in CoercionModule, driven by a `coercion:reward_signal` bus event.
 * These tests pin the protocol-core path's `handler_directives` write to the
 * EXACT legacy inline payload, and pin the trigger regex + no-op contract, so
 * the flag-ON path is provably byte-identical to the flag-OFF path.
 *
 * The bridge (`runComplianceRewardPulse`) is thin glue over createClient + emit;
 * the behavior under test is CoercionModule.onRewardSignal, exercised here via a
 * real EventBus (pure, no import.meta) + a chainable mock Supabase client.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../../lib/protocol-core/event-bus';
import { CoercionModule } from '../../lib/protocol-core/modules/coercion-module';
import type { SupabaseClient } from '@supabase/supabase-js';

// The byte-for-byte payload the legacy inline insert produced in chat-action.ts
// (both transports). The protocol-core path MUST reproduce this exactly.
const LEGACY_REWARD_ROW = {
  user_id: 'user-xyz',
  action: 'send_device_command',
  target: 'lovense',
  value: { pattern: 'gentle_wave' },
  priority: 'normal',
  reasoning: 'Reward for compliance — positive reinforcement',
};

interface Recorded {
  table: string;
  op: 'insert' | 'select' | null;
  insertPayload?: unknown;
}

/** Minimal chainable Supabase mock: records inserts, resolves reads to []. */
function makeSupabase() {
  const queries: Recorded[] = [];
  const from = vi.fn((table: string) => {
    const q: Recorded = { table, op: null };
    queries.push(q);
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.insert = vi.fn((payload: unknown) => { q.op = 'insert'; q.insertPayload = payload; return chain; });
    chain.select = vi.fn(() => { if (q.op === null) q.op = 'select'; return chain; });
    chain.not = vi.fn(pass);
    chain.eq = vi.fn(pass);
    chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    // Thenable so `await chain` (active-episode read, handler_directives insert) resolves.
    chain.then = (onF: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onF);
    return chain;
  });
  return { supabase: { from } as unknown as SupabaseClient, queries, from };
}

function insertsFor(queries: Recorded[], table: string) {
  return queries.filter(q => q.table === table && q.op === 'insert').map(q => q.insertPayload);
}

async function runRewardFlow(visibleText: string, userId = 'user-xyz') {
  const sb = makeSupabase();
  const bus = new EventBus({ db: sb.supabase, persistEvents: false });
  bus.setUserId(userId);
  const coercion = new CoercionModule();
  await coercion.initialize(bus, sb.supabase);
  // emit() awaits its handlers → the directive insert completes before resolving.
  await bus.emit({ type: 'coercion:reward_signal', visibleText });
  return sb;
}

describe('Stage 4 canary — compliance reward pulse parity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fires a byte-identical handler_directives row on "good boy"', async () => {
    const sb = await runRewardFlow('Good boy. That was perfect.');
    const rows = insertsFor(sb.queries, 'handler_directives');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(LEGACY_REWARD_ROW);
  });

  it('does NOT set conversation_id (matches the legacy inline insert)', async () => {
    const sb = await runRewardFlow('such a good boy');
    const row = insertsFor(sb.queries, 'handler_directives')[0] as Record<string, unknown>;
    expect('conversation_id' in row).toBe(false);
  });

  it('matches case-insensitively and across internal whitespace', async () => {
    for (const text of ['GOOD BOY', 'Good   Boy', 'you are a good\tboy']) {
      const sb = await runRewardFlow(text);
      expect(insertsFor(sb.queries, 'handler_directives')).toHaveLength(1);
    }
  });

  it('does nothing when the response does not praise compliance', async () => {
    const sb = await runRewardFlow('Try harder next time.');
    expect(insertsFor(sb.queries, 'handler_directives')).toHaveLength(0);
  });

  it('does nothing when no user is set on the bus (no orphan write)', async () => {
    const sb = makeSupabase();
    const bus = new EventBus({ db: sb.supabase, persistEvents: false });
    // intentionally NOT calling setUserId
    const coercion = new CoercionModule();
    await coercion.initialize(bus, sb.supabase);
    await bus.emit({ type: 'coercion:reward_signal', visibleText: 'good boy' });
    expect(insertsFor(sb.queries, 'handler_directives')).toHaveLength(0);
  });

  it('never persists an event_log row on the canary path (persistEvents: false)', async () => {
    const sb = await runRewardFlow('good boy');
    expect(insertsFor(sb.queries, 'event_log')).toHaveLength(0);
  });
});
