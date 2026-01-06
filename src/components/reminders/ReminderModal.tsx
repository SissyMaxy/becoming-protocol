/**
 * Reminder Modal
 *
 * Appears when a feminization reminder triggers.
 * Quick interaction for posture, voice, movement, and identity reminders.
 */

import { useState, useEffect } from 'react';
import { X, Check, Star, Volume2, Move, Sparkles, User } from 'lucide-react';
import type { Reminder, ReminderType } from '../../types/reminders';
import { getReminderTypeLabel, getReminderTypeColor } from '../../types/reminders';

interface ReminderModalProps {
  reminder: Reminder;
  onRespond: (rating?: number, note?: string) => void;
  onSkip: () => void;
  onDismiss: () => void;
}

function getTypeIcon(type: ReminderType) {
  switch (type) {
    case 'posture': return <User className="w-6 h-6" />;
    case 'voice': return <Volume2 className="w-6 h-6" />;
    case 'movement': return <Move className="w-6 h-6" />;
    case 'identity': return <Sparkles className="w-6 h-6" />;
  }
}

export function ReminderModal({ reminder, onRespond, onSkip, onDismiss }: ReminderModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const typeColor = getReminderTypeColor(reminder.type);
  const typeLabel = getReminderTypeLabel(reminder.type);
  const needsRating = reminder.responseType === 'rate';

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);
  }, []);

  const handleComplete = async () => {
    if (needsRating && rating === null) {
      setShowRating(true);
      return;
    }

    setIsCompleting(true);
    await onRespond(rating ?? undefined);
  };

  const handleRatingSelect = async (value: number) => {
    setRating(value);
    setIsCompleting(true);
    await onRespond(value);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-black/70' : 'bg-transparent pointer-events-none'
      }`}
      onClick={onDismiss}
    >
      <div
        className={`max-w-sm w-full transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-protocol-surface border border-protocol-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Header with type color */}
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ backgroundColor: `${typeColor}20` }}
          >
            <div className="flex items-center gap-2">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${typeColor}30`, color: typeColor }}
              >
                {getTypeIcon(reminder.type)}
              </div>
              <span
                className="text-sm font-medium uppercase tracking-wider"
                style={{ color: typeColor }}
              >
                {typeLabel} Check
              </span>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 rounded-lg hover:bg-white/10 text-protocol-text-muted"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5">
            {!showRating ? (
              <>
                {/* Prompt */}
                <h2 className="text-xl font-semibold text-protocol-text mb-3">
                  {reminder.prompt}
                </h2>

                {/* Instruction */}
                {reminder.instruction && (
                  <p className="text-protocol-text-muted text-sm leading-relaxed mb-6">
                    {reminder.instruction}
                  </p>
                )}

                {/* Duration indicator */}
                {reminder.duration && (
                  <div className="mb-6 p-3 rounded-lg bg-protocol-bg/50 text-center">
                    <p className="text-2xl font-bold text-protocol-text">
                      {reminder.duration}s
                    </p>
                    <p className="text-xs text-protocol-text-muted">
                      Practice duration
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={onSkip}
                    className="flex-1 py-3 rounded-xl bg-protocol-bg/50 text-protocol-text-muted font-medium hover:bg-protocol-bg transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleComplete}
                    disabled={isCompleting}
                    className="flex-1 py-3 rounded-xl text-white font-medium transition-all flex items-center justify-center gap-2"
                    style={{ backgroundColor: typeColor }}
                  >
                    {isCompleting ? (
                      'Done!'
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        {needsRating ? 'Done - Rate' : 'Done'}
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Rating view */}
                <h2 className="text-xl font-semibold text-protocol-text mb-2 text-center">
                  How did you do?
                </h2>
                <p className="text-protocol-text-muted text-sm text-center mb-6">
                  Rate your feminine execution
                </p>

                {/* Star rating */}
                <div className="flex justify-center gap-2 mb-6">
                  {[1, 2, 3, 4, 5].map(value => (
                    <button
                      key={value}
                      onClick={() => handleRatingSelect(value)}
                      disabled={isCompleting}
                      className={`p-2 rounded-lg transition-all ${
                        rating === value
                          ? 'scale-110'
                          : 'hover:scale-105'
                      }`}
                      style={{
                        color: rating && value <= rating ? typeColor : '#666',
                      }}
                    >
                      <Star
                        className="w-8 h-8"
                        fill={rating && value <= rating ? typeColor : 'transparent'}
                      />
                    </button>
                  ))}
                </div>

                {/* Rating labels */}
                <div className="flex justify-between text-xs text-protocol-text-muted px-2">
                  <span>Needs work</span>
                  <span>Perfect!</span>
                </div>
              </>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-5 pb-4">
            <p className="text-xs text-protocol-text-muted text-center">
              {reminder.type === 'identity'
                ? 'Breathe. You are her.'
                : 'Every practice makes it more natural'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Minimal reminder toast (alternative to full modal)
 */
interface ReminderToastProps {
  reminder: Reminder;
  onExpand: () => void;
  onDismiss: () => void;
}

export function ReminderToast({ reminder, onExpand, onDismiss }: ReminderToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const typeColor = getReminderTypeColor(reminder.type);

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);

    // Auto-dismiss after 10 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300);
    }, 10000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`fixed top-4 right-4 z-50 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
      }`}
    >
      <div
        className="bg-protocol-surface border border-protocol-border rounded-xl shadow-lg p-4 max-w-xs cursor-pointer hover:scale-105 transition-transform"
        onClick={onExpand}
        style={{ borderLeftColor: typeColor, borderLeftWidth: 4 }}
      >
        <div className="flex items-start gap-3">
          <div
            className="p-2 rounded-lg flex-shrink-0"
            style={{ backgroundColor: `${typeColor}20`, color: typeColor }}
          >
            {getTypeIcon(reminder.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-protocol-text truncate">
              {reminder.prompt}
            </p>
            <p className="text-xs text-protocol-text-muted mt-1">
              Tap to respond
            </p>
          </div>
          <button
            onClick={e => {
              e.stopPropagation();
              setIsVisible(false);
              setTimeout(onDismiss, 300);
            }}
            className="p-1 rounded hover:bg-protocol-bg/50 text-protocol-text-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
