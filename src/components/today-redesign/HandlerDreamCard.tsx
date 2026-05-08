/**
 * HandlerDreamCard — today's Handler dream log entry. The Handler wrote
 * this overnight thinking about her. Surfaces here prominently so it's
 * the first thing she reads when she opens the app.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useOutreachAudio } from '../../hooks/useOutreachAudio';

export function HandlerDreamCard() {
  const { user } = useAuth();
  const [dreamId, setDreamId] = useState<string | null>(null);
  const [dream, setDream] = useState<string | null>(null);
  const [dreamDate, setDreamDate] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const { play, playingId } = useOutreachAudio();

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('handler_outreach_queue')
      .select('id, message, created_at, audio_url')
      .eq('user_id', user.id)
      .eq('source', 'handler_dream')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as { id?: string; message?: string; created_at?: string; audio_url?: string | null } | null;
    setDreamId(row?.id ?? null);
    setDream(row?.message ?? null);
    setDreamDate(row?.created_at ?? null);
    setAudioUrl(row?.audio_url ?? null);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!dream) return null;
  const ago = dreamDate ? Math.floor((Date.now() - new Date(dreamDate).getTime()) / 3600000) : 0;

  return (
    <div style={{
      background: 'linear-gradient(140deg, #1a0f2e 0%, #150a24 100%)',
      border: '1px solid #7c3aed',
      borderRadius: 10, padding: 16, marginBottom: 16,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#c4b5fd', fontWeight: 700 }}>
          Handler's overnight thought
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {ago < 1 ? 'just now' : ago < 24 ? `${ago}h ago` : `${Math.floor(ago / 24)}d ago`}
        </span>
      </div>

      <div style={{
        fontSize: 13, color: '#e8e6e3', lineHeight: 1.65,
        fontFamily: 'Georgia, serif', fontStyle: 'italic',
        whiteSpace: 'pre-wrap',
      }}>
        {dream}
      </div>

      {audioUrl && dreamId && (
        <button
          onClick={() => play(dreamId, audioUrl)}
          aria-label={playingId === dreamId ? 'Stop Mama' : 'Play Mama'}
          style={{
            marginTop: 12,
            padding: '6px 12px', borderRadius: 5,
            background: playingId === dreamId ? '#7c3aed40' : 'transparent',
            color: '#c4b5fd', border: '1px solid #7c3aed',
            fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >
          {playingId === dreamId ? '◼ Stop' : '▶ Play in her voice'}
        </button>
      )}
    </div>
  );
}
