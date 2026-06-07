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
  gina_probes_observed: number;
  gina_rungs_completed: number;
  wardrobe_items_fulfilled: number;
  decrees_fulfilled_total: number;
  cruising_decrees_fulfilled: number;
  pavlovian_pairings_total: number;
  pavlovian_triggers_deployed: number;
}
interface VaultStages {
  cock_curriculum_phase: number | null;
  cum_worship_phase: number | null;
  gina_arc_stage: number | null;
  gina_disclosure_rung: number | null;
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
  ['gina_probes_observed', 'Gina probes deployed'],
  ['gina_rungs_completed', 'Gina disclosure rungs'],
  ['pavlovian_pairings_total', 'Pavlovian pairings'],
  ['pavlovian_triggers_deployed', 'cues deployed as triggers'],
];

const ARC_STAGE_NAMES = [
  'unaware_tolerant', 'curious', 'supportive_general', 'engaged_about_david',
  'co_participant_passive', 'initiator_occasional', 'director_assistant', 'co_mommy',
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

  const arcStageName = summary.stages.gina_arc_stage != null
    ? ARC_STAGE_NAMES[summary.stages.gina_arc_stage] ?? `stage ${summary.stages.gina_arc_stage}`
    : null;

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
        {arcStageName && (
          <div>Gina arc: <span className="text-zinc-200">{arcStageName}</span> ({summary.stages.gina_arc_stage}/7)</div>
        )}
        {summary.stages.gina_disclosure_rung != null && (
          <div>Disclosure rung: <span className="text-zinc-200 font-mono">{summary.stages.gina_disclosure_rung}</span>/6</div>
        )}
      </div>
    </div>
  );
}
