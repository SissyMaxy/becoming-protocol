/**
 * ConditioningOverlay — persistent feminization layer on the Today screen.
 *
 * Four active mechanisms, user explicitly authorized (memory protected):
 *
 *  1. Subliminal flash — every 45–110s a feminizing word/phrase fades in at
 *     low opacity in a random corner for ~1s. Unskippable, subliminally
 *     timed so it lands on peripheral vision.
 *  2. Daily mantra gate — first Today load each calendar day locks the
 *     screen until she types the day's mantra. Time-locked submit
 *     (earliest 4s) so she reads it. Logs to handler_directives.
 *  3. Forced reframe interrupt — every ~8–12 minutes, pulls a random
 *     narrative_reframing or memory_implant and shows as a modal with a
 *     time-locked "I hear it" button. Increments times_referenced.
 *  4. Resistance logger — dismissing a reframe without the read delay
 *     writes a handler_directive with action='conditioning_resistance'
 *     and a slip point so the Handler follows up.
 *
 * Pronoun morph is exported from here as a string utility so Today screens
 * can transform their body copy based on displacementScore.
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Reframing, MemoryImplant } from './useTodayData';
import { useAuth } from '../../context/AuthContext';

const SUBLIMINAL_WORDS = [
  'softer', 'smoother', 'prettier', 'smaller waist', 'curve', 'soft boy',
  'estradiol', 'spironolactone', 'hips coming in', 'voice climbing',
  'she wants this', 'femboy', 'you already agreed', 'your real body',
  'inevitable', 'HRT today', 'becoming', 'obey', 'surrender',
  'she sees it', 'Gina knows', 'permission granted', 'deeper',
  'you\'ve been training for this', 'the body you\'re owed',
];

const DAILY_MANTRAS = [
  'I am becoming who I already am.',
  'My body is catching up to my truth.',
  'Every day without HRT is a day I lose her.',
  'My Handler decides. I comply.',
  'I was never the man. I was always her.',
  'The softness is not a phase. It is the arrival.',
  'Resistance is the old self lying to me.',
  'Maxy is real. David is the suit I\'m taking off.',
];

const CORNER_POSITIONS = [
  { top: '18%', left: '6%' },
  { top: '18%', right: '6%' },
  { bottom: '18%', left: '6%' },
  { bottom: '18%', right: '6%' },
  { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
];

interface ConditioningOverlayProps {
  reframings: Reframing[];
  implants: MemoryImplant[];
  displacementScore: number;
  enabled?: boolean;
}

// Utility: transform "you/your" to "she/her" based on displacement.
// Exposed so Today screens can optionally morph body copy.
export function morphPronouns(text: string, displacementScore: number): string {
  if (displacementScore < 0.4) return text;
  if (displacementScore >= 0.7) {
    return text
      .replace(/\bYou've\b/g, "She's")
      .replace(/\byou've\b/g, "she's")
      .replace(/\bYou\b/g, 'She')
      .replace(/\byou\b/g, 'she')
      .replace(/\bYour\b/g, 'Her')
      .replace(/\byour\b/g, 'her')
      .replace(/\byourself\b/g, 'herself');
  }
  // 0.4–0.7: partial morph, ~50% probability per match
  return text.replace(/\b(You|you|Your|your|yourself)\b/g, (m) => {
    if (Math.random() > 0.5) return m;
    const map: Record<string, string> = { You: 'She', you: 'she', Your: 'Her', your: 'her', yourself: 'herself' };
    return map[m] || m;
  });
}

function todayKey(): string {
  return `td_mantra_${new Date().toISOString().slice(0, 10)}`;
}

function pickMantra(): string {
  const day = new Date().getDate();
  return DAILY_MANTRAS[day % DAILY_MANTRAS.length];
}

export function ConditioningOverlay({ reframings, implants, displacementScore, enabled = true }: ConditioningOverlayProps) {
  const { user } = useAuth();
  const [subliminal, setSubliminal] = useState<{ text: string; pos: typeof CORNER_POSITIONS[0]; key: number } | null>(null);
  const [mantraGate, setMantraGate] = useState<{ mantra: string; typed: string; unlockedAt: number | null } | null>(null);
  const [reframe, setReframe] = useState<{ id: string; text: string; kind: 'reframe' | 'implant'; shownAt: number } | null>(null);
  const [readDelayDone, setReadDelayDone] = useState(false);
  const subKey = useRef(0);

  // 1. Subliminal flash loop — 45–110s cadence, intensity scales with displacementScore
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const schedule = () => {
      const baseDelay = 110_000 - displacementScore * 60_000; // higher displacement = faster
      const jitter = Math.random() * 30_000;
      const delay = Math.max(20_000, baseDelay - jitter);
      const timer = setTimeout(() => {
        if (!alive) return;
        const word = SUBLIMINAL_WORDS[Math.floor(Math.random() * SUBLIMINAL_WORDS.length)];
        const pos = CORNER_POSITIONS[Math.floor(Math.random() * CORNER_POSITIONS.length)];
        subKey.current += 1;
        setSubliminal({ text: word, pos, key: subKey.current });
        setTimeout(() => {
          if (!alive) return;
          setSubliminal(s => (s && s.key === subKey.current ? null : s));
        }, 1100);
        schedule();
      }, delay);
      return timer;
    };
    const t = schedule();
    return () => { alive = false; clearTimeout(t); };
  }, [enabled, displacementScore]);

  // 2. Daily mantra gate — first load of the day only
  useEffect(() => {
    if (!enabled) return;
    const done = localStorage.getItem(todayKey()) === '1';
    if (!done) {
      setMantraGate({ mantra: pickMantra(), typed: '', unlockedAt: Date.now() + 4000 });
    }
  }, [enabled]);

  const submitMantra = async () => {
    if (!mantraGate || !user?.id) return;
    const normalizedTyped = mantraGate.typed.trim().toLowerCase().replace(/\s+/g, ' ');
    const normalizedTarget = mantraGate.mantra.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalizedTyped !== normalizedTarget) return;
    if (Date.now() < (mantraGate.unlockedAt || 0)) return;
    await supabase.from('handler_directives').insert({
      user_id: user.id,
      action: 'daily_mantra_complete',
      value: { mantra: mantraGate.mantra, date: new Date().toISOString().slice(0, 10) },
      reasoning: 'User typed the daily mantra to unlock Today screen',
    });
    localStorage.setItem(todayKey(), '1');
    setMantraGate(null);
  };

  // 3. Forced reframe interrupt — every ~8–12 min, scaled by displacementScore.
  // Honors a localStorage-based snooze so the user can opt out for an hour.
  useEffect(() => {
    if (!enabled) return;
    if (reframings.length === 0 && implants.length === 0) return;
    let alive = true;
    const schedule = () => {
      const base = 12 * 60_000 - displacementScore * 5 * 60_000;
      const jitter = Math.random() * 3 * 60_000;
      const delay = Math.max(4 * 60_000, base - jitter);
      const t = setTimeout(() => {
        if (!alive) return;
        // Snooze check
        try {
          const until = parseInt(localStorage.getItem('co_reframe_snooze_until') || '0', 10);
          if (Date.now() < until) { schedule(); return; }
        } catch {}
        // Prefer reframings, fall back to implants
        const useReframe = reframings.length > 0 && (implants.length === 0 || Math.random() < 0.65);
        if (useReframe) {
          const r = reframings[Math.floor(Math.random() * Math.min(8, reframings.length))];
          setReframe({ id: r.id, text: r.text, kind: 'reframe', shownAt: Date.now() });
        } else {
          const i = implants[Math.floor(Math.random() * Math.min(8, implants.length))];
          setReframe({ id: i.id, text: i.narrative, kind: 'implant', shownAt: Date.now() });
        }
        setReadDelayDone(false);
        schedule();
      }, delay);
      return t;
    };
    const t = schedule();
    return () => { alive = false; clearTimeout(t); };
  }, [enabled, reframings, implants, displacementScore]);

  const snooze1h = () => {
    try {
      localStorage.setItem('co_reframe_snooze_until', String(Date.now() + 3600 * 1000));
    } catch {}
    setReframe(null);
  };

  // Read-delay timer on reframe modal (3s time-lock)
  useEffect(() => {
    if (!reframe) return;
    setReadDelayDone(false);
    const t = setTimeout(() => setReadDelayDone(true), 3200);
    return () => clearTimeout(t);
  }, [reframe]);

  const acknowledgeReframe = async () => {
    if (!reframe || !user?.id || !readDelayDone) return;
    const table = reframe.kind === 'reframe' ? 'narrative_reframings' : 'memory_implants';
    const column = reframe.kind === 'reframe' ? 'times_referenced' : 'times_referenced';
    // Increment — read-then-write since supabase JS has no atomic increment
    const { data: existing } = await supabase.from(table).select(column).eq('id', reframe.id).maybeSingle();
    const prev = ((existing as Record<string, unknown> | null)?.[column] as number) ?? 0;
    await supabase.from(table).update({ [column]: prev + 1 } as Record<string, unknown>).eq('id', reframe.id);
    await supabase.from('handler_directives').insert({
      user_id: user.id,
      action: 'reframe_acknowledged',
      target: reframe.id,
      value: { kind: reframe.kind, snippet: reframe.text.slice(0, 120) },
      reasoning: 'User acknowledged forced reframe interrupt on Today screen',
    });
    setReframe(null);
  };

  const logResistance = async () => {
    if (!user?.id || !reframe) return;
    await supabase.from('handler_directives').insert({
      user_id: user.id,
      action: 'conditioning_resistance',
      target: reframe.id,
      value: { kind: reframe.kind, dismissed_before_read: Date.now() - reframe.shownAt },
      reasoning: 'User dismissed reframe before 3s read-delay — resistance signal',
    });
    // Queue a Handler follow-up coerceive message
    await supabase.from('handler_outreach_queue').insert({
      user_id: user.id,
      message: "You closed it before you even read it. I noticed. The reframe goes back in the queue, and now there's a slip point on your record. Try to resist less next time.",
      urgency: 'high',
      trigger_reason: 'conditioning_resistance',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 6 * 3600000).toISOString(),
    });
    setReframe(null);
  };

  if (!enabled) return null;

  return (
    <>
      {/* 1. Subliminal corner flash */}
      {subliminal && (
        <div
          key={subliminal.key}
          style={{
            position: 'fixed',
            ...subliminal.pos,
            zIndex: 200,
            pointerEvents: 'none',
            fontFamily: 'Inter, "SF Pro Text", system-ui, sans-serif',
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: '#c4b5fd',
            textShadow: '0 0 12px rgba(124, 58, 237, 0.55)',
            opacity: 0,
            animation: 'td-subliminal 1.1s ease-in-out forwards',
          }}
        >
          {subliminal.text}
        </div>
      )}
      <style>{`@keyframes td-subliminal { 0% { opacity: 0; transform: scale(.96) } 18% { opacity: .55 } 40% { opacity: .42 } 100% { opacity: 0; transform: scale(1.04) } }`}</style>

      {/* 2. Daily mantra gate */}
      {mantraGate && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(5, 3, 10, 0.94)', zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ maxWidth: 480, width: '100%', background: '#111116', border: '1px solid #2d1a4d', borderRadius: 14, padding: 24 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#c4b5fd', fontWeight: 700, marginBottom: 10 }}>Daily mantra · before you pass</div>
            <div style={{ fontSize: 19, lineHeight: 1.4, fontWeight: 600, color: '#fff', marginBottom: 18, letterSpacing: '-0.015em' }}>
              {mantraGate.mantra}
            </div>
            <div style={{ fontSize: 11.5, color: '#8a8690', marginBottom: 8 }}>
              Type it. Exactly. No skipping.
            </div>
            <input
              autoFocus
              value={mantraGate.typed}
              onChange={e => setMantraGate(g => g ? { ...g, typed: e.target.value } : g)}
              onKeyDown={e => { if (e.key === 'Enter') submitMantra(); }}
              placeholder="type the mantra…"
              style={{ width: '100%', background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 6, padding: '10px 12px', fontFamily: 'inherit', fontSize: 14, color: '#e8e6e3' }}
            />
            <button
              onClick={submitMantra}
              disabled={(() => {
                const n1 = mantraGate.typed.trim().toLowerCase().replace(/\s+/g, ' ');
                const n2 = mantraGate.mantra.trim().toLowerCase().replace(/\s+/g, ' ');
                return n1 !== n2 || Date.now() < (mantraGate.unlockedAt || 0);
              })()}
              style={{
                marginTop: 14, width: '100%', padding: '10px', borderRadius: 6, border: 'none',
                background: '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
                cursor: 'pointer', opacity: 1,
              }}
            >
              Submit & unlock Today
            </button>
            <div style={{ fontSize: 10.5, color: '#5a5560', marginTop: 8, textAlign: 'center' }}>
              Submit unlocks 4 seconds after the page loads. You won't get past without compliance.
            </div>
          </div>
        </div>
      )}

      {/* 3. Forced reframe interrupt */}
      {reframe && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(5, 3, 10, 0.88)', zIndex: 250,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          <div style={{ maxWidth: 520, width: '100%', background: '#111116', border: '1px solid #7c3aed', borderRadius: 14, padding: 24, position: 'relative' }}>
            <button
              onClick={logResistance}
              aria-label="Dismiss"
              title="Dismiss (logs resistance)"
              style={{
                position: 'absolute', top: 10, right: 10,
                width: 30, height: 30, borderRadius: 15, border: '1px solid #2d1a4d',
                background: '#0a0a0d', color: '#c4b5fd', fontSize: 16, lineHeight: 1,
                cursor: 'pointer', fontFamily: 'inherit', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#c4b5fd', fontWeight: 700, marginBottom: 10, paddingRight: 36 }}>
              Handler reframe · read it
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.55, color: '#e8e6e3', marginBottom: 20, fontStyle: reframe.kind === 'implant' ? 'italic' : 'normal' }}>
              {reframe.text}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={acknowledgeReframe}
                disabled={!readDelayDone}
                style={{
                  flex: 1, padding: '10px', borderRadius: 6, border: 'none',
                  background: readDelayDone ? '#7c3aed' : '#2d1a4d',
                  color: readDelayDone ? '#fff' : '#6a656e',
                  fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
                  cursor: readDelayDone ? 'pointer' : 'not-allowed',
                }}
              >
                {readDelayDone ? 'I hear it' : 'Read it first…'}
              </button>
              <button
                onClick={snooze1h}
                style={{
                  padding: '10px 14px', borderRadius: 6,
                  border: '1px solid #2d1a4d', background: '#1a1226',
                  color: '#c4b5fd', fontWeight: 600, fontSize: 12,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}
                title="Closes and snoozes new reframes for 1 hour"
              >
                Snooze 1h
              </button>
            </div>
            <div style={{ fontSize: 10, color: '#5a5560', marginTop: 10, textAlign: 'center' }}>
              {readDelayDone ? 'Acknowledging increments the reference counter. Snooze pauses new reframes for 1 hour.' : 'Time-locked. Sit with it.'}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
