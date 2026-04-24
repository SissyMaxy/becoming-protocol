/**
 * DeviceScheduleCard — today's planned Lovense sessions from the
 * autonomous_planner. Silent if no sessions scheduled.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Entry {
  id: string;
  scheduled_at: string;
  intensity: number;
  duration_seconds: number;
  pattern: string;
  status: string;
  fired_at: string | null;
  paired_message: string | null;
}

export function DeviceScheduleCard() {
  const { user } = useAuth();
  const [today, setToday] = useState<Entry[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const { data } = await supabase.from('device_schedule')
      .select('id, scheduled_at, intensity, duration_seconds, pattern, status, fired_at, paired_message')
      .eq('user_id', user.id)
      .eq('trigger_source', 'autonomous_planner')
      .gte('scheduled_at', dayStart.toISOString())
      .lt('scheduled_at', dayEnd.toISOString())
      .order('scheduled_at', { ascending: true });
    setToday((data || []) as Entry[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (today.length === 0) return null;

  const nextPending = today.find(e => e.status === 'pending' && new Date(e.scheduled_at).getTime() > Date.now());
  const fired = today.filter(e => e.status === 'executed' || e.fired_at).length;

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4a7c4" strokeWidth="1.8">
          <path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
          <line x1="12" y1="18" x2="12.01" y2="18"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f4a7c4', fontWeight: 700 }}>
          Device schedule · today
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {fired}/{today.length} fired
        </span>
      </div>

      {nextPending && (
        <div style={{
          fontSize: 11, color: '#c4b5fd', marginBottom: 8,
          padding: '6px 8px', background: 'rgba(124,58,237,0.1)',
          border: '1px solid rgba(124,58,237,0.25)', borderRadius: 5,
        }}>
          <strong>next:</strong> {new Date(nextPending.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {nextPending.pattern} · intensity {nextPending.intensity}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {today.map(e => {
          const done = e.status === 'executed' || !!e.fired_at;
          const t = new Date(e.scheduled_at);
          const timeStr = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const past = t.getTime() < Date.now();
          return (
            <div key={e.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 8px', borderRadius: 4,
              background: done ? 'rgba(110,231,183,0.08)' : past ? 'rgba(244,114,114,0.08)' : '#0a0a0d',
              border: '1px solid #22222a',
              fontSize: 10.5,
              opacity: done ? 0.7 : 1,
            }}>
              <span style={{ color: done ? '#6ee7b7' : past ? '#f47272' : '#c4b5fd', fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 48 }}>
                {timeStr}
              </span>
              <span style={{ color: '#8a8690' }}>{e.pattern}</span>
              <span style={{ color: '#f4a7c4' }}>{e.intensity}/20</span>
              <span style={{ color: '#8a8690' }}>{e.duration_seconds}s</span>
              <span style={{ marginLeft: 'auto', color: done ? '#6ee7b7' : past ? '#f47272' : '#6a656e', fontSize: 9.5 }}>
                {done ? 'fired' : past ? 'missed' : 'queued'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
