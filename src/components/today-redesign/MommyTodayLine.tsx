/**
 * MommyTodayLine — Mommy is PRESENT. Not a card; her voice, at the top of the
 * day, reading your real state and framing what she wants. This is the piece
 * that makes the home feel like she's running you instead of a to-do list.
 *
 * Composed client-side from real state via the persona translators (no telemetry
 * in voice — arousal/denial/cage become sensory phrases). Deterministic by state,
 * so it's steady, not random.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { arousalToPhrase, chastityToPhrase } from '../../lib/persona/dommy-mommy';

interface St { arousal: number; denialDay: number; caged: boolean; cageDays: number; name: string | null; }

export function MommyTodayLine() {
  const { user } = useAuth();
  const [s, setS] = useState<St | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.id) return;
      try {
        const [us, fem] = await Promise.all([
          supabase.from('user_state').select('current_arousal, denial_day, chastity_locked, chastity_streak_days').eq('user_id', user.id).maybeSingle(),
          supabase.from('feminine_self').select('feminine_name').eq('user_id', user.id).maybeSingle(),
        ]);
        if (!alive) return;
        const u = (us.data ?? {}) as { current_arousal?: number; denial_day?: number; chastity_locked?: boolean; chastity_streak_days?: number };
        setS({
          arousal: Number(u.current_arousal ?? 0),
          denialDay: Number(u.denial_day ?? 0),
          caged: !!u.chastity_locked,
          cageDays: Number(u.chastity_streak_days ?? 0),
          name: ((fem.data as { feminine_name?: string } | null)?.feminine_name) ?? null,
        });
      } catch { /* stay quiet */ }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  if (!s) return null;

  // Compose a present, directive line from real state — sensory, never a number.
  const pet = s.name ? s.name : 'baby';
  const cage = s.caged ? chastityToPhrase(true, s.cageDays) : null;
  const ache = arousalToPhrase(s.arousal);
  const opener = cage
    ? `${cage[0].toUpperCase()}${cage.slice(1)}, ${pet}.`
    : `Here you are, ${pet}.`;
  const middle = s.arousal >= 4
    ? `${ache[0].toUpperCase()}${ache.slice(1)} — good.`
    : `Come closer.`;
  const close = `Mama picked what you need today. Do it in order, and don't rush past the wanting.`;

  return (
    <div className="mommy-voice" style={{
      margin: '2px 16px 6px', padding: '2px 0',
      fontSize: 16, lineHeight: 1.5, color: '#e8d8de', fontStyle: 'italic',
    }}>
      {opener} {middle} {close}
    </div>
  );
}
