/**
 * RitualSessionWrapper
 *
 * Wraps hypno/edge sessions with the full ritual sequence:
 * 1. Pre-session: "Light your candle. Assume position. Earbuds in."
 *    [Continue] after 30-second minimum
 * 2. Opening: Play phrase audio + Lovense signature pattern + log anchors
 * 3. Session: Children render (existing session UI)
 * 4. Closing: Fade Lovense to zero
 * 5. Check-in: HypnoPostSessionCheckIn (depth 1-5 + optional mood)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Flame, Volume2, Headphones, ChevronRight } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { useLovense } from '../../hooks/useLovense';
import { useHypnoSessionLogger } from '../../hooks/useHypnoSessionLogger';
import {
  seedInitialAnchors,
  activateAllAnchors,
  incrementAnchorsAfterSession,
  playRitualPattern,
  fadeToZero,
} from '../../lib/ritual-anchors';
import { isSpeechAvailable, getVoices, selectFeminineVoice } from '../../lib/speech-synthesis';
import { HypnoPostSessionCheckIn } from './HypnoPostSessionCheckIn';
import type { RitualPhase } from '../../types/hypno-session';

interface RitualSessionWrapperProps {
  sessionId: string;
  playlistId?: string;
  onComplete: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

const PRE_SESSION_MIN_SECONDS = 30;

export function RitualSessionWrapper({
  sessionId,
  playlistId,
  onComplete,
  onClose,
  children,
}: RitualSessionWrapperProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const lovense = useLovense();
  const logger = useHypnoSessionLogger(sessionId);

  const [phase, setPhase] = useState<RitualPhase>('pre_session');
  const [preSessionTimer, setPreSessionTimer] = useState(PRE_SESSION_MIN_SECONDS);
  const [canContinue, setCanContinue] = useState(false);
  const [activeAnchorIds, setActiveAnchorIds] = useState<string[]>([]);
  const mountedRef = useRef(true);

  // Seed anchors on mount
  useEffect(() => {
    if (user?.id) {
      seedInitialAnchors(user.id);
    }
    return () => { mountedRef.current = false; };
  }, [user?.id]);

  // Pre-session countdown
  useEffect(() => {
    if (phase !== 'pre_session') return;

    const timer = setInterval(() => {
      setPreSessionTimer(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanContinue(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  // Opening sequence
  const startOpening = useCallback(async () => {
    if (!user?.id) return;
    setPhase('opening');

    // Activate all anchors and log them
    const anchorIds = await activateAllAnchors(user.id);
    setActiveAnchorIds(anchorIds);

    for (const id of anchorIds) {
      await logger.logAnchorTrigger(id);
    }

    // Play opening phrase via speech synthesis
    if (isSpeechAvailable()) {
      try {
        const voices = await getVoices();
        const voice = selectFeminineVoice(voices);
        const utterance = new SpeechSynthesisUtterance('Good girl. Settle in.');
        if (voice) utterance.voice = voice;
        utterance.pitch = 1.1;
        utterance.rate = 0.75;
        window.speechSynthesis.speak(utterance);
      } catch {
        // Speech not critical
      }
    }

    // Play Lovense signature pattern
    if (lovense.status === 'connected' && lovense.activeToy) {
      try {
        await playRitualPattern(lovense.setIntensity);
      } catch {
        // Device not critical
      }
    }

    // Transition to session after a brief pause
    setTimeout(() => {
      if (mountedRef.current) {
        setPhase('session');
      }
    }, 3000);
  }, [user?.id, lovense, logger]);

  // Closing sequence
  const startClosing = useCallback(async () => {
    setPhase('closing');

    // Fade Lovense to zero
    if (lovense.status === 'connected' && lovense.activeToy) {
      try {
        await fadeToZero(lovense.setIntensity, lovense.currentIntensity);
      } catch {
        // Non-critical
      }
    }

    // Increment anchor strength
    if (user?.id && activeAnchorIds.length > 0) {
      await incrementAnchorsAfterSession(user.id, activeAnchorIds);
    }

    // Move to check-in
    setTimeout(() => {
      if (mountedRef.current) {
        setPhase('check_in');
      }
    }, 2000);
  }, [lovense, user?.id, activeAnchorIds]);

  // Handle session complete from child
  const handleSessionEnd = useCallback(() => {
    startClosing();
  }, [startClosing]);

  // Handle check-in complete
  const handleCheckInComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // ==========================================
  // PRE-SESSION SCREEN
  // ==========================================
  if (phase === 'pre_session') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className={`max-w-sm w-full mx-4 rounded-2xl p-8 text-center ${
          isBambiMode ? 'bg-white' : 'bg-protocol-surface'
        }`}>
          {/* Candle icon */}
          <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center ${
            isBambiMode
              ? 'bg-gradient-to-br from-pink-400 to-purple-400'
              : 'bg-gradient-to-br from-orange-500 to-red-500'
          }`}>
            <Flame className="w-10 h-10 text-white animate-pulse" />
          </div>

          <h2 className={`text-xl font-bold mb-6 ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            Prepare Your Space
          </h2>

          <div className={`space-y-4 text-left mb-8 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}>
            <div className="flex items-center gap-3">
              <Flame className="w-5 h-5 flex-shrink-0" />
              <span>Light your candle</span>
            </div>
            <div className="flex items-center gap-3">
              <Volume2 className="w-5 h-5 flex-shrink-0" />
              <span>Assume position</span>
            </div>
            <div className="flex items-center gap-3">
              <Headphones className="w-5 h-5 flex-shrink-0" />
              <span>Earbuds in</span>
            </div>
          </div>

          {/* Timer / Continue */}
          {!canContinue ? (
            <div className={`text-sm ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}>
              <span className="font-mono text-lg">{preSessionTimer}s</span>
              <p className="mt-1">Take your time</p>
            </div>
          ) : (
            <button
              onClick={startOpening}
              className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
              }`}
            >
              <span>Continue</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {/* Skip option (small, de-emphasized) */}
          <button
            onClick={onClose}
            className={`mt-4 text-xs ${
              isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted/50'
            } hover:underline`}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // OPENING PHASE
  // ==========================================
  if (phase === 'opening') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="text-center px-8">
          <div className={`w-24 h-24 rounded-full mx-auto mb-8 flex items-center justify-center animate-pulse ${
            isBambiMode
              ? 'bg-gradient-to-br from-pink-400 to-purple-500'
              : 'bg-gradient-to-br from-indigo-500 to-purple-600'
          }`}>
            <Volume2 className="w-12 h-12 text-white" />
          </div>
          <p className={`text-xl font-light italic ${
            isBambiMode ? 'text-pink-300' : 'text-white/80'
          }`}>
            Good girl. Settle in.
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // SESSION PHASE — render children (existing session UI)
  // ==========================================
  if (phase === 'session') {
    return (
      <div>
        {/* Inject session end handler via context or callback */}
        <div className="ritual-session-active">
          {children}
        </div>
        {/* Floating end ritual button */}
        <button
          onClick={handleSessionEnd}
          className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-full bg-black/60 backdrop-blur
                     border border-white/10 text-white/70 text-sm hover:bg-black/80 transition-all"
        >
          End Ritual
        </button>
      </div>
    );
  }

  // ==========================================
  // CLOSING PHASE
  // ==========================================
  if (phase === 'closing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="text-center px-8">
          <div className={`w-24 h-24 rounded-full mx-auto mb-8 flex items-center justify-center ${
            isBambiMode
              ? 'bg-gradient-to-br from-pink-400/50 to-purple-500/50'
              : 'bg-gradient-to-br from-indigo-500/50 to-purple-600/50'
          }`}>
            <Flame className="w-12 h-12 text-white/60" />
          </div>
          <p className={`text-lg font-light ${
            isBambiMode ? 'text-pink-300/80' : 'text-white/60'
          }`}>
            Remain in position...
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // CHECK-IN PHASE
  // ==========================================
  return (
    <HypnoPostSessionCheckIn
      sessionId={sessionId}
      playlistId={playlistId}
      onComplete={handleCheckInComplete}
    />
  );
}
