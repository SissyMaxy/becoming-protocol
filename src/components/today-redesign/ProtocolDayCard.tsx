/**
 * ProtocolDayCard — Day N counter.
 * Reads earliest handler_messages row as protocol start. Displays compounding
 * day count front-and-center so every app open reminds her the clock runs.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export function ProtocolDayCard() {
  const { user } = useAuth();
  const [startAt, setStartAt] = useState<Date | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [failureMode, setFailureMode] = useState<string | null>(null);
  const [denialDay, setDenialDay] = useState<number | null>(null);
  const [chastityLocked, setChastityLocked] = useState(false);
  const [chastityStreak, setChastityStreak] = useState(0);
  const [hardMode, setHardMode] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [firstRes, stateRes] = await Promise.all([
      supabase.from('handler_messages').select('created_at').eq('user_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('user_state').select('current_phase, current_failure_mode, denial_day, chastity_locked, chastity_streak_days, hard_mode_active').eq('user_id', user.id).maybeSingle(),
    ]);
    if (firstRes.data?.created_at) setStartAt(new Date(firstRes.data.created_at));
    const s = stateRes.data as Record<string, unknown> | null;
    if (s) {
      setPhase((s.current_phase as string) || 'phase_1');
      setFailureMode((s.current_failure_mode as string) || null);
      setDenialDay((s.denial_day as number) ?? 0);
      setChastityLocked(Boolean(s.chastity_locked));
      setChastityStreak((s.chastity_streak_days as number) ?? 0);
      setHardMode(Boolean(s.hard_mode_active));
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!startAt) return null;

  const days = Math.floor((Date.now() - startAt.getTime()) / 86400000);
  const milestone = days % 10 === 0 && days > 0;

  const modeColor = (m: string | null): string => {
    if (!m || m === 'engaged') return '#6ee7b7';
    if (m === 'shutting_down' || m === 'dissociating') return '#f4c272';
    if (m === 'resisting_openly' || m === 'testing_limits') return '#f47272';
    return '#c4b5fd';
  };

  return (
    <div style={{
      background: milestone ? 'linear-gradient(92deg, #2a1f0a 0%, #1f1608 100%)' : '#111116',
      border: `1px solid ${milestone ? '#f4c272' : '#2d1a4d'}`,
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: milestone ? '#f4c272' : '#e8e6e3', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          Day {days}
        </div>
        <div style={{ fontSize: 11, color: '#8a8690', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          of {(phase || 'phase_1').replace('_', ' ')}
        </div>
      </div>

      {milestone && (
        <div style={{ fontSize: 11, color: '#f4c272', marginBottom: 8, fontStyle: 'italic' }}>
          Milestone day. Irreversibility compounds.
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 10.5 }}>
        <Tag label="denial" value={`day ${denialDay ?? 0}`} color="#c4b5fd" />
        {chastityLocked && <Tag label="chastity" value={`${chastityStreak}d locked`} color="#f4a7c4" />}
        {hardMode && <Tag label="hard mode" value="ACTIVE" color="#f47272" />}
        {failureMode && failureMode !== 'engaged' && (
          <Tag label="mode" value={failureMode.replace('_', ' ')} color={modeColor(failureMode)} />
        )}
      </div>
    </div>
  );
}

function Tag({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 10,
      background: `${color}22`, color, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 9.5,
    }}>
      {label} · {value}
    </span>
  );
}
