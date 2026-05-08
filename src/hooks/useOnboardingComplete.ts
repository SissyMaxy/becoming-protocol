/**
 * useOnboardingComplete — read user_state.onboarding_completed_at once
 * per session and return whether the persona gate is open.
 *
 * Cached per user so multiple cards on Today share the result.
 * Defaults to `false` while loading so persona content stays suppressed
 * during the initial fetch — we'd rather show one extra card cycle
 * than leak mommy copy to a brand-new user.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const cache = new Map<string, boolean>();

export function useOnboardingComplete(): { complete: boolean; loading: boolean } {
  const { user } = useAuth();
  const [complete, setComplete] = useState<boolean>(() => {
    if (!user?.id) return false;
    return cache.get(user.id) ?? false;
  });
  const [loading, setLoading] = useState<boolean>(() => !user?.id ? false : !cache.has(user.id));

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    if (cache.has(user.id)) {
      setComplete(cache.get(user.id) ?? false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_state')
        .select('onboarding_completed_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const done = !!(data as { onboarding_completed_at?: string | null } | null)?.onboarding_completed_at;
      cache.set(user.id, done);
      setComplete(done);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { complete, loading };
}

/**
 * Invalidate the cached result so the next render re-fetches. Called
 * from the wizard's complete() handler so cards switch on without a
 * page reload.
 */
export function invalidateOnboardingCompleteCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
