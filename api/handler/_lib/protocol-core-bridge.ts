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
// LAZY value imports only (see functions below). The Vercel build compiles
// this per-file to ESM ("type": "module") WITHOUT rewriting extensionless
// specifiers — a static `from '../../../src/lib/protocol-core/event-bus'`
// throws ERR_MODULE_NOT_FOUND at module load and takes down the WHOLE
// /api/handler dispatcher (chat + analyze-photo + meta-frame-reveal died
// exactly this way, 2026-07-21). Value imports therefore happen inside the
// functions, with explicit .js specifiers; type imports are erased at
// compile and safe to keep static.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EventBus } from '../../../src/lib/protocol-core/event-bus.js';
import type { ModuleRegistry } from '../../../src/lib/protocol-core/module-interface.js';
import type { AILayer } from '../../../src/lib/protocol-core/ai-layer.js';
import type { HandlerDirectiveModule } from '../../../src/lib/protocol-core/modules/handler-directive-module.js';

export interface ProtocolCoreServer {
  bus: EventBus;
  registry: ModuleRegistry;
  db: SupabaseClient;
}

/**
 * Per-flow kill-switch for the protocol-core revival (Stage 4+).
 *
 * `PROTOCOL_CORE_FLOWS` is a comma-separated allowlist of flow names that route
 * through protocol-core instead of the legacy inline path in chat-action.ts.
 * Unset / empty → every flow stays on the legacy path (production default).
 * `*` or `all` → every flow routes through protocol-core.
 *
 * Example: `PROTOCOL_CORE_FLOWS=compliance_reward`
 */
export function isProtocolCoreFlowEnabled(flow: string): boolean {
  const raw = (process.env.PROTOCOL_CORE_FLOWS || '').trim();
  if (!raw) return false;
  const set = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return set.includes('*') || set.includes('all') || set.includes(flow.toLowerCase());
}

/** Build a service-role-backed protocol-core for a given user (server-side). */
export async function createServerProtocolCore(
  userId: string,
  opts: { persistEvents?: boolean } = {},
): Promise<ProtocolCoreServer> {
  const [{ EventBus }, { ModuleRegistry }] = await Promise.all([
    import('../../../src/lib/protocol-core/event-bus.js'),
    import('../../../src/lib/protocol-core/module-interface.js'),
  ]);
  const db = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  );
  const bus = new EventBus({ db, persistEvents: opts.persistEvents ?? true });
  bus.setUserId(userId);
  const registry = new ModuleRegistry();
  return { bus, registry, db };
}

/**
 * Stage 4 canary — fire the compliance reward pulse through protocol-core.
 *
 * Replaces the inline `if (/good\s+girl/i.test(...)) supabase.from('handler_directives').insert(...)`
 * that lived in BOTH chat transports. The CoercionModule, initialized against a
 * service-role client and driven by a `coercion:reward_signal` bus event, owns
 * the regex test and the (byte-identical) directive insert.
 *
 * Events are NOT persisted here (`persistEvents: false`) so the only DB write is
 * the handler_directives row — keeping the flag-ON / flag-OFF footprint diff
 * strictly to that one row. Returns true iff the reward pulse fired.
 *
 * Non-throwing: any failure is swallowed so the canary can never break a live
 * chat turn (matches the legacy non-critical try/catch in chat-action.ts).
 */
export async function runComplianceRewardPulse(
  userId: string,
  visibleText: string,
): Promise<boolean> {
  try {
    const [core, { CoercionModule }] = await Promise.all([
      createServerProtocolCore(userId, { persistEvents: false }),
      import('../../../src/lib/protocol-core/modules/coercion-module.js'),
    ]);
    const coercion = new CoercionModule();
    await coercion.initialize(core.bus, core.db);
    // emit() awaits its handlers, so the directive insert completes before this
    // resolves.
    await core.bus.emit({ type: 'coercion:reward_signal', visibleText });
    return /good\s+girl/i.test(visibleText);
  } catch {
    return false;
  }
}

/**
 * Stage 5 — persist a Handler observation note through protocol-core.
 *
 * Routes the per-turn `handler_note` save (formerly an inline insert at the head
 * of persistTurnSideEffects) into HandlerNotesModule. Byte-identical row,
 * including conversation_id. Non-throwing; events not persisted so the only
 * write is the handler_notes row.
 */
export async function runHandlerNoteSave(
  userId: string,
  note: { type: string; content: string; priority: number },
  conversationId: string,
): Promise<void> {
  try {
    const [core, { HandlerNotesModule }] = await Promise.all([
      createServerProtocolCore(userId, { persistEvents: false }),
      import('../../../src/lib/protocol-core/modules/handler-notes-module.js'),
    ]);
    const notes = new HandlerNotesModule();
    await notes.initialize(core.bus, core.db);
    await core.bus.emit({
      type: 'handler:note_captured',
      noteType: note.type,
      content: note.content,
      priority: note.priority,
      conversationId,
    });
  } catch {
    // Non-critical — never break a live turn.
  }
}

/**
 * Stage 5b — build the directive-loop module bound to the caller's Supabase
 * client. The directive loop is RELOCATED into HandlerDirectiveModule (single
 * copy); persistTurnSideEffects delegates to it through the SAME client it
 * already holds (so characterization-test parity is exact, and there is no
 * service-role re-client here). The api/ executors are injected at the call
 * site. Events are not used (procedural module) → the pure bus is inert.
 */
export async function buildHandlerDirectiveModule(
  db: SupabaseClient,
  userId: string,
): Promise<HandlerDirectiveModule> {
  const [{ EventBus }, { HandlerDirectiveModule }] = await Promise.all([
    import('../../../src/lib/protocol-core/event-bus.js'),
    import('../../../src/lib/protocol-core/modules/handler-directive-module.js'),
  ]);
  const bus = new EventBus({ db, persistEvents: false });
  bus.setUserId(userId);
  const mod = new HandlerDirectiveModule();
  await mod.initialize(bus, db);
  return mod;
}

/** Build the budgeted AI layer (service-role-backed) for a user. */
export async function createServerAILayer(
  userId: string,
  db: SupabaseClient,
  apiKey: string | null,
  dailyBudgetCents = 150,
): Promise<AILayer> {
  const { createAILayer } = await import('../../../src/lib/protocol-core/ai-layer.js');
  return createAILayer(userId, apiKey, dailyBudgetCents, db);
}
