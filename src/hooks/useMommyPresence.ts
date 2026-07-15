/**
 * useMommyPresence — ONE fetch for the state Mommy's presence line reads
 * (arousal / denial / cage / feminine name).
 *
 * Before this hook, DropPortal and MommyTodayLine each issued the same
 * user_state + feminine_self queries on every focus-home mount and rendered
 * two near-identical presence lines stacked on top of each other. The home
 * composes ONE presence block now; anything else needing this state shares
 * the same in-flight promise + short cache.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface MommyPresenceState {
  arousal: number;
  denialDay: number;
  caged: boolean;
  cageDays: number;
  name: string | null;
}

const CACHE_TTL_MS = 60_000;

let cached: { userId: string; at: number; state: MommyPresenceState } | null = null;
let inflight: { userId: string; promise: Promise<MommyPresenceState> } | null = null;

async function fetchPresence(userId: string): Promise<MommyPresenceState> {
  const [us, fem] = await Promise.all([
    supabase.from('user_state')
      .select('current_arousal, denial_day, chastity_locked, chastity_streak_days')
      .eq('user_id', userId).maybeSingle(),
    supabase.from('feminine_self')
      .select('feminine_name')
      .eq('user_id', userId).maybeSingle(),
  ]);
  const u = (us.data ?? {}) as {
    current_arousal?: number; denial_day?: number;
    chastity_locked?: boolean; chastity_streak_days?: number;
  };
  return {
    arousal: Number(u.current_arousal ?? 0),
    denialDay: Number(u.denial_day ?? 0),
    caged: !!u.chastity_locked,
    cageDays: Number(u.chastity_streak_days ?? 0),
    name: ((fem.data as { feminine_name?: string } | null)?.feminine_name) ?? null,
  };
}

export function useMommyPresence(): MommyPresenceState | null {
  const { user } = useAuth();
  const [state, setState] = useState<MommyPresenceState | null>(() => {
    if (user?.id && cached?.userId === user.id && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.state;
    }
    return null;
  });

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    if (cached?.userId === userId && Date.now() - cached.at < CACHE_TTL_MS) {
      setState(cached.state);
      return;
    }
    let alive = true;
    if (!inflight || inflight.userId !== userId) {
      inflight = { userId, promise: fetchPresence(userId) };
    }
    inflight.promise
      .then(s => {
        cached = { userId, at: Date.now(), state: s };
        if (alive) setState(s);
      })
      .catch(() => { /* stay quiet — presence is decorative */ })
      .finally(() => {
        if (inflight?.userId === userId) inflight = null;
      });
    return () => { alive = false; };
  }, [user?.id]);

  return state;
}
