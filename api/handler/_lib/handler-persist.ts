// ============================================================================
// handler-persist.ts — shared post-LLM directive-execution pipeline
//
// Extracted from chat-action.ts to collapse the byte-identical directive
// pipeline that previously lived in BOTH the streaming and non-streaming
// branches. The two copies were identical (modulo indentation + a
// `[Handler][stream]` vs `[Handler]` log tag) for every directive branch that
// appeared in both paths — see the rigorous branch-by-branch verification in
// the refactor that introduced this file.
//
// SCOPE (what this owns):
//   - handler_note save
//   - the directive loop: handler_directives insert + logDirectiveOutcome +
//     the 18 directive branches common to both paths + the force-feminization
//     helper
//
// OUT OF SCOPE (stays in each caller — they genuinely diverge):
//   - the 6 streaming-only directive branches (enqueue_punishment,
//     schedule_immersion, lock_chastity, log_release, prescribe_workout,
//     approve_content) — these do NOT run in the non-streaming path. The
//     streaming caller passes them via `executeExtraDirective`; the
//     non-streaming caller passes nothing, preserving its exact behavior.
//   - resistance-triggered escalation — the two paths run it at different
//     points relative to commitment-extraction / classification, so it stays
//     inline in both to preserve ordering.
//   - compliance reward pulse (the two paths test DIFFERENT strings:
//     streamVisible vs the trigger-weaved finalResponse)
//   - handler_messages insert / handler_conversations update / the
//     fire-and-forget learning hooks (the two paths fire DIFFERENT hook sets)
//   - commitment extraction / classification / conditioning-session lookup /
//     trigger weaving / media resolution (non-streaming only)
//   - all transport (SSE writes / res.json)
//
// All Supabase writes, columns, values, conditions, ordering and
// fire-and-forget `.catch()` semantics are preserved verbatim.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  logDirectiveOutcome,
  executeDeviceCommand,
  handleForceFeminizationDirective,
  searchContent,
} from './chat-action.js';
import { buildHandlerDirectiveModule } from './protocol-core-bridge.js';

export interface PersistTurnDeps {
  /** Module-singleton Supabase service-role client from chat-action.ts. */
  supabase: SupabaseClient;
  /** Authenticated user (only `id` is read). */
  user: { id: string };
  /**
   * Conversation id for this turn (used as conversation_id / source_id).
   * Callers pass the value already narrowed to a string (both chat paths
   * guard `if (!convId) return` before reaching here).
   */
  convId: string;
  /** `req.headers.authorization || ''` — forwarded to executeDeviceCommand. */
  authHeader: string;
  /**
   * Streaming-only directive branches that the non-streaming path does NOT
   * execute. The streaming caller supplies a handler for:
   *   enqueue_punishment · schedule_immersion · lock_chastity · log_release ·
   *   prescribe_workout · approve_content
   * Called once per directive, AFTER the shared branches for that directive.
   * Omitted by the non-streaming caller → its behavior is unchanged.
   */
  executeExtraDirective?: (dir: Record<string, unknown>) => Promise<void>;
  /**
   * Optional injected writer for the per-turn handler_note save (revival Stage
   * 5). When supplied (PROTOCOL_CORE_FLOWS includes `turn_notes`), the note is
   * persisted THROUGH this callback — which routes to protocol-core's
   * HandlerNotesModule — instead of the inline `handler_notes` insert. The
   * resulting row is byte-identical. Omitted → the inline insert runs unchanged.
   */
  saveHandlerNote?: (note: { type: string; content: string; priority: number }) => Promise<void>;
}

export interface PersistTurn {
  /**
   * The handler signals object for this turn (tool_use or regex-parsed).
   * `handler_note`, `directive` / `directives` and `resistance_level` are read.
   */
  signals: Record<string, unknown> | null | undefined;
  /**
   * The raw user message text — needed by the log_release edging-guard and
   * release-date parsing in the streaming-only branches. Passed through to
   * `executeExtraDirective` callers via closure; kept here for symmetry and
   * future shared branches. (Currently unused by the shared branches.)
   */
  userMessage: string;
}

/**
 * Run the post-LLM directive side-effect pipeline shared by the streaming and
 * non-streaming chat paths. Behavior-preserving: identical DB writes, order
 * and error semantics to the two former inline copies.
 */
export async function persistTurnSideEffects(
  deps: PersistTurnDeps,
  turn: PersistTurn,
): Promise<void> {
  const { supabase, user, convId, authHeader, executeExtraDirective, saveHandlerNote } = deps;
  const { signals } = turn;

  // ── Save handler_note ──
  if (signals?.handler_note) {
    try {
      const note = signals.handler_note as { type?: string; content?: string; priority?: number };
      if (note.type && note.content) {
        if (saveHandlerNote) {
          // Stage 5: route through protocol-core (HandlerNotesModule). Same row.
          await saveHandlerNote({ type: note.type, content: note.content, priority: note.priority || 0 });
        } else {
          await supabase.from('handler_notes').insert({
            user_id: user.id,
            note_type: note.type,
            content: note.content,
            priority: note.priority || 0,
            conversation_id: convId,
          });
        }
      }
    } catch {
      // Non-critical — continue on failure
    }
  }

  // ── Save AND execute directives ──
  // Stage 5b: the per-directive loop is RELOCATED into protocol-core's
  // HandlerDirectiveModule (single copy — see handler-directive-module.ts).
  // We delegate through the SAME `supabase` client this function already holds,
  // injecting the api/ executors the module cannot import. Behavior-identical;
  // the characterization tests pin it.
  if (signals?.directive || signals?.directives) {
    try {
      const rawDirectives = signals.directives || signals.directive;
      const directiveList = Array.isArray(rawDirectives) ? rawDirectives : [rawDirectives];
      const directiveModule = await buildHandlerDirectiveModule(supabase, user.id);
      await directiveModule.runDirectiveLoop({
        directiveList,
        userId: user.id,
        convId,
        authHeader,
        exec: {
          logDirectiveOutcome,
          executeDeviceCommand,
          handleForceFeminizationDirective,
          searchContent,
        },
        executeExtraDirective,
      });
    } catch {
      // Non-critical — continue on failure
    }
  }

  // NOTE: resistance-triggered escalation is deliberately NOT handled here.
  // The non-streaming path runs it AFTER commitment-extraction + classification
  // (inside the same `if (signals)` block), while the streaming path runs it
  // standalone. To preserve each path's exact ordering it stays inline in both
  // callers.
}
