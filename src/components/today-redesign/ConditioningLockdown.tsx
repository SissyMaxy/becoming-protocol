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

export function ConditioningLockdown() {
  const { user } = useAuth();
  const [activeWindow, setActiveWindow] = useState<LockdownWindow | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [safewordInput, setSafewordInput] = useState('');
  const [safewords, setSafewords] = useState<string[]>([]);
  const [started, setStarted] = useState<number | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load user's windows + safewords
  const loadConfig = useCallback(async () => {
    if (!user?.id) return;
    const [winRes, sfRes] = await Promise.all([
      supabase.from('conditioning_lockdown_windows').select('*').eq('user_id', user.id).eq('active', true),
      supabase.from('safewords').select('*').eq('user_id', user.id),
    ]);
    const wins = (winRes.data || []) as LockdownWindow[];
    const now = new Date();
    const active = wins.find(w => isInWindow(w, now)) || null;
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
    await supabase
      .from('conditioning_lockdown_sessions')
      .update({
        ended_at: new Date().toISOString(),
        ended_reason: reason,
        duration_actual_seconds: durationSec,
      })
      .eq('id', sessionId);
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
        // Also check we're still in the window (handle DST etc.)
        if (!isInWindow(activeWindow, new Date())) {
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

      {activeWindow.script_text && (
        <div style={{ maxWidth: 520, fontSize: 16, lineHeight: 1.7, textAlign: 'center', color: '#e8dcff', marginBottom: 24, fontStyle: 'italic' }}>
          {activeWindow.script_text}
        </div>
      )}

      {!activeWindow.script_text && !activeWindow.audio_url && (
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
