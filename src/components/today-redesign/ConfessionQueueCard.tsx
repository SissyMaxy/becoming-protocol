/**
 * ConfessionQueueCard — Handler-scheduled confessions. Each open confession
 * is a prompt she has to answer (text now, audio later) by deadline. Miss →
 * penalty cascade handled server-side. This is the verbal-owning surface.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Confession {
  id: string;
  category: string;
  prompt: string;
  context_note: string | null;
  deadline: string;
  created_at: string;
  response_text: string | null;
  confessed_at: string | null;
  missed: boolean;
}

const CATEGORY_TONE: Record<string, string> = {
  slip: '#f47272',
  arousal_spike: '#ec4899',
  rationalization: '#f4c272',
  scheduled_daily: '#c4b5fd',
  resistance: '#f47272',
  desire_owning: '#ec4899',
  identity_acknowledgement: '#6ee7b7',
  handler_triggered: '#c4b5fd',
};

export function ConfessionQueueCard() {
  const { user } = useAuth();
  const [items, setItems] = useState<Confession[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('confession_queue')
      .select('id, category, prompt, context_note, deadline, created_at, response_text, confessed_at, missed')
      .eq('user_id', user.id)
      .is('confessed_at', null)
      .eq('missed', false)
      .order('deadline', { ascending: true })
      .limit(6);
    setItems((data as Confession[]) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const confess = async (id: string) => {
    const text = (drafts[id] || '').trim();
    if (!text) return;
    setSubmittingId(id);
    await supabase.from('confession_queue').update({
      response_text: text,
      confessed_at: new Date().toISOString(),
    }).eq('id', id);
    setSubmittingId(null);
    setDrafts(d => { const c = { ...d }; delete c[id]; return c; });
    load();
  };

  if (items.length === 0) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #2a0a1a 0%, #1a050e 100%)',
      border: '1px solid #7a1f3a', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4a7c4" strokeWidth="1.8">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <path d="M8 9h8M8 13h5"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#f4a7c4', fontWeight: 700 }}>
          Confess ({items.length})
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          Handler is waiting.
        </span>
      </div>

      {items.map(c => {
        const now = Date.now();
        const dueMs = new Date(c.deadline).getTime() - now;
        const overdue = dueMs < 0;
        const hoursLeft = Math.max(0, Math.round(dueMs / 3600000));
        const tone = CATEGORY_TONE[c.category] || '#c4b5fd';
        const draft = drafts[c.id] || '';
        return (
          <div key={c.id} style={{
            padding: '10px 12px', marginBottom: 8,
            background: '#0a0a0d', border: `1px solid ${tone}44`,
            borderLeft: `3px solid ${tone}`, borderRadius: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: tone, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {c.category.replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 9.5, color: overdue ? '#f47272' : '#8a8690', marginLeft: 'auto' }}>
                {overdue ? `overdue by ${Math.abs(hoursLeft)}h` : hoursLeft >= 24 ? `${Math.round(hoursLeft / 24)}d left` : `${hoursLeft}h left`}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: '#e8e6e3', lineHeight: 1.45, marginBottom: c.context_note ? 4 : 8 }}>
              {c.prompt}
            </div>
            {c.context_note && (
              <div style={{ fontSize: 10.5, color: '#8a8690', fontStyle: 'italic', marginBottom: 8 }}>
                {c.context_note}
              </div>
            )}
            <textarea
              value={draft}
              onChange={e => setDrafts(d => ({ ...d, [c.id]: e.target.value }))}
              placeholder="Say it. In your own words. No softening."
              rows={3}
              style={{
                width: '100%', background: '#050507', border: '1px solid #22222a',
                borderRadius: 5, padding: '7px 9px', fontSize: 11.5, color: '#e8e6e3',
                fontFamily: 'inherit', resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                onClick={() => confess(c.id)}
                disabled={!draft.trim() || submittingId === c.id}
                style={{
                  padding: '6px 14px', borderRadius: 5, border: 'none',
                  background: draft.trim() ? tone : '#22222a',
                  color: draft.trim() ? '#0a0a0d' : '#5a5560',
                  fontWeight: 600, fontSize: 11,
                  cursor: draft.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                }}
              >
                {submittingId === c.id ? '…' : 'Confess'}
              </button>
              <span style={{ fontSize: 10, color: '#5a5560', alignSelf: 'center' }}>
                Handler reads this next turn.
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
