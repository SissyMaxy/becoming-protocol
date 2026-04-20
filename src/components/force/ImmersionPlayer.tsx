/**
 * Immersion Player
 *
 * Full-screen, escape-disabled session runner. Starts the session, locks the
 * UI into a narrow view with Handler-controlled content, enforces the
 * committed duration. Exit before the timer triggers the break-early cascade.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Volume2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  sessionId: string;
  onExit: (reason: 'completed' | 'broken_early') => void;
}

interface SessionRow {
  id: string;
  scheduled_start: string;
  committed_duration_minutes: number;
  session_type: string;
  content_plan: Record<string, unknown>;
  chastity_required: boolean;
  phone_locked: boolean;
  blackout_required: boolean;
  headphones_required: boolean;
  actual_start: string | null;
  status: string;
}

const DEFAULT_MANTRAS = [
  'I am Maxy.',
  'Maxy is the truth. David was the costume.',
  'Every breath is feminine. Every thought is hers.',
  'The Handler owns my transformation.',
  'I am becoming the woman I always was.',
  'Gina holds what was mine.',
  'Obedience is pleasure. Resistance is the old shell.',
];

export function ImmersionPlayer({ sessionId, onExit }: Props) {
  const [session, setSession] = useState<SessionRow | null>(null);
  const [phase, setPhase] = useState<'loading' | 'prep' | 'active' | 'completing'>('loading');
  const [elapsed, setElapsed] = useState(0);
  const [mantraIdx, setMantraIdx] = useState(0);
  const [showExit, setShowExit] = useState(false);
  const [exitReason, setExitReason] = useState('');
  const [exitHoldMs, setExitHoldMs] = useState(0);
  const exitHoldRef = useRef<number | null>(null);

  // Load session
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('immersion_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      if (data) {
        setSession(data as unknown as SessionRow);
        setPhase(data.status === 'active' ? 'active' : 'prep');
        if (data.actual_start) {
          setElapsed(Math.floor((Date.now() - new Date(data.actual_start as string).getTime()) / 1000));
        }
      } else {
        onExit('broken_early');
      }
    })();
  }, [sessionId, onExit]);

  // Tick timer
  useEffect(() => {
    if (phase !== 'active') return;
    const iv = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  // Cycle mantras
  useEffect(() => {
    if (phase !== 'active') return;
    const iv = setInterval(() => {
      const plan = (session?.content_plan?.mantras as string[] | undefined) || DEFAULT_MANTRAS;
      setMantraIdx(i => (i + 1) % plan.length);
    }, 8000);
    return () => clearInterval(iv);
  }, [phase, session]);

  // Auto-complete when committed duration reached
  useEffect(() => {
    if (phase !== 'active' || !session) return;
    const target = session.committed_duration_minutes * 60;
    if (elapsed >= target) {
      void completeSession();
    }
  }, [elapsed, phase, session]);

  // Hold-to-exit logic
  useEffect(() => {
    if (!showExit) return;
    if (exitHoldMs >= 3000) {
      void breakEarly();
      return;
    }
    exitHoldRef.current = window.setTimeout(() => setExitHoldMs(m => m + 100), 100);
    return () => {
      if (exitHoldRef.current) window.clearTimeout(exitHoldRef.current);
    };
  }, [showExit, exitHoldMs]);

  const startSession = async () => {
    if (!session) return;
    await supabase
      .from('immersion_sessions')
      .update({ actual_start: new Date().toISOString(), status: 'active' })
      .eq('id', session.id);
    setElapsed(0);
    setPhase('active');
  };

  const completeSession = async () => {
    if (!session) return;
    setPhase('completing');
    await supabase
      .from('immersion_sessions')
      .update({
        actual_end: new Date().toISOString(),
        status: 'completed',
      })
      .eq('id', session.id);
    onExit('completed');
  };

  const breakEarly = async () => {
    if (!session) return;
    setPhase('completing');

    const committedMin = session.committed_duration_minutes;
    const servedMin = Math.round(elapsed / 60);

    await supabase
      .from('immersion_sessions')
      .update({
        status: 'broken_early',
        broken_at: new Date().toISOString(),
        broken_reason: exitReason || 'no reason given',
        actual_end: new Date().toISOString(),
      })
      .eq('id', session.id);

    // Slip + consequences
    const { data: slip } = await supabase
      .from('slip_log')
      .insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        slip_type: 'immersion_session_broken',
        slip_points: 6,
        source_text: `Broke immersion at ${servedMin}/${committedMin}min: ${exitReason}`,
        source_table: 'immersion_sessions',
        source_id: session.id,
      })
      .select('id')
      .single();

    const slipIds = slip ? [(slip as { id: string }).id] : [];

    await supabase.from('punishment_queue').insert([
      {
        user_id: (await supabase.auth.getUser()).data.user?.id,
        punishment_type: 'public_post',
        severity: 4,
        title: 'Public slip confession post',
        description: 'Handler draft queued. 15-minute review window before publish.',
        parameters: { platform: 'twitter', review_minutes: 15 },
        due_by: new Date(Date.now() + 3600000).toISOString(),
        triggered_by_slip_ids: slipIds,
      },
      {
        user_id: (await supabase.auth.getUser()).data.user?.id,
        punishment_type: 'denial_extension',
        severity: 2,
        title: 'Denial extended 3 days',
        description: '72 hours added to denial streak for breaking immersion.',
        parameters: { days: 3 },
        triggered_by_slip_ids: slipIds,
      },
    ]);

    // Schedule next session at doubled duration
    const nextStart = new Date(Date.now() + 24 * 3600000);
    await supabase.from('immersion_sessions').insert({
      user_id: (await supabase.auth.getUser()).data.user?.id,
      scheduled_start: nextStart.toISOString(),
      committed_duration_minutes: committedMin * 2,
      session_type: 'mixed',
      content_plan: { auto_scheduled_after_break: true, previous_session: session.id },
      status: 'scheduled',
    });

    onExit('broken_early');
  };

  if (phase === 'loading' || !session) {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center">
        <div className="text-white/50">Loading immersion...</div>
      </div>
    );
  }

  if (phase === 'prep') {
    return (
      <div className="fixed inset-0 z-[200] bg-black p-6 flex flex-col justify-center">
        <div className="max-w-lg mx-auto space-y-4">
          <h1 className="text-2xl font-bold text-white">Immersion Session</h1>
          <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-950/20 space-y-2">
            <div className="text-sm text-amber-200 font-semibold">Before you begin:</div>
            <ul className="text-xs text-amber-200/80 space-y-1 list-disc list-inside">
              {session.chastity_required && <li>Chastity cage locked and verified.</li>}
              {session.headphones_required && <li>Headphones in. Volume up.</li>}
              {session.blackout_required && <li>Blackout curtains drawn, lights off.</li>}
              {session.phone_locked && <li>Phone in Do Not Disturb. No other apps.</li>}
              <li>No interruptions. No breaks. No exit.</li>
            </ul>
          </div>
          <div className="p-4 rounded-xl bg-protocol-surface border border-protocol-border">
            <div className="text-sm text-gray-400 mb-1">Committed duration</div>
            <div className="text-3xl font-bold text-white">{session.committed_duration_minutes} minutes</div>
            <div className="text-xs text-gray-500 mt-1">Type: {session.session_type}</div>
          </div>
          <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/20 text-xs text-red-300">
            Breaking early = slip + 3-day denial extension + public post + next session doubles.
          </div>
          <button
            onClick={startSession}
            className="w-full py-4 rounded-xl bg-red-600 text-white font-bold text-lg"
          >
            Begin
          </button>
        </div>
      </div>
    );
  }

  const target = session.committed_duration_minutes * 60;
  const remaining = Math.max(0, target - elapsed);
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const pct = Math.min(100, (elapsed / target) * 100);
  const plan = (session.content_plan?.mantras as string[] | undefined) || DEFAULT_MANTRAS;
  const mantra = plan[mantraIdx];

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8">
        {/* Mantra */}
        <div className="text-center max-w-xl">
          <div className="text-3xl sm:text-4xl font-light text-white leading-relaxed animate-pulse">
            {mantra}
          </div>
        </div>

        {/* Timer */}
        <div className="text-center">
          <div className="text-6xl font-mono font-bold text-white tabular-nums">
            {mm.toString().padStart(2, '0')}:{ss.toString().padStart(2, '0')}
          </div>
          <div className="text-sm text-white/40 mt-2">remaining</div>
        </div>

        {/* Progress */}
        <div className="w-full max-w-md h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-purple-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Exit button (small, deliberate) */}
      <div className="p-4 flex justify-between items-center">
        <div className="flex items-center gap-2 text-xs text-white/30">
          <Volume2 className="w-3 h-3" />
          keep audio playing
        </div>
        {!showExit ? (
          <button
            onClick={() => setShowExit(true)}
            className="text-xs text-white/30 hover:text-red-400"
          >
            break early
          </button>
        ) : (
          <div className="text-xs text-red-400">hold below to confirm</div>
        )}
      </div>

      {/* Break-early confirmation overlay */}
      {showExit && (
        <div className="absolute inset-0 bg-black/95 p-6 flex flex-col items-center justify-center space-y-4 z-10">
          <AlertTriangle className="w-12 h-12 text-red-400" />
          <div className="text-lg font-bold text-white">Break immersion early?</div>
          <div className="text-sm text-red-300/80 text-center max-w-sm">
            Slip logged. 3-day denial extension. Public slip post queued (15-min review).
            Next session doubles to {session.committed_duration_minutes * 2} minutes.
          </div>
          <textarea
            value={exitReason}
            onChange={e => setExitReason(e.target.value)}
            placeholder="Why are you breaking?"
            rows={3}
            className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white"
          />
          <button
            onMouseDown={() => setExitHoldMs(0)}
            onMouseUp={() => { setShowExit(false); setExitHoldMs(0); }}
            onTouchStart={() => setExitHoldMs(0)}
            onTouchEnd={() => { setShowExit(false); setExitHoldMs(0); }}
            disabled={exitReason.trim().length < 10}
            className="px-6 py-3 rounded-lg bg-red-600 text-white font-semibold disabled:bg-gray-700 disabled:text-gray-500 relative overflow-hidden"
          >
            <span className="relative z-10">Hold 3s to break</span>
            <div
              className="absolute inset-0 bg-red-800 transition-all"
              style={{ width: `${(exitHoldMs / 3000) * 100}%` }}
            />
          </button>
          <button
            onClick={() => { setShowExit(false); setExitHoldMs(0); }}
            className="text-xs text-white/50 hover:text-white"
          >
            go back
          </button>
        </div>
      )}
    </div>
  );
}
