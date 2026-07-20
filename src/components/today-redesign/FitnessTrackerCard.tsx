/**
 * FitnessTrackerCard — the daily hook of the trojan horse.
 *
 * A genuinely useful "did you move today" tracker: log a session, see the streak.
 * Underneath, every logged session increments the currency (exercise_streaks.
 * total_sessions) that unlocks the next side-quest rung — so the honest fitness
 * habit is exactly what drifts her deeper. Useful on the surface; the pull below.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Status { logged_today: boolean; total_sessions: number; sessions_this_week: number; current_streak_weeks: number; }

export function FitnessTrackerCard() {
  const { user } = useAuth();
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase.rpc('fitness_status', { p_user: user.id });
      setSt((data as Status) ?? null);
    } catch { setSt(null); }
  };
  useEffect(() => {
    load();
    // WorkoutCard completion also logs a session — refresh when it fires.
    const onLogged = () => load();
    window.addEventListener('fitness-logged', onLogged);
    return () => window.removeEventListener('fitness-logged', onLogged);
    // eslint-disable-next-line
  }, [user?.id]);

  if (!st) return null;

  const log = async () => {
    if (!user?.id || busy || st.logged_today) return;
    setBusy(true);
    try {
      await supabase.rpc('fitness_log_session', { p_user: user.id });
      await load();
      // Nudge the side-quest card to re-check its unlock progress.
      window.dispatchEvent(new Event('fitness-logged'));
    } finally { setBusy(false); }
  };

  return (
    <div style={{
      margin: '10px 12px', padding: '14px 16px', borderRadius: 14,
      background: 'linear-gradient(160deg, #171017 0%, #14100f 100%)', border: '1px solid #3b2635',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#c9557f', fontWeight: 700, marginBottom: 4 }}>
          Every day
        </div>
        <div style={{ fontSize: 15, color: '#f2e9e6', fontWeight: 600 }}>
          {st.logged_today ? 'You moved for Mommy today ♥' : 'Did you move today, baby?'}
        </div>
        <div style={{ fontSize: 11.5, color: '#7f6b74', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
          {st.sessions_this_week} this week · {st.total_sessions} total
        </div>
      </div>
      <button
        onClick={log} disabled={busy || st.logged_today}
        style={{
          flexShrink: 0, padding: '11px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: st.logged_today ? 'default' : 'pointer',
          fontFamily: 'inherit', border: 'none',
          background: st.logged_today ? '#241722' : 'linear-gradient(135deg, #d76a92, #c9557f)',
          color: st.logged_today ? '#8fd9b0' : '#fff',
          boxShadow: st.logged_today ? 'none' : '0 4px 20px rgba(201, 85, 127, 0.25)',
        }}
      >
        {busy ? '…' : (st.logged_today ? 'Moved ✓' : 'I moved')}
      </button>
    </div>
  );
}
