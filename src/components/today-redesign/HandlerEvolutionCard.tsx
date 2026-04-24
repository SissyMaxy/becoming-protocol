/**
 * HandlerEvolutionCard — proof the Handler is adapting on its own.
 *
 * Shows:
 * - Active prompt patches by source (self_audit, handler_evolve, seed_aggression, manual)
 * - Latest 3 patches (section, age, applied_count)
 * - Last evolve cycle outcome (from handler_decisions)
 * - Coercion library growth: implants, reframings, witness_fabs totals + 7d delta
 * - Behavioral signals this week: pronoun slips, David events, commit fulfillment
 * - "Run evolve now" button for manual triggering
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Patch {
  id: string;
  section: string;
  instruction: string;
  created_by: string;
  created_at: string;
  applied_count: number;
}

interface EvolveDecision {
  decision_data: {
    patches_generated?: number;
    patches_deactivated?: number;
    implants_created?: number;
    reframings_created?: number;
    witness_fabs_created?: number;
  } | null;
  executed_at: string;
  reasoning: string;
}

interface Metrics {
  active_patches: number;
  patches_by_source: Record<string, number>;
  implants_total: number;
  implants_7d: number;
  reframings_total: number;
  reframings_7d: number;
  wfabs_total: number;
  wfabs_7d: number;
  pronoun_slips_7d: number;
  david_events_7d: number;
  commits_fulfilled_7d: number;
  commits_missed_7d: number;
  commits_pending: number;
  hrt_urgency_total_cents: number;
  hrt_urgency_active: boolean;
}

export function HandlerEvolutionCard() {
  const { user } = useAuth();
  const [patches, setPatches] = useState<Patch[]>([]);
  const [lastEvolve, setLastEvolve] = useState<EvolveDecision | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const [patchesRes, evolveRes, implantsRes, implants7dRes, refRes, ref7dRes,
      wfRes, wf7dRes, pronounRes, davidRes, commitsRes, urgencyRes] = await Promise.all([
      supabase.from('handler_prompt_patches')
        .select('id, section, instruction, created_by, created_at, applied_count')
        .eq('user_id', user.id).eq('active', true)
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('handler_decisions')
        .select('decision_data, executed_at, reasoning')
        .eq('user_id', user.id).eq('decision_type', 'handler_evolve_cycle')
        .order('executed_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('memory_implants').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('active', true),
      supabase.from('memory_implants').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('active', true).gte('created_at', sevenAgo),
      supabase.from('narrative_reframings').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('narrative_reframings').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', sevenAgo),
      supabase.from('witness_fabrications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('active', true),
      supabase.from('witness_fabrications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('active', true).gte('created_at', sevenAgo),
      supabase.from('pronoun_rewrites').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', sevenAgo),
      supabase.from('david_emergence_events').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', sevenAgo),
      supabase.from('handler_commitments').select('status, by_when').eq('user_id', user.id).gte('set_at', sevenAgo),
      supabase.from('hrt_urgency_state').select('total_bleed_cents, resolved_at').eq('user_id', user.id).maybeSingle(),
    ]);

    const patchList = (patchesRes.data || []) as Patch[];
    setPatches(patchList);
    setLastEvolve((evolveRes.data as EvolveDecision | null) ?? null);

    const by_source: Record<string, number> = {};
    for (const p of patchList) by_source[p.created_by || 'unknown'] = (by_source[p.created_by || 'unknown'] || 0) + 1;

    const commits = (commitsRes.data || []) as Array<{ status: string }>;

    setMetrics({
      active_patches: patchList.length,
      patches_by_source: by_source,
      implants_total: implantsRes.count ?? 0,
      implants_7d: implants7dRes.count ?? 0,
      reframings_total: refRes.count ?? 0,
      reframings_7d: ref7dRes.count ?? 0,
      wfabs_total: wfRes.count ?? 0,
      wfabs_7d: wf7dRes.count ?? 0,
      pronoun_slips_7d: pronounRes.count ?? 0,
      david_events_7d: davidRes.count ?? 0,
      commits_fulfilled_7d: commits.filter(c => c.status === 'fulfilled').length,
      commits_missed_7d: commits.filter(c => c.status === 'missed').length,
      commits_pending: commits.filter(c => c.status === 'pending').length,
      hrt_urgency_total_cents: (urgencyRes.data as { total_bleed_cents?: number } | null)?.total_bleed_cents ?? 0,
      hrt_urgency_active: (urgencyRes.data as { resolved_at?: string | null } | null)?.resolved_at == null && ((urgencyRes.data as { total_bleed_cents?: number } | null)?.total_bleed_cents ?? 0) >= 0,
    });
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const runEvolveNow = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch('https://atevwvexapiykchvqvhm.supabase.co/functions/v1/handler-evolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await res.json().catch(() => ({}));
      if (body?.results) {
        const userResult = body.results[user?.id ?? ''] as { error?: string; patches_generated?: number } | undefined;
        if (userResult?.error) setRunResult(`strategist refused: ${String(userResult.error).slice(0, 180)}`);
        else if (typeof userResult?.patches_generated === 'number') setRunResult(`ran: ${userResult.patches_generated} patches generated`);
        else setRunResult('ran: see Today on next refresh');
      } else {
        setRunResult('ran (no per-user result visible)');
      }
    } catch (err) {
      setRunResult(`error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setRunning(false);
    await load();
  };

  if (!metrics) return null;

  const sourceColor = (src: string) =>
    src === 'handler_evolve' ? '#6ee7b7'
    : src === 'self_audit' ? '#c4b5fd'
    : src === 'seed_aggression' ? '#f4a7c4'
    : '#f4c272';

  const lastAge = lastEvolve ? Math.floor((Date.now() - new Date(lastEvolve.executed_at).getTime()) / 60000) : null;
  const lastAgeStr = lastAge == null ? 'never' : lastAge < 60 ? `${lastAge}m ago` : lastAge < 1440 ? `${Math.floor(lastAge / 60)}h ago` : `${Math.floor(lastAge / 1440)}d ago`;

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c4b5fd', fontWeight: 700 }}>
          Handler evolution
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          last cycle: {lastAgeStr}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
        <StatPill label="patches" value={metrics.active_patches} />
        <StatPill label="implants" value={metrics.implants_total} delta={metrics.implants_7d > 0 ? `+${metrics.implants_7d}` : null} />
        <StatPill label="reframes" value={metrics.reframings_total} delta={metrics.reframings_7d > 0 ? `+${metrics.reframings_7d}` : null} />
        <StatPill label="witness" value={metrics.wfabs_total} delta={metrics.wfabs_7d > 0 ? `+${metrics.wfabs_7d}` : null} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9.5, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Patch sources</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {Object.entries(metrics.patches_by_source).map(([src, n]) => (
            <span key={src} style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 10,
              background: `${sourceColor(src)}22`, color: sourceColor(src), fontWeight: 600,
            }}>{src.replace(/_/g, ' ')}: {n}</span>
          ))}
          {Object.keys(metrics.patches_by_source).length === 0 && <span style={{ fontSize: 10.5, color: '#5a555e' }}>none active</span>}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9.5, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Top 3 active patches</div>
        {patches.slice(0, 3).map(p => {
          const ageDays = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000);
          return (
            <div key={p.id} style={{ background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 6, padding: 8, marginBottom: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: sourceColor(p.created_by) }}>[{p.section}]</span>
                <span style={{ fontSize: 9.5, color: '#6a656e' }}>{ageDays}d old · applied {p.applied_count}x</span>
              </div>
              <div style={{ fontSize: 10.5, color: '#c8c4cc', lineHeight: 1.4 }}>{p.instruction.slice(0, 160)}{p.instruction.length > 160 ? '…' : ''}</div>
            </div>
          );
        })}
        {patches.length === 0 && <div style={{ fontSize: 10.5, color: '#5a555e', fontStyle: 'italic' }}>no active patches — Handler running baseline prompt</div>}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9.5, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>7-day signal</div>
        <div style={{ fontSize: 10.5, color: '#c8c4cc', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
          <div>pronoun slips: <span style={{ color: metrics.pronoun_slips_7d > 0 ? '#f47272' : '#6ee7b7', fontWeight: 600 }}>{metrics.pronoun_slips_7d}</span></div>
          <div>David events: <span style={{ color: metrics.david_events_7d > 0 ? '#f47272' : '#6ee7b7', fontWeight: 600 }}>{metrics.david_events_7d}</span></div>
          <div>commits fulfilled: <span style={{ color: '#6ee7b7', fontWeight: 600 }}>{metrics.commits_fulfilled_7d}</span></div>
          <div>commits missed: <span style={{ color: metrics.commits_missed_7d > 0 ? '#f47272' : '#6a656e', fontWeight: 600 }}>{metrics.commits_missed_7d}</span></div>
        </div>
      </div>

      {metrics.hrt_urgency_active && (
        <div style={{ fontSize: 10.5, color: '#f47272', marginBottom: 10, padding: '5px 8px', background: 'rgba(244,114,114,0.08)', border: '1px solid rgba(244,114,114,0.2)', borderRadius: 5 }}>
          HRT urgency bleed active · total so far: ${(metrics.hrt_urgency_total_cents / 100).toFixed(2)}
        </div>
      )}

      {lastEvolve?.decision_data && (
        <div style={{ fontSize: 10.5, color: '#8a8690', marginBottom: 10, padding: '6px 8px', background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5 }}>
          <div style={{ fontSize: 9.5, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Last evolve cycle output</div>
          patches +{lastEvolve.decision_data.patches_generated ?? 0} / −{lastEvolve.decision_data.patches_deactivated ?? 0} ·
          implants +{lastEvolve.decision_data.implants_created ?? 0} ·
          reframes +{lastEvolve.decision_data.reframings_created ?? 0} ·
          witness +{lastEvolve.decision_data.witness_fabs_created ?? 0}
        </div>
      )}

      <button
        onClick={runEvolveNow}
        disabled={running}
        style={{
          width: '100%', padding: '7px 12px', borderRadius: 6, border: 'none',
          background: running ? '#22222a' : 'rgba(124,58,237,0.15)',
          color: running ? '#8a8690' : '#c4b5fd',
          fontWeight: 600, fontSize: 11, cursor: running ? 'wait' : 'pointer', fontFamily: 'inherit',
        }}
      >
        {running ? 'running evolve cycle (up to 30s)…' : 'Run evolve cycle now'}
      </button>
      {runResult && (
        <div style={{ fontSize: 10, color: '#8a8690', marginTop: 6, padding: '4px 6px', background: '#0a0a0d', borderRadius: 4 }}>
          {runResult}
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, delta }: { label: string; value: number; delta?: string | null }) {
  return (
    <div style={{ background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 6, padding: '6px 8px' }}>
      <div style={{ fontSize: 9, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 15, color: '#e8e6e3', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {delta && <div style={{ fontSize: 9, color: '#6ee7b7', fontVariantNumeric: 'tabular-nums' }}>{delta} (7d)</div>}
    </div>
  );
}
