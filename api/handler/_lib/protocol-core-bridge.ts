/**
 * Server-side bridge for protocol-core (revival Stage 3 — seam spike + façade).
 *
 * Proves and provides the api/ → src/lib/protocol-core import path: the decoupled
 * protocol-core (event-bus + ai-layer no longer import ../supabase, so no
 * import.meta.env) can now be constructed inside the Vercel serverless runtime,
 * backed by a SERVICE-ROLE Supabase client injected at construction.
 *
 * This is DARK until revival Stage 4 — nothing in the live chat turn routes
 * through it yet. It exists to (a) keep the seam typechecked by ci:typecheck-api,
 * and (b) give later stages ONE place to build the bus / registry / AI layer
 * server-side. Do not wire it into chat-action.ts until Stage 4's flagged canary.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { EventBus } from '../../../src/lib/protocol-core/event-bus';
import { ModuleRegistry } from '../../../src/lib/protocol-core/module-interface';
import { createAILayer, type AILayer } from '../../../src/lib/protocol-core/ai-layer';

export interface ProtocolCoreServer {
  bus: EventBus;
  registry: ModuleRegistry;
  db: SupabaseClient;
}

/** Build a service-role-backed protocol-core for a given user (server-side). */
export function createServerProtocolCore(userId: string): ProtocolCoreServer {
  const db = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  );
  const bus = new EventBus({ db, persistEvents: true });
  bus.setUserId(userId);
  const registry = new ModuleRegistry();
  return { bus, registry, db };
}

/** Build the budgeted AI layer (service-role-backed) for a user. */
export function createServerAILayer(
  userId: string,
  db: SupabaseClient,
  apiKey: string | null,
  dailyBudgetCents = 150,
): Promise<AILayer> {
  return createAILayer(userId, apiKey, dailyBudgetCents, db);
}
