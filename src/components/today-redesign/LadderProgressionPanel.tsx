/**
 * LadderProgressionPanel — every active force-fem ladder in one card.
 * Groups by category (oral, receiving, fem_visible, fem_body, fem_social).
 * Reads the ladder_catalog + per-user settings via user_ladder_progression
 * RPC (mig 520). Read-only — Mommy drives advancement via fulfillments.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Row {
  trigger_source: string;
  display_name: string;
  category: string;
  current_phase: number | null;
  total_phases: number;
  enabled: boolean | null;
  last_assigned_at: string | null;
  paused_until: string | null;
  cron_label: string | null;
  blurb: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  oral: 'Oral',
  receiving: 'Receiving',
  fem_visible: 'Visible fem',
  fem_body: 'Body fem',
  fem_social: 'Social fem',
};

const CATEGORY_ORDER = ['oral', 'receiving', 'fem_visible', 'fem_body', 'fem_social'];

export function LadderProgressionPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.rpc('user_ladder_progression', { p_user_id: user.id });
    setRows((data ?? []) as Row[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    }
    return CATEGORY_ORDER
      .filter(c => map.has(c))
      .map(c => ({ category: c, rows: map.get(c)! }));
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-3">
      <div className="text-sm font-medium text-zinc-200">Ladder progression</div>

      {grouped.map(g => (
        <div key={g.category} className="space-y-1">
          <div className="text-xs text-zinc-500">{CATEGORY_LABEL[g.category] ?? g.category}</div>
          {g.rows.map(r => {
            const isPaused = r.paused_until && new Date(r.paused_until) > new Date();
            const isEnrolled = r.enabled === true;
            const phaseStr = r.current_phase != null ? `${r.current_phase}/${r.total_phases - 1}` : '—';
            return (
              <div key={r.trigger_source} className="flex items-baseline justify-between text-xs">
                <div className="flex-1 min-w-0">
                  <span className={isEnrolled ? 'text-zinc-100' : 'text-zinc-500'}>{r.display_name}</span>
                  {r.blurb && <span className="text-zinc-500 ml-2 truncate">{r.blurb}</span>}
                </div>
                <div className="text-right shrink-0 flex items-baseline gap-2">
                  <span className="text-zinc-500 text-[10px]">{r.cron_label}</span>
                  <span className={
                    isPaused ? 'text-amber-400 font-mono' :
                    isEnrolled ? 'text-emerald-300 font-mono' :
                    'text-zinc-600 font-mono'
                  }>
                    {isPaused ? 'paused' : phaseStr}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
