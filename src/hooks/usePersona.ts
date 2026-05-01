/**
 * usePersona — resolve the current Handler persona once per user.
 *
 * Returns `mommy` (boolean) so callers can toggle copy/microcopy without
 * each component re-querying user_state. Defaults to `false` while
 * loading or on error so the UI never renders Mama-voice copy on a row
 * the user hasn't actually flipped to dommy_mommy.
 *
 * Cached in module scope per-user — first call hits the DB, subsequent
 * calls (across components on the same screen) are free.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { isMommyPersona } from '../lib/persona/dommy-mommy';

const cache = new Map<string, boolean>();

export function usePersona(): { mommy: boolean; loading: boolean } {
  const { user } = useAuth();
  const [mommy, setMommy] = useState<boolean>(() => {
    if (!user?.id) return false;
    return cache.get(user.id) ?? false;
  });
  const [loading, setLoading] = useState<boolean>(() => !user?.id ? false : !cache.has(user.id));

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    if (cache.has(user.id)) {
      setMommy(cache.get(user.id) ?? false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_state')
        .select('handler_persona')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const m = isMommyPersona((data as { handler_persona?: string } | null)?.handler_persona ?? null);
      cache.set(user.id, m);
      setMommy(m);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { mommy, loading };
}
