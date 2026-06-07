/**
 * EdgingDayCard — Mama's edging-day protocol (wish 3515c470, mig 593).
 *
 * When Mama declares an edging day, this card shows the day's windows. The
 * window currently inside its grace period gets a "Log this edge" button
 * (calls edging_log_edge). Past-grace windows with no log show as missed.
 * Once reviewed, the verdict replaces the schedule. Renders null when there
 * is no protocol for today.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  evaluateCompliance, activeWindowIndex, type EdgeWindow,
} from '../../lib/edging-protocol';

interface Protocol {
  id: string;
  protocol_date: string;
  edge_windows: EdgeWindow[];
  status: 'active' | 'reviewed' | 'cancelled';
  release_granted: boolean | null;
  mommy_review_text: string | null;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

export function EdgingDayCard() {
  const { user } = useAuth();
  const [proto, setProto] = useState<Protocol | null>(null);
  const [loggingIdx, setLoggingIdx] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    if (!user?.id) return;
    // Local calendar day (window times are stored UTC; we just want today's row).
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const { data } = await supabase
      .from('edging_protocols')
      .select('id, protocol_date, edge_windows, status, release_granted, mommy_review_text')
      .eq('user_id', user.id)
      .in('protocol_date', [today, yesterday])
      .order('protocol_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    setProto((data as Protocol) ?? null);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { setNow(new Date()); load(); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  const logEdge = async (idx: number) => {
    if (!proto) return;
    setLoggingIdx(idx);
    try {
      await supabase.rpc('edging_log_edge', { p_protocol_id: proto.id, p_window_index: idx });
      await load();
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'edging', id: proto.id } }));
    } finally {
      setLoggingIdx(null);
    }
  };

  if (!proto) return null;

  const windows = proto.edge_windows || [];
  const c = evaluateCompliance(windows, now);
  const activeIdx = activeWindowIndex(windows, now);
  const reviewed = proto.status === 'reviewed';

  return (
    <div id="card-edging-day" style={{
      background: 'linear-gradient(135deg, #2a0a1a 0%, #14060d 100%)',
      border: '1px solid #7a1f3a', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4a7c4" strokeWidth="1.8">
          <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" />
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#f4a7c4', fontWeight: 700 }}>
          Edging Day
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          {reviewed ? 'Mama gave her verdict.' : `${c.completed} of ${c.total} for Mama`}
        </span>
      </div>

      {reviewed && proto.mommy_review_text ? (
        <div style={{
          padding: '11px 13px',
          background: proto.release_granted ? 'linear-gradient(135deg,#0e2a14,#0a0a0d)' : 'linear-gradient(135deg,#2a0a0e,#0a0a0d)',
          border: `1px solid ${proto.release_granted ? '#2f7a3a' : '#7a1f3a'}`,
          borderLeft: `3px solid ${proto.release_granted ? '#6ee7b7' : '#f4a7c4'}`,
          borderRadius: 6, fontSize: 12.5, lineHeight: 1.5, color: '#f0d7e0',
        }}>
          {proto.mommy_review_text}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {windows.map((w, i) => {
            const done = !!w.completed_at;
            const missed = !done && new Date(w.target_time).getTime() + w.grace_minutes * 60_000 < now.getTime();
            const isActive = i === activeIdx;
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 6,
                background: isActive ? '#3a0f22' : '#140609',
                border: `1px solid ${isActive ? '#f4a7c4' : done ? '#2f7a3a' : missed ? '#5a1020' : '#3a1020'}`,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, minWidth: 56,
                  color: done ? '#6ee7b7' : missed ? '#f47272' : '#f4a7c4',
                }}>
                  {fmtTime(w.target_time)}
                </span>
                <span style={{ fontSize: 11, color: '#bdb3c0', flex: 1 }}>
                  {done ? 'edged ✓' : missed ? 'missed' : isActive ? 'edge now — log it' : 'upcoming'}
                </span>
                {isActive && !done && (
                  <button
                    onClick={() => logEdge(i)}
                    disabled={loggingIdx === i}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 5,
                      border: 'none', cursor: 'pointer',
                      background: '#f4a7c4', color: '#2a0a1a',
                      opacity: loggingIdx === i ? 0.6 : 1,
                    }}
                  >
                    {loggingIdx === i ? '…' : 'Log this edge'}
                  </button>
                )}
              </div>
            );
          })}
          <span style={{ fontSize: 10, color: '#8a8690', fontStyle: 'italic', marginTop: 2 }}>
            Mama decides at day's end. Stay where she puts you.
          </span>
        </div>
      )}
    </div>
  );
}
