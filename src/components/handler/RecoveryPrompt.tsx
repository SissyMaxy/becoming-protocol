/**
 * Recovery Prompt Component
 *
 * Displays when disassociation/inactivity is detected.
 * Gentle but persistent nudge to re-engage.
 */

import { useState, useEffect } from 'react';
import {
  Wind,
  Hand,
  Sparkles,
  Heart,
  RotateCcw,
  Check,
  AlertCircle,
} from 'lucide-react';
import type { RecoveryPrompt as RecoveryPromptType, RecoveryType } from '../../hooks/useDisassociationRecovery';

interface RecoveryPromptProps {
  prompt: RecoveryPromptType;
  escalationLevel: number;
  consecutiveIgnores: number;
  onComplete: () => void;
  onDismiss: () => void;
}

const TYPE_CONFIG: Record<RecoveryType, {
  icon: React.ElementType;
  color: string;
  bgGradient: string;
  label: string;
}> = {
  grounding_sensory: {
    icon: Hand,
    color: 'text-teal-400',
    bgGradient: 'from-teal-900/90 to-cyan-900/90',
    label: 'Ground Yourself',
  },
  grounding_breath: {
    icon: Wind,
    color: 'text-blue-400',
    bgGradient: 'from-blue-900/90 to-indigo-900/90',
    label: 'Breathe',
  },
  micro_task: {
    icon: Sparkles,
    color: 'text-pink-400',
    bgGradient: 'from-pink-900/90 to-purple-900/90',
    label: 'Micro Task',
  },
  body_check: {
    icon: RotateCcw,
    color: 'text-amber-400',
    bgGradient: 'from-amber-900/90 to-orange-900/90',
    label: 'Body Check',
  },
  momentum_builder: {
    icon: Heart,
    color: 'text-rose-400',
    bgGradient: 'from-rose-900/90 to-pink-900/90',
    label: "You're Here",
  },
  re_anchor: {
    icon: AlertCircle,
    color: 'text-red-400',
    bgGradient: 'from-red-900/90 to-rose-900/90',
    label: 'Come Back',
  },
};

export function RecoveryPrompt({
  prompt,
  escalationLevel,
  consecutiveIgnores,
  onComplete,
  onDismiss,
}: RecoveryPromptProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [countdown, setCountdown] = useState(prompt.duration);
  const [isCompleting, setIsCompleting] = useState(false);

  const config = TYPE_CONFIG[prompt.type];
  const Icon = config.icon;

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // Countdown timer when completing
  useEffect(() => {
    if (!isCompleting) return;

    if (countdown <= 0) {
      onComplete();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(c => c - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isCompleting, countdown, onComplete]);

  const handleStart = () => {
    setIsCompleting(true);
    // Gentle vibration
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleDismiss}
      />

      {/* Card */}
      <div
        className={`
          relative w-full max-w-sm rounded-2xl overflow-hidden
          bg-gradient-to-b ${config.bgGradient}
          border border-white/10 shadow-2xl
          transform transition-all duration-300
          ${isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}
        `}
      >
        {/* Escalation indicator */}
        {escalationLevel > 1 && (
          <div className="absolute top-2 right-2 flex gap-1">
            {Array.from({ length: escalationLevel }).map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < escalationLevel ? 'bg-white/60' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
        )}

        {/* Header */}
        <div className="p-6 text-center">
          <div className={`inline-flex p-4 rounded-full bg-white/10 mb-4 ${
            isCompleting ? 'animate-pulse' : ''
          }`}>
            <Icon className={`w-8 h-8 ${config.color}`} />
          </div>

          <div className={`text-sm font-medium ${config.color} mb-2`}>
            {config.label}
          </div>

          <p className="text-white text-lg leading-relaxed">
            {prompt.prompt}
          </p>
        </div>

        {/* Progress / Actions */}
        <div className="px-6 pb-6">
          {isCompleting ? (
            // Countdown
            <div className="text-center">
              <div className="text-5xl font-bold text-white mb-2">
                {countdown}
              </div>
              <div className="text-white/60 text-sm">
                seconds remaining
              </div>
              <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className={`h-full ${config.color.replace('text-', 'bg-')} transition-all duration-1000`}
                  style={{ width: `${((prompt.duration - countdown) / prompt.duration) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            // Action buttons
            <div className="space-y-3">
              <button
                onClick={handleStart}
                className={`
                  w-full py-4 rounded-xl font-medium text-lg
                  bg-white/20 hover:bg-white/30 text-white
                  transition-all active:scale-[0.98]
                  flex items-center justify-center gap-2
                `}
              >
                <Check className="w-5 h-5" />
                Do it now
              </button>

              {consecutiveIgnores < 3 && (
                <button
                  onClick={handleDismiss}
                  className="w-full py-3 text-white/50 hover:text-white/70 text-sm transition-colors"
                >
                  Not right now
                </button>
              )}

              {consecutiveIgnores >= 2 && (
                <p className="text-center text-white/40 text-xs">
                  You've dismissed {consecutiveIgnores} times. I'll keep checking.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
