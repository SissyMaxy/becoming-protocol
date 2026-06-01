/**
 * Parity test — Stage 5 (handler_note save through protocol-core).
 *
 * The per-turn `handler_note` save that sat inline at the head of
 * persistTurnSideEffects now runs in HandlerNotesModule, driven by a
 * `handler:note_captured` bus event. These tests pin the module's
 * `handler_notes` write to the EXACT legacy inline payload (including
 * conversation_id) and the no-user no-op contract.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../../lib/protocol-core/event-bus';
import { HandlerNotesModule } from '../../lib/protocol-core/modules/handler-notes-module';
import type { SupabaseClient } from '@supabase/supabase-js';

const USER = 'user-xyz';
const CONV = 'conv-123';

interface Recorded { table: string; op: 'insert' | null; insertPayload?: unknown; }

function makeSupabase() {
  const queries: Recorded[] = [];
  const from = vi.fn((table: string) => {
    const q: Recorded = { table, op: null };
    queries.push(q);
    const chain: Record<string, unknown> = {};
    chain.insert = vi.fn((payload: unknown) => { q.op = 'insert'; q.insertPayload = payload; return chain; });
    chain.then = (onF: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(onF);
    return chain;
  });
  return { supabase: { from } as unknown as SupabaseClient, queries };
}

function insertsFor(queries: Recorded[], table: string) {
  return queries.filter(q => q.table === table && q.op === 'insert').map(q => q.insertPayload);
}

async function runNoteSave(
  note: { noteType: string; content: string; priority: number; conversationId: string },
  userId: string | null = USER,
) {
  const sb = makeSupabase();
  const bus = new EventBus({ db: sb.supabase, persistEvents: false });
  if (userId) bus.setUserId(userId);
  const mod = new HandlerNotesModule();
  await mod.initialize(bus, sb.supabase);
  await bus.emit({ type: 'handler:note_captured', ...note });
  return sb;
}

describe('Stage 5 — handler_note save parity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes a byte-identical handler_notes row (with conversation_id)', async () => {
    const sb = await runNoteSave({ noteType: 'observation', content: 'she hesitated', priority: 3, conversationId: CONV });
    const rows = insertsFor(sb.queries, 'handler_notes');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      user_id: USER,
      note_type: 'observation',
      content: 'she hesitated',
      priority: 3,
      conversation_id: CONV,
    });
  });

  it('preserves priority 0 (does not drop a falsy priority)', async () => {
    const sb = await runNoteSave({ noteType: 'observation', content: 'x', priority: 0, conversationId: CONV });
    const row = insertsFor(sb.queries, 'handler_notes')[0] as Record<string, unknown>;
    expect(row.priority).toBe(0);
  });

  it('no user on the bus → no orphan write', async () => {
    const sb = await runNoteSave({ noteType: 'observation', content: 'x', priority: 1, conversationId: CONV }, null);
    expect(insertsFor(sb.queries, 'handler_notes')).toHaveLength(0);
  });
});
