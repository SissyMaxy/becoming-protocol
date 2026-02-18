/**
 * PostSessionMoodCapture
 *
 * Implements FM1: Post-Release Crash Detection
 * Prompts user 15 minutes after session to capture mood state
 * Helps detect post-orgasmic dysphoria and trigger caretaker interventions
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Heart,
  AlertTriangle,
  CheckCircle,
  X,
  ThermometerSun,
  Brain,
  Frown,
  Meh,
  Smile,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface PostSessionMoodCaptureProps {
  sessionId: string;
  sessionType: string;
  edgeCount: number;
  onComplete: (mood: MoodData) => void;
  onDismiss: () => void;
  className?: string;
}

interface MoodData {
  moodScore: number;
  energyLevel: number;
  regretLevel: number;
  doubtLevel: number;
  notes?: string;
}

// FM1: Post-release crash indicators
const CRASH_THRESHOLDS = {
  LOW_MOOD: 3,      // Mood score <= 3 indicates potential crash
  HIGH_REGRET: 7,   // Regret level >= 7 indicates crash
  HIGH_DOUBT: 7,    // Identity doubt >= 7 indicates crash
  LOW_ENERGY: 2,    // Energy <= 2 combined with low mood
};

export function PostSessionMoodCapture({
  sessionId,
  sessionType,
  edgeCount,
  onComplete,
  onDismiss,
  className = '',
}: PostSessionMoodCaptureProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'mood' | 'details' | 'complete'>('mood');
  const [moodScore, setMoodScore] = useState(5);
  const [energyLevel, setEnergyLevel] = useState(5);
  const [regretLevel, setRegretLevel] = useState(1);
  const [doubtLevel, setDoubtLevel] = useState(1);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCrashWarning, setShowCrashWarning] = useState(false);

  // Check for crash indicators
  const detectCrash = useCallback(() => {
    const hasCrash =
      moodScore <= CRASH_THRESHOLDS.LOW_MOOD ||
      regretLevel >= CRASH_THRESHOLDS.HIGH_REGRET ||
      doubtLevel >= CRASH_THRESHOLDS.HIGH_DOUBT ||
      (energyLevel <= CRASH_THRESHOLDS.LOW_ENERGY && moodScore <= 4);

    setShowCrashWarning(hasCrash);
    return hasCrash;
  }, [moodScore, energyLevel, regretLevel, doubtLevel]);

  useEffect(() => {
    detectCrash();
  }, [detectCrash]);

  const handleSubmit = async () => {
    if (!user?.id) return;

    setIsSubmitting(true);

    try {
      const moodData: MoodData = {
        moodScore,
        energyLevel,
        regretLevel,
        doubtLevel,
        notes: notes.trim() || undefined,
      };

      const hasCrash = detectCrash();

      // Log mood check-in
      await supabase.from('mood_checkins').insert({
        user_id: user.id,
        score: moodScore,
        energy: energyLevel,
        anxiety: regretLevel, // Using anxiety field for regret
        feminine_alignment: 10 - doubtLevel, // Invert doubt to alignment
        notes: notes.trim() || null,
        context: {
          type: 'post_session',
          sessionId,
          sessionType,
          edgeCount,
          crashDetected: hasCrash,
        },
      });

      // If crash detected, log failure mode event
      if (hasCrash) {
        await supabase.from('failure_mode_events').insert({
          user_id: user.id,
          failure_mode: 'post_release_crash',
          detected_at: new Date().toISOString(),
          detection_signals: {
            moodScore,
            energyLevel,
            regretLevel,
            doubtLevel,
            sessionId,
          },
          intervention_type: 'post_release_crash',
          handler_mode_at_detection: 'caretaker',
        });

        // Update user_state with failure mode
        await supabase
          .from('user_state')
          .update({
            current_failure_mode: 'post_release_crash',
            handler_mode: 'caretaker',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);
      }

      setStep('complete');
      onComplete(moodData);
    } catch (err) {
      console.error('Failed to submit mood check:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getMoodIcon = (score: number) => {
    if (score <= 3) return <Frown className="w-6 h-6 text-red-400" />;
    if (score <= 6) return <Meh className="w-6 h-6 text-yellow-400" />;
    return <Smile className="w-6 h-6 text-green-400" />;
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm ${className}`}>
      <div className="w-full max-w-md bg-protocol-surface border border-protocol-border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-protocol-border flex items-center justify-between bg-gradient-to-r from-purple-900/30 to-pink-900/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Heart className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-protocol-text font-semibold">Post-Session Check-in</h2>
              <p className="text-protocol-text-muted text-xs">How are you feeling now?</p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5 text-protocol-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'mood' && (
            <div className="space-y-6">
              {/* Mood Score */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-protocol-text mb-3">
                  {getMoodIcon(moodScore)}
                  <span>Overall Mood</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-protocol-text-muted">Low</span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={moodScore}
                    onChange={(e) => setMoodScore(parseInt(e.target.value))}
                    className="flex-1 h-2 rounded-full appearance-none bg-protocol-border
                               [&::-webkit-slider-thumb]:appearance-none
                               [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                               [&::-webkit-slider-thumb]:rounded-full
                               [&::-webkit-slider-thumb]:bg-purple-500
                               [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <span className="text-xs text-protocol-text-muted">Great</span>
                  <span className="w-8 text-center font-mono text-protocol-text">{moodScore}</span>
                </div>
              </div>

              {/* Energy Level */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-protocol-text mb-3">
                  <ThermometerSun className="w-5 h-5 text-yellow-400" />
                  <span>Energy Level</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-protocol-text-muted">Depleted</span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={energyLevel}
                    onChange={(e) => setEnergyLevel(parseInt(e.target.value))}
                    className="flex-1 h-2 rounded-full appearance-none bg-protocol-border
                               [&::-webkit-slider-thumb]:appearance-none
                               [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                               [&::-webkit-slider-thumb]:rounded-full
                               [&::-webkit-slider-thumb]:bg-yellow-500
                               [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <span className="text-xs text-protocol-text-muted">Energized</span>
                  <span className="w-8 text-center font-mono text-protocol-text">{energyLevel}</span>
                </div>
              </div>

              <button
                onClick={() => setStep('details')}
                className="w-full py-3 bg-protocol-accent text-white rounded-xl font-medium
                         hover:bg-protocol-accent/90 transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-6">
              {/* Regret Level */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-protocol-text mb-3">
                  <AlertTriangle className="w-5 h-5 text-orange-400" />
                  <span>Any Regret?</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-protocol-text-muted">None</span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={regretLevel}
                    onChange={(e) => setRegretLevel(parseInt(e.target.value))}
                    className="flex-1 h-2 rounded-full appearance-none bg-protocol-border
                               [&::-webkit-slider-thumb]:appearance-none
                               [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                               [&::-webkit-slider-thumb]:rounded-full
                               [&::-webkit-slider-thumb]:bg-orange-500
                               [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <span className="text-xs text-protocol-text-muted">Strong</span>
                  <span className="w-8 text-center font-mono text-protocol-text">{regretLevel}</span>
                </div>
              </div>

              {/* Doubt Level */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-protocol-text mb-3">
                  <Brain className="w-5 h-5 text-blue-400" />
                  <span>Identity Doubt?</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-protocol-text-muted">None</span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={doubtLevel}
                    onChange={(e) => setDoubtLevel(parseInt(e.target.value))}
                    className="flex-1 h-2 rounded-full appearance-none bg-protocol-border
                               [&::-webkit-slider-thumb]:appearance-none
                               [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                               [&::-webkit-slider-thumb]:rounded-full
                               [&::-webkit-slider-thumb]:bg-blue-500
                               [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <span className="text-xs text-protocol-text-muted">Strong</span>
                  <span className="w-8 text-center font-mono text-protocol-text">{doubtLevel}</span>
                </div>
              </div>

              {/* Crash Warning */}
              {showCrashWarning && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-amber-300 text-sm font-medium">
                        Post-session dip detected
                      </p>
                      <p className="text-amber-300/70 text-xs mt-1">
                        This is normal. The crash is prolactin, not truth.
                        What you felt during the session was real.
                        Take care of yourself - skincare, water, rest.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-protocol-text mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="How are you feeling? Any thoughts?"
                  rows={3}
                  className="w-full px-4 py-3 bg-protocol-bg border border-protocol-border rounded-xl
                           text-protocol-text placeholder-protocol-text-muted resize-none
                           focus:outline-none focus:border-protocol-accent"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('mood')}
                  className="flex-1 py-3 bg-protocol-bg border border-protocol-border text-protocol-text
                           rounded-xl font-medium hover:bg-protocol-border/50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-protocol-accent text-white rounded-xl font-medium
                           hover:bg-protocol-accent/90 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-protocol-text font-semibold text-lg mb-2">
                Check-in Complete
              </h3>
              <p className="text-protocol-text-muted text-sm mb-6">
                {showCrashWarning
                  ? "Take care of yourself. Handler is here if you need support."
                  : "Thank you for checking in. You're doing great."}
              </p>
              <button
                onClick={onDismiss}
                className="px-6 py-2 bg-protocol-surface border border-protocol-border
                         text-protocol-text rounded-xl font-medium
                         hover:bg-protocol-border/50 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PostSessionMoodCapture;
