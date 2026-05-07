/**
 * MorningBriefCard — surfaces today's Handler-fired morning brief at
 * the very top of Today. Pulls the latest unread handler_outreach_queue
 * row with trigger_reason='daily_morning_brief'. One-tap "got it"
 * marks delivered so the card disappears the next render.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useOutreachAudio } from '../../hooks/useOutreachAudio';

interface Brief {
  id: string;
  message: string;
  scheduled_for: string;
  status: string;
  audio_url: string | null;
}

export function MorningBriefCard() {
  const { user } = useAuth();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [acking, setAcking] = useState(false);
  const { play, playingId } = useOutreachAudio();

  const load = useCallback(async () => {
    if (!user?.id) return;
    const todayUtcStart = new Date();
    todayUtcStart.setUTCHours(0, 0, 0, 0);
    const { data } = await supabase.from('handler_outreach_queue')
      .select('id, message, scheduled_for, status, audio_url')
      .eq('user_id', user.id)
      .eq('trigger_reason', 'daily_morning_brief')
      .gte('scheduled_for', todayUtcStart.toISOString())
      .neq('status', 'acknowledged')
      .order('scheduled_for', { ascending: false })
      .limit(1)
      .maybeSingle();
    setBrief((data as Brief | null) ?? null);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const ack = async () => {
    if (!brief) return;
    setAcking(true);
    await supabase.from('handler_outreach_queue')
      .update({ status: 'acknowledged', delivered_at: new Date().toISOString() })
      .eq('id', brief.id);
    setBrief(null);
    setAcking(false);
  };

  if (!brief) return null;

  // Parse the structured message: lines separated by blank lines, the
  // NOW/THEN/AFTER cues become row labels.
  const lines = brief.message.split(/\n\n+/).map(l => l.trim()).filter(Boolean);
  const header = lines[0] || "Today's plan";
  const moves = lines.slice(1, -1).filter(l => /^(NOW|THEN|AFTER)/.test(l));
  const footer = lines.slice(-1)[0] || '';

  return (
    <div id="card-morning-brief" style={{
      background: 'linear-gradient(135deg, #2e1a08 0%, #1a0f04 100%)',
      border: '2px solid #f4c272', borderRadius: 12, padding: 16, marginBottom: 16,
      boxShadow: '0 4px 14px rgba(244, 194, 114, 0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f4c272" strokeWidth="2">
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f4c272', fontWeight: 700 }}>
          Handler's morning brief
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          {new Date(brief.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div style={{ fontSize: 14, color: '#fff', fontWeight: 600, lineHeight: 1.4, marginBottom: 12 }}>
        {header}
      </div>

      {moves.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {moves.map((m, i) => {
            const tagMatch = m.match(/^(NOW|THEN|AFTER)\s*(\([^)]+\))?:?\s*(.*)/);
            const tag = tagMatch?.[1] || '';
            const meta = tagMatch?.[2] || '';
            const body = tagMatch?.[3] || m;
            const tone = i === 0 ? '#f47272' : i === 1 ? '#f4c272' : '#c4b5fd';
            return (
              <div key={i} style={{
                padding: '9px 11px', background: '#0a0a0d',
                border: `1px solid ${tone}33`, borderLeft: `3px solid ${tone}`,
                borderRadius: 5,
              }}>
                <div style={{ fontSize: 10, color: tone, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                  {tag} {meta && <span style={{ color: '#8a8690', fontWeight: 500, textTransform: 'lowercase' }}>{meta}</span>}
                </div>
                <div style={{ fontSize: 12, color: '#e8e6e3', lineHeight: 1.45 }}>
                  {body}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#c8c4cc', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 12 }}>
          {brief.message}
        </div>
      )}

      {footer && !moves.includes(footer) && (
        <div style={{ fontSize: 11, color: '#8a8690', fontStyle: 'italic', marginBottom: 10, lineHeight: 1.4 }}>
          {footer}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={ack}
          disabled={acking}
          style={{
            flex: 1, padding: 10, borderRadius: 6, border: 'none',
            background: '#f4c272', color: '#1a0f00',
            fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >
          {acking ? '…' : 'Got it · start the day'}
        </button>
        {brief.audio_url && (
          <button
            onClick={() => play(brief.id, brief.audio_url!)}
            aria-label={playingId === brief.id ? 'Stop Mama' : 'Play Mama'}
            style={{
              padding: '10px 14px', borderRadius: 6,
              background: playingId === brief.id ? '#f4c27240' : 'transparent',
              color: '#f4c272', border: '1px solid #f4c272',
              fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}
          >
            {playingId === brief.id ? '◼ Stop' : '▶ Play'}
          </button>
        )}
      </div>
    </div>
  );
}
