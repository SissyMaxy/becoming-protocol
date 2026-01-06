/**
 * Streak Value Visualization
 *
 * Shows what a streak represents to make breaking it feel costly.
 * "Your 12-day streak represents..."
 */

import { useState, useEffect } from 'react';
import {
  Flame,
  CheckCircle,
  Clock,
  Sparkles,
  DollarSign,
  TrendingUp,
  BookOpen,
  Mail,
  Shield,
  AlertTriangle,
  X,
} from 'lucide-react';
import { StreakValue, calculateStreakValue } from '../../types/ratchets';

interface StreakValueCardProps {
  streak: number;
  data: Partial<StreakValue>;
  showWarning?: boolean;
  warningMessage?: string;
}

export function StreakValueCard({
  streak,
  data,
  showWarning = false,
  warningMessage,
}: StreakValueCardProps) {
  const psychValue = calculateStreakValue(streak, data);

  const items = [
    { icon: CheckCircle, label: 'tasks completed', value: data.tasksCompleted || 0, show: true },
    { icon: Clock, label: 'hours of practice', value: data.practiceHours?.toFixed(1) || '0', show: (data.practiceHours || 0) > 0 },
    { icon: Sparkles, label: 'edges without release', value: data.edgesWithoutRelease || 0, show: (data.edgesWithoutRelease || 0) > 0 },
    { icon: DollarSign, label: 'invested during streak', value: `$${(data.investmentDuring || 0).toLocaleString()}`, show: (data.investmentDuring || 0) > 0 },
    { icon: TrendingUp, label: 'levels gained', value: data.levelsGained || 0, show: (data.levelsGained || 0) > 0 },
    { icon: BookOpen, label: 'journal entries', value: data.journalEntries || 0, show: (data.journalEntries || 0) > 0 },
    { icon: Mail, label: 'sealed letters', value: data.lettersWritten || 0, show: (data.lettersWritten || 0) > 0 },
    { icon: Shield, label: 'covenant signed', value: '✓', show: data.covenantSigned },
  ];

  const visibleItems = items.filter(item => item.show);

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
          <Flame className="w-8 h-8 text-orange-400" />
        </div>
        <div className="text-4xl font-bold text-protocol-text mb-1">{streak}</div>
        <div className="text-sm text-protocol-text-muted">day streak</div>
      </div>

      {/* What streak represents */}
      <div className="mb-6">
        <p className="text-sm text-protocol-text-muted text-center mb-4">
          This streak represents:
        </p>

        <div className="space-y-3">
          {visibleItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={index} className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-protocol-text-muted flex-shrink-0" />
                <span className="text-sm text-protocol-text">
                  <span className="font-medium">{item.value}</span>{' '}
                  <span className="text-protocol-text-muted">{item.label}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Psychological value score */}
      <div className="p-3 rounded-lg bg-protocol-accent/10 text-center mb-4">
        <div className="text-2xl font-bold text-protocol-accent">{psychValue}</div>
        <div className="text-xs text-protocol-text-muted">psychological value</div>
      </div>

      {/* Warning if shown */}
      {showWarning && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-center">
          <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-400">
            {warningMessage || 'Destroying this streak destroys all of this.'}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Streak Break Warning Modal
 * Shown when user is about to break their streak
 */
interface StreakBreakWarningProps {
  streak: number;
  data: Partial<StreakValue>;
  onStay: () => void;
  onBreak: () => void;
}

export function StreakBreakWarningModal({
  streak,
  data,
  onStay,
  onBreak,
}: StreakBreakWarningProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [step, setStep] = useState<'warning' | 'confirm'>('warning');

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);
  }, []);

  const psychValue = calculateStreakValue(streak, data);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-protocol-bg/95' : 'bg-transparent pointer-events-none'
      }`}
    >
      <div
        className={`max-w-md w-full max-h-[90vh] overflow-y-auto transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className="card p-6">
          {step === 'warning' && (
            <>
              <button
                onClick={onStay}
                className="absolute top-4 right-4 p-1 text-protocol-text-muted hover:text-protocol-text transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <StreakValueCard
                streak={streak}
                data={data}
                showWarning
                warningMessage="Is that what you want?"
              />

              <div className="mt-6 space-y-3">
                <button
                  onClick={onStay}
                  className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors"
                >
                  Protect my streak
                </button>

                <button
                  onClick={() => setStep('confirm')}
                  className="w-full py-3 text-sm text-protocol-text-muted hover:text-protocol-text transition-colors"
                >
                  I understand the cost
                </button>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-red-400" />
              </div>

              <h2 className="text-xl font-bold text-protocol-text mb-2">
                Final Warning
              </h2>

              <p className="text-protocol-text-muted mb-4">
                You're about to destroy{' '}
                <span className="text-red-400 font-medium">{streak} days</span> of work
                and <span className="text-red-400 font-medium">{psychValue} points</span> of progress.
              </p>

              <p className="text-sm text-protocol-text-muted mb-6">
                This cannot be undone.
              </p>

              <button
                onClick={onStay}
                className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors mb-3"
              >
                No, protect my streak
              </button>

              <button
                onClick={onBreak}
                className="w-full py-3 text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Break streak anyway
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact streak badge with value preview
 */
interface StreakBadgeProps {
  streak: number;
  psychValue: number;
  onClick?: () => void;
}

export function StreakBadge({ streak, psychValue, onClick }: StreakBadgeProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-orange-500/20 to-red-500/20 hover:from-orange-500/30 hover:to-red-500/30 transition-colors"
    >
      <Flame className="w-4 h-4 text-orange-400" />
      <span className="font-bold text-protocol-text">{streak}</span>
      <span className="text-xs text-protocol-text-muted">
        ({psychValue} pts)
      </span>
    </button>
  );
}
