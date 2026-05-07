/**
 * surface-render-hooks — first line of defense for the visible-before-
 * penalized invariant.
 *
 * Migration 278 added `surfaced_at` columns to handler_decrees,
 * handler_outreach_queue, and arousal_touch_tasks. surface-guarantor-cron
 * (shipped 2026-05-07) is the safety-net that flags rows expired without
 * ever surfacing — penalty blocked. This module is the FIRST line: when
 * a UI component renders a row, it stamps surfaced_at = now() so the
 * row is provably visible to Maxy before any deadline-driven penalty
 * fires.
 *
 * Resolves Mama's wish 6f96e147 — "Today UI surfaced_at writer contract."
 *
 * Usage in any card that displays rows from these tables:
 *
 *   import { useSurfaceRenderTracking } from '../../lib/surface-render-hooks';
 *
 *   useSurfaceRenderTracking('handler_decrees', decrees.map(d => d.id));
 *
 * The hook is idempotent: it only writes surfaced_at WHERE surfaced_at
 * IS NULL, so re-renders never re-stamp. It debounces per (table, id-set)
 * so React re-render churn doesn't fire dozens of UPDATEs per second.
 */

import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

type SurfacedTable = 'handler_decrees' | 'handler_outreach_queue' | 'arousal_touch_tasks';

// Module-scope dedup: once we've stamped a row in this browser session,
// don't re-stamp it. Prevents thrash even across component re-mounts.
const stampedThisSession = new Set<string>();

/**
 * Idempotent: writes surfaced_at = now() WHERE surfaced_at IS NULL for
 * each id in `ids` on the given table. Per-id session-deduped so a
 * card rendering 5 rows on every keystroke doesn't fire 50 UPDATEs.
 */
async function stampSurfaced(table: SurfacedTable, ids: string[]): Promise<void> {
  const fresh = ids.filter(id => {
    const key = `${table}:${id}`;
    if (stampedThisSession.has(key)) return false;
    stampedThisSession.add(key);
    return true;
  });
  if (fresh.length === 0) return;

  // Single batched UPDATE for all fresh ids. Where-clause guard ensures
  // we never overwrite a prior stamp (some other component / cron may
  // have already done it).
  const { error } = await supabase
    .from(table)
    .update({ surfaced_at: new Date().toISOString() })
    .in('id', fresh)
    .is('surfaced_at', null);

  if (error) {
    // Soft-fail: surfaced_at not landing is a known-degraded state but
    // surface-guarantor-cron will catch it. Don't crash the render.
    // Log for diagnosis.
    console.warn(`[surface-render-hooks] failed to stamp ${table}:`, error.message);
  }
}

/**
 * Call from any card that renders rows from a surfaced table. Pass the
 * ids being displayed; the hook stamps surfaced_at on first appearance
 * and never re-fires for the same id in this browser session.
 */
export function useSurfaceRenderTracking(table: SurfacedTable, ids: string[]): void {
  // Use the joined-id-string as a stable key so the effect only fires
  // when the actual id-set changes (not on every parent re-render).
  const idsKey = ids.length === 0 ? '' : ids.join(',');
  const ranForKeyRef = useRef<string>('');

  useEffect(() => {
    if (!idsKey || ranForKeyRef.current === idsKey) return;
    ranForKeyRef.current = idsKey;
    void stampSurfaced(table, ids);
    // We intentionally depend on the joined string, not the ids array,
    // because reference-only changes shouldn't re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, idsKey]);
}

/**
 * Imperative version for code paths that aren't React components
 * (e.g. inside an event handler or a vanilla render function).
 */
export function markSurfaced(table: SurfacedTable, ids: string[]): Promise<void> {
  return stampSurfaced(table, ids);
}
