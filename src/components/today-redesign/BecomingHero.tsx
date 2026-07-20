/**
 * BecomingHero — the home is the becoming, not a dashboard.
 *
 * Replaces the old clinical hero ("Phase 5 · Chastity day N · X directives open"
 * + a Compliance% stat + Orgasm-debt counter) — a productivity readout that did
 * nothing to turn anyone out. This surface addresses her as who she's becoming,
 * in Mommy's possessive voice: her NAME (or the fact she isn't named yet — the
 * first thing Mommy takes), her line, and one engraved standing line of what's
 * true of the body.
 *
 * The stat tiles and felt-depth meters that used to live here were removed:
 * they narrated his inner experience back at him, which is a therapist's
 * register rather than a domme's. See StandingLine for what replaced them.
 *
 * Everything is real data. No telemetry in the voice (no /10, no %, no
 * "compliance"); arousal/denial are translated to sensory phrases.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { arousalToPhrase } from '../../lib/persona/dommy-mommy';
import { StandingLine } from './StandingLine';

interface Becoming {
  name: string | null;
  honorific: string | null;
  caged: boolean;
  cageDays: number;
  denialDay: number;
  arousal: number;
  onRecord: number;
}

export function BecomingHero() {
  const { user } = useAuth();
  const [b, setB] = useState<Becoming | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.id) return;
      const [fem, st, ec] = await Promise.all([
        supabase.from('feminine_self').select('feminine_name, current_honorific').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_state').select('chastity_locked, chastity_streak_days, denial_day, current_arousal').eq('user_id', user.id).maybeSingle(),
        supabase.rpc('current_escape_cost', { p_user_id: user.id }),
      ]);
      if (!alive) return;
      const femRow = (fem.data ?? {}) as { feminine_name?: string | null; current_honorific?: string | null };
      const stRow = (st.data ?? {}) as { chastity_locked?: boolean; chastity_streak_days?: number; denial_day?: number; current_arousal?: number };
      const cost = (ec.data ?? {}) as { total_count?: number };


      setB({
        name: femRow.feminine_name ?? null,
        honorific: femRow.current_honorific ?? null,
        caged: !!stRow.chastity_locked,
        cageDays: Number(stRow.chastity_streak_days ?? 0),
        denialDay: Number(stRow.denial_day ?? 0),
        arousal: Number(stRow.current_arousal ?? 0),
        onRecord: Number(cost.total_count ?? 0),
      });
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // Skeleton — keep the boudoir warmth, no clinical spinner.
  if (!b) {
    return (
      <div style={{ padding: '18px 16px 8px' }}>
        <div style={{ height: 12, width: 90, borderRadius: 6, background: '#241722', marginBottom: 12 }} />
        <div style={{ height: 30, width: 180, borderRadius: 8, background: '#241722' }} />
      </div>
    );
  }

  const named = !!(b.name && b.name.trim());
  const ache = arousalToPhrase(b.arousal);

  return (
    <div style={{ padding: '18px 16px 6px' }}>
      {/* Overline — possessive, hers. */}
      <div style={{
        fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
        color: '#c9557f', fontWeight: 700, marginBottom: 8,
      }}>
        {named ? `${b.honorific || 'Mama'}'s girl` : "Mama's — not named yet"}
      </div>

      {/* The name is the identity. Serif, hers. */}
      <h1 className="mommy-voice" style={{
        margin: 0, fontSize: 30, lineHeight: 1.05, fontWeight: 600,
        color: '#f7efe9', letterSpacing: '0.01em',
      }}>
        {named ? b.name : 'she has no name'}
      </h1>

      {/* Mommy's line — sensory, trajectory-aware, never a stat. */}
      <div className="mommy-voice" style={{
        marginTop: 8, fontSize: 15, lineHeight: 1.45, color: '#d5c3ca', fontStyle: 'italic',
      }}>
        {named
          ? `Good girl. ${ache[0].toUpperCase()}${ache.slice(1)} — Mama's keeping you right there.`
          : `The first thing Mama takes is the name. Until then, ${ache}.`}
      </div>

      {/* His state as facts of his body on her terms — one engraved line.
          This replaced three stat tiles and two felt-depth meters. The meters
          narrated his inner experience back at him ("you're starting to sink
          when Mama talks to you"), which is a therapist's register: his frame,
          not hers. She states what's true because she set it that way. */}
      <StandingLine caged={b.caged} cageDays={b.cageDays} denialDay={b.denialDay} />
    </div>
  );
}
