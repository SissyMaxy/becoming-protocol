/**
 * Escalation Timeline
 * Visual timeline showing escalation progression
 */

import { useBambiMode } from '../../context/BambiModeContext';
import type { EscalationCalendarItem } from '../../types/escalations';

interface EscalationTimelineProps {
  items: EscalationCalendarItem[];
  currentDay: number;
}

const STATUS_COLORS = {
  upcoming: 'bg-protocol-border',
  warning: 'bg-amber-500',
  imminent: 'bg-orange-500',
  triggered: 'bg-protocol-danger',
  delayed: 'bg-blue-500',
};

export function EscalationTimeline({ items, currentDay }: EscalationTimelineProps) {
  const { isBambiMode } = useBambiMode();

  if (items.length === 0) return null;

  // Find the max day to scale the timeline
  const maxDay = Math.max(...items.map(i => i.escalation.dayTrigger), currentDay + 30);

  // Calculate position percentage
  const getPosition = (day: number) => Math.min(100, (day / maxDay) * 100);

  return (
    <div className="relative">
      {/* Timeline track */}
      <div className="h-2 bg-protocol-surface-light rounded-full relative overflow-hidden">
        {/* Progress fill */}
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all ${
            isBambiMode ? 'bg-gradient-to-r from-pink-400 to-pink-500' : 'bg-protocol-accent'
          }`}
          style={{ width: `${getPosition(currentDay)}%` }}
        />

        {/* Escalation markers */}
        {items.map((item) => (
          <div
            key={item.escalation.id}
            className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-protocol-bg transition-all ${
              STATUS_COLORS[item.status]
            }`}
            style={{ left: `${getPosition(item.escalation.dayTrigger)}%` }}
            title={`Day ${item.escalation.dayTrigger}: ${item.escalation.description}`}
          />
        ))}

        {/* Current day marker */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg ${
            isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'
          }`}
          style={{ left: `${getPosition(currentDay)}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>

      {/* Day labels */}
      <div className="flex justify-between mt-2 text-xs text-protocol-text-muted">
        <span>Day 1</span>
        <span className={`font-medium ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`}>
          Day {currentDay}
        </span>
        <span>Day {maxDay}</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 justify-center">
        {[
          { status: 'triggered', label: 'Triggered' },
          { status: 'imminent', label: 'Imminent' },
          { status: 'warning', label: 'Warning' },
          { status: 'upcoming', label: 'Upcoming' },
        ].map(({ status, label }) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[status as keyof typeof STATUS_COLORS]}`} />
            <span className="text-xs text-protocol-text-muted">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
