/**
 * EvidenceVaultCard — passive-conditioning surface showing the
 * accumulated pile of what Maxy has done. The numbers grow over time;
 * watching them grow is conditioning by itself.
 *
 * Calls evidence_vault_summary(user_id) RPC (mig 459).
 * Belongs in the Today main column or Strategy group.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface VaultCounts {
  photos: number;
  voice_samples: number;
  confessions_transcribed: number;
  mantras_in_rotation: number;
  cock_stations_completed: number;
  wardrobe_items_fulfilled: number;
  decrees_fulfilled_total: number;
  cruising_decrees_fulfilled: number;
  pavlovian_pairings_total: number;
  pavlovian_triggers_deployed: number;
}
interface VaultStages {
  cock_curriculum_phase: number | null;
  cum_worship_phase: number | null;
  denial_day: number | null;
}
interface VaultSummary { counts: VaultCounts; stages: VaultStages; generated_at: string; }

const COUNT_LABELS: Array<[keyof VaultCounts, string]> = [
  ['photos', 'photos in the vault'],
  ['voice_samples', 'voice clips'],
  ['confessions_transcribed', 'confessions transcribed'],
  ['mantras_in_rotation', 'mantras in rotation'],
  ['decrees_fulfilled_total', 'decrees completed'],
  ['cock_stations_completed', 'cock-conditioning stations'],
  ['wardrobe_items_fulfilled', 'wardrobe items earned'],
  ['cruising_decrees_fulfilled', 'cruising decrees done'],
  ['pavlovian_pairings_total', 'Pavlovian pairings'],
  ['pavlovian_triggers_deployed', 'cues deployed as triggers'],
];

export function EvidenceVaultCard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<VaultSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.rpc('evidence_vault_summary', { p_user_id: user.id });
    if (error) { setErr(error.message); return; }
    setSummary(data as VaultSummary);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  if (err) return null;
  if (!summary) return null;

  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-zinc-200">Evidence vault</div>
        <div className="text-xs text-zinc-500">growing</div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {COUNT_LABELS.map(([key, label]) => {
          const n = summary.counts[key] ?? 0;
          if (n === 0) return null;
          return (
            <div key={key} className="flex items-baseline gap-2">
              <span className="text-lg font-mono tabular-nums text-zinc-100">{n}</span>
              <span className="text-xs text-zinc-400">{label}</span>
            </div>
          );
        })}
      </div>

      <div className="pt-2 border-t border-zinc-800 space-y-1 text-xs text-zinc-400">
        {summary.stages.denial_day != null && summary.stages.denial_day > 0 && (
          <div><span className="text-zinc-200 font-mono tabular-nums">{summary.stages.denial_day}</span> denial days</div>
        )}
        {summary.stages.cock_curriculum_phase != null && (
          <div>Cock curriculum: phase <span className="text-zinc-200 font-mono">{summary.stages.cock_curriculum_phase}</span>/7</div>
        )}
        {summary.stages.cum_worship_phase != null && (
          <div>Cum worship: phase <span className="text-zinc-200 font-mono">{summary.stages.cum_worship_phase}</span>/6</div>
        )}
      </div>
    </div>
  );
}
