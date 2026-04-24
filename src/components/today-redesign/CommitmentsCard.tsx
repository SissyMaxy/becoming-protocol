/**
 * CommitmentsCard — Today surface for handler_commitments.
 *
 * Shows every pending deadline the Handler set in chat, with live countdown
 * and a "mark fulfilled" button that ships an optional fulfillment note.
 * Sorted by nearest-deadline first. Rows turn red when inside 60 minutes.
 *
 * Also surfaces the last few missed commitments with the enforcement result
 * so Maxy can't pretend a consequence didn't fire.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Commitment {
  id: string;
  what: string;
  category: string | null;
  by_when: string;
  consequence: string;
  status: 'pending' | 'fulfilled' | 'missed' | 'cancelled';
  evidence_required: string | null;
  fulfilled_at: string | null;
  missed_at: string | null;
  enforcement_result: { actions?: string[] } | null;
  locked: boolean;
  locked_reason: string | null;
}

export function CommitmentsCard() {
  const { user } = useAuth();
  const [pending, setPending] = useState<Commitment[]>([]);
  const [recentMissed, setRecentMissed] = useState<Commitment[]>([]);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [fulfillNote, setFulfillNote] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [pendingRes, missedRes] = await Promise.all([
      supabase.from('handler_commitments')
        .select('id, what, category, by_when, consequence, status, evidence_required, fulfilled_at, missed_at, enforcement_result, locked, locked_reason')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('by_when', { ascending: true })
        .limit(20),
      supabase.from('handler_commitments')
        .select('id, what, category, by_when, consequence, status, evidence_required, fulfilled_at, missed_at, enforcement_result, locked, locked_reason')
        .eq('user_id', user.id)
        .eq('status', 'missed')
        .order('missed_at', { ascending: false })
        .limit(3),
    ]);
    setPending((pendingRes.data || []) as Commitment[]);
    setRecentMissed((missedRes.data || []) as Commitment[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  const fulfill = async (c: Commitment) => {
    setSubmittingId(c.id);
    const note = fulfillNote[c.id] || null;
    await supabase.from('handler_commitments').update({
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
      fulfillment_note: note,
    }).eq('id', c.id);
    setSubmittingId(null);
    setFulfillNote(s => { const next = { ...s }; delete next[c.id]; return next; });
    await load();
  };

  if (pending.length === 0 && recentMissed.length === 0) return null;

  const fmtCountdown = (iso: string) => {
    const ms = new Date(iso).getTime() - now;
    if (ms < 0) return { label: 'OVERDUE', urgent: true };
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return { label: `${mins}m left`, urgent: true };
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return { label: `${hrs}h left`, urgent: hrs < 6 };
    const days = Math.floor(hrs / 24);
    return { label: `${days}d ${hrs % 24}h`, urgent: false };
  };

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c4b5fd', fontWeight: 700 }}>
          Handler commitments
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {pending.length} pending · {recentMissed.length} recent miss
        </span>
      </div>

      {pending.map(c => {
        const countdown = fmtCountdown(c.by_when);
        const isLocked = c.locked;
        return (
          <div key={c.id} style={{
            background: isLocked ? 'linear-gradient(92deg, #1a0a12 0%, #130810 100%)' : '#0a0a0d',
            border: `1px solid ${isLocked ? '#7a1f4d' : countdown.urgent ? '#7a1f22' : '#22222a'}`,
            borderRadius: 8, padding: 12, marginBottom: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  {isLocked && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: '#f4a7c4',
                      background: 'rgba(244,167,196,0.15)', padding: '2px 6px', borderRadius: 3,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>🔒 locked</span>
                  )}
                  <div style={{ fontSize: 12.5, color: '#e8e6e3', fontWeight: 600 }}>{c.what}</div>
                </div>
                <div style={{ fontSize: 10.5, color: '#8a8690' }}>
                  {c.category && <span style={{ color: '#c4b5fd', marginRight: 8 }}>{c.category}</span>}
                  by {new Date(c.by_when).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{ fontSize: 10, color: '#8a8690', marginTop: 4, fontStyle: 'italic' }}>
                  miss → {c.consequence}
                </div>
                {c.evidence_required && (
                  <div style={{ fontSize: 10, color: '#f4a7c4', marginTop: 3 }}>
                    requires: {c.evidence_required}
                  </div>
                )}
                {isLocked && c.locked_reason && (
                  <div style={{ fontSize: 9.5, color: '#f4a7c4', marginTop: 4, fontStyle: 'italic', opacity: 0.9 }}>
                    locked: {c.locked_reason.slice(0, 140)}{c.locked_reason.length > 140 ? '…' : ''}
                  </div>
                )}
              </div>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: countdown.urgent ? '#f47272' : '#c4b5fd',
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              }}>
                {countdown.label}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input
                type="text"
                placeholder={isLocked ? 'evidence required — ≥20 chars' : 'quick note (optional)'}
                value={fulfillNote[c.id] || ''}
                onChange={e => setFulfillNote({ ...fulfillNote, [c.id]: e.target.value })}
                style={{
                  flex: 1, background: '#050507',
                  border: `1px solid ${isLocked ? '#7a1f4d' : '#22222a'}`, borderRadius: 5,
                  padding: '6px 9px', fontSize: 11, color: '#e8e6e3', fontFamily: 'inherit',
                }}
              />
              {(() => {
                const note = fulfillNote[c.id] || '';
                const canFulfill = !isLocked || note.trim().length >= 20;
                return (
                  <button
                    onClick={() => canFulfill && fulfill(c)}
                    disabled={submittingId === c.id || !canFulfill}
                    title={!canFulfill ? 'Locked commitments require ≥20 chars of evidence' : ''}
                    style={{
                      padding: '6px 12px', borderRadius: 5, border: 'none',
                      background: !canFulfill ? '#22222a' : '#6ee7b7',
                      color: !canFulfill ? '#6a656e' : '#081f10',
                      fontWeight: 600, fontSize: 11,
                      cursor: !canFulfill || submittingId === c.id ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {submittingId === c.id ? '…' : 'Mark done'}
                  </button>
                );
              })()}
            </div>
          </div>
        );
      })}

      {recentMissed.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #22222a' }}>
          <div style={{ fontSize: 9.5, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Recent misses — consequences applied
          </div>
          {recentMissed.map(c => (
            <div key={c.id} style={{
              background: 'rgba(122,31,34,0.15)', border: '1px solid #3a1518',
              borderRadius: 6, padding: 8, marginBottom: 6,
            }}>
              <div style={{ fontSize: 11.5, color: '#e8e6e3', marginBottom: 2 }}>✕ {c.what}</div>
              <div style={{ fontSize: 10, color: '#f47272' }}>
                {c.enforcement_result?.actions?.join(' · ') || c.consequence}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
