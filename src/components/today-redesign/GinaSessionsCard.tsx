/**
 * GinaSessionsCard — past captured Gina conversations with transcripts,
 * extracted quotes, reaction readings, digests. Silent if no sessions
 * captured yet.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Session {
  id: string;
  recorded_at: string;
  duration_seconds: number | null;
  status: string;
  digest: string | null;
  extracted_quotes_count: number | null;
  extracted_reactions_count: number | null;
  flagged_triggers: string[] | null;
  flagged_soft_spots: string[] | null;
}

export function GinaSessionsCard() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('gina_session_recordings')
      .select('id, recorded_at, duration_seconds, status, digest, extracted_quotes_count, extracted_reactions_count, flagged_triggers, flagged_soft_spots')
      .eq('user_id', user.id)
      .in('status', ['processed', 'pending_review', 'deciphering', 'failed'])
      .order('recorded_at', { ascending: false })
      .limit(5);
    setSessions((data || []) as Session[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (sessions.length === 0) return null;

  const statusColor = (s: string) =>
    s === 'processed' ? '#6ee7b7' : s === 'pending_review' ? '#f4c272' : s === 'failed' ? '#f47272' : '#c4b5fd';

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4a7c4" strokeWidth="1.8">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f4a7c4', fontWeight: 700 }}>
          Captured Gina sessions
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {sessions.length}
        </span>
      </div>

      {sessions.map(s => {
        const isOpen = openId === s.id;
        const ago = Math.floor((Date.now() - new Date(s.recorded_at).getTime()) / 86400000);
        const dur = s.duration_seconds ? `${Math.floor(s.duration_seconds / 60)}m ${s.duration_seconds % 60}s` : '—';

        return (
          <div key={s.id} style={{
            background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 6,
            padding: '7px 9px', marginBottom: 5,
          }}>
            <button
              onClick={() => setOpenId(isOpen ? null : s.id)}
              style={{
                width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#e8e6e3',
                padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{
                fontSize: 9, fontWeight: 700, color: statusColor(s.status),
                background: `${statusColor(s.status)}22`, padding: '2px 5px', borderRadius: 3,
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>{s.status.replace(/_/g, ' ')}</span>
              <span style={{ fontSize: 10.5, color: '#8a8690' }}>
                {ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago}d ago`} · {dur}
              </span>
              {s.extracted_quotes_count != null && (
                <span style={{ fontSize: 10, color: '#f4a7c4', marginLeft: 'auto' }}>
                  {s.extracted_quotes_count} quotes · {s.extracted_reactions_count ?? 0} reactions
                </span>
              )}
            </button>

            {isOpen && s.digest && (
              <div style={{
                fontSize: 11, color: '#c8c4cc', lineHeight: 1.5, padding: 10, marginTop: 6,
                background: '#050507', border: '1px solid #22222a', borderRadius: 5,
              }}>
                {s.digest}
              </div>
            )}

            {isOpen && ((s.flagged_triggers?.length || 0) > 0 || (s.flagged_soft_spots?.length || 0) > 0) && (
              <div style={{ marginTop: 5, fontSize: 10 }}>
                {s.flagged_soft_spots && s.flagged_soft_spots.length > 0 && (
                  <div style={{ color: '#6ee7b7' }}>+ soft-spots surfaced: {s.flagged_soft_spots.join(', ')}</div>
                )}
                {s.flagged_triggers && s.flagged_triggers.length > 0 && (
                  <div style={{ color: '#f47272' }}>− triggers hit: {s.flagged_triggers.join(', ')}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
