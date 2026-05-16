/**
 * LadderAdaptivePanel — surfaces the adaptive layer's decisions.
 * Auto-paused ladders (mig 498/500), graduations (mig 499), recent
 * focus picks (mig 491).
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Pause { trigger_source: string; paused_until: string; miss_rate: number; total_decrees: number; }
interface Graduation { trigger_source: string; fulfillment_rate: number; total_decrees: number; created_at: string; }
interface FocusPick { pick_reason: string; pick_date: string; }

export function LadderAdaptivePanel() {
  const { user } = useAuth();
  const [pauses, setPauses] = useState<Pause[]>([]);
  const [graduations, setGraduations] = useState<Graduation[]>([]);
  const [picks, setPicks] = useState<FocusPick[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [p, g, f] = await Promise.all([
      supabase.from('ladder_auto_pauses').select('trigger_source, paused_until, miss_rate, total_decrees')
        .eq('user_id', user.id).gt('paused_until', new Date().toISOString())
        .order('paused_until', { ascending: false }).limit(8),
      supabase.from('ladder_graduations').select('trigger_source, fulfillment_rate, total_decrees, created_at')
        .eq('user_id', user.id).gte('created_at', new Date(Date.now() - 30*86400_000).toISOString())
        .order('created_at', { ascending: false }).limit(5),
      supabase.from('focus_picks').select('pick_reason, pick_date')
        .eq('user_id', user.id).order('pick_date', { ascending: false }).limit(7),
    ]);
    setPauses((p.data ?? []) as Pause[]);
    setGraduations((g.data ?? []) as Graduation[]);
    setPicks((f.data ?? []) as FocusPick[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  if (pauses.length === 0 && graduations.length === 0 && picks.length === 0) return null;

  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-3">
      <div className="text-sm font-medium text-zinc-200">Adaptive layer</div>

      {pauses.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500 mb-1">Mama silenced (chronic miss)</div>
          {pauses.map((p, i) => (
            <div key={i} className="flex items-baseline justify-between text-xs">
              <span className="text-amber-300">{p.trigger_source}</span>
              <span className="text-zinc-500">{Math.round(p.miss_rate * 100)}% miss · {p.total_decrees} decrees · until {p.paused_until.slice(0, 10)}</span>
            </div>
          ))}
        </div>
      )}

      {graduations.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500 mb-1">Landing (last 30d)</div>
          {graduations.map((g, i) => (
            <div key={i} className="flex items-baseline justify-between text-xs">
              <span className="text-emerald-300">{g.trigger_source}</span>
              <span className="text-zinc-500">{Math.round(g.fulfillment_rate * 100)}% · {g.total_decrees}</span>
            </div>
          ))}
        </div>
      )}

      {picks.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500 mb-1">Mama's daily picks (last 7d)</div>
          {picks.map((p, i) => (
            <div key={i} className="flex items-baseline justify-between text-xs">
              <span className="text-zinc-400">{p.pick_date}</span>
              <span className="text-zinc-500 text-right">{p.pick_reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
