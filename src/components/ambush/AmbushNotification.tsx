/**
 * AmbushNotification.tsx
 *
 * Pop-up notification for scheduled ambushes (micro-tasks).
 * Appears when it's time for a quick task, with options to complete, snooze, or skip.
 */

import { useState, useEffect, useRef } from 'react';
import { X, Clock, Camera, Mic, Check, AlarmClock, SkipForward } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { ScheduledAmbush } from '../../types/scheduled-ambush';
import { AMBUSH_TYPE_CONFIG } from '../../types/scheduled-ambush';

interface AmbushNotificationProps {
  ambush: ScheduledAmbush;
  onComplete: (proofUrl?: string) => Promise<void>;
  onSnooze: () => Promise<void>;
  onSkip: () => Promise<void>;
  onDismiss: () => void;
  canSnooze: boolean;
  isCompleting?: boolean;
}

export function AmbushNotification({
  ambush,
  onComplete,
  onSnooze,
  onSkip,
  onDismiss,
  canSnooze,
  isCompleting = false,
}: AmbushNotificationProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const [timeRemaining, setTimeRemaining] = useState(ambush.template?.duration_seconds || 30);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [showActions, setShowActions] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const template = ambush.template;
  const typeConfig = template ? AMBUSH_TYPE_CONFIG[template.type] : null;

  // Timer logic
  useEffect(() => {
    if (isTimerActive && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setIsTimerActive(false);
            setShowActions(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTimerActive, timeRemaining]);

  const handleStartTimer = () => {
    setIsTimerActive(true);
    setShowActions(false);
  };

  const handleComplete = async () => {
    if (isBambiMode) {
      triggerHearts();
    }
    await onComplete();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  const proofRequired = template?.proof_type && template.proof_type !== 'none' && template.proof_type !== 'tap';

  return (
    <div className="fixed inset-x-0 top-0 z-50 p-4 animate-slide-down">
      <div className={`max-w-md mx-auto rounded-2xl shadow-2xl overflow-hidden ${
        isBambiMode
          ? 'bg-gradient-to-br from-pink-900 via-fuchsia-900 to-purple-900 border border-pink-500/50'
          : 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-gray-700'
      }`}>
        {/* Header */}
        <div className={`px-4 py-3 flex items-center justify-between ${
          isBambiMode ? 'bg-pink-800/50' : 'bg-gray-800/50'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{typeConfig?.icon || '✨'}</span>
            <span className={`font-bold ${isBambiMode ? 'text-pink-100' : 'text-white'}`}>
              {typeConfig?.label || 'Quick Task'}
            </span>
          </div>
          <button
            onClick={onDismiss}
            className={`p-1.5 rounded-full transition-colors ${
              isBambiMode
                ? 'hover:bg-pink-700/50 text-pink-300'
                : 'hover:bg-gray-700 text-gray-400'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Instruction */}
          <p className={`text-lg leading-relaxed ${
            isBambiMode ? 'text-pink-50' : 'text-white'
          }`}>
            {template?.instruction || 'Complete this quick task'}
          </p>

          {/* Timer display */}
          {isTimerActive && (
            <div className="flex flex-col items-center py-4">
              <div className={`text-5xl font-mono font-bold ${
                timeRemaining <= 5
                  ? 'text-red-400 animate-pulse'
                  : isBambiMode ? 'text-pink-300' : 'text-white'
              }`}>
                {formatTime(timeRemaining)}
              </div>
              <p className={`text-sm mt-2 ${isBambiMode ? 'text-pink-300' : 'text-gray-400'}`}>
                Focus and complete the task
              </p>
            </div>
          )}

          {/* Duration badge */}
          {!isTimerActive && template?.duration_seconds && (
            <div className="flex items-center gap-2">
              <Clock className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-400'}`} />
              <span className={`text-sm ${isBambiMode ? 'text-pink-300' : 'text-gray-400'}`}>
                ~{formatTime(template.duration_seconds)}
              </span>
              {proofRequired && (
                <>
                  <span className={isBambiMode ? 'text-pink-600' : 'text-gray-600'}>•</span>
                  {template.proof_type === 'photo' || template.proof_type === 'selfie' ? (
                    <Camera className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-400'}`} />
                  ) : (
                    <Mic className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-400'}`} />
                  )}
                  <span className={`text-sm ${isBambiMode ? 'text-pink-300' : 'text-gray-400'}`}>
                    {template.proof_type === 'photo' ? 'Photo' : template.proof_type === 'audio' ? 'Audio' : 'Selfie'} optional
                  </span>
                </>
              )}
            </div>
          )}

          {/* Snooze count */}
          {ambush.snooze_count > 0 && (
            <p className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-amber-400'}`}>
              Snoozed {ambush.snooze_count} time{ambush.snooze_count > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Actions */}
        {showActions && (
          <div className={`p-4 space-y-3 ${
            isBambiMode ? 'bg-pink-950/50' : 'bg-gray-900/50'
          }`}>
            {/* Primary action row */}
            <div className="flex gap-3">
              {/* Start timer / Complete button */}
              {template?.duration_seconds && template.duration_seconds > 10 && !isTimerActive ? (
                <button
                  onClick={handleStartTimer}
                  className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                    isBambiMode
                      ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white hover:from-pink-400 hover:to-fuchsia-400'
                      : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  <Clock className="w-5 h-5" />
                  Start Timer
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  disabled={isCompleting}
                  className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                    isCompleting
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : isBambiMode
                        ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white hover:from-pink-400 hover:to-fuchsia-400'
                        : 'bg-white text-black hover:bg-gray-100'
                  }`}
                >
                  <Check className="w-5 h-5" />
                  {isCompleting ? 'Completing...' : 'Done'}
                </button>
              )}
            </div>

            {/* Secondary action row */}
            <div className="flex gap-3">
              {canSnooze && (
                <button
                  onClick={onSnooze}
                  className={`flex-1 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
                    isBambiMode
                      ? 'bg-pink-800/50 text-pink-200 hover:bg-pink-800/70 border border-pink-600/50'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                  }`}
                >
                  <AlarmClock className="w-4 h-4" />
                  Snooze
                </button>
              )}
              <button
                onClick={onSkip}
                className={`flex-1 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
                  isBambiMode
                    ? 'bg-pink-900/30 text-pink-300 hover:bg-pink-900/50 border border-pink-700/30'
                    : 'bg-gray-900/50 text-gray-400 hover:bg-gray-800 border border-gray-800'
                }`}
              >
                <SkipForward className="w-4 h-4" />
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Timer mode - just show done button */}
        {isTimerActive && (
          <div className={`p-4 ${isBambiMode ? 'bg-pink-950/50' : 'bg-gray-900/50'}`}>
            <button
              onClick={handleComplete}
              disabled={isCompleting}
              className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                isBambiMode
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-400 hover:to-emerald-400'
                  : 'bg-green-600 text-white hover:bg-green-500'
              }`}
            >
              <Check className="w-5 h-5" />
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

