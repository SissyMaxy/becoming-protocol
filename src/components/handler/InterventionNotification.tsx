/**
 * Intervention Notification Component
 *
 * Displays Handler AI interventions to the user.
 * Supports different intervention types with appropriate styling.
 */

import { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Heart,
  Zap,
  Gift,
  Target,
  Flame,
  Clock,
  CheckCircle,
  Play,
  AlertTriangle,
  Shield,
  HeartHandshake,
  TrendingUp,
  Sunrise,
  MessageCircle,
} from 'lucide-react';
import type { HandlerIntervention, InterventionType } from '../../types/handler';
import { truncateToLimit, NOTIFICATION_LIMITS } from '../../lib/handler-v2/popup-utils';

interface InterventionNotificationProps {
  intervention: HandlerIntervention;
  onComplete: () => void;
  onDismiss: () => void;
  onResponse?: (response: 'completed' | 'dismissed' | 'ignored') => void;
}

const INTERVENTION_CONFIG: Record<
  InterventionType,
  {
    icon: React.ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
    title: string;
  }
> = {
  microtask: {
    icon: Target,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    title: 'Micro Task',
  },
  affirmation: {
    icon: Heart,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/30',
    title: 'Affirmation',
  },
  content_unlock: {
    icon: Gift,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    title: 'Content Unlocked',
  },
  challenge: {
    icon: Zap,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    title: 'Challenge',
  },
  jackpot: {
    icon: Sparkles,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    title: 'Jackpot!',
  },
  commitment_prompt: {
    icon: Flame,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    title: 'Commitment',
  },
  anchor_reminder: {
    icon: Clock,
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/30',
    title: 'Anchor Reminder',
  },
  escalation_push: {
    icon: Flame,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    title: 'Escalation',
  },
  // Timing engine intervention types (Feature 2)
  session_initiation: {
    icon: Play,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    title: 'Session Time',
  },
  avoidance_confrontation: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    title: 'Avoidance Detected',
  },
  streak_protection: {
    icon: Shield,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    title: 'Streak at Risk',
  },
  support_check_in: {
    icon: HeartHandshake,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500/30',
    title: 'Check-In',
  },
  momentum_push: {
    icon: TrendingUp,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
    title: 'Keep Going',
  },
  integration_prompt: {
    icon: Sunrise,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    title: 'Morning Reflection',
  },
  post_session_capture: {
    icon: MessageCircle,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/30',
    title: 'Capture This',
  },
};

export function InterventionNotification({
  intervention,
  onComplete,
  onDismiss,
  onResponse,
}: InterventionNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const config = INTERVENTION_CONFIG[intervention.type];
  const Icon = config.icon;

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const handleDismiss = () => {
    setIsExiting(true);
    onResponse?.('dismissed');
    setTimeout(() => {
      onDismiss();
    }, 300);
  };

  const handleComplete = () => {
    setIsExiting(true);
    onResponse?.('completed');
    setTimeout(() => {
      onComplete();
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className={`
          w-full max-w-sm rounded-2xl border ${config.borderColor} ${config.bgColor}
          shadow-2xl transform transition-all duration-300
          ${isVisible && !isExiting ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.bgColor}`}>
              <Icon className={`w-5 h-5 ${config.color}`} />
            </div>
            <span className={`font-semibold ${config.color}`}>{config.title}</span>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-white text-lg leading-relaxed line-clamp-4">
            {truncateToLimit(intervention.content, NOTIFICATION_LIMITS.interventionContent)}
          </p>

          {intervention.targetDomain && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-sm text-gray-300">
              <span className="capitalize">{intervention.targetDomain}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-white/10 flex gap-3">
          {intervention.type === 'microtask' || intervention.type === 'challenge' ? (
            <>
              <button
                onClick={handleDismiss}
                className="flex-1 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10
                           text-gray-300 font-medium transition-colors"
              >
                Later
              </button>
              <button
                onClick={handleComplete}
                className={`flex-1 py-3 px-4 rounded-xl ${config.bgColor} hover:brightness-110
                           ${config.color} font-medium transition-all flex items-center justify-center gap-2`}
              >
                <CheckCircle className="w-5 h-5" />
                Done
              </button>
            </>
          ) : intervention.type === 'commitment_prompt' ? (
            <>
              <button
                onClick={handleDismiss}
                className="flex-1 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10
                           text-gray-300 font-medium transition-colors"
              >
                Not Now
              </button>
              <button
                onClick={handleComplete}
                className={`flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-red-500 to-pink-500
                           text-white font-medium transition-all hover:brightness-110`}
              >
                I Commit
              </button>
            </>
          ) : (
            <button
              onClick={handleComplete}
              className={`w-full py-3 px-4 rounded-xl ${config.bgColor} hover:brightness-110
                         ${config.color} font-medium transition-all`}
            >
              Acknowledged
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Floating intervention badge - less intrusive notification
 */
interface InterventionBadgeProps {
  intervention: HandlerIntervention;
  onClick: () => void;
}

export function InterventionBadge({ intervention, onClick }: InterventionBadgeProps) {
  const config = INTERVENTION_CONFIG[intervention.type];
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className={`
        fixed bottom-24 right-4 z-40
        flex items-center gap-3 px-4 py-3 rounded-full
        ${config.bgColor} ${config.borderColor} border
        shadow-lg animate-pulse hover:animate-none
        transition-all hover:scale-105
      `}
    >
      <Icon className={`w-5 h-5 ${config.color}`} />
      <span className={`${config.color} font-medium text-sm`}>
        {config.title}
      </span>
    </button>
  );
}
