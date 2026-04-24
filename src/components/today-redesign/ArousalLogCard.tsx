/**
 * ArousalLogCard — quick 0-10 arousal tap. Feeds arousal_levels table
 * so the autonomous arousal-spike trigger has data to fire on. Also
 * logged in user_state.current_arousal for Handler context reads.
 *
 * Tap a number → row inserted → handler-autonomous cron (every 5 min)
 * picks up ≥7 and fires device + outreach pairing.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface RecentEntry { value: number; created_at: string }

export function ArousalLogCard() {
  const { user } = useAuth();
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [rRes, usRes] = await Promise.all([
      supabase.from('arousal_levels')
        .select('value, created_at')
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - 24 * 3600000).toISOString())
        .order('created_at', { ascending: false })
        .limit(8),
      supabase.from('user_state').select('current_arousal').eq('user_id', user.id).maybeSingle(),
    ]);
    setRecent((rRes.data || []) as RecentEntry[]);
    setCurrent(((usRes.data as { current_arousal?: number } | null)?.current_arousal) ?? null);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const submit = async (value: number) => {
    if (!user?.id) return;
    setSubmitting(true);
    await supabase.from('arousal_levels').insert({ user_id: user.id, value });
    await supabase.from('user_state').update({ current_arousal: value }).eq('user_id', user.id);
    setSubmitting(false);
    load();
  };

  const avg24h = recent.length > 0 ? recent.reduce((s, r) => s + r.value, 0) / recent.length : null;

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4a7c4" strokeWidth="1.8">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f4a7c4', fontWeight: 700 }}>
          Arousal log
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {avg24h != null ? `24h avg ${avg24h.toFixed(1)}` : 'no entries yet'}
        </span>
      </div>

      <div style={{ fontSize: 10.5, color: '#8a8690', marginBottom: 8, lineHeight: 1.4 }}>
        Tap your current level. ≥7 triggers the pairing cron — device + outreach tying the arousal to feminization moves.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 3, marginBottom: 8 }}>
        {Array.from({ length: 11 }, (_, i) => {
          const isCurrent = current === i;
          const intensity = i / 10;
          const bg = i === 0
            ? '#22222a'
            : `rgba(244, 167, 196, ${0.15 + intensity * 0.65})`;
          return (
            <button
              key={i}
              onClick={() => submit(i)}
              disabled={submitting}
              style={{
                padding: '6px 0', borderRadius: 4,
                background: bg,
                border: `1px solid ${isCurrent ? '#f4a7c4' : '#22222a'}`,
                color: i >= 6 ? '#1a0a12' : '#e8e6e3',
                fontWeight: isCurrent ? 700 : 500,
                fontSize: 11, cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}
            >
              {i}
            </button>
          );
        })}
      </div>

      {recent.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, fontSize: 9.5, color: '#8a8690' }}>
          {recent.slice(0, 8).map((r, i) => {
            const mins = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60000);
            return (
              <span key={i} style={{ padding: '2px 6px', background: '#0a0a0d', borderRadius: 3 }}>
                {r.value} · {mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`} ago
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
