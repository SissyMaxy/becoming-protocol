/**
 * MantraStreakCard — consecutive days completing the morning mantra gate.
 * Visible gamified reinforcement. Losing the streak = visible cost.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export function MantraStreakCard() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<string[]>([]);
  const [currentMantra, setCurrentMantra] = useState<string>('');
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [subRes, winRes] = await Promise.all([
      supabase.from('morning_mantra_submissions')
        .select('submission_date')
        .eq('user_id', user.id)
        .gte('submission_date', new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10))
        .order('submission_date', { ascending: false }),
      supabase.from('morning_mantra_windows').select('current_mantra').eq('user_id', user.id).maybeSingle(),
    ]);
    setSubmissions(((subRes.data || []) as Array<{ submission_date: string }>).map(r => r.submission_date));
    setCurrentMantra(((winRes.data as { current_mantra?: string } | null)?.current_mantra) || '');
    setReady(true);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!ready) return null;

  // Compute current streak: consecutive days up to and including today
  const today = new Date().toISOString().slice(0, 10);
  const todayDate = new Date(today);
  let streak = 0;
  const dateSet = new Set(submissions);
  for (let i = 0; i < 365; i++) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (dateSet.has(key)) streak++;
    else if (i > 0) break;  // Allow today to not be submitted yet; break on first missing past day
  }
  // Include today in streak display only if submitted
  const submittedToday = dateSet.has(today);

  // Longest streak — scan
  let longest = 0;
  let cur = 0;
  const sortedDates = [...submissions].sort();
  let prev: string | null = null;
  for (const d of sortedDates) {
    if (!prev) { cur = 1; prev = d; continue; }
    const prevD = new Date(prev);
    const thisD = new Date(d);
    const diffDays = Math.round((thisD.getTime() - prevD.getTime()) / 86400000);
    if (diffDays === 1) cur++;
    else cur = 1;
    longest = Math.max(longest, cur);
    prev = d;
  }
  longest = Math.max(longest, cur);

  if (submissions.length === 0) return null;

  // Grid of last 28 days
  const grid: Array<{ date: string; done: boolean }> = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    grid.push({ date: key, done: dateSet.has(key) });
  }

  return (
    <div style={{ background: '#171017', border: '1px solid #4a2438', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e6bd80" strokeWidth="1.8">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#e6bd80', fontWeight: 700 }}>
          Mantra streak
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: submittedToday ? '#e6bd80' : '#9c8590', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {streak}
        </div>
        <div style={{ fontSize: 11.5, color: '#9c8590' }}>
          {submittedToday ? 'day streak · today done' : 'days · not yet today'}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 10, color: '#7f6b74' }}>
          best: {longest}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(28, 1fr)', gap: 2, marginBottom: 10 }}>
        {grid.map((g, i) => (
          <div
            key={i}
            title={`${g.date} ${g.done ? '· done' : '· missed'}`}
            style={{
              aspectRatio: '1/1',
              background: g.done ? '#e6bd80' : g.date === today ? 'rgba(244,194,114,0.12)' : '#2b1d29',
              border: g.date === today ? '1px solid #e6bd80' : 'none',
              borderRadius: 2,
            }}
          />
        ))}
      </div>

      {currentMantra && (
        <div style={{ fontSize: 10.5, color: '#9c8590', fontStyle: 'italic', padding: '5px 8px', background: '#0f0a0e', borderRadius: 4 }}>
          today's mantra: "{currentMantra}"
        </div>
      )}
    </div>
  );
}
