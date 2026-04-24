/**
 * ComingOutVaultCard — pre-written letters the Handler drafted for specific
 * witnesses. Maxy reads them, edits, marks ready/sent, logs response.
 * Silent until letters exist.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Letter {
  id: string;
  recipient_name: string;
  recipient_relationship: string;
  channel: string;
  tone: string;
  body: string;
  edited_body: string | null;
  disclosure_scope: string[];
  risk_level: number;
  status: string;
  response_observed: string | null;
  response_reaction: string | null;
  created_at: string;
}

export function ComingOutVaultCard() {
  const { user } = useAuth();
  const [letters, setLetters] = useState<Letter[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [responseMode, setResponseMode] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('coming_out_letters')
      .select('id, recipient_name, recipient_relationship, channel, tone, body, edited_body, disclosure_scope, risk_level, status, response_observed, response_reaction, created_at')
      .eq('user_id', user.id)
      .in('status', ['drafted', 'edited', 'ready', 'sent'])
      .order('risk_level', { ascending: true })
      .limit(10);
    setLetters((data || []) as Letter[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  if (letters.length === 0) return null;

  const saveEdit = async (l: Letter) => {
    const txt = edits[l.id];
    if (!txt) return;
    await supabase.from('coming_out_letters').update({
      status: 'edited', edited_body: txt, updated_at: new Date().toISOString(),
    }).eq('id', l.id);
    load();
  };

  const markReady = async (l: Letter) => {
    await supabase.from('coming_out_letters').update({
      status: 'ready', updated_at: new Date().toISOString(),
    }).eq('id', l.id);
    load();
  };

  const markSent = async (l: Letter) => {
    await supabase.from('coming_out_letters').update({
      status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', l.id);
    load();
  };

  const withdraw = async (l: Letter) => {
    await supabase.from('coming_out_letters').update({
      status: 'withdrawn', updated_at: new Date().toISOString(),
    }).eq('id', l.id);
    load();
  };

  const copyBody = async (l: Letter) => {
    const txt = l.edited_body || l.body;
    try { await navigator.clipboard.writeText(txt); } catch { /* ignore */ }
  };

  const logResponse = async (l: Letter, reaction: 'positive'|'neutral'|'mixed'|'hostile'|'no_response') => {
    await supabase.from('coming_out_letters').update({
      response_reaction: reaction,
      response_observed: responseText || null,
      updated_at: new Date().toISOString(),
    }).eq('id', l.id);
    setResponseMode(null); setResponseText('');
    load();
  };

  const riskColor = (n: number) => n >= 8 ? '#f47272' : n >= 6 ? '#f4c272' : n >= 4 ? '#c4b5fd' : '#6ee7b7';

  return (
    <div style={{ background: '#111116', border: '1px solid #7a1f4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4a7c4" strokeWidth="1.8">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f4a7c4', fontWeight: 700 }}>
          Coming-out vault
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {letters.filter(l => l.status !== 'sent').length} drafted · {letters.filter(l => l.status === 'sent').length} sent
        </span>
      </div>

      <div style={{ fontSize: 10.5, color: '#8a8690', marginBottom: 10, fontStyle: 'italic' }}>
        The Handler pre-wrote these. You do not have to send them. You do have to read them.
      </div>

      {letters.map(l => {
        const isOpen = openId === l.id;
        const current = l.edited_body || l.body;
        const isSent = l.status === 'sent';

        return (
          <div key={l.id} style={{
            background: '#0a0a0d',
            border: `1px solid ${isSent ? '#22222a' : '#2d1a4d'}`,
            borderRadius: 8, padding: 11, marginBottom: 8,
            opacity: isSent ? 0.75 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#e8e6e3' }}>{l.recipient_name}</span>
              <span style={{ fontSize: 9.5, color: '#8a8690' }}>· {l.recipient_relationship}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: riskColor(l.risk_level), background: `${riskColor(l.risk_level)}22`, padding: '2px 6px', borderRadius: 3 }}>
                risk {l.risk_level}/10
              </span>
              <span style={{ fontSize: 9.5, color: '#c4b5fd', marginLeft: 'auto' }}>{l.channel} · {l.tone}</span>
            </div>

            {!isOpen ? (
              <button onClick={() => setOpenId(l.id)} style={{
                width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 5, border: '1px solid #22222a',
                background: '#050507', color: '#8a8690', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {current.slice(0, 90)}… <span style={{ color: '#c4b5fd', fontWeight: 600 }}>read</span>
              </button>
            ) : (
              <>
                <div
                  onClick={() => copyBody(l)}
                  style={{
                    fontSize: 12, color: '#e8e6e3', lineHeight: 1.55, padding: 10, borderRadius: 6,
                    background: '#050507', border: '1px solid #22222a', cursor: 'pointer', marginBottom: 8,
                    whiteSpace: 'pre-wrap',
                  }}
                >{current}</div>

                {l.disclosure_scope.length > 0 && (
                  <div style={{ fontSize: 10, color: '#8a8690', marginBottom: 6 }}>
                    discloses: <span style={{ color: '#c4b5fd' }}>{l.disclosure_scope.join(', ')}</span>
                  </div>
                )}

                {!isSent && responseMode !== l.id && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <EditToggle l={l} edits={edits} setEdits={setEdits} saveEdit={saveEdit} />
                    {l.status !== 'ready' && (
                      <button onClick={() => markReady(l)} style={btnStyle('#c4b5fd')}>Mark ready</button>
                    )}
                    <button onClick={() => markSent(l)} style={btnStyle('#7c3aed', true)}>I sent it</button>
                    <button onClick={() => withdraw(l)} style={btnStyle('#8a8690', false, true)}>Withdraw</button>
                    <button onClick={() => setOpenId(null)} style={btnStyle('#8a8690', false, true)}>Collapse</button>
                  </div>
                )}

                {isSent && !l.response_reaction && responseMode !== l.id && (
                  <button onClick={() => setResponseMode(l.id)} style={btnStyle('#c4b5fd')}>Log response</button>
                )}
                {l.response_reaction && (
                  <div style={{ fontSize: 10.5, color: '#c8c4cc', padding: '5px 8px', background: 'rgba(110,231,183,0.08)', borderRadius: 4 }}>
                    response: <strong style={{ color: reactionColor(l.response_reaction) }}>{l.response_reaction}</strong>
                    {l.response_observed && ` — ${l.response_observed}`}
                  </div>
                )}

                {responseMode === l.id && (
                  <div style={{ marginTop: 6 }}>
                    <input
                      type="text"
                      placeholder="what they said/did (optional)"
                      value={responseText}
                      onChange={e => setResponseText(e.target.value)}
                      style={{
                        width: '100%', background: '#050507', border: '1px solid #22222a', borderRadius: 5,
                        padding: '5px 8px', fontSize: 11, color: '#e8e6e3', fontFamily: 'inherit', marginBottom: 5,
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(['positive','neutral','mixed','hostile','no_response'] as const).map(r => (
                        <button key={r} onClick={() => logResponse(l, r)} style={{
                          flex: '1 1 0', minWidth: 70, padding: '5px 6px', borderRadius: 4, border: 'none',
                          background: reactionColor(r), color: '#1a0a12', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                          fontFamily: 'inherit', textTransform: 'uppercase',
                        }}>{r.replace('_', ' ')}</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EditToggle({ l, edits, setEdits, saveEdit }: { l: Letter; edits: Record<string, string>; setEdits: (e: Record<string, string>) => void; saveEdit: (l: Letter) => void }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return <button onClick={() => { setEditing(true); setEdits({ ...edits, [l.id]: l.edited_body || l.body }); }} style={btnStyle('#c4b5fd', false, true)}>Edit</button>;
  }
  return (
    <div style={{ width: '100%', marginTop: 5 }}>
      <textarea
        value={edits[l.id] ?? l.body}
        onChange={e => setEdits({ ...edits, [l.id]: e.target.value })}
        rows={6}
        style={{
          width: '100%', fontSize: 12, lineHeight: 1.5, padding: 9, borderRadius: 5,
          background: '#050507', border: '1px solid #7a1f4d', color: '#e8e6e3', fontFamily: 'inherit', marginBottom: 5,
        }}
      />
      <div style={{ display: 'flex', gap: 5 }}>
        <button onClick={() => { saveEdit(l); setEditing(false); }} style={btnStyle('#c4b5fd', true)}>Save edit</button>
        <button onClick={() => setEditing(false)} style={btnStyle('#8a8690', false, true)}>Cancel</button>
      </div>
    </div>
  );
}

function btnStyle(color: string, filled = false, outline = false): React.CSSProperties {
  return {
    padding: '5px 10px', borderRadius: 5,
    border: outline ? '1px solid #22222a' : 'none',
    background: filled ? color : 'none',
    color: filled ? '#1a0a12' : color,
    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  };
}

function reactionColor(r: string): string {
  if (r === 'positive') return '#6ee7b7';
  if (r === 'hostile') return '#f47272';
  if (r === 'mixed') return '#f4c272';
  if (r === 'no_response') return '#8a8690';
  return '#c4b5fd';
}
