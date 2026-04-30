/**
 * uiFriction — fire-and-forget UI telemetry for the friction grader.
 *
 * Tracks the events the protocol cares about: empty-state renders, slow
 * loads (>1s), abandoned chat composes, repeated clicks without effect.
 * Persists to ui_friction_log; cron grader scores patterns weekly.
 *
 * Caller pattern: import { logFriction } and fire from useEffect or click
 * handlers. Never blocks; failures are silent.
 */

import { supabase } from './supabase';

type FrictionEvent =
  | 'empty_state'
  | 'slow_load'
  | 'compose_abandoned'
  | 'card_click_no_effect'
  | 'scroll_target_missing'
  | 'rendered'
  | 'task_completed';

let userIdCache: string | null = null;
async function getUserId(): Promise<string | null> {
  if (userIdCache) return userIdCache;
  const { data } = await supabase.auth.getUser();
  userIdCache = data?.user?.id ?? null;
  return userIdCache;
}

// Throttle: same surface+event in same minute = drop the duplicate
const recentKeys = new Map<string, number>();
function shouldEmit(key: string): boolean {
  const now = Date.now();
  const prev = recentKeys.get(key);
  if (prev && now - prev < 60_000) return false;
  recentKeys.set(key, now);
  // Keep map small
  if (recentKeys.size > 200) {
    const cutoff = now - 5 * 60_000;
    for (const [k, v] of recentKeys) if (v < cutoff) recentKeys.delete(k);
  }
  return true;
}

export async function logFriction(
  surface: string,
  event: FrictionEvent,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    if (!shouldEmit(`${surface}:${event}`)) return;
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from('ui_friction_log').insert({
      user_id: userId,
      surface: surface.slice(0, 100),
      event,
      detail: detail ?? null,
    });
  } catch {
    // Silent — telemetry never blocks UI
  }
}
