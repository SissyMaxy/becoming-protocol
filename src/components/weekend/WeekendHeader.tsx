/**
 * Weekend Header
 *
 * Special header for weekend days showing Gina integration context.
 */

import { useState, useEffect } from 'react';
import { Heart, Sparkles, Calendar, Clock } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { GinaIntegrationProgress } from '../../types/weekend';
import { INTEGRATION_LEVEL_LABELS } from '../../types/weekend';

interface WeekendHeaderProps {
  weekendDay: 'saturday' | 'sunday';
  activitiesRemaining: number;
  activitiesTotal: number;
  integrationProgress: GinaIntegrationProgress | null;
  weekendFocus?: string;
}

// Weekend focus messages
const WEEKEND_MESSAGES = {
  saturday: [
    "Today is about connection. Let Gina be part of your journey.",
    "Weekends are for deepening bonds. Share this time with her.",
    "Her hands, her care, your transformation.",
    "Building beautiful moments together.",
  ],
  sunday: [
    "A perfect day to continue what you started.",
    "Sunday intimacy runs deeper.",
    "Close the weekend with connection.",
    "Let the weekend magic linger.",
  ]
};

function getWeekendMessage(day: 'saturday' | 'sunday'): string {
  const messages = WEEKEND_MESSAGES[day];
  const index = Math.floor(Math.random() * messages.length);
  return messages[index];
}

// Format current date and time
function formatDateTime(date: Date): { dateStr: string; timeStr: string } {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${months[date.getMonth()]} ${date.getDate()}`;

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  const timeStr = `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;

  return { dateStr, timeStr };
}

export function WeekendHeader({
  weekendDay,
  activitiesRemaining,
  activitiesTotal,
  integrationProgress,
  weekendFocus
}: WeekendHeaderProps) {
  const { isBambiMode } = useBambiMode();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const dayLabel = weekendDay === 'saturday' ? 'Saturday' : 'Sunday';
  const levelLabel = integrationProgress
    ? INTEGRATION_LEVEL_LABELS[integrationProgress.currentLevel]?.label || 'Starting'
    : 'Starting';

  const focusMessage = weekendFocus || getWeekendMessage(weekendDay);
  const { dateStr, timeStr } = formatDateTime(currentTime);

  return (
    <div className={`relative overflow-hidden rounded-2xl ${
      isBambiMode
        ? 'bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-500'
        : 'bg-gradient-to-br from-rose-600 via-pink-600 to-purple-600'
    }`}>
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white blur-3xl transform translate-x-10 -translate-y-10" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white blur-2xl transform -translate-x-8 translate-y-8" />
      </div>

      <div className="relative p-5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Heart className="w-5 h-5 text-white fill-white/50" />
              <span className="text-white/80 text-sm font-medium">Weekend with Gina</span>
            </div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              {dayLabel} <Sparkles className="w-5 h-5" />
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-white/90 text-sm">
                {activitiesRemaining === 0
                  ? 'All activities complete!'
                  : `${activitiesRemaining} activit${activitiesRemaining === 1 ? 'y' : 'ies'} remaining`}
              </span>
            </div>
          </div>

          {/* Integration level badge */}
          {integrationProgress && (
            <div className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/20 text-white border border-white/20">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                <span>Level {integrationProgress.currentLevel}</span>
              </div>
              <div className="text-white/70 text-[10px] mt-0.5">
                {levelLabel}
              </div>
            </div>
          )}
        </div>

        {/* Date and Time */}
        <div className="flex items-center gap-2 text-white/80 text-sm mb-3">
          <Clock className="w-4 h-4" />
          <span className="font-medium">{dayLabel}</span>
          <span className="text-white/50">•</span>
          <span>{dateStr}</span>
          <span className="text-white/50">•</span>
          <span>{timeStr}</span>
        </div>

        {/* Focus message */}
        <div className={`mt-4 p-4 rounded-xl ${
          isBambiMode ? 'bg-white/15' : 'bg-black/20'
        } backdrop-blur-sm`}>
          <p className="text-white/90 text-sm italic leading-relaxed">
            "{focusMessage}"
          </p>
        </div>

        {/* Completion celebration */}
        {activitiesTotal > 0 && activitiesRemaining === 0 && (
          <div className="mt-3 text-center">
            <span className="text-white font-medium text-sm">
              Beautiful weekend together
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
