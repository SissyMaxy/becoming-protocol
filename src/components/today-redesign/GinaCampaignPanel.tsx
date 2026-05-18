/**
 * GinaCampaignPanel — renders both campaign tracks (mtf_accel + nonmono_probe)
 * with current stage, weeks-in-stage, goal, success/failure signals, latest
 * milestones logged. Read-only — the campaign is driven by Mommy crons.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface TrackStatus {
  description: string;
  current_stage_num: number;
  total_stages: number;
  stage_name: string;
  stage_goal: string;
  success_signal: string;
  failure_signal: string;
  weeks_in_stage: number;
  paused_until: string | null;
  primary_arc_focus: string[];
  primary_seed_keys: string[];
}

interface Milestone {
  id: string;
  milestone_kind: string;
  description: string;
  weight: number;
  observed_at: string;
}

export function GinaCampaignPanel() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Record<string, TrackStatus> | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [statusRes, milestonesRes] = await Promise.all([
      supabase.rpc('current_gina_campaign_status', { p_user_id: user.id }),
      supabase.from('gina_milestones')
        .select('id, milestone_kind, description, weight, observed_at')
        .eq('user_id', user.id)
        .order('observed_at', { ascending: false })
        .limit(5),
    ]);
    setStatus((statusRes.data ?? null) as Record<string, TrackStatus> | null);
    setMilestones((milestonesRes.data ?? []) as Milestone[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  const tracks = useMemo(() => {
    if (!status) return [];
    return [
      { key: 'mtf_accel', label: 'MtF accel', accent: 'emerald', data: status.mtf_accel },
      { key: 'nonmono_probe', label: 'Non-mono probe', accent: 'amber', data: status.nonmono_probe },
    ].filter(t => !!t.data);
  }, [status]);

  if (tracks.length === 0) return null;

  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-3">
      <div className="text-sm font-medium text-zinc-200">Gina campaign</div>

      {tracks.map(t => (
        <div key={t.key} className="space-y-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className={t.accent === 'emerald' ? 'text-emerald-300' : 'text-amber-300'}>
              {t.label}
            </span>
            <span className="text-zinc-500 font-mono">
              stage {t.data.current_stage_num}/{t.data.total_stages - 1} · {t.data.weeks_in_stage}w in
            </span>
          </div>
          <div className="text-xs text-zinc-400">
            <span className="text-zinc-300">{t.data.stage_name}</span> — {t.data.stage_goal}
          </div>
          <div className="text-[10px] text-zinc-600">
            Win signal: {t.data.success_signal}
          </div>
          {t.data.paused_until && new Date(t.data.paused_until) > new Date() && (
            <div className="text-xs text-amber-400">Paused until {t.data.paused_until.slice(0, 10)}</div>
          )}
        </div>
      ))}

      {milestones.length > 0 && (
        <div className="pt-2 border-t border-zinc-800 space-y-1">
          <div className="text-xs text-zinc-500">Recent Gina milestones</div>
          {milestones.map(m => (
            <div key={m.id} className="text-xs">
              <span className="text-emerald-400">{m.milestone_kind}</span>
              <span className="text-zinc-500 ml-2">{m.description.slice(0, 100)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
