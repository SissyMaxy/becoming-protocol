/**
 * SupabaseHealthCard — Supabase-side observability surface.
 *
 * Companion to ProtocolHealthCard. ProtocolHealthCard rolls up GitHub
 * Actions / Vercel / loophole / audit findings; this card narrows to the
 * sources added in migration 315: pg_cron failures, edge function 4xx and
 * timeouts, postgres health (connections, WAL), and the watcher's own
 * self-check. One number per category, severity-coded.
 *
 * Read-only — taps drill out to the Supabase dashboard.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type Source = 'pg_cron' | 'supabase_edge' | 'postgres' | 'self';

interface Bucket {
  critical: number;
  high: number;
  total: number;
}

interface Snapshot {
  pg_cron: Bucket;
  supabase_edge: Bucket;
  postgres: Bucket;
  self: Bucket;
  latestAt: string | null;
}

const EMPTY_BUCKET: Bucket = { critical: 0, high: 0, total: 0 };
const EMPTY: Snapshot = {
  pg_cron: EMPTY_BUCKET,
  supabase_edge: EMPTY_BUCKET,
  postgres: EMPTY_BUCKET,
  self: EMPTY_BUCKET,
  latestAt: null,
};

const SOURCES: Source[] = ['pg_cron', 'supabase_edge', 'postgres', 'self'];

function bucketFor(rows: Array<{ severity: string; source: string }>, source: Source): Bucket {
  const out: Bucket = { critical: 0, high: 0, total: 0 };
  for (const r of rows) {
    if (r.source !== source) continue;
    out.total++;
    if (r.severity === 'critical') out.critical++;
    else if (r.severity === 'high') out.high++;
  }
  return out;
}

const SOURCE_LABELS: Record<Source, string> = {
  pg_cron: 'pg_cron',
  supabase_edge: 'Edge fns',
  postgres: 'Postgres',
  self: 'Watcher self',
};

const SOURCE_HINTS: Record<Source, string> = {
  pg_cron: 'cron job runs',
  supabase_edge: '4xx · 5xx · timeouts',
  postgres: 'connections · WAL',
  self: 'monitor invocation',
};

export function SupabaseHealthCard() {
  const { user } = useAuth();
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('deploy_health_log')
        .select('severity, source, detected_at')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .in('source', SOURCES)
        .order('detected_at', { ascending: false })
        .limit(200);

      const rows = (data ?? []) as Array<{ severity: string; source: string; detected_at: string }>;
      const latest = rows.length > 0 ? rows[0].detected_at : null;

      setSnap({
        pg_cron: bucketFor(rows, 'pg_cron'),
        supabase_edge: bucketFor(rows, 'supabase_edge'),
        postgres: bucketFor(rows, 'postgres'),
        self: bucketFor(rows, 'self'),
        latestAt: latest,
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 5 * 60_000); return () => clearInterval(t); }, [load]);

  const totalCritical = SOURCES.reduce((acc, s) => acc + snap[s].critical, 0);
  const totalHigh = SOURCES.reduce((acc, s) => acc + snap[s].high, 0);
  const totalUrgent = totalCritical + totalHigh;
  const grandTotal = SOURCES.reduce((acc, s) => acc + snap[s].total, 0);

  const tone = totalCritical > 0
    ? { bg: 'linear-gradient(135deg, #2a0a14 0%, #1a0510 100%)', border: '#a8273f', accent: '#fda4af', label: 'CRITICAL' }
    : totalHigh > 0
      ? { bg: 'linear-gradient(135deg, #2a1f0a 0%, #1f1608 100%)', border: '#a87a1f', accent: '#fbbf24', label: 'ATTEND' }
      : grandTotal > 0
        ? { bg: 'linear-gradient(135deg, #1a1f0a 0%, #15180a 100%)', border: '#7a8a3f', accent: '#a3e635', label: 'WATCH' }
        : { bg: 'linear-gradient(135deg, #0a1a14 0%, #051a10 100%)', border: '#3a5a3f', accent: '#86efac', label: 'CLEAN' };

  if (loading && snap.latestAt === null && grandTotal === 0) {
    return (
      <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 12, marginBottom: 16, color: '#8a8690', fontSize: 11 }}>
        Reading Supabase health…
      </div>
    );
  }

  const Row = ({ source }: { source: Source }) => {
    const b = snap[source];
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #15151b' }}>
        <span style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 600, flex: '0 0 110px' }}>{SOURCE_LABELS[source]}</span>
        {b.critical > 0 && <span style={{ fontSize: 10, color: '#fff', background: '#c4272d', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{b.critical} crit</span>}
        {b.high > 0 && <span style={{ fontSize: 10, color: '#fff', background: '#a87a1f', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{b.high} high</span>}
        {b.total === 0 && <span style={{ fontSize: 10.5, color: '#5a5560', fontStyle: 'italic' }}>clean</span>}
        {b.total > b.critical + b.high && <span style={{ fontSize: 10, color: '#8a8690' }}>+{b.total - b.critical - b.high} more</span>}
        <span style={{ fontSize: 10, color: '#6a656e', marginLeft: 'auto', fontStyle: 'italic' }}>{SOURCE_HINTS[source]}</span>
      </div>
    );
  };

  return (
    <div style={{
      background: tone.bg, border: `1px solid ${tone.border}`,
      borderLeft: `3px solid ${tone.border}`, borderRadius: 10,
      padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 9.5, color: tone.accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          SUPABASE HEALTH · {tone.label}
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
          {grandTotal === 0
            ? <span>pg_cron, edge fns, postgres, self-check all clean.</span>
            : <span>{totalUrgent > 0 ? `${totalUrgent} urgent ` : ''}across {SOURCES.filter(s => snap[s].total > 0).map(s => SOURCE_LABELS[s]).join(' · ')}. Tap details.</span>}
        </div>
      ) : (
        <div>
          {SOURCES.map(s => <Row key={s} source={s} />)}
          {snap.latestAt && (
            <div style={{ fontSize: 10, color: '#5a5560', marginTop: 8, fontStyle: 'italic' }}>
              latest: {new Date(snap.latestAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
