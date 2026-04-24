/**
 * DisclosureDraftsCard — Gina-facing messages the Handler pre-wrote.
 *
 * Daily, handler-autonomous generates 1-2 draft messages via Claude that
 * match Gina's tone register, cite her soft spots, dodge her triggers.
 * Maxy sees them here, edits inline, marks sent or skipped. Sent drafts
 * wait for her to log Gina's reaction.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Draft {
  id: string;
  channel: string;
  subject_rung: number | null;
  context_block: string;
  draft_text: string;
  edited_text: string | null;
  status: string;
  soft_spot_cited: string | null;
  triggers_avoided: string[] | null;
  created_at: string;
  expires_at: string;
}

export function DisclosureDraftsCard() {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [reactionFor, setReactionFor] = useState<string | null>(null);
  const [reactionDetail, setReactionDetail] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('disclosure_drafts')
      .select('id, channel, subject_rung, context_block, draft_text, edited_text, status, soft_spot_cited, triggers_avoided, created_at, expires_at')
      .eq('user_id', user.id)
      .in('status', ['queued', 'edited', 'sent'])
      .order('created_at', { ascending: false })
      .limit(10);
    setDrafts((data || []) as Draft[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  if (drafts.length === 0) return null;

  const saveEdit = async (d: Draft) => {
    const text = edits[d.id];
    if (!text) return;
    await supabase.from('disclosure_drafts').update({
      status: 'edited', edited_text: text,
    }).eq('id', d.id);
    setEditingId(null);
    load();
  };

  const markSent = async (d: Draft) => {
    await supabase.from('disclosure_drafts').update({
      status: 'sent', sent_at: new Date().toISOString(),
    }).eq('id', d.id);
    load();
  };

  const markSkipped = async (d: Draft) => {
    await supabase.from('disclosure_drafts').update({ status: 'skipped' }).eq('id', d.id);
    load();
  };

  const copyText = async (d: Draft) => {
    const text = d.edited_text || d.draft_text;
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  };

  const captureReaction = async (d: Draft, reaction: 'positive' | 'neutral' | 'stalled' | 'hostile') => {
    if (!user?.id) return;
    const { data } = await supabase.from('gina_reactions').insert({
      user_id: user.id,
      move_kind: 'disclosure_opener',
      move_summary: (d.edited_text || d.draft_text).slice(0, 300),
      channel: d.channel,
      reaction, reaction_detail: reactionDetail || null,
    }).select('id').maybeSingle();
    await supabase.from('disclosure_drafts').update({ reaction_id: data?.id || null }).eq('id', d.id);
    setReactionFor(null);
    setReactionDetail('');
    load();
  };

  return (
    <div style={{ background: '#111116', border: '1px solid #7a1f4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4a7c4" strokeWidth="1.8">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f4a7c4', fontWeight: 700 }}>
          Gina drafts · Handler pre-wrote
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>{drafts.filter(d => d.status !== 'sent').length} ready</span>
      </div>

      {drafts.map(d => {
        const isSent = d.status === 'sent';
        const isEditing = editingId === d.id;
        const current = d.edited_text || d.draft_text;

        return (
          <div key={d.id} style={{
            background: '#0a0a0d',
            border: `1px solid ${isSent ? '#22222a' : '#7a1f4d'}`,
            borderRadius: 8, padding: 11, marginBottom: 8,
            opacity: isSent ? 0.7 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#f4a7c4', background: 'rgba(244,167,196,0.15)', padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {d.channel.replace('_', ' ')}
              </span>
              {d.subject_rung && <span style={{ fontSize: 9.5, color: '#c4b5fd' }}>rung {d.subject_rung}</span>}
              {isSent && <span style={{ fontSize: 10, color: '#6ee7b7', marginLeft: 'auto' }}>sent</span>}
              {!isSent && <span style={{ fontSize: 9.5, color: '#6a656e', marginLeft: 'auto' }}>expires {new Date(d.expires_at).toLocaleDateString()}</span>}
            </div>

            <div style={{ fontSize: 10.5, color: '#8a8690', marginBottom: 6, fontStyle: 'italic' }}>
              {d.context_block}
            </div>

            {!isEditing ? (
              <div
                onClick={() => !isSent && copyText(d)}
                style={{
                  fontSize: 12, color: '#e8e6e3', lineHeight: 1.5, padding: 10, borderRadius: 6,
                  background: '#050507', border: '1px solid #22222a', cursor: isSent ? 'default' : 'pointer', marginBottom: 8,
                }}
              >
                {current}
              </div>
            ) : (
              <textarea
                value={edits[d.id] ?? current}
                onChange={e => setEdits({ ...edits, [d.id]: e.target.value })}
                rows={4}
                style={{
                  width: '100%', fontSize: 12, color: '#e8e6e3', lineHeight: 1.5, padding: 10, borderRadius: 6,
                  background: '#050507', border: '1px solid #7a1f4d', fontFamily: 'inherit', marginBottom: 8,
                }}
              />
            )}

            {(d.soft_spot_cited || (d.triggers_avoided && d.triggers_avoided.length > 0)) && (
              <div style={{ fontSize: 10, color: '#6a656e', marginBottom: 8 }}>
                {d.soft_spot_cited && <span style={{ color: '#6ee7b7' }}>+ {d.soft_spot_cited}</span>}
                {d.soft_spot_cited && d.triggers_avoided && d.triggers_avoided.length > 0 && ' · '}
                {d.triggers_avoided && d.triggers_avoided.length > 0 && <span style={{ color: '#f47272' }}>− {d.triggers_avoided.join(', ')}</span>}
              </div>
            )}

            {!isSent && !reactionFor && (
              <div style={{ display: 'flex', gap: 5 }}>
                {!isEditing && (
                  <button onClick={() => { setEditingId(d.id); setEdits({ ...edits, [d.id]: current }); }} style={{
                    padding: '5px 10px', borderRadius: 5, border: '1px solid #22222a', background: 'none',
                    color: '#c4b5fd', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}>Edit</button>
                )}
                {isEditing && (
                  <button onClick={() => saveEdit(d)} style={{
                    padding: '5px 10px', borderRadius: 5, border: 'none', background: '#c4b5fd',
                    color: '#1a0a12', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}>Save edit</button>
                )}
                <button onClick={() => markSent(d)} style={{
                  padding: '5px 10px', borderRadius: 5, border: 'none', background: '#7c3aed',
                  color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>I sent it</button>
                <button onClick={() => markSkipped(d)} style={{
                  padding: '5px 10px', borderRadius: 5, border: '1px solid #22222a', background: 'none',
                  color: '#8a8690', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                }}>Skip</button>
              </div>
            )}

            {isSent && reactionFor !== d.id && (
              <button onClick={() => setReactionFor(d.id)} style={{
                padding: '5px 10px', borderRadius: 5, border: '1px solid #22222a', background: 'none',
                color: '#c4b5fd', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}>Log her reaction</button>
            )}

            {reactionFor === d.id && (
              <div style={{ marginTop: 6 }}>
                <input
                  type="text"
                  placeholder="what she said / did (optional)"
                  value={reactionDetail}
                  onChange={e => setReactionDetail(e.target.value)}
                  style={{
                    width: '100%', background: '#050507', border: '1px solid #22222a', borderRadius: 5,
                    padding: '5px 8px', fontSize: 11, color: '#e8e6e3', fontFamily: 'inherit', marginBottom: 6,
                  }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['positive', 'neutral', 'stalled', 'hostile'] as const).map(r => (
                    <button key={r} onClick={() => captureReaction(d, r)} style={{
                      flex: 1, padding: '5px 6px', borderRadius: 4, border: 'none',
                      background: r === 'positive' ? '#6ee7b7' : r === 'hostile' ? '#f47272' : r === 'stalled' ? '#f4c272' : '#c4b5fd',
                      color: '#1a0a12', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      textTransform: 'uppercase',
                    }}>{r}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
