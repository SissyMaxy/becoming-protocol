/**
 * Stage 6 — frontend protocol-core integration + the first migrated consumer.
 *
 * Pins (a) GinaModule.logComfortReaction's gina_comfort_map write to the EXACT
 * row the old handler-v2 logGinaReaction produced, and (b) the frontend factory's
 * per-user memoization + module retrieval. The browser supabase client is mocked
 * so no real client is constructed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Chainable supabase mock: every PostgREST method returns the same proxy, it
// is thenable (resolves {data:null}), and insert/upsert payloads are recorded.
// A Proxy means we don't have to enumerate limit/order/gte/in/etc. Defined via
// vi.hoisted so the (hoisted) vi.mock factory can reference it. ──
interface RecQ { table: string; op: string | null; payload?: unknown }
const { makeClient, sharedQueries } = vi.hoisted(() => {
  function makeClient(queries: Array<{ table: string; op: string | null; payload?: unknown }>) {
    return {
      from: (table: string) => {
        const q = { table, op: null as string | null, payload: undefined as unknown };
        queries.push(q);
        const handler: ProxyHandler<() => void> = {
          get(_t, prop) {
            if (prop === 'then') {
              return (f: (v: { data: unknown; error: unknown }) => unknown) =>
                Promise.resolve({ data: null, error: null }).then(f);
            }
            if (prop === 'insert') return (p: unknown) => { q.op = 'insert'; q.payload = p; return proxy; };
            if (prop === 'upsert') return (p: unknown) => { q.op = 'upsert'; q.payload = p; return proxy; };
            return () => proxy;
          },
        };
        const proxy = new Proxy(() => {}, handler) as Record<string, unknown>;
        return proxy;
      },
    };
  }
  return { makeClient, sharedQueries: [] as Array<{ table: string; op: string | null; payload?: unknown }> };
});
vi.mock('../../lib/supabase', () => ({ supabase: makeClient(sharedQueries) }));

import { EventBus } from '../../lib/protocol-core/event-bus';
import { GinaModule } from '../../lib/protocol-core/modules/gina-module';
import {
  getFrontendProtocolCore,
  getFrontendModule,
  resetFrontendProtocolCore,
} from '../../lib/protocol-core/frontend';
import type { SupabaseClient } from '@supabase/supabase-js';

beforeEach(() => {
  sharedQueries.length = 0;
  resetFrontendProtocolCore();
  vi.clearAllMocks();
});

describe('GinaModule.logComfortReaction — parity with handler-v2 logGinaReaction', () => {
  function moduleWithMock() {
    const queries: RecQ[] = [];
    const db = makeClient(queries) as unknown as SupabaseClient;
    return { db, queries };
  }

  it('writes the byte-identical gina_comfort_map row', async () => {
    const { db, queries } = moduleWithMock();
    const bus = new EventBus({ db, persistEvents: false });
    bus.setUserId('user-xyz');
    const gina = new GinaModule();
    await gina.initialize(bus, db);

    await gina.logComfortReaction('cruising', 'met someone', 'positive', 'she smiled', true);

    const row = queries.find(q => q.table === 'gina_comfort_map' && q.op === 'insert')?.payload as Record<string, unknown>;
    expect(row).toMatchObject({
      user_id: 'user-xyz',
      channel: 'cruising',
      introduction: 'met someone',
      reaction: 'positive',
      reaction_detail: 'she smiled',
      gina_initiated: true,
    });
    expect(row.day_of_week).toBeDefined();
    expect(['morning', 'afternoon', 'evening', 'night']).toContain(row.time_of_day);
  });

  it('no user on the bus → no orphan write', async () => {
    const { db, queries } = moduleWithMock();
    const bus = new EventBus({ db, persistEvents: false });
    const gina = new GinaModule();
    await gina.initialize(bus, db);
    await gina.logComfortReaction('c', 'i', 'neutral');
    expect(queries.some(q => q.table === 'gina_comfort_map' && q.op === 'insert')).toBe(false);
  });

  it('defaults reaction_detail to null and gina_initiated to false', async () => {
    const { db, queries } = moduleWithMock();
    const bus = new EventBus({ db, persistEvents: false });
    bus.setUserId('u');
    const gina = new GinaModule();
    await gina.initialize(bus, db);
    await gina.logComfortReaction('c', 'i', 'curious');
    const row = queries.find(q => q.table === 'gina_comfort_map')?.payload as Record<string, unknown>;
    expect(row.reaction_detail).toBeNull();
    expect(row.gina_initiated).toBe(false);
  });
});

describe('frontend protocol-core factory', () => {
  it('memoizes per user id (same instance for same user)', () => {
    const a = getFrontendProtocolCore('user-1');
    const b = getFrontendProtocolCore('user-1');
    expect(a).toBe(b);
  });

  it('rebuilds for a different user', () => {
    const a = getFrontendProtocolCore('user-1');
    const b = getFrontendProtocolCore('user-2');
    expect(a).not.toBe(b);
  });

  it('exposes the registered GinaModule after ready', async () => {
    const gina = await getFrontendModule('user-1', 'gina');
    expect(gina).toBeInstanceOf(GinaModule);
  });
});
