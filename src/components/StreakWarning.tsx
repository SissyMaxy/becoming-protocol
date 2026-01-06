import { useState } from 'react';
import { AlertTriangle, Flame, X, Shield } from 'lucide-react';

interface StreakWarningProps {
  streak: number;
  status: 'stable' | 'at_risk' | 'broken';
  yesterdayCompletion: number;
  onDismiss?: () => void;
}

export function StreakWarning({ streak, status, yesterdayCompletion, onDismiss }: StreakWarningProps) {
  const [dismissed, setDismissed] = useState(false);

  if (status === 'stable' || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  if (status === 'broken') {
    return (
      <div className="relative p-4 rounded-lg bg-protocol-danger/10 border border-protocol-danger/30">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 rounded hover:bg-protocol-danger/20"
        >
          <X className="w-4 h-4 text-protocol-danger" />
        </button>

        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-protocol-danger/20">
            <Flame className="w-5 h-5 text-protocol-danger" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-protocol-danger">Streak Reset</p>
            <p className="text-sm text-protocol-text-muted mt-1">
              No worries - it happens to everyone. Today is a fresh start.
              One good day begins a new streak.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // at_risk status
  return (
    <div className="relative p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded hover:bg-amber-500/20"
      >
        <X className="w-4 h-4 text-amber-500" />
      </button>

      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/20">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-amber-500">
            {streak}-Day Streak at Risk
          </p>
          <p className="text-sm text-protocol-text-muted mt-1">
            Yesterday was {Math.round(yesterdayCompletion)}% completion.
            Focus on today's essentials to keep your momentum.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Shield className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-amber-500 font-medium">
              PROTECT MODE ACTIVE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Streak milestone celebration
interface StreakMilestoneProps {
  streak: number;
  onDismiss: () => void;
}

export function StreakMilestone({ streak, onDismiss }: StreakMilestoneProps) {
  const milestones: Record<number, { title: string; message: string }> = {
    7: {
      title: 'One Week Strong!',
      message: 'Seven days of showing up. The habit is taking root.'
    },
    14: {
      title: 'Two Weeks!',
      message: 'This is becoming part of who you are.'
    },
    21: {
      title: 'Three Weeks!',
      message: 'They say it takes 21 days to build a habit. You did it.'
    },
    30: {
      title: 'One Month!',
      message: 'Thirty days of consistent practice. You\'re transforming.'
    },
    60: {
      title: 'Two Months!',
      message: 'Sixty days. This isn\'t a phase - it\'s who you\'re becoming.'
    },
    90: {
      title: 'Ninety Days!',
      message: 'Three months of dedication. You\'ve proven your commitment to yourself.'
    },
    100: {
      title: 'Triple Digits!',
      message: '100 days. You are the discipline. You are the practice.'
    },
    365: {
      title: 'ONE YEAR!',
      message: 'An entire year of showing up for yourself. Incredible.'
    }
  };

  const milestone = milestones[streak];
  if (!milestone) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-protocol-bg/90">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="card p-6 text-center relative overflow-hidden">
          {/* Decorative background */}
          <div className="absolute inset-0 bg-gradient-to-br from-protocol-accent/20 to-transparent" />

          {/* Content */}
          <div className="relative z-10">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <Flame className="w-10 h-10 text-white" />
            </div>

            <p className="text-4xl font-bold text-protocol-text mb-2">
              {streak}
            </p>

            <h3 className="text-xl font-semibold text-gradient mb-2">
              {milestone.title}
            </h3>

            <p className="text-sm text-protocol-text-muted mb-6">
              {milestone.message}
            </p>

            <button
              onClick={onDismiss}
              className="w-full py-3 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent-soft transition-colors"
            >
              Keep Going
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
