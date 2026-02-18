/**
 * Escalation Card
 * Individual escalation item showing status, countdown, and actions
 */

import { memo } from 'react';
import { Clock, AlertTriangle, Check, Pause, ChevronRight } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { EscalationCalendarItem } from '../../types/escalations';

interface EscalationCardProps {
  item: EscalationCalendarItem;
  currentDay: number;
  onDelay?: (id: string) => void;
  onViewDetails?: (item: EscalationCalendarItem) => void;
  formatCountdown: (days: number) => string;
}

const STATUS_CONFIG = {
  upcoming: {
    bg: 'bg-protocol-surface',
    border: 'border-protocol-border',
    icon: Clock,
    iconColor: 'text-protocol-text-muted',
    label: 'Upcoming',
    labelColor: 'text-protocol-text-muted',
  },
  warning: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    label: 'Warning',
    labelColor: 'text-amber-500',
  },
  imminent: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    icon: AlertTriangle,
    iconColor: 'text-orange-500',
    label: 'Imminent',
    labelColor: 'text-orange-500',
  },
  triggered: {
    bg: 'bg-protocol-danger/10',
    border: 'border-protocol-danger/30',
    icon: Check,
    iconColor: 'text-protocol-danger',
    label: 'Triggered',
    labelColor: 'text-protocol-danger',
  },
  delayed: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: Pause,
    iconColor: 'text-blue-500',
    label: 'Delayed',
    labelColor: 'text-blue-500',
  },
};

// Memoized to prevent unnecessary re-renders
export const EscalationCard = memo(function EscalationCard({
  item,
  currentDay: _currentDay,
  onDelay,
  onViewDetails,
  formatCountdown,
}: EscalationCardProps) {
  const { isBambiMode } = useBambiMode();
  const config = STATUS_CONFIG[item.status];
  const Icon = config.icon;

  const isClickable = onViewDetails !== undefined;
  const showDelayButton = item.canDelay && item.status !== 'triggered' && item.status !== 'delayed';

  return (
    <div
      className={`relative rounded-xl border p-4 transition-all ${config.bg} ${config.border} ${
        isClickable ? 'cursor-pointer hover:scale-[1.02]' : ''
      } ${isBambiMode ? 'shadow-pink-100' : ''}`}
      onClick={() => onViewDetails?.(item)}
    >
      <div className="flex items-start gap-3">
        {/* Status Icon */}
        <div className={`p-2 rounded-lg ${config.bg}`}>
          <Icon className={`w-5 h-5 ${config.iconColor}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium ${config.labelColor}`}>
              {config.label}
            </span>
            <span className="text-xs text-protocol-text-muted">
              Day {item.escalation.dayTrigger}
            </span>
          </div>

          <p className={`text-sm font-medium mb-1 ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            {item.escalation.description}
          </p>

          {/* Countdown */}
          {item.status !== 'triggered' && (
            <p className={`text-xs ${
              item.status === 'imminent' ? 'text-orange-500 font-medium' :
              item.status === 'warning' ? 'text-amber-500' :
              'text-protocol-text-muted'
            }`}>
              {item.daysUntil === 0 ? 'Today' : formatCountdown(item.daysUntil)}
            </p>
          )}

          {/* Triggered date */}
          {item.status === 'triggered' && (
            <p className="text-xs text-protocol-danger">
              Activated on Day {item.escalation.dayTrigger}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {showDelayButton && onDelay && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelay(item.escalation.id);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                isBambiMode
                  ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                  : 'bg-protocol-surface-light text-protocol-text hover:bg-protocol-border'
              }`}
            >
              Delay
            </button>
          )}

          {isClickable && (
            <ChevronRight className="w-4 h-4 text-protocol-text-muted" />
          )}
        </div>
      </div>

      {/* Progress bar for upcoming items */}
      {item.status === 'upcoming' && item.daysUntil > 0 && (
        <div className="mt-3 h-1 bg-protocol-border rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              isBambiMode ? 'bg-pink-400' : 'bg-protocol-accent'
            }`}
            style={{
              width: `${Math.max(5, ((item.escalation.dayTrigger - item.daysUntil) / item.escalation.dayTrigger) * 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
});

// Display name for React DevTools
EscalationCard.displayName = 'EscalationCard';
