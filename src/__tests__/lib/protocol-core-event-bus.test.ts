import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../lib/protocol-core/event-bus';
import type { SupabaseClient } from '@supabase/supabase-js';

// Stage 3 of the protocol-core revival decoupled the EventBus from the imported
// `../supabase` singleton (import.meta.env, Vite-only) so it can run server-side
// with an INJECTED client. These tests pin that decoupled behavior.

function mockDb() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ insert }));
  return { client: { from } as unknown as SupabaseClient, from, insert };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('EventBus (decoupled — injected client)', () => {
  it('routes an event to a matching exact subscriber', async () => {
    const bus = new EventBus({ persistEvents: false });
    const handler = vi.fn();
    bus.on('task:completed', handler);
    await bus.emit({ type: 'task:completed', taskId: 't1', domain: 'body', points: 10 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('matches category (task:*) and global (*) wildcards', async () => {
    const bus = new EventBus({ persistEvents: false });
    const cat = vi.fn();
    const all = vi.fn();
    bus.onCategory('task', cat);
    bus.onAll(all);
    await bus.emit({ type: 'task:declined', taskId: 't2', domain: 'voice' });
    expect(cat).toHaveBeenCalledTimes(1);
    expect(all).toHaveBeenCalledTimes(1);
  });

  it('persists through the INJECTED client, not a global import', async () => {
    const { client, from, insert } = mockDb();
    const bus = new EventBus({ persistEvents: true, db: client });
    bus.setUserId('u1');
    bus.on('task:completed', () => {});
    await bus.emit({ type: 'task:completed', taskId: 't3', domain: 'body', points: 5 });
    await flush(); // persistEvent is fire-and-forget
    expect(from).toHaveBeenCalledWith('event_log');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('is a safe no-op for persistence when no client is injected', async () => {
    const bus = new EventBus({ persistEvents: true }); // no db
    bus.setUserId('u1');
    bus.on('task:completed', () => {});
    await expect(
      bus.emit({ type: 'task:completed', taskId: 't4', domain: 'body', points: 1 }),
    ).resolves.toBeUndefined();
  });

  it('isolates handler errors (one throwing handler does not block others)', async () => {
    const bus = new EventBus({ persistEvents: false });
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    bus.on('task:completed', bad);
    bus.on('task:completed', good);
    await bus.emit({ type: 'task:completed', taskId: 't5', domain: 'body', points: 1 });
    expect(good).toHaveBeenCalledTimes(1);
  });
});
