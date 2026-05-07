/**
 * NextShotsCard — surfaces the next atomic Handler-issued shots from the
 * shot-list pipeline, copy-paste ready. The unified task list shows
 * everything; this card is for "what should I do RIGHT NOW with the
 * exact text I need."
 *
 * Pulls active handler_decrees with trigger_source LIKE 'shot_list:%',
 * sorted by deadline ascending, top 3. For text-proof shots, shows
 * the literal text in a copyable box. For photo/video/audio shots,
 * shows the framing instructions in a clean checklist format.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useSurfaceRenderTracking } from '../../lib/surface-render-hooks';

interface Shot {
  id: string;
  edict: string;
  proof_type: string;
  deadline: string;
  consequence: string;
  trigger_source: string;
  reasoning: string | null;
}

const PROOF_BADGE: Record<string, { tone: string; label: string }> = {
  photo: { tone: '#ec4899', label: 'PHOTO' },
  audio: { tone: '#c4b5fd', label: 'AUDIO' },
  video: { tone: '#f47272', label: 'VIDEO' },
  text: { tone: '#6ee7b7', label: 'TEXT' },
  journal_entry: { tone: '#f4c272', label: 'JOURNAL' },
  voice_pitch_sample: { tone: '#c4b5fd', label: 'VOICE' },
  device_state: { tone: '#f4a7c4', label: 'DEVICE' },
  none: { tone: '#8a8690', label: 'TASK' },
};

function fmtCountdown(deadline: string): { text: string; overdue: boolean } {
  const ms = new Date(deadline).getTime() - Date.now();
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  if (h >= 24) return { text: `${overdue ? 'overdue ' : ''}${Math.floor(h / 24)}d ${h % 24}h`, overdue };
  if (h >= 1) return { text: `${overdue ? 'overdue ' : ''}${h}h ${m}m`, overdue };
  return { text: `${overdue ? 'overdue ' : ''}${m}m`, overdue };
}

export function NextShotsCard() {
  const { user } = useAuth();
  const [shots, setShots] = useState<Shot[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('handler_decrees')
      .select('id, edict, proof_type, deadline, consequence, trigger_source, reasoning')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .like('trigger_source', 'shot_list:%')
      .order('deadline', { ascending: true })
      .limit(3);
    setShots((data as Shot[]) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // visible-before-penalized invariant: stamp surfaced_at on each shot
  useSurfaceRenderTracking('handler_decrees', shots.map(s => s.id));

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(c => c === id ? null : c), 1500);
    } catch {}
  };

  const fulfill = async (id: string) => {
    setCompleting(id);
    await supabase.from('handler_decrees')
      .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
      .eq('id', id);
    setCompleting(null);
    load();
  };

  if (shots.length === 0) return null;

  return (
    <div id="card-next-shots" style={{
      background: 'linear-gradient(135deg, #1f0a1f 0%, #14060f 100%)',
      border: '2px solid #ec4899',
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3"/><path d="M3 7h2l2-3h10l2 3h2v12H3z"/>
        </svg>
        <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#ec4899', fontWeight: 700 }}>
          Next shots — exact direction
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          Copy-paste ready. No interpretation.
        </span>
      </div>

      {shots.map((s, idx) => {
        const due = fmtCountdown(s.deadline);
        const badge = PROOF_BADGE[s.proof_type] || PROOF_BADGE.none;
        // Detect literal text payload — for text/journal proof types where the
        // edict contains a quoted string, surface that string as copyable.
        const textPayloadMatch = s.edict.match(/['"]([^'"]{20,})['"]/);
        const literalText = (s.proof_type === 'text' || s.proof_type === 'journal_entry') && textPayloadMatch
          ? textPayloadMatch[1]
          : null;
        return (
          <div key={s.id} style={{
            padding: '11px 12px', marginBottom: idx < shots.length - 1 ? 8 : 0,
            background: '#0a0a0d',
            border: `1px solid ${due.overdue ? '#7a1f22' : badge.tone + '44'}`,
            borderLeft: `3px solid ${badge.tone}`, borderRadius: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: badge.tone, fontWeight: 700, letterSpacing: '0.08em' }}>
                {idx === 0 ? '▸ NOW · ' : `${idx + 1}. `}{badge.label}
              </span>
              <span style={{ fontSize: 10, color: due.overdue ? '#f47272' : '#8a8690', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {due.text}
              </span>
            </div>
            <div style={{ fontSize: idx === 0 ? 13 : 12, color: '#e8e6e3', lineHeight: 1.5, marginBottom: 8 }}>
              {s.edict}
            </div>
            {literalText && (
              <div style={{
                padding: '8px 10px', marginBottom: 8,
                background: '#050507', border: '1px dashed #2d1a4d', borderRadius: 4,
              }}>
                <div style={{ fontSize: 9, color: '#c4b5fd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Exact text — copy
                </div>
                <div style={{ fontSize: 12, color: '#fff', fontFamily: 'inherit', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                  {literalText}
                </div>
                <button
                  onClick={() => copy(s.id, literalText)}
                  style={{
                    marginTop: 6, padding: '4px 10px', borderRadius: 4, border: 'none',
                    background: copiedId === s.id ? '#5fc88f' : '#c4b5fd',
                    color: copiedId === s.id ? '#0a1a14' : '#1a1226',
                    fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}
                >
                  {copiedId === s.id ? 'copied' : 'copy text'}
                </button>
              </div>
            )}
            {s.reasoning && (
              <div style={{ fontSize: 10, color: '#8a8690', fontStyle: 'italic', marginBottom: 8, lineHeight: 1.4 }}>
                {s.reasoning}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => fulfill(s.id)}
                disabled={completing === s.id}
                style={{
                  padding: '6px 14px', borderRadius: 5, border: 'none',
                  background: '#ec4899', color: '#fff',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}
              >
                {completing === s.id ? '…' : 'Done'}
              </button>
              <span style={{ fontSize: 10, color: '#5a5560', alignSelf: 'center' }}>
                miss → {s.consequence}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
