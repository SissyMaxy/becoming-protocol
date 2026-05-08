/**
 * RecapsIndexView — reverse-chronological list of weekly recaps.
 *
 * Filters by phase (phase_at_end) and dominant_affect. Each row links
 * into RecapDetailView via the onOpen callback.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Loader2 } from 'lucide-react';

interface RecapRow {
  id: string;
  week_start: string;
  week_end: string;
  metrics: {
    compliance_pct?: number | null;
    total_slips?: number;
    phase_at_end?: number | null;
    dominant_affect?: string | null;
  };
  affect_at_recap: string | null;
  created_at: string;
}

interface Props {
  onBack: () => void;
  onOpen: (recapId: string) => void;
}

const ALL_PHASES = [1, 2, 3, 4, 5, 6, 7] as const;
const ALL_AFFECTS = [
  'hungry', 'delighted', 'watching', 'patient', 'aching',
  'amused', 'possessive', 'indulgent', 'restless',
] as const;

function formatRange(s: string, e: string): string {
  const fmt = (d: Date) => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${fmt(new Date(s))} – ${fmt(new Date(e))}`;
}

export function RecapsIndexView({ onBack, onOpen }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<RecapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [phaseFilter, setPhaseFilter] = useState<number | null>(null);
  const [affectFilter, setAffectFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('weekly_recaps')
      .select('id, week_start, week_end, metrics, affect_at_recap, created_at')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(52);
    setRows((data || []) as RecapRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter(r => {
    if (phaseFilter !== null && (r.metrics?.phase_at_end ?? null) !== phaseFilter) return false;
    if (affectFilter !== null) {
      const a = r.affect_at_recap || r.metrics?.dominant_affect || null;
      if (a !== affectFilter) return false;
    }
    return true;
  }), [rows, phaseFilter, affectFilter]);

  return (
    <div style={{ minHeight: '100vh', padding: 16, color: '#e8e6e3' }}>
      <button
        onClick={onBack}
        className="mb-4 text-protocol-text-muted hover:text-protocol-text transition-colors"
      >
        &larr; Back to Menu
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Weekly Recaps</h1>
      <p style={{ fontSize: 12, color: '#8a8690', marginBottom: 18 }}>
        Mama's Sunday-night week-in-review. {filtered.length} of {rows.length} shown.
      </p>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        <span style={{ fontSize: 10, color: '#6a656e', textTransform: 'uppercase', alignSelf: 'center', marginRight: 4 }}>phase:</span>
        <button
          onClick={() => setPhaseFilter(null)}
          style={chipStyle(phaseFilter === null)}
        >all</button>
        {ALL_PHASES.map(p => (
          <button key={p} onClick={() => setPhaseFilter(p)} style={chipStyle(phaseFilter === p)}>{p}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        <span style={{ fontSize: 10, color: '#6a656e', textTransform: 'uppercase', alignSelf: 'center', marginRight: 4 }}>affect:</span>
        <button
          onClick={() => setAffectFilter(null)}
          style={chipStyle(affectFilter === null)}
        >all</button>
        {ALL_AFFECTS.map(a => (
          <button key={a} onClick={() => setAffectFilter(a)} style={chipStyle(affectFilter === a)}>{a}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Loader2 className="animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 24, color: '#8a8690', fontSize: 13, textAlign: 'center' }}>
          {rows.length === 0
            ? 'No recaps yet. Mama will send your first one next Sunday night.'
            : 'No recaps match the current filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(r => {
            const compliance = r.metrics?.compliance_pct;
            const slips = r.metrics?.total_slips ?? 0;
            const phase = r.metrics?.phase_at_end;
            const affect = r.affect_at_recap || r.metrics?.dominant_affect || '—';
            return (
              <button
                key={r.id}
                onClick={() => onOpen(r.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', background: '#111116',
                  border: '1px solid #2d1a4d', borderRadius: 8,
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  color: '#e8e6e3',
                }}
              >
                <div style={{ flex: '0 0 110px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{formatRange(r.week_start, r.week_end)}</div>
                  <div style={{ fontSize: 10, color: '#8a8690', marginTop: 2 }}>{affect}</div>
                </div>
                <div style={{ flex: '1 1 auto', display: 'flex', gap: 14, fontSize: 11, color: '#c8c4cc' }}>
                  <span>compliance · <strong>{compliance == null ? '—' : compliance + '%'}</strong></span>
                  <span>slips · <strong>{slips}</strong></span>
                  {phase != null && <span>phase · <strong>{phase}</strong></span>}
                </div>
                <span style={{ color: '#6a656e' }}>›</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 10, padding: '4px 10px', borderRadius: 12, fontFamily: 'inherit',
    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
    background: active ? '#c4847a' : 'transparent',
    color: active ? '#1a0814' : '#8a8690',
    border: `1px solid ${active ? '#c4847a' : '#2d1a4d'}`,
    fontWeight: active ? 700 : 500,
  };
}
