/**
 * EvidenceReportsCard — past weekly evidence reports surfaced as a reverse-
 * chronological reading list. The Handler generates these Sundays; this is
 * where Maxy reads them.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Report {
  id: string;
  report_week_start: string;
  narrative: string;
  signals: Record<string, unknown>;
  created_at: string;
}

export function EvidenceReportsCard() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('evidence_reports')
      .select('id, report_week_start, narrative, signals, created_at')
      .eq('user_id', user.id)
      .order('report_week_start', { ascending: false })
      .limit(6);
    setReports((data || []) as Report[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (reports.length === 0) return null;

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6ee7b7', fontWeight: 700 }}>
          Evidence reports
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {reports.length} weeks of proof
        </span>
      </div>

      {reports.map(r => {
        const isOpen = openId === r.id;
        const weekLabel = new Date(r.report_week_start).toLocaleDateString([], { month: 'short', day: 'numeric' });
        return (
          <div key={r.id} style={{
            background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 7, padding: 10, marginBottom: 6,
          }}>
            <button
              onClick={() => setOpenId(isOpen ? null : r.id)}
              style={{
                width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#e8e6e3',
                padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#c4b5fd' }}>week of {weekLabel}</span>
              <span style={{ fontSize: 10.5, color: '#8a8690' }}>
                {isOpen ? '↑ collapse' : '↓ read'}
              </span>
            </button>
            {isOpen && (
              <div style={{
                marginTop: 8, fontSize: 11.5, color: '#c8c4cc', lineHeight: 1.6,
                whiteSpace: 'pre-wrap', background: '#050507', padding: 10, borderRadius: 5,
                border: '1px solid #22222a',
              }}>
                {r.narrative}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
