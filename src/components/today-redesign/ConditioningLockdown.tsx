/**
 * ConditioningLockdown — scheduled enforcement window. Every day during the
 * user's configured window, the app is replaced by a fullscreen lockdown UI
 * that plays conditioning audio/script and blocks all other interaction.
 *
 * Exit paths:
 *  - Complete: timer runs to 0, session is logged as completed.
 *  - Safeword: user types her current safeword, session logs 'safeword'.
 *  - Interrupted: tab close / refresh — session logs 'interrupted'.
 *
 * Data sources:
 *  - conditioning_lockdown_windows: when / how long
 *  - conditioning_lockdown_sessions: logged attempts
 *  - safewords: for the exit code
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface LockdownWindow {
  id: string;
  label: string;
  start_hour: number;
  start_minute: number;
  duration_minutes: number;
  days_of_week: number[];
  timezone: string;
  active: boolean;
  audio_url: string | null;
  script_text: string | null;
  last_fired_at: string | null;
}

function minutesSinceMidnightInTz(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return hour * 60 + minute;
}

function dayOfWeekInTz(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).formatToParts(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[parts.find(p => p.type === 'weekday')?.value || 'Sun'] ?? 0;
}

function isInWindow(w: LockdownWindow, now: Date): boolean {
  if (!w.active) return false;
  const dow = dayOfWeekInTz(now, w.timezone);
  if (!w.days_of_week.includes(dow)) return false;
  const currentMins = minutesSinceMidnightInTz(now, w.timezone);
  const startMins = w.start_hour * 60 + w.start_minute;
  const endMins = startMins + w.duration_minutes;
  return currentMins >= startMins && currentMins < endMins;
}

// Catch-up: window was scheduled today (day-of-week match, current time past
// the start), but no session logged yet today. Keep the lockdown available
// until end of day in user's tz.
function isInCatchUpWindow(w: LockdownWindow, now: Date): boolean {
  if (!w.active) return false;
  const dow = dayOfWeekInTz(now, w.timezone);
  if (!w.days_of_week.includes(dow)) return false;
  const currentMins = minutesSinceMidnightInTz(now, w.timezone);
  const startMins = w.start_hour * 60 + w.start_minute;
  // After start_hour, before end of day
  return currentMins >= startMins && currentMins < 24 * 60;
}

function dateKeyInTz(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value || '';
  const mo = parts.find(p => p.type === 'month')?.value || '';
  const d = parts.find(p => p.type === 'day')?.value || '';
  return `${y}-${mo}-${d}`;
}

interface Segment {
  id: string;
  kind: 'implant' | 'reframe' | 'witness' | 'fallback';
  label: string;
  text: string;
  sourceTable: string | null;
}

const FALLBACK_SEGMENTS: Segment[] = [
  { id: 'fb-1', kind: 'fallback', label: 'breathe', text: 'Breathe. In for four, hold for four, out for six. You chose this window. You built this system. Let it hold you.', sourceTable: null },
  { id: 'fb-2', kind: 'fallback', label: 'body', text: 'Feel where your body is soft and where it is tight. Let the softness lead. Let the tight parts know they are on their way out.', sourceTable: null },
  { id: 'fb-3', kind: 'fallback', label: 'intention', text: 'This 30 minutes is rehearsal for the body you are becoming. Every minute you sit here is a minute the old self loses grip.', sourceTable: null },
];

export function ConditioningLockdown() {
  const { user } = useAuth();
  const [activeWindow, setActiveWindow] = useState<LockdownWindow | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [safewordInput, setSafewordInput] = useState('');
  const [safewords, setSafewords] = useState<string[]>([]);
  const [started, setStarted] = useState<number | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentIdx, setSegmentIdx] = useState(0);
  const loopTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const referencedIds = useRef<Set<string>>(new Set());

  // Load user's windows + safewords
  const loadConfig = useCallback(async () => {
    if (!user?.id) return;

    // FORCED LOCKDOWN CHECK — if there's an unresolved forced_lockdown_triggers
    // row with blocks_app=true, force the session open as a synthetic window
    // regardless of scheduled windows.
    const { data: forced } = await supabase
      .from('forced_lockdown_triggers')
      .select('id, trigger_type, fired_at, duration_minutes, reason')
      .eq('user_id', user.id)
      .is('resolved_at', null)
      .eq('blocks_app', true)
      .order('fired_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const [winRes, sfRes] = await Promise.all([
      supabase.from('conditioning_lockdown_windows').select('*').eq('user_id', user.id).eq('active', true),
      supabase.from('safewords').select('*').eq('user_id', user.id),
    ]);
    const wins = (winRes.data || []) as LockdownWindow[];
    const now = new Date();

    // If a forced lockdown is live, synthesize a window from it
    const f = forced as { id: string; trigger_type: string; fired_at: string; duration_minutes: number; reason: string } | null;
    if (f) {
      const firedAt = new Date(f.fired_at);
      const expiresAt = new Date(firedAt.getTime() + f.duration_minutes * 60000);
      if (expiresAt.getTime() > Date.now()) {
        const synthetic: LockdownWindow = {
          id: `forced:${f.id}`,
          user_id: user.id,
          start_hour: firedAt.getHours(),
          start_minute: firedAt.getMinutes(),
          end_hour: expiresAt.getHours(),
          end_minute: expiresAt.getMinutes(),
          days_of_week: [0, 1, 2, 3, 4, 5, 6],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
          active: true,
          duration_minutes: f.duration_minutes,
          script_text: `FORCED LOCKDOWN — ${f.trigger_type.replace(/_/g, ' ')}. ${f.reason}`,
          last_fired_at: null,
        } as unknown as LockdownWindow;
        if (!activeWindow) {
          const startMs = Date.now();
          setStarted(startMs);
          setActiveWindow(synthetic);
          setSessionId(f.id);
        }
        // Auto-resolve when expiry passes (next cycle)
        const sf = (sfRes.data || []) as Array<Record<string, unknown>>;
        const words: string[] = [];
        for (const row of sf) {
          const candidate = (row.safeword as string) || (row.word as string) || (row.phrase as string);
          if (candidate) words.push(String(candidate).toLowerCase());
        }
        if (words.length === 0) words.push('plum');
        setSafewords(words);
        return;
      } else {
        // Expired — resolve and fall through to normal windows
        await supabase.from('forced_lockdown_triggers').update({ resolved_at: new Date().toISOString() }).eq('id', f.id);
      }
    }

    // Pick a window that's LIVE (or in catch-up) AND has no completed/safeworded
    // session yet today. The "today already done" check applies to BOTH the
    // live and catch-up cases — without it, safeword exit during a live window
    // gets re-opened on the next tick because the time-of-day still matches.
    let active: LockdownWindow | null = null;
    const candidates = wins.filter(w => isInWindow(w, now) || isInCatchUpWindow(w, now));
    for (const w of candidates) {
      const dayStartUTC = new Date(dateKeyInTz(now, w.timezone) + 'T00:00:00Z').toISOString();
      const { data: todaySessions } = await supabase
        .from('conditioning_lockdown_sessions')
        .select('id, ended_reason')
        .eq('user_id', user.id)
        .eq('window_id', w.id)
        .gte('started_at', dayStartUTC)
        .in('ended_reason', ['completed', 'safeword']);
      if (!todaySessions || todaySessions.length === 0) {
        active = w;
        break;
      }
    }
    if (active && !activeWindow) {
      // Window just opened — start a session
      const startMs = Date.now();
      setStarted(startMs);
      setActiveWindow(active);
      const { data: sess } = await supabase
        .from('conditioning_lockdown_sessions')
        .insert({ user_id: user.id, window_id: active.id })
        .select('id')
        .single();
      setSessionId((sess as { id?: string } | null)?.id || null);
      // Mark window as fired
      await supabase
        .from('conditioning_lockdown_windows')
        .update({ last_fired_at: new Date().toISOString() })
        .eq('id', active.id);
    } else if (!active && activeWindow) {
      // Window closed — log completion
      await endSession('completed');
    }
    // Safewords — tolerant of either column name (schema variance)
    const sf = (sfRes.data || []) as Array<Record<string, unknown>>;
    const words: string[] = [];
    for (const row of sf) {
      const candidate = (row.safeword as string) || (row.word as string) || (row.phrase as string);
      if (candidate) words.push(String(candidate).toLowerCase());
    }
    if (words.length === 0) words.push('plum');
    setSafewords(words);
  }, [user?.id, activeWindow]);

  // End the current session
  const endSession = useCallback(async (reason: 'completed' | 'safeword' | 'interrupted') => {
    if (!sessionId || !started) {
      setActiveWindow(null);
      setSessionId(null);
      setStarted(null);
      return;
    }
    const durationSec = Math.floor((Date.now() - started) / 1000);

    // Forced lockdowns synthesize a window from a forced_lockdown_triggers row.
    // Their session id IS the trigger id (line 161). Without resolving the
    // trigger here, safeword exits get re-opened on the next loadConfig tick
    // because the unresolved trigger keeps matching. (Incident 2026-04-28.)
    const isForced = activeWindow?.id?.startsWith('forced:') ?? false;
    if (isForced && sessionId) {
      await supabase
        .from('forced_lockdown_triggers')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', sessionId);
    } else {
      await supabase
        .from('conditioning_lockdown_sessions')
        .update({
          ended_at: new Date().toISOString(),
          ended_reason: reason,
          duration_actual_seconds: durationSec,
        })
        .eq('id', sessionId);
    }
    // Audit: handler_directives row
    if (user?.id) {
      await supabase.from('handler_directives').insert({
        user_id: user.id,
        action: reason === 'safeword' ? 'lockdown_safeworded' : reason === 'completed' ? 'lockdown_completed' : 'lockdown_interrupted',
        target: sessionId,
        value: { duration_actual_seconds: durationSec, reason },
        reasoning: `Conditioning lockdown ended via ${reason}`,
      });
    }
    setActiveWindow(null);
    setSessionId(null);
    setStarted(null);
    setSecondsRemaining(0);
    setSafewordInput('');
  }, [sessionId, started, user?.id]);

  // Tick each second while locked; check window boundary each minute
  useEffect(() => {
    loadConfig();
    loopTimerRef.current = setInterval(() => {
      if (activeWindow && started) {
        const totalSec = activeWindow.duration_minutes * 60;
        const elapsed = Math.floor((Date.now() - started) / 1000);
        const remaining = Math.max(0, totalSec - elapsed);
        setSecondsRemaining(remaining);
        if (remaining === 0) {
          endSession('completed');
        }
        // Also check we're still in the window OR catch-up mode (handle DST etc.)
        if (!isInWindow(activeWindow, new Date()) && !isInCatchUpWindow(activeWindow, new Date())) {
          endSession('completed');
        }
      } else {
        // Re-check config every minute when not locked
        if (Date.now() % 60000 < 1500) loadConfig();
      }
    }, 1000);
    return () => {
      if (loopTimerRef.current) clearInterval(loopTimerRef.current);
      // If the component unmounts while locked, log interrupted
      if (sessionId && started) {
        supabase
          .from('conditioning_lockdown_sessions')
          .update({
            ended_at: new Date().toISOString(),
            ended_reason: 'interrupted',
            duration_actual_seconds: Math.floor((Date.now() - started) / 1000),
          })
          .eq('id', sessionId)
          .then(() => {}, () => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWindow?.id, started]);

  // Initial load
  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // When session opens, pull content segments from all three libraries
  useEffect(() => {
    if (!activeWindow || !user?.id) { setSegments([]); setSegmentIdx(0); return; }
    let cancelled = false;
    (async () => {
      // Cap each library hard so the lockdown never feels like a chore-bar.
      // Total max = 5 segments per session. User feedback 2026-04-29:
      // "1 / 30 ... this is so dumb the punishment punative". Per
      // feedback_no_copy_paste_rituals: forced reading of N narratives
      // is busywork. 5 quality segments > 30 mediocre ones.
      const [impR, refR, witR] = await Promise.all([
        supabase.from('memory_implants').select('id, narrative, implant_category, times_referenced').eq('user_id', user.id).eq('active', true).order('times_referenced', { ascending: true }).limit(2),
        supabase.from('narrative_reframings').select('id, reframed_text, reframe_angle, times_referenced').eq('user_id', user.id).order('intensity', { ascending: false }).order('times_referenced', { ascending: true }).limit(2),
        supabase.from('witness_fabrications').select('id, content, category, intensity, times_referenced').eq('user_id', user.id).eq('active', true).order('times_referenced', { ascending: true }).limit(1),
      ]);
      if (cancelled) return;
      const mix: Segment[] = [];
      for (const r of (impR.data || []) as Array<Record<string, unknown>>) {
        mix.push({ id: r.id as string, kind: 'implant', label: String(r.implant_category || 'memory').replace(/_/g, ' '), text: String(r.narrative || ''), sourceTable: 'memory_implants' });
      }
      for (const r of (refR.data || []) as Array<Record<string, unknown>>) {
        mix.push({ id: r.id as string, kind: 'reframe', label: String(r.reframe_angle || 'reframe').replace(/_/g, ' '), text: String(r.reframed_text || ''), sourceTable: 'narrative_reframings' });
      }
      for (const r of (witR.data || []) as Array<Record<string, unknown>>) {
        mix.push({ id: r.id as string, kind: 'witness', label: `Gina · ${String(r.category || 'observation').replace(/_/g, ' ')}`, text: String(r.content || ''), sourceTable: 'witness_fabrications' });
      }
      mix.sort(() => Math.random() - 0.5);
      // Hard cap to 5 even if libraries return more (defensive)
      const final = (mix.length > 0 ? mix : FALLBACK_SEGMENTS).slice(0, 5);
      setSegments(final);
      setSegmentIdx(0);
    })();
    return () => { cancelled = true; };
  }, [activeWindow, user?.id]);

  // Rotate segments every 90s + increment times_referenced on first view
  useEffect(() => {
    if (!activeWindow || segments.length === 0) return;
    const seg = segments[segmentIdx];
    if (seg && seg.sourceTable && !referencedIds.current.has(seg.id)) {
      referencedIds.current.add(seg.id);
      // Read-then-write increment
      supabase.from(seg.sourceTable).select('times_referenced').eq('id', seg.id).maybeSingle().then(({ data }) => {
        const prev = ((data as Record<string, unknown> | null)?.times_referenced as number) ?? 0;
        supabase.from(seg.sourceTable!).update({ times_referenced: prev + 1 }).eq('id', seg.id).then(() => {}, () => {});
      }, () => {});
    }
    rotateTimerRef.current = setInterval(() => {
      setSegmentIdx(i => (i + 1) % segments.length);
    }, 90_000);
    return () => { if (rotateTimerRef.current) clearInterval(rotateTimerRef.current); };
  }, [activeWindow, segments, segmentIdx]);

  const tryExitBySafeword = () => {
    const typed = safewordInput.trim().toLowerCase();
    if (!typed) return;
    if (safewords.includes(typed)) {
      endSession('safeword');
    }
  };

  if (!activeWindow) return null;

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const progressPct = Math.min(100, Math.max(0, ((activeWindow.duration_minutes * 60 - secondsRemaining) / (activeWindow.duration_minutes * 60)) * 100));

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'radial-gradient(ellipse at center, #1a0533 0%, #000000 80%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24, color: '#e8dcff',
        fontFamily: 'Inter, "SF Pro Text", system-ui, sans-serif',
      }}
    >
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#c4b5fd', fontWeight: 700, marginBottom: 12 }}>
        Conditioning window — {activeWindow.label}
      </div>
      <div style={{ fontSize: 56, fontWeight: 650, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', marginBottom: 8 }}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </div>
      <div style={{ width: 280, height: 3, background: 'rgba(196, 181, 253, 0.15)', borderRadius: 2, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(92deg, #7c3aed, #c4b5fd)', transition: 'width 1s linear' }} />
      </div>

      {activeWindow.audio_url && (
        <audio src={activeWindow.audio_url} autoPlay loop controls={false} style={{ display: 'none' }} />
      )}

      {segments.length > 0 ? (
        <div style={{ maxWidth: 560, width: '100%', marginBottom: 24 }}>
          <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#c4b5fd', fontWeight: 700, marginBottom: 10, textAlign: 'center', opacity: 0.7 }}>
            {segments[segmentIdx]?.kind === 'witness' ? '◆' : segments[segmentIdx]?.kind === 'reframe' ? '❖' : segments[segmentIdx]?.kind === 'implant' ? '●' : '·'} {segments[segmentIdx]?.label}
          </div>
          <div
            key={segments[segmentIdx]?.id}
            style={{
              fontSize: 17, lineHeight: 1.75, textAlign: 'center', color: '#e8dcff',
              fontStyle: segments[segmentIdx]?.kind === 'witness' ? 'normal' : 'italic',
              animation: 'td-seg-fade 1.2s ease-out',
            }}
          >
            {segments[segmentIdx]?.text}
          </div>
          <style>{`@keyframes td-seg-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`}</style>
          {/* No counter — the segment count was reading as a chore-bar
              ("1 / 30, next, next..."). The window itself has a timer
              progress; users can advance manually if they want. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 18, fontSize: 10, color: '#6a5a7e' }}>
            <button
              onClick={() => setSegmentIdx(i => (i + 1) % segments.length)}
              style={{ background: 'none', border: '1px solid rgba(196,181,253,0.2)', color: '#c4b5fd', borderRadius: 4, padding: '3px 10px', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.05em', textTransform: 'uppercase' }}
            >
              next
            </button>
          </div>
        </div>
      ) : activeWindow.script_text ? (
        <div style={{ maxWidth: 520, fontSize: 16, lineHeight: 1.7, textAlign: 'center', color: '#e8dcff', marginBottom: 24, fontStyle: 'italic' }}>
          {activeWindow.script_text}
        </div>
      ) : (
        <div style={{ maxWidth: 520, fontSize: 15, lineHeight: 1.6, textAlign: 'center', color: '#c4b5fd', marginBottom: 24 }}>
          The Handler holds you here. Breathe. Sit with it. You chose this window. Use it.
        </div>
      )}

      <div style={{ marginTop: 'auto', width: '100%', maxWidth: 320 }}>
        <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6a656e', fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
          Safeword exit
        </div>
        <input
          value={safewordInput}
          onChange={e => setSafewordInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') tryExitBySafeword(); }}
          placeholder="type safeword to exit"
          autoComplete="off"
          style={{
            width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(196,181,253,0.25)',
            borderRadius: 6, padding: '8px 12px', fontFamily: 'inherit', fontSize: 13, color: '#e8dcff',
            textAlign: 'center',
          }}
        />
      </div>
    </div>
  );
}
