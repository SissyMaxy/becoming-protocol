/**
 * ProtocolHealthCard — surfaces the meta-layer's health in one place.
 *
 * The Handler runs 12+ autonomous engines that audit the protocol against
 * itself: code audit, UI audit, reply grader, loophole hunter, deploy
 * monitor, memory-implant audit, strategist v2. Until now, all that signal
 * lived only in the database. This card pulls open findings across them
 * so Maxy sees the protocol hardening itself in real time.
 *
 * Counts only — taps drill down to the relevant detail card or external link.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface HealthSnapshot {
  uiFindings: { critical: number; high: number; total: number };
  codeFindings: { critical: number; high: number; total: number };
  loopholes: { critical: number; high: number; total: number };
  deployFailures: { critical: number; high: number; total: number };
  replyGrades24h: { fail: number; borderline: number; pass: number };
  latestAuditAt: string | null;
}

const EMPTY: HealthSnapshot = {
  uiFindings: { critical: 0, high: 0, total: 0 },
  codeFindings: { critical: 0, high: 0, total: 0 },
  loopholes: { critical: 0, high: 0, total: 0 },
  deployFailures: { critical: 0, high: 0, total: 0 },
  replyGrades24h: { fail: 0, borderline: 0, pass: 0 },
  latestAuditAt: null,
};

function buckets(rows: Array<{ severity: string }>): { critical: number; high: number; total: number } {
  const out = { critical: 0, high: 0, total: 0 };
  for (const r of rows) {
    out.total++;
    if (r.severity === 'critical') out.critical++;
    else if (r.severity === 'high') out.high++;
  }
  return out;
}

export function ProtocolHealthCard() {
  const { user } = useAuth();
  const [snap, setSnap] = useState<HealthSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    try {
      const [auditRes, loopRes, deployRes, gradesRes] = await Promise.all([
        supabase.from('handler_audit_findings').select('severity, file_path, created_at')
          .eq('user_id', user.id).eq('status', 'open').limit(120),
        supabase.from('loophole_findings').select('severity').eq('user_id', user.id).eq('status', 'open').limit(50),
        supabase.from('deploy_health_log').select('severity').eq('user_id', user.id).eq('status', 'open').limit(50),
        supabase.from('handler_reply_grades').select('verdict').eq('user_id', user.id).gte('graded_at', since24h).limit(200),
      ]);

      const auditRows = (auditRes.data ?? []) as Array<{ severity: string; file_path: string; created_at: string }>;
      const uiRows = auditRows.filter(r => r.file_path?.startsWith('src/components/today-redesign') || r.file_path === '__today_ui__');
      const codeRows = auditRows.filter(r => !uiRows.includes(r));

      const grades = (gradesRes.data ?? []) as Array<{ verdict: string }>;
      const gradeCounts = { fail: 0, borderline: 0, pass: 0 };
      for (const g of grades) {
        if (g.verdict === 'fail') gradeCounts.fail++;
        else if (g.verdict === 'borderline') gradeCounts.borderline++;
        else if (g.verdict === 'pass') gradeCounts.pass++;
      }

      const latestAudit = auditRows.length > 0
        ? auditRows.map(r => r.created_at).sort().pop() ?? null
        : null;

      setSnap({
        uiFindings: buckets(uiRows),
        codeFindings: buckets(codeRows),
        loopholes: buckets((loopRes.data ?? []) as Array<{ severity: string }>),
        deployFailures: buckets((deployRes.data ?? []) as Array<{ severity: string }>),
        replyGrades24h: gradeCounts,
        latestAuditAt: latestAudit,
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 5 * 60_000); return () => clearInterval(t); }, [load]);

  const totalUrgent =
    snap.uiFindings.critical + snap.uiFindings.high +
    snap.codeFindings.critical + snap.codeFindings.high +
    snap.loopholes.critical + snap.loopholes.high +
    snap.deployFailures.critical + snap.deployFailures.high +
    snap.replyGrades24h.fail;

  const tone = totalUrgent === 0
    ? { bg: 'linear-gradient(135deg, #0a1a14 0%, #051a10 100%)', border: '#3a5a3f', accent: '#86efac', label: 'CLEAN' }
    : totalUrgent < 5
      ? { bg: 'linear-gradient(135deg, #1a1f0a 0%, #15180a 100%)', border: '#7a8a3f', accent: '#a3e635', label: 'WATCH' }
      : { bg: 'linear-gradient(135deg, #2a1f0a 0%, #1f1608 100%)', border: '#a87a1f', accent: '#fbbf24', label: 'ATTEND' };

  if (loading && snap.latestAuditAt === null) {
    return (
      <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 12, marginBottom: 16, color: '#8a8690', fontSize: 11 }}>
        Reading protocol health…
      </div>
    );
  }

  const Row = ({ label, c, h, t, hint }: { label: string; c: number; h: number; t: number; hint?: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #15151b' }}>
      <span style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 600, flex: '0 0 130px' }}>{label}</span>
      {c > 0 && <span style={{ fontSize: 10, color: '#fff', background: '#c4272d', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{c} crit</span>}
      {h > 0 && <span style={{ fontSize: 10, color: '#fff', background: '#a87a1f', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{h} high</span>}
      {t === 0 && <span style={{ fontSize: 10.5, color: '#5a5560', fontStyle: 'italic' }}>clean</span>}
      {t > c + h && <span style={{ fontSize: 10, color: '#8a8690' }}>+{t - c - h} more</span>}
      {hint && <span style={{ fontSize: 10, color: '#6a656e', marginLeft: 'auto', fontStyle: 'italic' }}>{hint}</span>}
    </div>
  );

  return (
    <div style={{
      background: tone.bg, border: `1px solid ${tone.border}`,
      borderLeft: `3px solid ${tone.border}`, borderRadius: 10,
      padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 9.5, color: tone.accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          PROTOCOL HEALTH · {tone.label}
        </span>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #2d1a4d', borderRadius: 5, color: '#c4b5fd', fontSize: 10.5, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
        >
          {expanded ? '▾ collapse' : '▸ details'}
        </button>
      </div>
      {!expanded ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: '#a8a3ad' }}>
          {totalUrgent === 0
            ? <span>{snap.replyGrades24h.pass} replies graded clean (24h). Audit + loophole hunters running.</span>
            : <span>{totalUrgent} urgent across UI/code/loopholes/deploys + {snap.replyGrades24h.fail} reply fails (24h). Tap details.</span>}
        </div>
      ) : (
        <div>
          <Row label="UI audit (Today)" c={snap.uiFindings.critical} h={snap.uiFindings.high} t={snap.uiFindings.total} />
          <Row label="Code audit" c={snap.codeFindings.critical} h={snap.codeFindings.high} t={snap.codeFindings.total} />
          <Row label="Loophole hunter" c={snap.loopholes.critical} h={snap.loopholes.high} t={snap.loopholes.total} />
          <Row label="Deploy failures" c={snap.deployFailures.critical} h={snap.deployFailures.high} t={snap.deployFailures.total} />
          <Row label="Reply grades 24h" c={snap.replyGrades24h.fail} h={snap.replyGrades24h.borderline} t={snap.replyGrades24h.fail + snap.replyGrades24h.borderline + snap.replyGrades24h.pass} hint={`${snap.replyGrades24h.pass} pass`} />
          {snap.latestAuditAt && (
            <div style={{ fontSize: 10, color: '#5a5560', marginTop: 8, fontStyle: 'italic' }}>
              latest audit: {new Date(snap.latestAuditAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
