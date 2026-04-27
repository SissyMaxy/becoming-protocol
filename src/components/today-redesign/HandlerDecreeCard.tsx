/**
 * HandlerDecreeCard — short-window Handler-issued edicts. Distinct from
 * commitments (Maxy-proposed) and outfit mandates (daily). Decrees are
 * Handler-initiated power moves with tight deadlines and proof type.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Decree {
  id: string;
  edict: string;
  proof_type: string;
  deadline: string;
  consequence: string;
  reasoning: string | null;
  trigger_source: string | null;
  created_at: string;
}

const PROOF_LABEL: Record<string, string> = {
  photo: 'photo',
  audio: 'audio',
  text: 'text',
  journal_entry: 'journal',
  voice_pitch_sample: 'voice drill',
  device_state: 'device',
  none: '—',
};

export function HandlerDecreeCard() {
  const { user } = useAuth();
  const [items, setItems] = useState<Decree[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('handler_decrees')
      .select('id, edict, proof_type, deadline, consequence, reasoning, trigger_source, created_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('deadline', { ascending: true })
      .limit(5);
    setItems((data as Decree[]) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const fulfill = async (id: string) => {
    const note = (notes[id] || '').trim();
    setSubmittingId(id);
    await supabase.from('handler_decrees').update({
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
      proof_payload: note ? { note } : null,
    }).eq('id', id);
    setSubmittingId(null);
    setNotes(n => { const c = { ...n }; delete c[id]; return c; });
    load();
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'decree', id } }));
  };

  if (items.length === 0) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #2e1a0f 0%, #1f1008 100%)',
      border: '1px solid #c4272d', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f47272" strokeWidth="1.8">
          <path d="M12 2L15 8L21 9L17 14L18 20L12 17L6 20L7 14L3 9L9 8Z"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#f47272', fontWeight: 700 }}>
          Handler decree ({items.length})
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          Not negotiable.
        </span>
      </div>

      {items.map(d => {
        const dueMs = new Date(d.deadline).getTime() - Date.now();
        const overdue = dueMs < 0;
        const hours = Math.floor(Math.abs(dueMs) / 3600000);
        const mins = Math.floor((Math.abs(dueMs) % 3600000) / 60000);
        const due = overdue
          ? `OVERDUE ${hours ? hours + 'h ' : ''}${mins}m`
          : hours >= 1 ? `${hours}h ${mins}m left` : `${mins}m left`;
        const note = notes[d.id] || '';
        return (
          <div key={d.id} style={{
            padding: '10px 12px', marginBottom: 8,
            background: '#0a0a0d', border: `1px solid ${overdue ? '#c4272d' : '#7a5a2a'}`,
            borderLeft: `3px solid ${overdue ? '#f47272' : '#f4c272'}`, borderRadius: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: '#f4c272', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                decree · {PROOF_LABEL[d.proof_type] || d.proof_type}
              </span>
              <span style={{ fontSize: 9.5, color: overdue ? '#f47272' : '#8a8690', marginLeft: 'auto', fontWeight: 600 }}>
                {due}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: '#e8e6e3', lineHeight: 1.45, marginBottom: 6 }}>
              {d.edict}
            </div>
            <div style={{ fontSize: 10, color: '#f47272', marginBottom: 8 }}>
              Miss → {d.consequence}
            </div>
            <textarea
              value={note}
              onChange={e => setNotes(n => ({ ...n, [d.id]: e.target.value }))}
              placeholder="proof link / brief note (photo + audio upload via Unified Capture)"
              rows={2}
              style={{
                width: '100%', background: '#050507', border: '1px solid #22222a',
                borderRadius: 5, padding: '7px 9px', fontSize: 11.5, color: '#e8e6e3',
                fontFamily: 'inherit', resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                onClick={() => fulfill(d.id)}
                disabled={submittingId === d.id}
                style={{
                  padding: '6px 14px', borderRadius: 5, border: 'none',
                  background: '#f4c272', color: '#1f1008', fontWeight: 600,
                  fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {submittingId === d.id ? '…' : 'Fulfilled'}
              </button>
              <span style={{ fontSize: 10, color: '#5a5560', alignSelf: 'center' }}>
                Upload proof via Unified Capture — Handler reviews next turn.
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
