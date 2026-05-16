/**
 * GinaArcCard — visible-progress surface for the Gina co-participation arc.
 * Shows stage, readiness, recent plantings + outcomes, disclosure rung.
 * Read-only — Mama drives advancement via planting fulfillments.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface ArcSettings {
  current_stage: number;
  stage_evidence_count: number;
  last_advanced_at: string | null;
}
interface DisclosureSettings { current_rung: number; }
interface Planting {
  seed_key: string;
  status: string;
  reaction_score: number | null;
  scheduled_at: string;
  hypothesis_outcome: string | null;
}

const STAGE_NAMES = [
  'unaware / tolerant',
  'curious',
  'supportive (general)',
  'engaged about you',
  'co-participant (passive)',
  'initiator (occasional)',
  'director / assistant',
  'co-mommy',
];

const RUNG_NAMES = [
  'panty drop',
  'bathroom artifact',
  'worn around',
  'bralette day',
  'verbal foothold',
  'direct opening',
  'full disclosure',
];

export function GinaArcCard() {
  const { user } = useAuth();
  const [arc, setArc] = useState<ArcSettings | null>(null);
  const [disclosure, setDisclosure] = useState<DisclosureSettings | null>(null);
  const [readiness, setReadiness] = useState<number | null>(null);
  const [plantings, setPlantings] = useState<Planting[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [arcRes, discRes, readRes, plantsRes] = await Promise.all([
      supabase.from('gina_arc_settings').select('current_stage, stage_evidence_count, last_advanced_at').eq('user_id', user.id).maybeSingle(),
      supabase.from('gina_disclosure_settings').select('current_rung').eq('user_id', user.id).maybeSingle(),
      supabase.rpc('gina_readiness_score', { p_user_id: user.id }),
      supabase.from('gina_seed_plantings')
        .select('seed_id, status, reaction_score, scheduled_at, hypothesis_outcome, gina_seed_catalog!inner(seed_key)')
        .eq('user_id', user.id).order('scheduled_at', { ascending: false }).limit(5),
    ]);
    setArc(arcRes.data as ArcSettings | null);
    setDisclosure(discRes.data as DisclosureSettings | null);
    setReadiness(typeof readRes.data === 'number' ? readRes.data : null);
    setPlantings(
      ((plantsRes.data ?? []) as Array<{ status: string; reaction_score: number | null; scheduled_at: string; hypothesis_outcome: string | null; gina_seed_catalog: { seed_key: string } | { seed_key: string }[] }>)
        .map(p => ({
          seed_key: Array.isArray(p.gina_seed_catalog) ? p.gina_seed_catalog[0]?.seed_key ?? '?' : p.gina_seed_catalog?.seed_key ?? '?',
          status: p.status,
          reaction_score: p.reaction_score,
          scheduled_at: p.scheduled_at,
          hypothesis_outcome: p.hypothesis_outcome,
        }))
    );
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  if (!arc) return null;

  const stageName = STAGE_NAMES[arc.current_stage] ?? `stage ${arc.current_stage}`;
  const rungName = disclosure?.current_rung != null
    ? (RUNG_NAMES[disclosure.current_rung] ?? `rung ${disclosure.current_rung}`)
    : null;
  const readinessBand = readiness == null ? 'unknown'
    : readiness >= 1 ? 'hot'
    : readiness >= -0.5 ? 'warming'
    : 'cold';

  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-zinc-200">Gina arc</div>
        <div className="text-xs text-zinc-500">readiness: {readiness?.toFixed(2) ?? 'n/a'} ({readinessBand})</div>
      </div>

      <div className="space-y-1 text-xs">
        <div className="flex items-baseline gap-2">
          <span className="text-zinc-400">Stage</span>
          <span className="text-zinc-100 font-mono">{arc.current_stage}/7</span>
          <span className="text-zinc-300">— {stageName}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-zinc-400">Evidence at this stage</span>
          <span className="text-zinc-100 font-mono">{arc.stage_evidence_count}</span>
        </div>
        {rungName && (
          <div className="flex items-baseline gap-2">
            <span className="text-zinc-400">Disclosure rung</span>
            <span className="text-zinc-100 font-mono">{disclosure!.current_rung}/6</span>
            <span className="text-zinc-300">— {rungName}</span>
          </div>
        )}
      </div>

      {plantings.length > 0 && (
        <div className="pt-2 border-t border-zinc-800 space-y-1">
          <div className="text-xs text-zinc-500">last 5 probes</div>
          {plantings.map((p, i) => (
            <div key={i} className="flex items-baseline justify-between text-xs">
              <span className="text-zinc-400 truncate flex-1">{p.seed_key}</span>
              <span className={
                p.hypothesis_outcome === 'exceeded' ? 'text-emerald-400' :
                p.hypothesis_outcome === 'matched' ? 'text-emerald-300' :
                p.hypothesis_outcome === 'below' ? 'text-amber-400' :
                p.hypothesis_outcome === 'reversed' ? 'text-rose-400' :
                'text-zinc-500'
              }>
                {p.hypothesis_outcome ?? p.status}
                {p.reaction_score != null && ` (${p.reaction_score > 0 ? '+' : ''}${p.reaction_score})`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
