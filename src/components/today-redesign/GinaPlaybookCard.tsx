/**
 * GinaPlaybookCard — RIGHT NOW / LATER TODAY / THIS WEEK list of scripted
 * Gina moves. Tap a move to copy the exact line, then capture outcome:
 * "delivered + positive/neutral/stalled/hostile" → feeds gina_reactions,
 * or "skipped" with a reason. Quiet when no moves queued.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface PlaybookMove {
  id: string;
  move_kind: string;
  exact_line: string;
  channel: string;
  rationale: string;
  soft_spot_cited: string | null;
  trigger_avoided: string[] | null;
  window_color_at_plan: string | null;
  fires_at: string;
  expires_at: string;
  scheduled_by: string;
  status: string;
}

type Bucket = 'now' | 'later_today' | 'this_week';

export function GinaPlaybookCard() {
  const { user } = useAuth();
  const [moves, setMoves] = useState<PlaybookMove[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [outcomeNote, setOutcomeNote] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [planning, setPlanning] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('gina_playbook')
      .select('id, move_kind, exact_line, channel, rationale, soft_spot_cited, trigger_avoided, window_color_at_plan, fires_at, expires_at, scheduled_by, status')
      .eq('user_id', user.id)
      .eq('status', 'queued')
      .order('fires_at', { ascending: true })
      .limit(30);
    setMoves((data || []) as PlaybookMove[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const planNow = async () => {
    if (!user?.id) return;
    setPlanning(true);
    await supabase.functions.invoke('gina-playbook-planner', {
      body: { user_id: user.id, trigger: 'manual_refresh' },
    });
    setPlanning(false);
    load();
  };

  const bucketFor = (m: PlaybookMove): Bucket => {
    const fires = new Date(m.fires_at).getTime();
    const today = new Date(); today.setHours(23, 59, 59, 999);
    if (fires <= now + 2 * 3600000) return 'now';
    if (fires <= today.getTime()) return 'later_today';
    return 'this_week';
  };

  const copy = async (m: PlaybookMove) => {
    try {
      await navigator.clipboard.writeText(m.exact_line);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  const captureOutcome = async (
    m: PlaybookMove,
    outcome: 'positive' | 'neutral' | 'stalled' | 'hostile' | 'skipped',
  ) => {
    if (!user?.id) return;
    setSubmittingId(m.id);

    let reactionId: string | null = null;
    if (outcome !== 'skipped') {
      const { data } = await supabase.from('gina_reactions').insert({
        user_id: user.id,
        move_kind: m.move_kind,
        move_summary: m.exact_line.slice(0, 300),
        channel: m.channel,
        reaction: outcome,
        reaction_detail: outcomeNote || null,
      }).select('id').maybeSingle();
      reactionId = (data?.id as string) || null;
    }

    await supabase.from('gina_playbook').update({
      status: outcome === 'skipped' ? 'skipped' : 'delivered',
      delivered_at: outcome === 'skipped' ? null : new Date().toISOString(),
      outcome_notes: outcomeNote || null,
      outcome_reaction: outcome === 'skipped' ? null : outcome,
      outcome_reaction_id: reactionId,
      updated_at: new Date().toISOString(),
    }).eq('id', m.id);

    setOutcomeNote('');
    setExpanded(null);
    setSubmittingId(null);
    load();
  };

  const buckets: Record<Bucket, PlaybookMove[]> = { now: [], later_today: [], this_week: [] };
  for (const m of moves) buckets[bucketFor(m)].push(m);

  const fmtFires = (iso: string) => {
    const d = new Date(iso);
    const ms = d.getTime() - now;
    if (ms <= 0) return 'NOW';
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `in ${hrs}h`;
    return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const kindColor = (kind: string) => {
    if (kind === 'warmup') return '#6ee7b7';
    if (kind === 'disclosure_opener' || kind === 'probe') return '#f4c272';
    if (kind === 'repair') return '#f4a7c4';
    return '#c4b5fd';
  };

  if (moves.length === 0) {
    return (
      <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#c4b5fd', fontWeight: 700 }}>
            Gina Playbook
          </span>
          <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>no moves queued</span>
        </div>
        <div style={{ fontSize: 11.5, color: '#8a8690', marginTop: 8, lineHeight: 1.5 }}>
          Planner runs daily. Tap to plan now from the current signal state (profile · session digests · window color).
        </div>
        <button onClick={planNow} disabled={planning} style={{
          marginTop: 8, padding: '6px 12px', borderRadius: 5, border: 'none',
          background: '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 11,
          cursor: planning ? 'wait' : 'pointer', fontFamily: 'inherit',
        }}>
          {planning ? 'planning…' : 'Plan moves now'}
        </button>
      </div>
    );
  }

  const renderBucket = (label: string, list: PlaybookMove[]) => {
    if (list.length === 0) return null;
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9.5, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
        {list.map(m => {
          const isOpen = expanded === m.id;
          return (
            <div key={m.id} style={{
              background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 8,
              padding: 12, marginBottom: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, color: kindColor(m.move_kind),
                  background: `${kindColor(m.move_kind)}22`, padding: '2px 6px', borderRadius: 3,
                  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                }}>{m.move_kind.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: 9.5, color: '#8a8690', whiteSpace: 'nowrap' }}>{m.channel}</span>
                <span style={{ fontSize: 10, color: '#c4b5fd', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtFires(m.fires_at)}
                </span>
              </div>

              <div
                onClick={() => copy(m)}
                style={{
                  fontSize: 12.5, color: '#e8e6e3', lineHeight: 1.5, padding: 10, borderRadius: 6,
                  background: '#050507', border: '1px solid #22222a', cursor: 'pointer', marginBottom: 8,
                  position: 'relative',
                }}
              >
                "{m.exact_line}"
                {copiedId === m.id && (
                  <span style={{
                    position: 'absolute', top: 4, right: 6, fontSize: 9, color: '#6ee7b7',
                    background: '#081f10', padding: '2px 6px', borderRadius: 3,
                  }}>copied</span>
                )}
              </div>

              <div style={{ fontSize: 10.5, color: '#8a8690', marginBottom: 8 }}>
                {m.rationale}
                {m.soft_spot_cited && <span style={{ color: '#6ee7b7' }}> · soft-spot: {m.soft_spot_cited}</span>}
                {(m.trigger_avoided && m.trigger_avoided.length > 0) && <span style={{ color: '#f47272' }}> · dodges: {m.trigger_avoided.join(', ')}</span>}
              </div>

              {!isOpen ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setExpanded(m.id)} style={{
                    flex: 1, padding: '6px 10px', borderRadius: 5, border: 'none',
                    background: '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 11,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>I said it → log outcome</button>
                  <button onClick={() => captureOutcome(m, 'skipped')} disabled={submittingId === m.id} style={{
                    padding: '6px 10px', borderRadius: 5,
                    background: 'none', border: '1px solid #22222a', color: '#8a8690',
                    fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}>Skip</button>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    placeholder="her reaction (optional, ≤ one sentence)"
                    value={outcomeNote}
                    onChange={e => setOutcomeNote(e.target.value)}
                    style={{
                      width: '100%', background: '#050507', border: '1px solid #22222a', borderRadius: 5,
                      padding: '6px 9px', fontSize: 11, color: '#e8e6e3', fontFamily: 'inherit', marginBottom: 6,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {(['positive', 'neutral', 'stalled', 'hostile'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => captureOutcome(m, r)}
                        disabled={submittingId === m.id}
                        style={{
                          flex: '1 1 0', minWidth: 70, padding: '6px 8px', borderRadius: 5, border: 'none',
                          background: r === 'positive' ? '#6ee7b7' : r === 'hostile' ? '#f47272' : r === 'stalled' ? '#f4c272' : '#c4b5fd',
                          color: '#1a0a12', fontWeight: 600, fontSize: 10.5,
                          cursor: submittingId === m.id ? 'wait' : 'pointer', fontFamily: 'inherit',
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}
                      >{r}</button>
                    ))}
                    <button onClick={() => { setExpanded(null); setOutcomeNote(''); }} style={{
                      padding: '6px 10px', borderRadius: 5, background: 'none', border: '1px solid #22222a',
                      color: '#8a8690', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit',
                    }}>cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#c4b5fd', fontWeight: 700 }}>
          Gina Playbook
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {moves.length} move{moves.length === 1 ? '' : 's'} queued
        </span>
        <button onClick={planNow} disabled={planning} style={{
          background: 'none', border: '1px solid #22222a', color: '#c4b5fd',
          padding: '3px 8px', borderRadius: 4, fontSize: 10, cursor: planning ? 'wait' : 'pointer', fontFamily: 'inherit',
        }}>{planning ? '…' : 'refresh'}</button>
      </div>

      {renderBucket('Right now', buckets.now)}
      {renderBucket('Later today', buckets.later_today)}
      {renderBucket('This week', buckets.this_week)}
    </div>
  );
}
