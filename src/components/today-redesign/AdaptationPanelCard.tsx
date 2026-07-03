/**
 * AdaptationPanelCard — operator visibility on the adaptive-loop hypothesis
 * panel (the SAFE slice: propose / rank / record / file-wish, no auto-ship).
 *
 * Reads the SECURITY DEFINER RPC `adaptation_panel_summary` (migration 609)
 * which reads the service-role tables (mommy_adaptation_log, mommy_ux_signal_log,
 * mommy_code_wishes) without weakening their RLS. Surfaces:
 *   - last run + runs/7d, unhandled-signal backlog, pending adaptations
 *   - the 3 most recent proposals (design, scope, needs-review, wish-filed)
 *   - 30d panel_ideation wish-status counts
 *
 * Passive visibility only (press-not-block). Renders null when empty.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface RecentProposal {
  at: string;
  design: string;
  scope: string | null;
  needs_review: boolean;
  wish_filed: boolean;
  outcome: string | null;
}
interface Summary {
  last_run_at: string | null;
  runs_7d: number;
  unhandled_signals: number;
  pending_adaptations: number;
  recent: RecentProposal[];
  wish_counts: Record<string, number>;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3600_000);
  if (hours < 1) return `${Math.floor(ms / 60_000)}m ago`;
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AdaptationPanelCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('adaptation_panel_summary');
      if (!error && data) setSummary(data as Summary);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !summary) return null;
  if (!summary) return null;

  // Nothing has ever run and there's no backlog — stay out of the way.
  if (!summary.last_run_at && summary.unhandled_signals === 0) return null;

  const recent = summary.recent ?? [];
  const counts = summary.wish_counts ?? {};
  const shipped = counts.shipped ?? 0;
  const inProgress = counts.in_progress ?? 0;
  const queued = counts.queued ?? 0;
  const rejected = counts.rejected ?? 0;

  const backlog = summary.unhandled_signals;
  const tone = backlog > 0
    ? { bg: 'linear-gradient(135deg, #1a1a0a 0%, #15150a 100%)', border: '#a8843f', accent: '#fbbf24', label: `${backlog} UNHANDLED` }
    : { bg: 'linear-gradient(135deg, #14101e 0%, #0e0a18 100%)', border: '#7a3fa8', accent: '#edaec5', label: 'PANEL OK' };

  const scopeColor = (s: string | null) =>
    s === 'cross_cutting' ? '#f87171' : s === 'large' ? '#fbbf24' : '#8fd9b0';

  return (
    <div style={{
      background: tone.bg, border: `1px solid ${tone.border}`,
      borderLeft: `3px solid ${tone.border}`, borderRadius: 10,
      padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 9.5, color: tone.accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          ADAPTIVE PANEL · {tone.label}
        </span>
        <span style={{ fontSize: 10, color: '#6d5a63', marginLeft: 'auto' }}>
          last run {timeAgo(summary.last_run_at)} · {summary.runs_7d} runs/7d
        </span>
      </div>

      {recent.length > 0 ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#7a7480', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Recent proposals
          </div>
          {recent.map((r, i) => (
            <div key={i} style={{ fontSize: 11, color: '#edaec5', padding: '3px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ flex: 1 }}>{r.design}</span>
              {r.scope && (
                <span style={{ fontSize: 9, color: scopeColor(r.scope), border: '1px solid #4a2438', padding: '0 4px', borderRadius: 3 }}>
                  {r.scope.replace('_', '-')}
                </span>
              )}
              {r.needs_review && <span title="needs review" style={{ fontSize: 9, color: '#fbbf24' }}>review</span>}
              {r.wish_filed && <span title="wish filed" style={{ fontSize: 9, color: '#8fd9b0' }}>★</span>}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#6d5a63', fontStyle: 'italic', marginBottom: 10 }}>
          No proposals yet{backlog > 0 ? ` — ${backlog} signal${backlog === 1 ? '' : 's'} waiting` : ''}.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, fontSize: 10.5, color: '#a8a3ad', flexWrap: 'wrap', borderTop: '1px solid #1b121a', paddingTop: 8 }}>
        <span>30d wishes (panel→builder):</span>
        {shipped > 0 && <span style={{ color: '#8fd9b0' }}>{shipped} shipped</span>}
        {inProgress > 0 && <span style={{ color: '#fbbf24' }}>{inProgress} in progress</span>}
        {queued > 0 && <span style={{ color: '#edaec5' }}>{queued} queued</span>}
        {rejected > 0 && <span style={{ color: '#7a7480' }}>{rejected} rejected</span>}
        {shipped + inProgress + queued + rejected === 0 && <span style={{ color: '#6d5a63', fontStyle: 'italic' }}>none yet</span>}
        {summary.pending_adaptations > 0 && (
          <span style={{ marginLeft: 'auto', color: '#9c8590' }}>{summary.pending_adaptations} pending outcome</span>
        )}
      </div>
    </div>
  );
}
