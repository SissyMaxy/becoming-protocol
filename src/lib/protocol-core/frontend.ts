/**
 * Frontend protocol-core integration (revival Stage 6).
 *
 * The missing "latent bridge" the dead useHandlerPrescription stub only gestured
 * at. Mirrors the server-side protocol-core-bridge, but injects the BROWSER anon
 * Supabase client — so module reads/writes are RLS-scoped to the signed-in user
 * (no service-role). Memoized per user id so module initialization (which does
 * DB reads) runs once per session, not per call site.
 *
 * As engines migrate off handler-v2, their consumers (hooks/components) get the
 * owning module from here and call its methods, instead of importing the old
 * handler-v2 engine functions. Register a module below when its first consumer
 * is migrated — never before (no dead scaffolding).
 */

import { supabase } from '../supabase';
import { EventBus } from './event-bus';
import { ModuleRegistry, type ProtocolModule } from './module-interface';
import { GinaModule } from './modules/gina-module';

export interface FrontendProtocolCore {
  bus: EventBus;
  registry: ModuleRegistry;
  /** Resolves once every registered module has finished initialize(). */
  ready: Promise<void>;
}

let instance: { userId: string; core: FrontendProtocolCore } | null = null;

function build(userId: string): FrontendProtocolCore {
  const bus = new EventBus({ db: supabase, persistEvents: true });
  bus.setUserId(userId);

  const registry = new ModuleRegistry();
  // Modules whose first frontend consumer has been migrated off handler-v2:
  registry.register(new GinaModule());

  // initializeAll never rejects in practice (per-module init is defensive), but
  // guard so a single module's init failure can't poison `ready` for the rest.
  const ready = registry.initializeAll(bus, supabase).catch((e) => {
    console.error('[protocol-core/frontend] module init failed:', e);
  });

  return { bus, registry, ready };
}

/** Get (or lazily build) the memoized frontend protocol-core for a user. */
export function getFrontendProtocolCore(userId: string): FrontendProtocolCore {
  if (instance && instance.userId === userId) return instance.core;
  const core = build(userId);
  instance = { userId, core };
  return core;
}

/** Await readiness and return a registered module by name (undefined if absent). */
export async function getFrontendModule<T extends ProtocolModule>(
  userId: string,
  name: string,
): Promise<T | undefined> {
  const core = getFrontendProtocolCore(userId);
  await core.ready;
  return core.registry.get(name) as T | undefined;
}

/** Test/auth-change hook: drop the memoized instance so the next call rebuilds. */
export function resetFrontendProtocolCore(): void {
  instance = null;
}
