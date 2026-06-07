/**
 * HandlerNotesModule — owns the Handler's private observation notes.
 *
 * Protocol-core revival Stage 5: the `handler_notes` writes that the persist
 * pipeline used to perform inline (the per-turn `handler_note` save, and later
 * the `search_content` results note) move here, driven off the bus.
 *
 * Behavior-preserving: every write reproduces the former inline row exactly —
 * same table, columns, values, and `conversation_id`. Writes are swallowed on
 * failure to keep the inline "non-critical, never throws" contract.
 */

import { BaseModule, type ContextTier } from '../module-interface';
import type { ProtocolEvent } from '../event-bus';

interface HandlerNotesModuleState {
  notesThisSession: number;
  [key: string]: unknown;
}

export class HandlerNotesModule extends BaseModule {
  readonly name = 'handler-notes';
  readonly category = 'system' as const;

  private notesThisSession = 0;

  protected async onInitialize(): Promise<void> {
    this.subscribe('handler:note_captured', (e) => this.onNoteCaptured(e));
  }

  // This module contributes no AI context and holds no durable state worth
  // composing — it is a write sink. getContext stays empty so the registry's
  // composed context is unchanged.
  getContext(_tier: ContextTier): string {
    return '';
  }

  getState(): HandlerNotesModuleState {
    return { notesThisSession: this.notesThisSession };
  }

  getTemplate(_key: string, _context: Record<string, unknown>): string | null {
    return null;
  }

  /**
   * Persist a Handler observation note. Byte-identical to the former inline
   * insert in handler-persist.ts (user_id, note_type, content, priority,
   * conversation_id). user_id comes from the bus (service-role client has no
   * auth.uid()); a missing user is a no-op rather than an orphan write.
   */
  private async onNoteCaptured(event: ProtocolEvent): Promise<void> {
    if (event.type !== 'handler:note_captured') return;

    const userId = this.bus.getUserId();
    if (!userId) return;

    try {
      await this.db.from('handler_notes').insert({
        user_id: userId,
        note_type: event.noteType,
        content: event.content,
        priority: event.priority,
        conversation_id: event.conversationId,
      });
      this.notesThisSession += 1;
    } catch {
      // Non-critical — mirrors the inline `catch { /* continue */ }`.
    }
  }
}
