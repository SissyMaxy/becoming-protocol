/**
 * SystemGrowthCard — Mommy growth-loop dashboard surface.
 *
 * Reads from the three growth-loop tables (capability_gaps,
 * intervention_rate_snapshots, pattern_library_proposals) and the latest
 * meta_self_review row from mommy_ideation_log. Operator-facing — plain
 * English, not Mommy voice. The point is to make the growth loop
 * legible: is mommy_pct trending the right direction? Are gaps closing?
 *
 * Belongs in the Strategy & Briefings collapsible group on Today.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface RateSnap {
  snapshot_date: string;
  mommy_pct: number | null;
  total_resolutions: number;
  mommy_resolutions: number;
  operator_resolutions: number;
  investigation_flagged: boolean;
  investigation_reason: string | null;
}

interface Gap {
  id: string;
  category: string;
  description: string;
  signal_count: number;
  last_signal_at: string;
  forbidden: boolean;
  wish_id: string | null;
}

interface Proposal {
  id: string;
  pattern_signature: string;
  match_count: number;
  outcome: string;
  pr_url: string | null;
  proposed_at: string;
}

interface SelfReview {
  id: string;
  created_at: string;
  judged: string | null;
}

interface Snapshot {
  rateHistory: RateSnap[];
  todayPct: number | null;
  thirtyDayMean: number | null;
  trendDirection: 'up' | 'down' | 'flat' | 'unknown';
  topGaps: Gap[];
  proposalsAwaitingReview: Proposal[];
  lastSelfReview: SelfReview | null;
  investigationAlert: { reason: string; date: string } | null;
}

const EMPTY: Snapshot = {
  rateHistory: [],
  todayPct: null,
  thirtyDayMean: null,
  trendDirection: 'unknown',
  topGaps: [],
  proposalsAwaitingReview: [],
  lastSelfReview: null,
  investigationAlert: null,
};

export function SystemGrowthCard() {
  const { user } = useAuth();
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const since30d = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

      const [rateRes, gapsRes, propRes, reviewRes] = await Promise.all([
        supabase
          .from('intervention_rate_snapshots')
          .select('snapshot_date, mommy_pct, total_resolutions, mommy_resolutions, operator_resolutions, investigation_flagged, investigation_reason')
          .eq('user_id', user.id)
          .gte('snapshot_date', since30d)
          .order('snapshot_date', { ascending: true })
          .limit(40),
        supabase
          .from('capability_gaps')
          .select('id, category, description, signal_count, last_signal_at, forbidden, wish_id')
          .eq('user_id', user.id)
          .is('closed_at', null)
          .order('signal_count', { ascending: false })
          .limit(5),
        supabase
          .from('pattern_library_proposals')
          .select('id, pattern_signature, match_count, outcome, pr_url, proposed_at')
          .eq('user_id', user.id)
          .in('outcome', ['proposed', 'monitoring', 'pr_opened'])
          .order('match_count', { ascending: false })
          .limit(5),
        supabase
          .from('mommy_ideation_log')
          .select('id, created_at, judged, context_snapshot')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const rateHistory = (rateRes.data ?? []) as RateSnap[];
      const todayPct = rateHistory.length > 0 ? rateHistory[rateHistory.length - 1].mommy_pct : null;
      const validPcts = rateHistory.map((r) => r.mommy_pct).filter((p): p is number => p !== null);
      const thirtyDayMean = validPcts.length > 0
        ? Number((validPcts.reduce((a, b) => a + b, 0) / validPcts.length).toFixed(1))
        : null;

      let trendDirection: Snapshot['trendDirection'] = 'unknown';
      if (validPcts.length >= 5) {
        const half = Math.floor(validPcts.length / 2);
        const earlier = validPcts.slice(0, half);
        const later = validPcts.slice(half);
        const eMean = earlier.reduce((a, b) => a + b, 0) / earlier.length;
        const lMean = later.reduce((a, b) => a + b, 0) / later.length;
        if (lMean - eMean > 3) trendDirection = 'up';
        else if (eMean - lMean > 3) trendDirection = 'down';
        else trendDirection = 'flat';
      }

      // Investigation alert: last row with investigation_flagged true
      const flaggedRow = [...rateHistory].reverse().find((r) => r.investigation_flagged);
      const investigationAlert = flaggedRow && flaggedRow.investigation_reason
        ? { reason: flaggedRow.investigation_reason, date: flaggedRow.snapshot_date }
        : null;

      // Filter ideation log for meta_self_review
      type IdeationRow = { id: string; created_at: string; judged: string | null; context_snapshot: { meta_self_review?: boolean } | null };
      const reviewRows = (reviewRes.data ?? []) as IdeationRow[];
      const lastSelfReview = reviewRows.find((r) => r.context_snapshot?.meta_self_review === true) ?? null;

      setSnap({
        rateHistory,
        todayPct,
        thirtyDayMean,
        trendDirection,
        topGaps: (gapsRes.data ?? []) as Gap[],
        proposalsAwaitingReview: (propRes.data ?? []) as Proposal[],
        lastSelfReview: lastSelfReview ? { id: lastSelfReview.id, created_at: lastSelfReview.created_at, judged: lastSelfReview.judged } : null,
        investigationAlert,
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 10 * 60_000); return () => clearInterval(t); }, [load]);

  if (loading && snap.rateHistory.length === 0) {
    return (
      <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 12, marginBottom: 16, color: '#8a8690', fontSize: 11 }}>
        Reading growth-loop telemetry…
      </div>
    );
  }

  // Tone driven by trend + investigation flag
  const tone = snap.investigationAlert
    ? { bg: 'linear-gradient(135deg, #2a1f0a 0%, #1f0a0a 100%)', border: '#a87a1f', accent: '#fbbf24', label: 'INVESTIGATE' }
    : snap.trendDirection === 'up'
      ? { bg: 'linear-gradient(135deg, #0a1a14 0%, #051a10 100%)', border: '#3a5a3f', accent: '#86efac', label: 'GROWING' }
      : snap.trendDirection === 'down'
        ? { bg: 'linear-gradient(135deg, #1f0a14 0%, #1a0a14 100%)', border: '#7a3f5a', accent: '#f87171', label: 'REGRESSING' }
        : { bg: 'linear-gradient(135deg, #0a141a 0%, #0a101a 100%)', border: '#3f5a7a', accent: '#93c5fd', label: 'STEADY' };

  const trendArrow = snap.trendDirection === 'up' ? '↑' : snap.trendDirection === 'down' ? '↓' : snap.trendDirection === 'flat' ? '→' : '·';

  // Mini sparkline of mommy_pct (30 days). 60×16 bars.
  const sparkValues = snap.rateHistory.map((r) => r.mommy_pct ?? 0);
  const sparkMax = sparkValues.length > 0 ? Math.max(100, ...sparkValues) : 100;

  const formatGap = (g: Gap) => {
    const flag = g.forbidden ? ' [FORBIDDEN]' : g.wish_id ? ' [wish queued]' : '';
    return `[×${g.signal_count}] ${g.description.slice(0, 90)}${flag}`;
  };

  return (
    <div style={{
      background: tone.bg, border: `1px solid ${tone.border}`,
      borderLeft: `3px solid ${tone.border}`, borderRadius: 10,
      padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 9.5, color: tone.accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          GROWTH LOOP · {tone.label}
        </span>
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #2d1a4d', borderRadius: 5, color: '#c4b5fd', fontSize: 10.5, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
        >
          {expanded ? '▾ collapse' : '▸ details'}
        </button>
      </div>

      {snap.investigationAlert && (
        <div style={{ background: '#2a1f0a', border: '1px solid #a87a1f', borderRadius: 6, padding: 8, marginBottom: 8, fontSize: 10.5, color: '#fbbf24' }}>
          ⚠ Investigation flagged ({snap.investigationAlert.date}): {snap.investigationAlert.reason}
        </div>
      )}

      {!expanded ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: '#a8a3ad', alignItems: 'center' }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>
            {snap.todayPct !== null ? `${snap.todayPct.toFixed(0)}%` : '—'}
          </span>
          <span style={{ color: tone.accent }}>{trendArrow} mommy</span>
          <span style={{ color: '#6a656e' }}>·</span>
          <span>{snap.topGaps.length} open gaps</span>
          <span style={{ color: '#6a656e' }}>·</span>
          <span>{snap.proposalsAwaitingReview.length} proposals</span>
        </div>
      ) : (
        <div>
          {/* Rate panel */}
          <div style={{ padding: '6px 0', borderBottom: '1px solid #15151b' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 600 }}>Mommy intervention rate (30d)</span>
              <span style={{ fontSize: 22, color: '#fff', fontWeight: 700 }}>
                {snap.todayPct !== null ? `${snap.todayPct.toFixed(0)}%` : '—'}
              </span>
              <span style={{ fontSize: 11, color: tone.accent }}>{trendArrow} {snap.trendDirection}</span>
              <span style={{ fontSize: 10, color: '#6a656e', marginLeft: 'auto' }}>
                30d mean {snap.thirtyDayMean !== null ? `${snap.thirtyDayMean}%` : '—'}
              </span>
            </div>
            {sparkValues.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 18 }}>
                {sparkValues.map((v, i) => (
                  <div
                    key={i}
                    title={`${snap.rateHistory[i].snapshot_date}: ${v.toFixed(0)}%`}
                    style={{
                      width: 4,
                      height: `${Math.max(2, (v / sparkMax) * 18)}px`,
                      background: tone.accent,
                      opacity: 0.6,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Top open gaps */}
          <div style={{ padding: '6px 0', borderBottom: '1px solid #15151b' }}>
            <div style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 600, marginBottom: 4 }}>
              Top open capability gaps ({snap.topGaps.length})
            </div>
            {snap.topGaps.length === 0 ? (
              <div style={{ fontSize: 10.5, color: '#5a5560', fontStyle: 'italic' }}>no open gaps</div>
            ) : (
              snap.topGaps.map((g) => (
                <div key={g.id} style={{ fontSize: 10.5, color: '#a8a3ad', padding: '2px 0' }}>
                  {formatGap(g)}
                </div>
              ))
            )}
          </div>

          {/* Pattern proposals */}
          <div style={{ padding: '6px 0', borderBottom: '1px solid #15151b' }}>
            <div style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 600, marginBottom: 4 }}>
              Pattern proposals awaiting review ({snap.proposalsAwaitingReview.length})
            </div>
            {snap.proposalsAwaitingReview.length === 0 ? (
              <div style={{ fontSize: 10.5, color: '#5a5560', fontStyle: 'italic' }}>no proposals waiting</div>
            ) : (
              snap.proposalsAwaitingReview.map((p) => (
                <div key={p.id} style={{ fontSize: 10.5, color: '#a8a3ad', padding: '2px 0' }}>
                  [×{p.match_count}] {p.pattern_signature} <span style={{ color: '#5a5560' }}>· {p.outcome}</span>
                  {p.pr_url && (
                    <a href={p.pr_url} target="_blank" rel="noopener noreferrer" style={{ color: tone.accent, marginLeft: 6, fontSize: 10 }}>
                      PR ↗
                    </a>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Last self-review */}
          <div style={{ padding: '6px 0' }}>
            <div style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 600, marginBottom: 4 }}>
              Last self-review
            </div>
            {snap.lastSelfReview ? (
              <div style={{ fontSize: 10.5, color: '#a8a3ad' }}>
                {new Date(snap.lastSelfReview.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                <span style={{ color: '#5a5560' }}> · </span>
                {(snap.lastSelfReview.judged ?? '').slice(0, 200)}…
              </div>
            ) : (
              <div style={{ fontSize: 10.5, color: '#5a5560', fontStyle: 'italic' }}>
                no self-review run yet (Saturday 04:00 UTC)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
