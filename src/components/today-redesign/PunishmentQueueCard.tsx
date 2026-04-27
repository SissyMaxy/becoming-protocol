/**
 * PunishmentQueueCard — surfaces active punishment_queue rows with a
 * concrete "mark complete" path. Without this, Handler-issued
 * punishments stay open forever because there's nowhere to attach
 * proof. Each row accepts an evidence URL (Reddit post link, screenshot
 * URL, etc.) plus optional notes; submission writes status='completed'
 * with completed_at + completion_evidence JSONB.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Punishment {
  id: string;
  punishment_type: string | null;
  severity: number;
  title: string;
  description: string | null;
  status: string;
  due_by: string | null;
  dodge_count: number;
  created_at: string;
}

const SEVERITY_TONE: Record<number, string> = {
  1: '#c4b5fd', 2: '#f4c272', 3: '#f4a7c4', 4: '#f47272', 5: '#c4272d',
};

function fmtDue(due: string | null): { text: string; overdue: boolean } {
  if (!due) return { text: 'no deadline', overdue: false };
  const ms = new Date(due).getTime() - Date.now();
  const overdue = ms < 0;
  const h = Math.floor(Math.abs(ms) / 3600000);
  if (h >= 24) return { text: `${overdue ? 'overdue ' : ''}${Math.floor(h / 24)}d ${h % 24}h`, overdue };
  if (h >= 1) return { text: `${overdue ? 'overdue ' : ''}${h}h`, overdue };
  return { text: `${overdue ? 'overdue' : '<1h left'}`, overdue };
}

export function PunishmentQueueCard() {
  const { user } = useAuth();
  const [items, setItems] = useState<Punishment[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [evUrl, setEvUrl] = useState<Record<string, string>>({});
  const [evNotes, setEvNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('punishment_queue')
      .select('id, punishment_type, severity, title, description, status, due_by, dodge_count, created_at')
      .eq('user_id', user.id)
      .in('status', ['queued', 'active', 'escalated'])
      .order('severity', { ascending: false })
      .order('due_by', { ascending: true, nullsFirst: false });
    setItems((data as Punishment[]) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const markComplete = async (item: Punishment) => {
    if (!user?.id) return;
    const url = (evUrl[item.id] || '').trim();
    const notes = (evNotes[item.id] || '').trim();
    if (!url && !notes) return;
    setSubmitting(item.id);
    await supabase.from('punishment_queue').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completion_evidence: { url: url || null, notes: notes || null, marked_by: 'user' },
    }).eq('id', item.id);
    setOpenId(null);
    setEvUrl(s => { const c = { ...s }; delete c[item.id]; return c; });
    setEvNotes(s => { const c = { ...s }; delete c[item.id]; return c; });
    setSubmitting(null);
    load();
  };

  if (items.length === 0) return null;

  return (
    <div id="card-punishment-queue" style={{
      background: 'linear-gradient(135deg, #2a0a0c 0%, #1a0608 100%)',
      border: '1px solid #7a1f22', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f47272" strokeWidth="1.8">
          <path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#f47272', fontWeight: 700 }}>
          Punishment queue ({items.length})
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          Mark complete with proof.
        </span>
      </div>

      {items.map(item => {
        const tone = SEVERITY_TONE[item.severity] || '#f47272';
        const due = fmtDue(item.due_by);
        const open = openId === item.id;
        return (
          <div key={item.id} style={{
            padding: '10px 12px', marginBottom: 7,
            background: '#0a0a0d',
            border: `1px solid ${due.overdue ? '#7a1f22' : tone + '44'}`,
            borderLeft: `3px solid ${tone}`, borderRadius: 5,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 9.5, color: tone, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                S{item.severity} · {item.status}
                {item.dodge_count > 0 && (
                  <span style={{ marginLeft: 6, color: '#f47272' }}>dodged {item.dodge_count}×</span>
                )}
              </span>
              <span style={{ fontSize: 10, color: due.overdue ? '#f47272' : '#8a8690', marginLeft: 'auto', fontWeight: 600 }}>
                {due.text}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#e8e6e3', fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }}>
              {item.title}
            </div>
            {item.description && (
              <div style={{ fontSize: 11, color: '#c8c4cc', lineHeight: 1.45, marginBottom: 6 }}>
                {item.description}
              </div>
            )}

            {!open ? (
              <button
                onClick={() => setOpenId(item.id)}
                style={{
                  padding: '6px 14px', borderRadius: 5, border: 'none',
                  background: tone, color: '#1a0608',
                  fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}
              >
                Mark complete
              </button>
            ) : (
              <div style={{
                marginTop: 4, padding: 9, background: '#050507',
                border: '1px solid #2d1a4d', borderRadius: 4,
              }}>
                <div style={{ fontSize: 10, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 5 }}>
                  Evidence
                </div>
                <input
                  value={evUrl[item.id] || ''}
                  onChange={e => setEvUrl(s => ({ ...s, [item.id]: e.target.value }))}
                  placeholder="link to post / screenshot URL / Reddit thread"
                  style={{
                    width: '100%', background: '#0a0a0d', border: '1px solid #22222a',
                    borderRadius: 4, padding: '6px 9px', fontSize: 11.5, color: '#e8e6e3',
                    fontFamily: 'inherit', marginBottom: 5,
                  }}
                />
                <textarea
                  value={evNotes[item.id] || ''}
                  onChange={e => setEvNotes(s => ({ ...s, [item.id]: e.target.value }))}
                  placeholder="optional notes — when, where, what happened"
                  rows={2}
                  style={{
                    width: '100%', background: '#0a0a0d', border: '1px solid #22222a',
                    borderRadius: 4, padding: '6px 9px', fontSize: 11.5, color: '#e8e6e3',
                    fontFamily: 'inherit', resize: 'vertical', marginBottom: 6,
                  }}
                />
                <div style={{ display: 'flex', gap: 5 }}>
                  <button
                    onClick={() => markComplete(item)}
                    disabled={submitting === item.id || (!evUrl[item.id]?.trim() && !evNotes[item.id]?.trim())}
                    style={{
                      flex: 1, padding: '6px 12px', borderRadius: 4, border: 'none',
                      background: (evUrl[item.id]?.trim() || evNotes[item.id]?.trim()) ? '#5fc88f' : '#22222a',
                      color: (evUrl[item.id]?.trim() || evNotes[item.id]?.trim()) ? '#0a1a14' : '#5a5560',
                      fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                      textTransform: 'uppercase',
                    }}
                  >
                    {submitting === item.id ? '…' : 'Submit + close'}
                  </button>
                  <button
                    onClick={() => setOpenId(null)}
                    style={{
                      padding: '6px 12px', borderRadius: 4, background: 'transparent',
                      border: '1px solid #2d1a4d', color: '#8a8690', fontSize: 10,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
