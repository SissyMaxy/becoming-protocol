/**
 * Next Up Banner
 * Shows countdown to the next scheduled item
 */

import { useState, useEffect } from 'react';
import { Clock, Flame, Bell } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { PlannedEdgeSession, ArousalCheckIn } from '../../types/arousal-planner';

interface NextUpBannerProps {
  nextItem: PlannedEdgeSession | ArousalCheckIn | null;
  nextItemType: 'session' | 'check_in' | null;
  onStartSession?: () => void;
  onOpenCheckIn?: () => void;
}

export function NextUpBanner({
  nextItem,
  nextItemType,
  onStartSession,
  onOpenCheckIn,
}: NextUpBannerProps) {
  const { isBambiMode } = useBambiMode();
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number } | null>(null);
  const [isNow, setIsNow] = useState(false);

  // Update countdown every minute
  useEffect(() => {
    if (!nextItem) return;

    const updateTime = () => {
      const now = new Date();
      const [hours, minutes] = nextItem.scheduledTime.split(':').map(Number);

      const scheduled = new Date();
      scheduled.setHours(hours, minutes, 0, 0);

      const diffMs = scheduled.getTime() - now.getTime();

      if (diffMs <= 0) {
        setIsNow(true);
        setTimeLeft(null);
      } else {
        setIsNow(false);
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        setTimeLeft({
          hours: Math.floor(diffMinutes / 60),
          minutes: diffMinutes % 60,
        });
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [nextItem]);

  if (!nextItem || !nextItemType) return null;

  const isSession = nextItemType === 'session';
  const session = isSession ? (nextItem as PlannedEdgeSession) : null;
  const checkIn = !isSession ? (nextItem as ArousalCheckIn) : null;

  const handleAction = () => {
    if (isSession && onStartSession) {
      onStartSession();
    } else if (!isSession && onOpenCheckIn) {
      onOpenCheckIn();
    }
  };

  // Session type labels
  const sessionTypeLabels: Record<string, string> = {
    edge_training: 'Edge Training',
    denial: 'Denial Practice',
    anchoring: 'Anchoring',
    goon: 'Goon Session',
    maintenance: 'Maintenance',
  };

  const checkInTypeLabels: Record<string, string> = {
    morning: 'Morning Check-In',
    midday: 'Midday Check-In',
    evening: 'Evening Check-In',
    post_session: 'Post-Session Check-In',
  };

  return (
    <div className={`rounded-xl p-4 ${
      isNow
        ? isBambiMode
          ? 'bg-gradient-to-r from-purple-100 to-pink-100 border border-purple-200'
          : 'bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30'
        : isBambiMode
          ? 'bg-white shadow-sm border border-gray-100'
          : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <div className="flex items-center justify-between">
        {/* Left: Info */}
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className={`p-2.5 rounded-xl ${
            isSession
              ? isBambiMode ? 'bg-purple-100' : 'bg-purple-900/30'
              : isBambiMode ? 'bg-blue-100' : 'bg-blue-900/30'
          }`}>
            {isSession ? (
              <Flame className={`w-5 h-5 ${isBambiMode ? 'text-purple-600' : 'text-purple-400'}`} />
            ) : (
              <Bell className={`w-5 h-5 ${isBambiMode ? 'text-blue-600' : 'text-blue-400'}`} />
            )}
          </div>

          {/* Text */}
          <div>
            <p className={`text-xs uppercase tracking-wider font-semibold ${
              isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
            }`}>
              {isNow ? 'Now' : 'Next Up'}
            </p>
            <p className={`font-semibold ${
              isBambiMode ? 'text-gray-800' : 'text-protocol-text'
            }`}>
              {isSession
                ? sessionTypeLabels[session!.sessionType] || 'Session'
                : checkInTypeLabels[checkIn!.checkInType] || 'Check-In'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Clock className={`w-3.5 h-3.5 ${
                isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
              }`} />
              <span className={`text-sm ${
                isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'
              }`}>
                {nextItem.scheduledTime}
              </span>
              {session && (
                <>
                  <span className={`mx-1 ${isBambiMode ? 'text-gray-300' : 'text-gray-600'}`}>|</span>
                  <span className={`text-sm ${
                    isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'
                  }`}>
                    {session.targetEdges} edges, {session.targetDurationMinutes} min
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Time/Action */}
        <div className="text-right">
          {isNow ? (
            <button
              onClick={handleAction}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                isSession
                  ? isBambiMode
                    ? 'bg-purple-500 hover:bg-purple-600 text-white'
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                  : isBambiMode
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {isSession ? 'Start' : 'Check In'}
            </button>
          ) : timeLeft ? (
            <div>
              <p className={`text-2xl font-bold ${
                isBambiMode ? 'text-gray-800' : 'text-protocol-text'
              }`}>
                {timeLeft.hours > 0 ? `${timeLeft.hours}h ` : ''}{timeLeft.minutes}m
              </p>
              <p className={`text-xs ${
                isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
              }`}>
                until {isSession ? 'session' : 'check-in'}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
