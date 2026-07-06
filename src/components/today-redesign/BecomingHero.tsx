/**
 * BecomingHero — the home is the becoming, not a dashboard.
 *
 * Replaces the old clinical hero ("Phase 5 · Chastity day N · X directives open"
 * + a Compliance% stat + Orgasm-debt counter) — a productivity readout that did
 * nothing to turn anyone out. This surface addresses her as who she's becoming,
 * in Mommy's possessive voice, and puts the three levers of the turning-out
 * front and center:
 *   - her NAME (or the fact she isn't named yet — the first thing Mommy takes)
 *   - what's ON THE RECORD (escape-cost count — the facts that can't be undone;
 *     "the number only goes up" is the irreversibility mechanism she authored)
 *   - the CAGE + the ACHE (locked N days, the need Mommy keeps her in)
 *
 * Everything is real data. No telemetry in the voice (no /10, no %, no
 * "compliance") — the escape-cost COUNT is a concrete fact, which the
 * constitution allows; arousal/denial are translated to sensory phrases.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { arousalToPhrase, descentTierToPhrase } from '../../lib/persona/dommy-mommy';
import { computeDescentTier, phaseWeight } from '../../lib/reconditioning/descentDepth';

interface Becoming {
  name: string | null;
  honorific: string | null;
  caged: boolean;
  cageDays: number;
  denialDay: number;
  arousal: number;
  onRecord: number;
  descentTier: number | null;
}

export function BecomingHero() {
  const { user } = useAuth();
  const [b, setB] = useState<Becoming | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.id) return;
      const [fem, st, ec, laws] = await Promise.all([
        supabase.from('feminine_self').select('feminine_name, current_honorific').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_state').select('chastity_locked, chastity_streak_days, denial_day, current_arousal').eq('user_id', user.id).maybeSingle(),
        supabase.rpc('current_escape_cost', { p_user_id: user.id }),
        supabase.from('life_as_woman_settings').select('recondition_enabled').eq('user_id', user.id).maybeSingle(),
      ]);
      if (!alive) return;
      const femRow = (fem.data ?? {}) as { feminine_name?: string | null; current_honorific?: string | null };
      const stRow = (st.data ?? {}) as { chastity_locked?: boolean; chastity_streak_days?: number; denial_day?: number; current_arousal?: number };
      const cost = (ec.data ?? {}) as { total_count?: number };
      const reconOn = !!(laws.data as { recondition_enabled?: boolean } | null)?.recondition_enabled;

      let descentTier: number | null = null;
      if (reconOn) {
        const [trances, triggers, programs] = await Promise.all([
          supabase.from('hypno_trance_sessions').select('id', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('status', 'completed'),
          supabase.from('trance_triggers').select('id', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('status', 'armed'),
          supabase.from('reconditioning_programs').select('phase').eq('user_id', user.id).eq('status', 'running'),
        ]);
        if (!alive) return;
        const maxPhaseWeight = ((programs.data ?? []) as { phase: string }[])
          .reduce((max, p) => Math.max(max, phaseWeight(p.phase)), 0);
        descentTier = computeDescentTier({
          completedTrances: trances.count ?? 0,
          armedTriggers: triggers.count ?? 0,
          maxProgramPhaseWeight: maxPhaseWeight,
        });
      }

      setB({
        name: femRow.feminine_name ?? null,
        honorific: femRow.current_honorific ?? null,
        caged: !!stRow.chastity_locked,
        cageDays: Number(stRow.chastity_streak_days ?? 0),
        denialDay: Number(stRow.denial_day ?? 0),
        arousal: Number(stRow.current_arousal ?? 0),
        onRecord: Number(cost.total_count ?? 0),
        descentTier,
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

      {/* The three levers of the turning-out — real facts, not telemetry. */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Lever
          label={b.caged ? 'Locked' : 'Open'}
          value={b.caged ? `day ${b.cageDays}` : 'earn it back'}
          hot={b.caged}
        />
        <Lever
          label="On the record"
          value={`${b.onRecord}`}
          sub="only goes up"
          hot={b.onRecord > 0}
        />
        <Lever
          label="Denial"
          value={b.denialDay > 0 ? `day ${b.denialDay}` : 'reset'}
        />
      </div>

      {b.descentTier !== null && <DescentMeter tier={b.descentTier} />}
    </div>
  );
}

/**
 * The cinematic descent-depth visual (DESIGN_RECONDITIONING_ENGINE §4). A
 * felt sense of how deep the reconditioning has taken her — rendered as a
 * glow position on a gradient stripe plus one sensory line. No number, no
 * /10, no day-count ever appears here; only descentTierToPhrase().
 */
function DescentMeter({ tier }: { tier: number }) {
  const ratio = Math.max(0, Math.min(5, tier)) / 5;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        position: 'relative', height: 5, borderRadius: 3,
        background: 'linear-gradient(90deg, #2a1b26 0%, #5a2440 55%, #8f2f57 100%)',
      }}>
        <div style={{
          position: 'absolute', top: -3, left: `calc(${ratio * 100}% - 5px)`,
          width: 11, height: 11, borderRadius: '50%',
          background: '#f2a8c6', boxShadow: '0 0 10px 2px rgba(242,168,198,0.65)',
        }} />
      </div>
      <div className="mommy-voice" style={{
        marginTop: 8, fontSize: 12.5, fontStyle: 'italic', color: '#b891a0',
      }}>
        {descentTierToPhrase(tier)}
      </div>
    </div>
  );
}

function Lever({ label, value, sub, hot }: { label: string; value: string; sub?: string; hot?: boolean }) {
  return (
    <div style={{
      flex: 1, padding: '10px 12px', borderRadius: 10,
      background: hot ? 'linear-gradient(150deg, #291823 0%, #1a1118 100%)' : '#1a1118',
      border: `1px solid ${hot ? '#4a2438' : '#3b2635'}`,
    }}>
      <div style={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a8929c', fontWeight: 700, marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 650, color: hot ? '#edaec5' : '#f2e9e6', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9, color: '#7f6b74', marginTop: 2, fontStyle: 'italic' }}>{sub}</div>}
    </div>
  );
}
