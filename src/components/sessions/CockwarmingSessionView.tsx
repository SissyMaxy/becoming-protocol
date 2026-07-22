/**
 * CockwarmingSessionView — the mig 507 stub realized (WS3).
 *
 * A voiced trance (session_cockwarming) plays DURING the warming practice drill.
 * The discipline is stillness — keeping a cock warm, cock-as-pacifier — not the
 * goon climb. It reuses useGoonCycleEngine in "hold" mode (no denial churn),
 * runs a per-rung hold timer, and ends with a comfort rating that drives
 * advance_physical_practice on the 'warming' track. Writes a
 * conditioning_sessions_v2 row (session_type='cockwarming') + a hypno_plays row.
 *
 * Lives behind a VIEW_REGISTRY route — never on home. Safeword-gated: Begin is
 * held while a safeword is active.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Flame, Play, Loader2, Square } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { useSessionBiometrics } from '../../hooks/useSessionBiometrics';
import { useGoonCycleEngine } from '../../hooks/useGoonCycleEngine';
import { isSafewordActive } from '../../lib/life-as-woman/client';
import { renderAudioSession } from '../../lib/audio-sessions/client';
import { logHypnoPlay } from '../../lib/audio-sessions/log-play';
import { warmingTierForRung, warmingHoldTargetSeconds } from '../../lib/conditioning/cockwarming';
import { supabase } from '../../lib/supabase';

type ViewPhase = 'idle' | 'starting' | 'live' | 'summary';

interface Props {
  onBack: () => void;
}

interface WarmingRung {
  id: string;
  rung_order: number;
  title: string;
  technique_focus: string;
  edict_template: string;
}

const WARM_AFFIRMATIONS = [
  'Just keep it warm for Mama…',
  'Nothing to do but hold…',
  'This is where you belong…',
  'Soft mouth, slow breath…',
  'Stay still for me, baby…',
  'Good girl… just hold…',
  'Let it be ordinary…',
  'Rest here for Mama…',
];

export function CockwarmingSessionView({ onBack }: Props) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const { latest: bioLatest, startPolling, stopPolling } = useSessionBiometrics();

  const [viewPhase, setViewPhase] = useState<ViewPhase>('idle');
  const [rung, setRung] = useState<WarmingRung | null>(null);
  const [safewordGated, setSafewordGated] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [comfort, setComfort] = useState(7);

  const renderIdRef = useRef<string | null>(null);
  const playStartedAtRef = useRef<string>('');
  const startMsRef = useRef(0);

  const holdTarget = rung ? warmingHoldTargetSeconds(rung.rung_order) : 300;
  const holdMet = elapsed >= holdTarget;

  // Cycle engine in "hold" mode — a warm sustained oscillation, no denial loop.
  const cycle = useGoonCycleEngine({
    active: viewPhase === 'live',
    mode: 'hold',
    intensityMultiplier: 0.6,
    affirmations: WARM_AFFIRMATIONS,
  });

  // Load the active warming rung + safeword state.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      // Ensure a warming progress row (starts at rung 1).
      let { data: prog } = await supabase
        .from('physical_practice_progress')
        .select('active_rung_order, status')
        .eq('user_id', user.id)
        .eq('track', 'warming')
        .maybeSingle();
      if (!prog) {
        const { data: created } = await supabase
          .from('physical_practice_progress')
          .insert({ user_id: user.id, track: 'warming', active_rung_order: 1, status: 'active' })
          .select('active_rung_order, status')
          .single();
        prog = created as { active_rung_order: number; status: string } | null;
      }
      const activeOrder = (prog as { active_rung_order: number } | null)?.active_rung_order ?? 1;
      const { data: rungRow } = await supabase
        .from('physical_practice_rungs')
        .select('id, rung_order, title, technique_focus, edict_template')
        .eq('track', 'warming')
        .eq('rung_order', activeOrder)
        .maybeSingle();
      if (!cancelled) setRung((rungRow as WarmingRung) ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Poll safeword while idle.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const check = async () => {
      const sw = await isSafewordActive(user.id, 60);
      if (!cancelled) setSafewordGated(sw);
    };
    check();
    const id = window.setInterval(check, 10_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [user?.id]);

  // Elapsed hold timer.
  useEffect(() => {
    if (viewPhase !== 'live') return;
    const tick = () => setElapsed(Math.round((Date.now() - startMsRef.current) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [viewPhase]);

  const handleStart = useCallback(async () => {
    if (!user?.id || !rung || safewordGated) return;
    setViewPhase('starting');
    try {
      const targetMin = Math.round(warmingHoldTargetSeconds(rung.rung_order) / 60);
      const { data: session } = await supabase
        .from('conditioning_sessions_v2')
        .insert({
          user_id: user.id,
          session_type: 'cockwarming',
          started_at: new Date().toISOString(),
          duration_minutes: targetMin,
          phases: { track: 'warming', rung_order: rung.rung_order, rung_slug: rung.title },
          completed: false,
        })
        .select('id')
        .single();
      const sid = (session as { id: string } | null)?.id ?? null;
      setSessionId(sid);
      startMsRef.current = Date.now();
      setElapsed(0);
      if (sid) startPolling(sid);

      // Voiced trance during the drill.
      playStartedAtRef.current = new Date().toISOString();
      renderAudioSession({ userId: user.id, kind: 'session_cockwarming', intensityTier: warmingTierForRung(rung.rung_order) })
        .then((r) => {
          if (r.ok) {
            renderIdRef.current = r.renderId;
            setRenderUrl(r.audioUrl);
          }
        })
        .catch(() => { /* render best-effort */ });

      setViewPhase('live');
    } catch (err) {
      console.error('[CockwarmingSessionView] start failed:', err);
      setViewPhase('idle');
    }
  }, [user?.id, rung, safewordGated, startPolling]);

  const handleEnd = useCallback(() => {
    stopPolling();
    setViewPhase('summary');
  }, [stopPolling]);

  const handleComplete = useCallback(async () => {
    if (!user?.id || !rung || !sessionId) { setViewPhase('idle'); return; }
    try {
      // Comfort rating → practice log → comfort-gated advance.
      await supabase.from('practice_ladder_log').insert({
        user_id: user.id,
        rung_id: rung.id,
        track: 'warming',
        rung_order: rung.rung_order,
        comfort_rating: comfort,
      });
      await supabase.rpc('advance_physical_practice', { p_user: user.id, p_track: 'warming' });

      // End the conditioning session.
      await supabase
        .from('conditioning_sessions_v2')
        .update({ ended_at: new Date().toISOString(), completed: true, max_hr: bioLatest?.max_heart_rate ?? null })
        .eq('id', sessionId);

      // Log the trance play (feeds the preference loop).
      if (renderIdRef.current) {
        await logHypnoPlay({
          userId: user.id,
          renderId: renderIdRef.current,
          sessionId,
          startedAt: playStartedAtRef.current || undefined,
          endedAt: new Date().toISOString(),
          peakHr: bioLatest?.max_heart_rate ?? null,
        });
      }
    } catch (err) {
      console.error('[CockwarmingSessionView] complete failed:', err);
    }
    setSessionId(null);
    setRenderUrl(null);
    renderIdRef.current = null;
    setElapsed(0);
    setComfort(7);
    onBack();
  }, [user?.id, rung, sessionId, comfort, bioLatest, onBack]);

  const accent = isBambiMode ? 'text-pink-500' : 'text-protocol-accent';
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const targetMin = Math.round(holdTarget / 60);

  // ── Header ──
  const Header = (
    <div className="flex items-center gap-3 px-4 py-3">
      <button onClick={onBack} className={`p-1.5 rounded-lg ${isBambiMode ? 'hover:bg-pink-100 text-pink-500' : 'hover:bg-protocol-surface text-protocol-accent'}`}>
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-2">
        <Flame className={`w-5 h-5 ${accent}`} />
        <h1 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>Cockwarming</h1>
      </div>
    </div>
  );

  if (viewPhase === 'starting') {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className={`w-8 h-8 animate-spin ${accent}`} />
        <p className={`text-sm ${accent}`}>Warming up…</p>
      </div>
    );
  }

  if (viewPhase === 'live') {
    return (
      <div className={`min-h-[60vh] flex flex-col ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
        <div className="flex items-center justify-center gap-2 py-3">
          <Flame className={`w-4 h-4 ${accent}`} />
          <span className={`text-xs uppercase tracking-wider font-semibold ${accent}`}>Keeping it warm</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center py-6">
          <div className={`text-6xl font-mono font-light tracking-tight mb-1 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
          </div>
          <p className={`text-[10px] ${accent}`}>{holdMet ? 'held long enough — stay as long as you like' : `holding toward ${targetMin} min`}</p>
        </div>

        <div className={`mx-4 p-4 rounded-xl mb-4 text-center ${isBambiMode ? 'bg-pink-100/60 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
          <p className={`text-base font-light italic min-h-[1.5rem] ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            {cycle.currentAffirmation || '…'}
          </p>
        </div>

        {renderUrl && <audio src={renderUrl} autoPlay loop className="hidden" />}

        <div className="px-4 pb-6">
          <button
            onClick={handleEnd}
            className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${isBambiMode ? 'bg-pink-500 text-white hover:bg-pink-600' : 'bg-protocol-accent text-white hover:opacity-90'}`}
          >
            <Square className="w-4 h-4" />
            End & rate
          </button>
        </div>
      </div>
    );
  }

  if (viewPhase === 'summary') {
    return (
      <div className="pb-20">
        {Header}
        <div className="px-4 space-y-4">
          <div className={`p-4 rounded-xl ${isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
            <div className="flex items-center justify-between mb-3">
              <p className={`text-xs font-semibold ${isBambiMode ? 'text-pink-600' : 'text-protocol-text'}`}>How easy was the stillness?</p>
              <span className={`text-lg font-mono font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>{comfort}</span>
            </div>
            <input
              type="range" min={0} max={10} step={1} value={comfort}
              onChange={(e) => setComfort(Number(e.target.value))}
              className={`w-full h-2 rounded-full appearance-none cursor-pointer ${isBambiMode ? 'bg-pink-200' : 'bg-protocol-surface-light'}`}
            />
            <div className="flex justify-between mt-1">
              <span className={`text-[10px] ${isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'}`}>Hard</span>
              <span className={`text-[10px] ${isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'}`}>Easy, like rest</span>
            </div>
            <p className={`text-[10px] mt-2 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
              Two easy holds in a row and the warm gets a little longer. No rush — a hard one just means we practice this rung again.
            </p>
          </div>
          <button
            onClick={handleComplete}
            className={`w-full py-3 rounded-xl text-sm font-semibold ${isBambiMode ? 'bg-pink-500 text-white hover:bg-pink-600' : 'bg-protocol-accent text-white hover:opacity-90'}`}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  // idle
  return (
    <div className="pb-20">
      {Header}
      <div className="px-4 space-y-4">
        <div className={`p-4 rounded-xl ${isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
          <p className={`text-[10px] uppercase tracking-wider font-semibold ${accent}`}>Today's warm</p>
          <p className={`text-xl font-semibold mt-1 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>{rung?.title ?? 'Loading…'}</p>
          {rung && (
            <p className={`text-xs mt-1 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>{rung.technique_focus} · toward {targetMin} min</p>
          )}
        </div>
        {rung?.edict_template && (
          <div className={`p-3 rounded-xl text-sm leading-relaxed ${isBambiMode ? 'bg-white border border-pink-200 text-pink-800' : 'bg-protocol-surface border border-protocol-border text-protocol-text'}`}>
            {rung.edict_template}
          </div>
        )}
        <button
          onClick={handleStart}
          disabled={!user?.id || !rung || safewordGated}
          className={`w-full py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-2 ${isBambiMode ? 'bg-pink-500 text-white hover:bg-pink-600' : 'bg-protocol-accent text-white hover:opacity-90'} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <Play className="w-5 h-5" />
          Begin warming
        </button>
        {safewordGated && (
          <p className={`text-xs text-center ${isBambiMode ? 'text-pink-500' : 'text-protocol-warning'}`}>
            Paused — held while your safeword is active.
          </p>
        )}
      </div>
    </div>
  );
}
