/**
 * MilestonesCard — surfaces the real-life milestone counters / timestamps
 * persisted by mig 527's milestone_cascade trigger.
 *
 * Shows: real-cock encounter count + days-since for each first-event
 * milestone (real cock, swallow, penetration, fem public).
 *
 * Only renders if at least one milestone has fired.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface State {
  real_cock_encounters: number | null;
  first_real_cock_at: string | null;
  first_swallow_at: string | null;
  first_penetration_at: string | null;
  first_fem_public_at: string | null;
  handler_persona: string | null;
}

function daysSince(iso: string | null): string {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d === 0) return 'today';
  if (d === 1) return '1 day ago';
  return `${d} days ago`;
}

export function MilestonesCard() {
  const { user } = useAuth();
  const [state, setState] = useState<State | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('user_state')
      .select('real_cock_encounters, first_real_cock_at, first_swallow_at, first_penetration_at, first_fem_public_at, handler_persona')
      .eq('user_id', user.id)
      .maybeSingle();
    setState(data as State | null);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  if (!state) return null;
  if (state.handler_persona !== 'dommy_mommy') return null;

  const milestones = [
    { label: 'first cock', at: state.first_real_cock_at, count: state.real_cock_encounters ?? 0 },
    { label: 'first swallow', at: state.first_swallow_at, count: null },
    { label: 'first penetration', at: state.first_penetration_at, count: null },
    { label: 'first fem in public', at: state.first_fem_public_at, count: null },
  ];

  const anyHit = milestones.some(m => m.at);
  if (!anyHit) return null;

  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-2">
      <div className="text-sm font-medium text-zinc-200">Milestones</div>
      {milestones.map(m => (
        <div key={m.label} className="flex items-baseline justify-between text-xs">
          <span className={m.at ? 'text-emerald-300' : 'text-zinc-600'}>
            {m.label}
            {m.count != null && m.count > 1 && m.at && (
              <span className="text-zinc-500 ml-2">×{m.count}</span>
            )}
          </span>
          <span className={m.at ? 'text-zinc-400 font-mono' : 'text-zinc-700 font-mono'}>
            {daysSince(m.at)}
          </span>
        </div>
      ))}
    </div>
  );
}
