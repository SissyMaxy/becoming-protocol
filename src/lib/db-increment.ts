import { supabase } from './supabase';

/**
 * Atomically-as-possible increment a numeric counter column on the row(s)
 * matching `match`, by `by` (default 1). Read-then-write — the same pattern the
 * codebase uses for JSONB-array appends — chosen over a generic dynamic-SQL RPC
 * to keep RLS intact (runs as the caller) and to support composite-key matches.
 *
 * Replaces the broken anti-pattern where a supabase.rpc(...) builder was placed
 * as a column value inside an update({...}) — that serialized a query-builder
 * object into the column instead of executing anything (audit #5). For
 * server-side / single-purpose counters
 * with their own named RPC (memory_implants, hypno_sources, content_arcs,
 * consequence_state), prefer those atomic functions instead.
 *
 * Counters only ever ADD here (negative `by` is rejected) so this can never be
 * used to game protocol state downward.
 *
 * @returns the new counter value, or null if the row was missing or the write failed.
 */
export async function incrementCounter(
  table: string,
  column: string,
  match: Record<string, string | number | boolean>,
  by = 1,
): Promise<number | null> {
  if (by <= 0) {
    console.error(`[incrementCounter] refusing non-positive increment ${by} for ${table}.${column}`);
    return null;
  }

  let read = supabase.from(table).select(`${column}`);
  for (const [k, v] of Object.entries(match)) read = read.eq(k, v);
  const { data, error } = await read.maybeSingle();
  if (error) {
    console.error(`[incrementCounter] read ${table}.${column} failed:`, error.message);
    return null;
  }
  if (!data) {
    console.error(`[incrementCounter] no ${table} row matched`, match);
    return null;
  }

  const current = (data as unknown as Record<string, unknown>)[column];
  const next = (typeof current === 'number' ? current : 0) + by;

  let write = supabase.from(table).update({ [column]: next });
  for (const [k, v] of Object.entries(match)) write = write.eq(k, v);
  const { error: writeError } = await write;
  if (writeError) {
    console.error(`[incrementCounter] write ${table}.${column} failed:`, writeError.message);
    return null;
  }
  return next;
}
