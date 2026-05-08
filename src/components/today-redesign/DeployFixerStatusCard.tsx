/**
 * DeployFixerStatusCard — operator-facing surface for the autonomous
 * deploy-fixer subsystem.
 *
 * What you see:
 *   - Open deploy_health_log rows (severity-bucketed)
 *   - Most recent deploy-fixer action (auto-merged / PR opened / no match / etc.)
 *   - Pending operator-action count: deploy-fixer escalations in last 24h
 *   - Whether an auto-rollback PR is currently open
 *
 * What the card does NOT need:
 *   - The last green Vercel SHA — that's behind a token. The card derives
 *     "healthy = no open critical/high rows" from what it can read.
 *
 * Data sources (all owner-RLS, no token needed):
 *   - deploy_health_log         (migration 240, owner SELECT)
 *   - deploy_fixer_attempts     (migration 314, owner SELECT)
 *   - autonomous_escalation_log (migration 243, owner SELECT)
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface FixerSnapshot {
  openFailures: { critical: number; high: number; total: number };
  attempts24h: {
    auto_merged: number;
    pr_opened: number;
    no_match: number;
    forbidden_path: number;
    failed: number;
    rollback_pr_opened: number;
    loop_guard_stopped: number;
  };
  pendingOperatorActions: number;       // escalations in last 24h
  rollbackOpen: boolean;
  lastAction: { outcome: string; at: string; summary: string | null } | null;
}

const EMPTY: FixerSnapshot = {
  openFailures: { critical: 0, high: 0, total: 0 },
  attempts24h: {
    auto_merged: 0, pr_opened: 0, no_match: 0,
    forbidden_path: 0, failed: 0, rollback_pr_opened: 0, loop_guard_stopped: 0,
  },
  pendingOperatorActions: 0,
  rollbackOpen: false,
  lastAction: null,
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

const OUTCOME_LABEL: Record<string, string> = {
  auto_merged: 'auto-merged',
  pr_opened: 'PR opened',
  no_match: 'no pattern match',
  forbidden_path: 'refused (forbidden path)',
  failed: 'failed',
  rollback_pr_opened: 'rollback PR opened',
  loop_guard_stopped: 'loop guard stopped',
};

const OUTCOME_TONE: Record<string, string> = {
  auto_merged: '#86efac',           // green — actually fixed
  pr_opened: '#fbbf24',              // amber — needs review
  no_match: '#a8a3ad',               // grey — escalated
  forbidden_path: '#a8a3ad',
  failed: '#f87171',                 // red
  rollback_pr_opened: '#fb7185',     // rose — critical
  loop_guard_stopped: '#f87171',
};

export function DeployFixerStatusCard() {
  const { user } = useAuth();
  const [snap, setSnap] = useState<FixerSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    try {
      const [openRes, attemptsRes, escRes, rollbackRes] = await Promise.all([
        supabase.from('deploy_health_log').select('severity')
          .eq('user_id', user.id).eq('status', 'open').limit(100),
        supabase.from('deploy_fixer_attempts').select('outcome, fix_diff_summary, created_at')
          .gte('created_at', since24h)
          .order('created_at', { ascending: false })
          .limit(60),
        supabase.from('autonomous_escalation_log').select('id')
          .eq('engine', 'deploy_fixer').eq('action', 'escalated')
          .gte('occurred_at', since24h).limit(50),
        // rollback_pr_opened in last 7d, not yet superseded
        supabase.from('deploy_fixer_attempts').select('id, created_at')
          .eq('outcome', 'rollback_pr_opened')
          .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      const openRows = (openRes.data ?? []) as Array<{ severity: string }>;
      const openBuckets = { critical: 0, high: 0, total: 0 };
      for (const r of openRows) {
        openBuckets.total++;
        if (r.severity === 'critical') openBuckets.critical++;
        else if (r.severity === 'high') openBuckets.high++;
      }

      const attempts = (attemptsRes.data ?? []) as Array<{ outcome: string; fix_diff_summary: string | null; created_at: string }>;
      const counts = { auto_merged: 0, pr_opened: 0, no_match: 0, forbidden_path: 0, failed: 0, rollback_pr_opened: 0, loop_guard_stopped: 0 };
      for (const a of attempts) {
        if (a.outcome in counts) counts[a.outcome as keyof typeof counts]++;
      }
      const lastAction = attempts.length > 0
        ? { outcome: attempts[0].outcome, at: attempts[0].created_at, summary: attempts[0].fix_diff_summary }
        : null;

      setSnap({
        openFailures: openBuckets,
        attempts24h: counts,
        pendingOperatorActions: (escRes.data ?? []).length,
        rollbackOpen: (rollbackRes.data ?? []).length > 0,
        lastAction,
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  // Refresh every 5 minutes — same cadence as ProtocolHealthCard.
  useEffect(() => { const t = setInterval(load, 5 * 60_000); return () => clearInterval(t); }, [load]);

  const totalUrgent = snap.openFailures.critical + snap.openFailures.high + snap.pendingOperatorActions + (snap.rollbackOpen ? 1 : 0);

  const tone = snap.rollbackOpen
    ? { bg: 'linear-gradient(135deg, #2a0a0f 0%, #1f0510 100%)', border: '#a8273a', accent: '#fb7185', label: 'ROLLBACK PR OPEN' }
    : totalUrgent === 0
      ? { bg: 'linear-gradient(135deg, #0a1a14 0%, #051a10 100%)', border: '#3a5a3f', accent: '#86efac', label: 'CLEAN' }
      : totalUrgent < 3
        ? { bg: 'linear-gradient(135deg, #1a1f0a 0%, #15180a 100%)', border: '#7a8a3f', accent: '#a3e635', label: 'WATCH' }
        : { bg: 'linear-gradient(135deg, #2a1f0a 0%, #1f1608 100%)', border: '#a87a1f', accent: '#fbbf24', label: 'ATTEND' };

  if (loading && snap.lastAction === null && snap.openFailures.total === 0) {
    return (
      <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 12, marginBottom: 16, color: '#8a8690', fontSize: 11 }}>
        Reading deploy-fixer status…
      </div>
    );
  }

  return (
    <div style={{
      background: tone.bg, border: `1px solid ${tone.border}`,
      borderLeft: `3px solid ${tone.border}`, borderRadius: 10,
      padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 9.5, color: tone.accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          DEPLOY FIXER · {tone.label}
        </span>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #2d1a4d', borderRadius: 5, color: '#c4b5fd', fontSize: 10.5, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
        >
          {expanded ? '▾ collapse' : '▸ details'}
        </button>
      </div>

      {!expanded ? (
        <div style={{ fontSize: 11, color: '#a8a3ad', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {snap.rollbackOpen && (
            <span style={{ color: '#fb7185', fontWeight: 600 }}>
              auto-rollback PR is open — review before closing the window
            </span>
          )}
          {snap.openFailures.total === 0 && !snap.rollbackOpen
            ? <span>No open deploy failures. Auto-fixer recorded {snap.attempts24h.auto_merged} merges in the last 24h.</span>
            : <span>
                {snap.openFailures.critical + snap.openFailures.high} urgent open failure{(snap.openFailures.critical + snap.openFailures.high) === 1 ? '' : 's'}
                {snap.pendingOperatorActions > 0 && ` · ${snap.pendingOperatorActions} pending operator review`}
                {snap.attempts24h.auto_merged > 0 && ` · ${snap.attempts24h.auto_merged} auto-merged today`}
              </span>}
          {snap.lastAction && (
            <span style={{ color: '#6a656e', fontSize: 10 }}>
              last action: <span style={{ color: OUTCOME_TONE[snap.lastAction.outcome] ?? '#a8a3ad' }}>{OUTCOME_LABEL[snap.lastAction.outcome] ?? snap.lastAction.outcome}</span> · {relTime(snap.lastAction.at)}
            </span>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#a8a3ad' }}>
          <Row label="Open deploy failures" c={snap.openFailures.critical} h={snap.openFailures.high} t={snap.openFailures.total} />
          <Row label="Auto-merged 24h" c={0} h={snap.attempts24h.auto_merged} t={snap.attempts24h.auto_merged} hint="green = fix shipped" />
          <Row label="PRs awaiting review" c={0} h={snap.attempts24h.pr_opened} t={snap.attempts24h.pr_opened + snap.attempts24h.rollback_pr_opened} hint={snap.rollbackOpen ? 'incl. rollback PR' : ''} />
          <Row label="Operator escalations 24h" c={0} h={snap.pendingOperatorActions} t={snap.pendingOperatorActions} />
          <Row label="No-match / refused" c={0} h={0} t={snap.attempts24h.no_match + snap.attempts24h.forbidden_path} hint="needs new pattern" />
          <Row label="Failed / loop-guard" c={snap.attempts24h.loop_guard_stopped} h={snap.attempts24h.failed} t={snap.attempts24h.failed + snap.attempts24h.loop_guard_stopped} />
          {snap.lastAction && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #15151b', fontSize: 10.5, color: '#8a8690' }}>
              <strong style={{ color: OUTCOME_TONE[snap.lastAction.outcome] ?? '#c4b5fd' }}>last action: {OUTCOME_LABEL[snap.lastAction.outcome] ?? snap.lastAction.outcome}</strong>
              <div style={{ color: '#6a656e', fontStyle: 'italic', marginTop: 2 }}>
                {snap.lastAction.summary ?? '(no diff summary)'} · {relTime(snap.lastAction.at)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, c, h, t, hint }: { label: string; c: number; h: number; t: number; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #15151b' }}>
      <span style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 600, flex: '0 0 170px' }}>{label}</span>
      {c > 0 && <span style={{ fontSize: 10, color: '#fff', background: '#c4272d', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{c} crit</span>}
      {h > 0 && <span style={{ fontSize: 10, color: '#fff', background: '#a87a1f', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{h}</span>}
      {t === 0 && <span style={{ fontSize: 10.5, color: '#5a5560', fontStyle: 'italic' }}>none</span>}
      {t > c + h && <span style={{ fontSize: 10, color: '#8a8690' }}>+{t - c - h} more</span>}
      {hint && <span style={{ fontSize: 10, color: '#6a656e', marginLeft: 'auto', fontStyle: 'italic' }}>{hint}</span>}
    </div>
  );
}
