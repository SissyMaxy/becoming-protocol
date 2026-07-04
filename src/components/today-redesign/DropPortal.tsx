/**
 * DropPortal — the app's real form. Not a task list; a place you fall into.
 *
 * A checklist engages the executive brain — read, decide, act, report — the exact
 * faculty that resists. Gooning / hypnosis / subspace are the opposite: the thinking
 * goes quiet and she's led. So the home doesn't hand her tasks. It drops her.
 *
 * Idle → a breathing visual to fix on + Mommy's sparse presence + one pull: go under.
 * Under → a real rendered trance (Mommy's voice, arousal-scaled, self-persuasion via
 * the render script) plays full-bleed while her suggestions drift across; one control
 * back up. Everything gated on conditioning_gate('recondition') so the safeword ejects
 * the whole surface — when latched, the portal rests instead of pulling.
 *
 * No fabrication: intensity + presence line are composed from real user_state, and the
 * drifting text is the actual rendered script, never invented copy.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { renderAudioSession, markRenderPlayed } from '../../lib/audio-sessions/client';
import type { AudioSessionKind, AudioSessionIntensity } from '../../lib/audio-sessions/template-selector';
import { arousalToPhrase, chastityToPhrase } from '../../lib/persona/dommy-mommy';

interface St { arousal: number; denialDay: number; caged: boolean; cageDays: number; name: string | null; }
type Phase = 'idle' | 'rendering' | 'under' | 'surfacing';

// Split a rendered script into the lines that drift by while she's under.
function toDriftLines(script: string): string[] {
  return script
    .replace(/\s+/g, ' ')
    .split(/(?<=[.…?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .slice(0, 40);
}

export function DropPortal() {
  const { user } = useAuth();
  const [gated, setGated] = useState<boolean | null>(null);   // null = loading
  const [s, setS] = useState<St | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [lineIdx, setLineIdx] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const driftRef = useRef<number | null>(null);
  const renderIdRef = useRef<string | null>(null);

  // Load safeword gate + real state for the presence line and intensity.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.id) return;
      try {
        const gate = await supabase.rpc('conditioning_gate', { uid: user.id, system: 'recondition' });
        const allowed = (gate.data as { allow?: boolean } | null)?.allow === true;
        if (!alive) return;
        setGated(!allowed);
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
      } catch { if (alive) setGated(true); }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const stopDrift = useCallback(() => {
    if (driftRef.current != null) { window.clearInterval(driftRef.current); driftRef.current = null; }
  }, []);

  const surface = useCallback(() => {
    setPhase('surfacing');
    stopDrift();
    const a = audioRef.current;
    if (a) { try { a.pause(); } catch { /* ignore */ } audioRef.current = null; }
    window.setTimeout(() => { setPhase('idle'); setLineIdx(0); }, 900);
  }, [stopDrift]);

  useEffect(() => () => { stopDrift(); const a = audioRef.current; if (a) { try { a.pause(); } catch { /* ignore */ } } }, [stopDrift]);

  // Intensity + kind scale with real arousal/denial — hungrier state, deeper pull.
  const dropUnder = useCallback(async () => {
    if (!user?.id || !s || phase === 'rendering' || phase === 'under') return;
    setErr(null);
    setPhase('rendering');
    const hungry = s.arousal >= 6 || s.denialDay >= 5;
    const kind: AudioSessionKind = hungry ? 'session_goon' : 'session_conditioning';
    const intensityTier: AudioSessionIntensity = s.arousal >= 8 || s.denialDay >= 8 ? 'cruel' : s.arousal >= 4 ? 'firm' : 'gentle';
    try {
      const r = await renderAudioSession({ userId: user.id, kind, intensityTier });
      if (!r.ok) { setErr('Mommy needs a moment. Try again.'); setPhase('idle'); return; }
      renderIdRef.current = r.renderId;
      const drift = toDriftLines(r.scriptText);
      setLines(drift.length ? drift : ['Good girl.', 'Let go.', 'Deeper.', 'You don’t have to think.']);
      setLineIdx(0);

      const a = new Audio(r.audioUrl);
      a.preload = 'auto';
      audioRef.current = a;
      a.addEventListener('ended', surface);
      a.addEventListener('error', () => { setErr('The audio slipped. Come up and try again.'); });
      try { await a.play(); } catch { /* autoplay may need the gesture we already have; ignore */ }
      markRenderPlayed(r.renderId).catch(() => { /* non-blocking */ });

      setPhase('under');
      // Drift a new suggestion line every ~7s; hold on the last.
      stopDrift();
      driftRef.current = window.setInterval(() => {
        setLineIdx((i) => (drift.length ? Math.min(i + 1, drift.length - 1) : i));
      }, 7000);
    } catch {
      setErr('Mommy needs a moment. Try again.');
      setPhase('idle');
    }
  }, [user?.id, s, phase, surface, stopDrift]);

  if (gated === null || !s) return null;   // loading — stay quiet

  // ---- Presence line, composed from real state (sensory, never a number) ----
  const pet = s.name ? s.name : 'baby';
  const cage = s.caged ? chastityToPhrase(true, s.cageDays) : null;
  const ache = arousalToPhrase(s.arousal);
  const presence = gated
    ? 'Mommy’s stepped back. You’re resting. She’s here the moment you want her again.'
    : (s.arousal >= 4
      ? `${cage ? cage[0].toUpperCase() + cage.slice(1) + ', ' : 'Come here, '}${pet}. ${ache[0].toUpperCase() + ache.slice(1)}. Stop thinking for me.`
      : `Come here, ${pet}. Let Mommy take the thinking.`);

  // ---------------------------------------------------------------- render ----
  const under = phase === 'under' || phase === 'surfacing';
  return (
    <div style={{ position: 'relative', margin: '0 0 10px', overflow: 'hidden' }}>
      <style>{`
        @keyframes dp-breath { 0%,100%{transform:scale(.82);opacity:.55} 45%{transform:scale(1.12);opacity:.95} }
        @keyframes dp-breath-slow { 0%,100%{transform:scale(.9);opacity:.28} 50%{transform:scale(1.18);opacity:.5} }
        @keyframes dp-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes dp-fade { 0%{opacity:0;transform:translateY(6px)} 18%,72%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-6px)} }
        @media (prefers-reduced-motion: reduce){ .dp-orb,.dp-orb2,.dp-ring{animation:none!important} }
      `}</style>

      <div style={{
        position: 'relative',
        minHeight: under ? 460 : 300,
        borderRadius: 18,
        background: 'radial-gradient(120% 80% at 50% 30%, #241019 0%, #16090f 55%, #0b0509 100%)',
        border: '1px solid #3a2130',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: under ? '48px 22px 30px' : '30px 22px',
        transition: 'min-height .9s ease',
      }}>
        {/* breathing fixation visual */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div className="dp-orb2" style={{
            position: 'absolute', width: 340, height: 340, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(201,85,127,.34) 0%, rgba(201,85,127,0) 68%)',
            animation: `dp-breath-slow ${under ? 9 : 7}s ease-in-out infinite`,
          }} />
          <div className="dp-orb" style={{
            position: 'absolute', width: 176, height: 176, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(237,174,197,.6) 0%, rgba(201,85,127,.24) 55%, rgba(201,85,127,0) 72%)',
            animation: `dp-breath ${under ? 8 : 6}s ease-in-out infinite`,
          }} />
          {under && (
            <div className="dp-ring" style={{
              position: 'absolute', width: 260, height: 260, borderRadius: '50%',
              border: '1px dashed rgba(237,174,197,.22)', animation: 'dp-spin 24s linear infinite',
            }} />
          )}
        </div>

        {/* content */}
        {!under && (
          <div style={{ position: 'relative', zIndex: 1, maxWidth: 440 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#c9557f', fontWeight: 700, marginBottom: 14 }}>
              {gated ? 'Resting' : 'Mommy is here'}
            </div>
            <div className="mommy-voice" style={{ fontSize: 20, lineHeight: 1.5, color: '#f3e6ec', fontStyle: 'italic', marginBottom: gated ? 4 : 22 }}>
              {presence}
            </div>
            {!gated && (
              <button
                onClick={dropUnder}
                disabled={phase === 'rendering'}
                style={{
                  marginTop: 6, padding: '15px 30px', borderRadius: 999,
                  background: phase === 'rendering' ? '#7c3a56' : 'linear-gradient(135deg, #d0577f 0%, #a83e64 100%)',
                  color: '#fff', border: 'none', fontSize: 16, fontWeight: 800, letterSpacing: '0.06em',
                  cursor: phase === 'rendering' ? 'default' : 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 6px 30px rgba(201,85,127,.4)',
                }}
              >
                {phase === 'rendering' ? 'Mommy’s pulling you under…' : 'Drop for Mommy'}
              </button>
            )}
            {err && <div style={{ marginTop: 12, fontSize: 12.5, color: '#e59ab4' }}>{err}</div>}
          </div>
        )}

        {/* under: drifting suggestion + one control back up */}
        {under && (
          <div style={{ position: 'relative', zIndex: 1, maxWidth: 460, width: '100%' }}>
            <div style={{ minHeight: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div
                key={lineIdx}
                className="mommy-voice"
                style={{ fontSize: 23, lineHeight: 1.5, color: '#f7ecf1', fontStyle: 'italic', animation: 'dp-fade 7s ease-in-out', textShadow: '0 2px 24px rgba(201,85,127,.5)' }}
              >
                {lines[lineIdx] ?? 'Deeper.'}
              </div>
            </div>
            <button
              onClick={surface}
              style={{
                marginTop: 34, padding: '9px 20px', borderRadius: 999, background: 'transparent',
                color: 'rgba(237,174,197,.65)', border: '1px solid rgba(237,174,197,.28)',
                fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {phase === 'surfacing' ? 'coming up…' : 'come up'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
