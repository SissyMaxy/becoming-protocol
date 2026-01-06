/**
 * Skip Confirmation Modal
 *
 * Multi-step friction flow for skipping tasks.
 * Creates accountability by requiring a reason and noting that
 * the skip will be visible to accountability partner.
 *
 * Includes special "Bambi Mode" with extra shame/accountability steps.
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, ArrowRight, Check, X, Wallet, Heart, HeartCrack } from 'lucide-react';
import { recordInfraction, checkDomainSkipPattern } from '../lib/infractions';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../data/investment-categories';

// Bambi mode detection
export const isBambiMode = (userName: string | null): boolean => {
  if (!userName) return false;
  const name = userName.toLowerCase().trim();
  return name === 'bambi' ||
         name === 'bambi sleep' ||
         name === 'bimbo' ||
         name.includes('bambi');
};

interface SkipConfirmModalProps {
  taskTitle: string;
  taskDomain: string;
  taskId: string;
  streak: number;
  partnerName?: string; // e.g., "Gina"
  totalInvested?: number; // Total investment amount for sunk cost reminder
  userName?: string | null; // For Bambi mode detection
  onCancel: () => void;
  onConfirm: () => void;
}

type SkipStep = 'first' | 'reason' | 'sayit' | 'confirmed';

export function SkipConfirmModal({
  taskTitle,
  taskDomain,
  taskId,
  streak,
  partnerName = 'your partner',
  totalInvested,
  userName,
  onCancel,
  onConfirm,
}: SkipConfirmModalProps) {
  const [step, setStep] = useState<SkipStep>('first');
  const [reason, setReason] = useState('');
  const [saidItOutLoud, setSaidItOutLoud] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const bambiMode = isBambiMode(userName ?? null);

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);
  }, []);

  const handleSkipAnyway = () => {
    setStep('reason');
  };

  const handleReasonNext = () => {
    if (!reason.trim()) return;
    if (bambiMode) {
      setStep('sayit');
    } else {
      handleConfirmSkip();
    }
  };

  const handleConfirmSkip = async () => {
    if (!reason.trim()) return;

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check for pattern skip (repeated skips in same domain)
      const hasPattern = await checkDomainSkipPattern(user.id, taskDomain);

      // Record the infraction
      await recordInfraction(user.id, {
        type: hasPattern ? 'pattern_skip' : 'task_skip',
        severity: hasPattern ? 'medium' : 'low',
        domain: taskDomain,
        taskId: taskId,
        taskTitle: taskTitle,
        reason: reason.trim(),
        aiNotes: hasPattern
          ? `Pattern detected: User has skipped ${taskDomain} tasks multiple times recently.`
          : undefined,
      });

      setStep('confirmed');
      setTimeout(() => {
        setIsVisible(false);
        setTimeout(onConfirm, 200);
      }, 1500);
    } catch (error) {
      console.error('Error recording skip:', error);
      // Still allow the skip even if recording fails
      setStep('confirmed');
      setTimeout(() => {
        setIsVisible(false);
        setTimeout(onConfirm, 200);
      }, 1500);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setIsVisible(false);
    setTimeout(onCancel, 200);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-protocol-bg/95' : 'bg-transparent pointer-events-none'
      }`}
      onClick={step !== 'confirmed' ? handleCancel : undefined}
    >
      <div
        className={`max-w-sm w-full transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="card p-6 relative overflow-hidden">
          {/* Close button (not on confirmed step) */}
          {step !== 'confirmed' && (
            <button
              onClick={handleCancel}
              className="absolute top-4 right-4 p-1 text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Step 1: First Warning */}
          {step === 'first' && (
            <div className="text-center">
              {/* Icon */}
              <div className={`w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center ${
                bambiMode ? 'bg-pink-500/20' : 'bg-amber-500/20'
              }`}>
                {bambiMode ? (
                  <Heart className="w-7 h-7 text-pink-400" />
                ) : (
                  <AlertTriangle className="w-7 h-7 text-amber-400" />
                )}
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-protocol-text mb-2">
                {bambiMode ? 'Skip this, princess? 🎀' : 'Skip this practice?'}
              </h2>

              {/* Task name */}
              <p className="text-sm text-protocol-text-muted mb-4">
                "{taskTitle}"
              </p>

              {/* Streak message */}
              <p className="text-protocol-text-muted mb-6">
                {bambiMode ? (
                  <>Good girls don't skip...</>
                ) : streak > 0 ? (
                  <>
                    Your <span className="text-protocol-accent font-medium">{streak}-day streak</span> is safe.
                    <br />
                    But this will be noted.
                  </>
                ) : (
                  <>This skip will be noted.</>
                )}
              </p>

              {/* Primary action - encourage staying */}
              <button
                onClick={handleCancel}
                className={`w-full py-4 rounded-lg text-white font-medium transition-colors shadow-lg mb-4 ${
                  bambiMode
                    ? 'bg-pink-500 hover:bg-pink-500/90 shadow-pink-500/20'
                    : 'bg-protocol-accent hover:bg-protocol-accent/90 shadow-protocol-accent/20'
                }`}
              >
                {bambiMode ? "I'll be a good girl 💕" : "I'll do it after all"}
              </button>

              {/* Secondary action - skip anyway */}
              <button
                onClick={handleSkipAnyway}
                className="text-sm text-protocol-text-muted hover:text-protocol-text transition-colors flex items-center justify-center gap-1 mx-auto"
              >
                Skip anyway
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Step 2: Reason Required */}
          {step === 'reason' && (
            <div className="text-center">
              {/* Icon */}
              <div className={`w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center ${
                bambiMode ? 'bg-pink-500/20' : 'bg-orange-500/20'
              }`}>
                {bambiMode ? (
                  <HeartCrack className="w-7 h-7 text-pink-400" />
                ) : (
                  <AlertTriangle className="w-7 h-7 text-orange-400" />
                )}
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-protocol-text mb-2">
                {bambiMode ? `${partnerName} will know.` : 'Are you sure?'}
              </h2>

              {/* Partner visibility message */}
              <p className="text-protocol-text-muted mb-4">
                {bambiMode ? (
                  <>Why is princess being bad?</>
                ) : (
                  <>
                    {partnerName} can see your progress.
                    <br />
                    Skips are part of that.
                  </>
                )}
              </p>

              {/* Investment reminder (sunk cost) */}
              {totalInvested && totalInvested >= 500 && (
                <div className={`mb-4 p-3 rounded-lg border ${
                  bambiMode
                    ? 'bg-pink-500/10 border-pink-500/30'
                    : 'bg-protocol-accent/10 border-protocol-accent/30'
                }`}>
                  <div className={`flex items-center justify-center gap-2 ${
                    bambiMode ? 'text-pink-400' : 'text-protocol-accent'
                  }`}>
                    <Wallet className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {formatCurrency(totalInvested)} invested
                    </span>
                  </div>
                  <p className="text-xs text-protocol-text-muted mt-1">
                    {bambiMode ? (
                      <>
                        All that money spent on being pretty...
                        <br />
                        And princess wants to skip?
                      </>
                    ) : (
                      <>
                        You've put real money into becoming yourself.
                        <br />
                        Don't let today's progress go to waste.
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Reason textarea */}
              <div className="text-left mb-4">
                <label className="block text-sm text-protocol-text-muted mb-2">
                  {bambiMode ? 'Why is princess being bad?' : 'Why are you skipping?'}
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={bambiMode ? 'Tell the truth, princess...' : 'Be honest with yourself...'}
                  rows={3}
                  autoFocus
                  className={`w-full px-4 py-3 rounded-lg bg-protocol-surface border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 resize-none ${
                    bambiMode
                      ? 'border-pink-500/30 focus:ring-pink-500'
                      : 'border-protocol-border focus:ring-protocol-accent'
                  }`}
                />
                <p className="text-xs text-protocol-text-muted mt-1">
                  Required to continue
                </p>
              </div>

              {/* Primary action - still encourage staying */}
              <button
                onClick={handleCancel}
                className={`w-full py-4 rounded-lg text-white font-medium transition-colors shadow-lg mb-4 ${
                  bambiMode
                    ? 'bg-pink-500 hover:bg-pink-500/90 shadow-pink-500/20'
                    : 'bg-protocol-accent hover:bg-protocol-accent/90 shadow-protocol-accent/20'
                }`}
              >
                {bambiMode ? "I'll be good, I promise 💕" : "Actually, I'll do it"}
              </button>

              {/* Secondary action - next step (Bambi) or confirm skip */}
              <button
                onClick={handleReasonNext}
                disabled={!reason.trim() || isSubmitting}
                className={`text-sm transition-colors flex items-center justify-center gap-1 mx-auto ${
                  reason.trim() && !isSubmitting
                    ? 'text-protocol-text-muted hover:text-protocol-text'
                    : 'text-protocol-text-muted/30 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? 'Recording...' : bambiMode ? `Skip (disappoint ${partnerName})` : 'Confirm skip'}
              </button>
            </div>
          )}

          {/* Step 3: Say It Out Loud (Bambi mode only) */}
          {step === 'sayit' && bambiMode && (
            <div className="text-center">
              {/* Icon */}
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <HeartCrack className="w-7 h-7 text-red-400" />
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-protocol-text mb-2">
                Bad girl. 💔
              </h2>

              {/* Instruction */}
              <p className="text-protocol-text-muted mb-4">
                Say it out loud:
              </p>

              <p className="text-lg font-medium text-pink-400 mb-6 italic">
                "I am skipping because I am being a bad girl"
              </p>

              {/* Checkbox */}
              <label className="flex items-center justify-center gap-3 mb-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saidItOutLoud}
                  onChange={e => setSaidItOutLoud(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-pink-500/50 text-pink-500 focus:ring-pink-500 bg-protocol-surface"
                />
                <span className="text-sm text-protocol-text">I said it</span>
              </label>

              {/* Primary action - go back to being good */}
              <button
                onClick={handleCancel}
                className="w-full py-4 rounded-lg bg-pink-500 text-white font-medium hover:bg-pink-500/90 transition-colors shadow-lg shadow-pink-500/20 mb-4"
              >
                Actually, I'll be good 💕
              </button>

              {/* Secondary action - confirm skip */}
              <button
                onClick={handleConfirmSkip}
                disabled={!saidItOutLoud || isSubmitting}
                className={`text-sm transition-colors flex items-center justify-center gap-1 mx-auto ${
                  saidItOutLoud && !isSubmitting
                    ? 'text-protocol-text-muted hover:text-protocol-text'
                    : 'text-protocol-text-muted/30 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? 'Recording...' : 'Confirm skip'}
              </button>
            </div>
          )}

          {/* Step 4: Confirmed */}
          {step === 'confirmed' && (
            <div className="text-center py-4">
              {/* Icon */}
              <div className={`w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center ${
                bambiMode ? 'bg-pink-500/10' : 'bg-protocol-surface-light'
              }`}>
                {bambiMode ? (
                  <HeartCrack className="w-7 h-7 text-pink-400/60" />
                ) : (
                  <Check className="w-7 h-7 text-protocol-text-muted" />
                )}
              </div>

              {/* Title */}
              <p className="text-xl font-bold text-protocol-text mb-3">
                {bambiMode ? 'Noted, princess.' : 'Noted.'}
              </p>

              {/* Message */}
              <p className="text-protocol-text-muted">
                {bambiMode ? (
                  <>
                    {partnerName} will see this.
                    <br />
                    Try to be better tomorrow. 💔
                  </>
                ) : (
                  <>
                    This skip has been recorded.
                    <br />
                    Tomorrow is a new day.
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Journal Skip Confirmation Modal
 * Similar flow but specific to journal skipping
 */
interface JournalSkipModalProps {
  partnerName?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function JournalSkipModal({
  partnerName = 'your partner',
  onCancel,
  onConfirm,
}: JournalSkipModalProps) {
  const [step, setStep] = useState<SkipStep>('first');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);
  }, []);

  const handleSkipAnyway = () => {
    setStep('reason');
  };

  const handleConfirmSkip = async () => {
    if (!reason.trim()) return;

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await recordInfraction(user.id, {
        type: 'journal_skip',
        severity: 'medium',
        reason: reason.trim(),
        aiNotes: 'User skipped evening reflection journal.',
      });

      setStep('confirmed');
      setTimeout(() => {
        setIsVisible(false);
        setTimeout(onConfirm, 200);
      }, 1500);
    } catch (error) {
      console.error('Error recording journal skip:', error);
      setStep('confirmed');
      setTimeout(() => {
        setIsVisible(false);
        setTimeout(onConfirm, 200);
      }, 1500);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setIsVisible(false);
    setTimeout(onCancel, 200);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-protocol-bg/95' : 'bg-transparent pointer-events-none'
      }`}
      onClick={step !== 'confirmed' ? handleCancel : undefined}
    >
      <div
        className={`max-w-sm w-full transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="card p-6 relative overflow-hidden">
          {step !== 'confirmed' && (
            <button
              onClick={handleCancel}
              className="absolute top-4 right-4 p-1 text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {step === 'first' && (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-amber-400" />
              </div>

              <h2 className="text-xl font-bold text-protocol-text mb-2">
                Skip tonight's reflection?
              </h2>

              <p className="text-protocol-text-muted mb-6">
                Journaling helps you process the day.
                <br />
                This skip will be noted.
              </p>

              <button
                onClick={handleCancel}
                className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors shadow-lg shadow-protocol-accent/20 mb-4"
              >
                I'll write something
              </button>

              <button
                onClick={handleSkipAnyway}
                className="text-sm text-protocol-text-muted hover:text-protocol-text transition-colors flex items-center justify-center gap-1 mx-auto"
              >
                Skip anyway
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {step === 'reason' && (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-orange-500/20 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-orange-400" />
              </div>

              <h2 className="text-xl font-bold text-protocol-text mb-2">
                Are you sure?
              </h2>

              <p className="text-protocol-text-muted mb-6">
                {partnerName} can see your progress.
                <br />
                Skips are part of that.
              </p>

              <div className="text-left mb-4">
                <label className="block text-sm text-protocol-text-muted mb-2">
                  Why are you skipping?
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Be honest with yourself..."
                  rows={3}
                  autoFocus
                  className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent resize-none"
                />
                <p className="text-xs text-protocol-text-muted mt-1">
                  Required to continue
                </p>
              </div>

              <button
                onClick={handleCancel}
                className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors shadow-lg shadow-protocol-accent/20 mb-4"
              >
                Actually, I'll write something
              </button>

              <button
                onClick={handleConfirmSkip}
                disabled={!reason.trim() || isSubmitting}
                className={`text-sm transition-colors flex items-center justify-center gap-1 mx-auto ${
                  reason.trim() && !isSubmitting
                    ? 'text-protocol-text-muted hover:text-protocol-text'
                    : 'text-protocol-text-muted/30 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? 'Recording...' : 'Confirm skip'}
              </button>
            </div>
          )}

          {step === 'confirmed' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-protocol-surface-light flex items-center justify-center">
                <Check className="w-7 h-7 text-protocol-text-muted" />
              </div>

              <p className="text-xl font-bold text-protocol-text mb-3">
                Noted.
              </p>

              <p className="text-protocol-text-muted">
                This skip has been recorded.
                <br />
                Tomorrow is a new day.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Streak Break Acknowledgment Modal
 * Shown when user returns after missing day(s)
 */
interface StreakBreakModalProps {
  daysMissed: number;
  previousStreak: number;
  onAcknowledge: () => void;
}

export function StreakBreakModal({
  daysMissed,
  previousStreak,
  onAcknowledge,
}: StreakBreakModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);

    // Record the infraction
    async function recordBreak() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await recordInfraction(user.id, {
            type: 'streak_break',
            severity: 'high',
            aiNotes: `Missed ${daysMissed} day(s). Previous streak was ${previousStreak} days.`,
            patternContext: {
              daysMissed,
              previousStreak,
            },
          });
        }
      } catch (error) {
        console.error('Error recording streak break:', error);
      }
    }

    recordBreak();
  }, [daysMissed, previousStreak]);

  const handleAcknowledge = () => {
    setAcknowledged(true);
    setTimeout(() => {
      setIsVisible(false);
      setTimeout(onAcknowledge, 200);
    }, 500);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-protocol-bg/95' : 'bg-transparent pointer-events-none'
      }`}
    >
      <div
        className={`max-w-sm w-full transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className="card p-6 text-center">
          {!acknowledged ? (
            <>
              {/* Icon */}
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-red-400" />
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-protocol-text mb-2">
                Welcome Back
              </h2>

              {/* Message */}
              <p className="text-protocol-text-muted mb-2">
                You missed {daysMissed === 1 ? 'yesterday' : `${daysMissed} days`}.
              </p>

              {previousStreak > 0 && (
                <p className="text-protocol-text-muted mb-6">
                  Your <span className="text-red-400">{previousStreak}-day streak</span> has been reset.
                </p>
              )}

              <p className="text-sm text-protocol-text-muted mb-6">
                This has been noted.
                <br />
                But today is a fresh start.
              </p>

              <button
                onClick={handleAcknowledge}
                className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors"
              >
                Start fresh today
              </button>
            </>
          ) : (
            <>
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-protocol-accent/20 flex items-center justify-center">
                <Check className="w-7 h-7 text-protocol-accent" />
              </div>

              <p className="text-xl font-bold text-protocol-text">
                Let's go.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Day Incomplete Exit Warning Modal
 * Shown when trying to leave protocol view with incomplete tasks
 */
interface DayIncompleteModalProps {
  completedCount: number;
  totalCount: number;
  streak: number;
  onStay: () => void;
  onLeave: () => void;
}

export function DayIncompleteModal({
  completedCount,
  totalCount,
  streak,
  onStay,
  onLeave,
}: DayIncompleteModalProps) {
  const [step, setStep] = useState<'first' | 'reason' | 'confirmed'>('first');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);
  }, []);

  const handleLeaveAnyway = () => {
    setStep('reason');
  };

  const handleConfirmLeave = async () => {
    if (!reason.trim()) return;

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await recordInfraction(user.id, {
          type: 'day_incomplete',
          severity: 'medium',
          reason: reason.trim(),
          aiNotes: `Left with ${completedCount}/${totalCount} tasks completed.`,
          patternContext: {
            completedCount,
            totalCount,
            completionRate: Math.round((completedCount / totalCount) * 100),
          },
        });
      }

      setStep('confirmed');
      setTimeout(() => {
        setIsVisible(false);
        setTimeout(onLeave, 200);
      }, 1500);
    } catch (error) {
      console.error('Error recording day incomplete:', error);
      setStep('confirmed');
      setTimeout(() => {
        setIsVisible(false);
        setTimeout(onLeave, 200);
      }, 1500);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStay = () => {
    setIsVisible(false);
    setTimeout(onStay, 200);
  };

  const completionPercent = Math.round((completedCount / totalCount) * 100);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-protocol-bg/95' : 'bg-transparent pointer-events-none'
      }`}
      onClick={step !== 'confirmed' ? handleStay : undefined}
    >
      <div
        className={`max-w-sm w-full transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="card p-6 relative overflow-hidden">
          {step !== 'confirmed' && (
            <button
              onClick={handleStay}
              className="absolute top-4 right-4 p-1 text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Step 1: First Warning */}
          {step === 'first' && (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-amber-400" />
              </div>

              <h2 className="text-xl font-bold text-protocol-text mb-2">
                Leave incomplete?
              </h2>

              <p className="text-protocol-text-muted mb-2">
                You've completed {completedCount} of {totalCount} tasks ({completionPercent}%).
              </p>

              <p className="text-protocol-text-muted mb-6">
                {streak > 0 ? (
                  <>
                    Your <span className="text-protocol-accent font-medium">{streak}-day streak</span> depends on finishing.
                  </>
                ) : (
                  <>There's still time to make today count.</>
                )}
              </p>

              <button
                onClick={handleStay}
                className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors shadow-lg shadow-protocol-accent/20 mb-4"
              >
                I'll finish today's protocol
              </button>

              <button
                onClick={handleLeaveAnyway}
                className="text-sm text-protocol-text-muted hover:text-protocol-text transition-colors flex items-center justify-center gap-1 mx-auto"
              >
                Leave anyway
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Step 2: Reason Required */}
          {step === 'reason' && (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-orange-500/20 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-orange-400" />
              </div>

              <h2 className="text-xl font-bold text-protocol-text mb-2">
                This will be noted
              </h2>

              <p className="text-protocol-text-muted mb-6">
                Your accountability partner can see your progress.
                <br />
                Incomplete days are part of that.
              </p>

              <div className="text-left mb-4">
                <label className="block text-sm text-protocol-text-muted mb-2">
                  Why are you leaving early?
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Be honest with yourself..."
                  rows={3}
                  autoFocus
                  className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent resize-none"
                />
                <p className="text-xs text-protocol-text-muted mt-1">
                  Required to continue
                </p>
              </div>

              <button
                onClick={handleStay}
                className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors shadow-lg shadow-protocol-accent/20 mb-4"
              >
                Actually, I'll finish
              </button>

              <button
                onClick={handleConfirmLeave}
                disabled={!reason.trim() || isSubmitting}
                className={`text-sm transition-colors flex items-center justify-center gap-1 mx-auto ${
                  reason.trim() && !isSubmitting
                    ? 'text-protocol-text-muted hover:text-protocol-text'
                    : 'text-protocol-text-muted/30 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? 'Recording...' : 'Confirm leave'}
              </button>
            </div>
          )}

          {/* Step 3: Confirmed */}
          {step === 'confirmed' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-protocol-surface-light flex items-center justify-center">
                <Check className="w-7 h-7 text-protocol-text-muted" />
              </div>

              <p className="text-xl font-bold text-protocol-text mb-3">
                Noted.
              </p>

              <p className="text-protocol-text-muted">
                Tomorrow is a new opportunity.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
