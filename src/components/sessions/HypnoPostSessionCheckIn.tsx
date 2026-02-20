/**
 * HypnoPostSessionCheckIn
 *
 * Minimal post-session check-in per spec: trance depth (1-5 tap)
 * and optional one-line mood text. Maximum 10 seconds of user effort.
 * Creates the hypno_session_summary row via buildSessionSummary.
 */

import { useState, useCallback } from 'react';
import { CheckCircle } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { useUserState } from '../../hooks/useUserState';
import { buildSessionSummary } from '../../lib/session-telemetry';

interface HypnoPostSessionCheckInProps {
  sessionId: string;
  playlistId?: string;
  onComplete: () => void;
}

export function HypnoPostSessionCheckIn({
  sessionId,
  playlistId,
  onComplete,
}: HypnoPostSessionCheckInProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const { userState } = useUserState();
  const denialDay = userState?.denialDay ?? 0;

  const [tranceDepth, setTraceDepth] = useState(3);
  const [mood, setMood] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const depthLabels = ['Light', 'Mild', 'Medium', 'Deep', 'Gone'];

  const handleSubmit = useCallback(async () => {
    if (!user?.id || isSubmitting) return;
    setIsSubmitting(true);

    try {
      await buildSessionSummary(
        user.id,
        sessionId,
        denialDay,
        { trance_depth: tranceDepth, mood: mood.trim() || undefined },
        playlistId,
      );
      setIsDone(true);
      setTimeout(onComplete, 1200);
    } catch (err) {
      console.error('[CheckIn] Failed to save summary:', err);
      onComplete();
    }
  }, [user?.id, sessionId, denialDay, tranceDepth, mood, playlistId, isSubmitting, onComplete]);

  if (isDone) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className={`max-w-sm w-full mx-4 rounded-2xl p-8 text-center ${
          isBambiMode ? 'bg-white' : 'bg-protocol-surface'
        }`}>
          <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
            isBambiMode ? 'bg-pink-100' : 'bg-green-500/20'
          }`}>
            <CheckCircle className={`w-8 h-8 ${isBambiMode ? 'text-pink-500' : 'text-green-400'}`} />
          </div>
          <p className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            Logged. Good girl.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className={`max-w-sm w-full mx-4 rounded-2xl overflow-hidden ${
        isBambiMode ? 'bg-white' : 'bg-protocol-surface'
      }`}>
        {/* Header */}
        <div className={`px-6 pt-6 pb-3 ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          <h2 className="text-lg font-semibold">How deep did you go?</h2>
        </div>

        {/* Trance Depth - 1-5 tap */}
        <div className="px-6 pb-4">
          <div className="flex justify-between gap-2">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                onClick={() => setTraceDepth(level)}
                className={`flex-1 py-3 rounded-xl text-center transition-all ${
                  tranceDepth === level
                    ? isBambiMode
                      ? 'bg-pink-500 text-white scale-105'
                      : 'bg-protocol-accent text-white scale-105'
                    : isBambiMode
                      ? 'bg-pink-100 text-pink-600'
                      : 'bg-protocol-bg text-protocol-text-muted'
                }`}
              >
                <span className="block text-lg font-bold">{level}</span>
                <span className="block text-[10px] mt-0.5">{depthLabels[level - 1]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Optional mood text */}
        <div className="px-6 pb-4">
          <input
            type="text"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            placeholder="How do you feel? (optional)"
            maxLength={140}
            className={`w-full px-4 py-3 rounded-xl text-sm ${
              isBambiMode
                ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
                : 'bg-protocol-bg border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
            } outline-none`}
          />
        </div>

        {/* Submit */}
        <div className="px-6 pb-6">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`w-full py-3 rounded-xl font-medium transition-all ${
              isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
            } ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
            }`}
          >
            {isSubmitting ? 'Saving...' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
