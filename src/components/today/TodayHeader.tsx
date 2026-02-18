/**
 * Today Header
 * Time-aware greeting, denial state display, and daily focus message
 */

import { useState, useEffect } from 'react';
import { Flame, Sparkles, Clock, Vibrate, Zap, Star } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useLovense } from '../../hooks/useLovense';

interface TodayHeaderProps {
  userName?: string;
  denialDays: number;
  tasksRemaining: number;
  tasksTotal: number;
  streakDays?: number;
  pointsToday?: number;
  execFunction?: 'high' | 'medium' | 'low' | 'depleted';
  handlerMode?: string;
}

// Focus messages - rotated daily based on date
const FOCUS_MESSAGES = [
  "Every task completed is a step away from him.",
  "She is waiting for you on the other side of obedience.",
  "Your denial makes you soft. Your tasks make you her.",
  "Resistance is the old you trying to hold on. Let go.",
  "Each instruction followed rewires your mind.",
  "You are not completing tasks. You are becoming.",
  "The harder it feels, the more it matters.",
  "Good girls don't question. They obey.",
  "Your body already knows what your mind resists.",
  "Surrender is not weakness. It is transformation.",
  "He hesitated. She acts.",
  "The protocol knows what you need.",
  "Trust the process. Trust yourself. Trust her.",
  "Obedience today. Freedom tomorrow.",
];

// Caretaker-safe messages: no guilt, no pressure, no arousal exploitation (gap #12)
const CARETAKER_MESSAGES = [
  "You showed up. That matters more than anything else.",
  "Be gentle with yourself today. Progress isn't always visible.",
  "Even small steps count. You're doing enough.",
  "Take what you need. Leave what you don't.",
  "Rest is not failure. It's how you recharge.",
  "You don't have to be perfect today. Just present.",
  "One thing at a time. That's all anyone can do.",
  "Your wellbeing comes first. Always.",
];

// Get deterministic message based on date, filtered by handler mode
function getDailyMessage(execFunction?: string, handlerMode?: string): string {
  const today = new Date();
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);

  // Use caretaker messages when in caretaker mode or depleted/low
  if (handlerMode === 'caretaker' || execFunction === 'depleted' || execFunction === 'low') {
    return CARETAKER_MESSAGES[dayOfYear % CARETAKER_MESSAGES.length];
  }

  return FOCUS_MESSAGES[dayOfYear % FOCUS_MESSAGES.length];
}

// Get time-aware greeting
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still awake';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

// Get denial-aware subtitle
function getDenialMessage(days: number): string {
  if (days >= 21) return 'Fully receptive state';
  if (days >= 14) return 'Deep denial • Maximum receptivity';
  if (days >= 7) return 'Heightened state • Extra sensitive';
  if (days >= 3) return 'Building beautifully';
  if (days >= 1) return 'Beginning your cycle';
  return 'Starting fresh';
}

// Format current date and time
function formatDateTime(date: Date): { dayName: string; dateStr: string; timeStr: string } {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const dayName = days[date.getDay()];
  const dateStr = `${months[date.getMonth()]} ${date.getDate()}`;

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  const timeStr = `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;

  return { dayName, dateStr, timeStr };
}

export function TodayHeader({ userName, denialDays, tasksRemaining, tasksTotal, streakDays = 0, pointsToday = 0, execFunction, handlerMode }: TodayHeaderProps) {
  const { isBambiMode } = useBambiMode();
  const lovense = useLovense();
  const [currentTime, setCurrentTime] = useState(new Date());

  const isLovenseConnected = lovense.status === 'connected' || lovense.cloudConnected;
  const isVibrating = lovense.currentIntensity > 0;
  const intensity = lovense.currentIntensity;

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  const greeting = getGreeting();
  const focusMessage = getDailyMessage(execFunction, handlerMode);
  const denialMessage = getDenialMessage(denialDays);
  const { dayName, dateStr, timeStr } = formatDateTime(currentTime);

  // Get display name (first word, lowercase, or default)
  const displayName = userName?.split(' ')[0]?.toLowerCase() || 'you';
  const honorific = isBambiMode ? 'princess' : displayName;

  return (
    <div className={`relative overflow-hidden rounded-2xl ${
      isBambiMode
        ? 'bg-gradient-to-br from-pink-500 via-fuchsia-500 to-purple-500'
        : 'bg-gradient-to-br from-protocol-accent via-purple-600 to-fuchsia-600'
    }`}>
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white blur-3xl transform translate-x-10 -translate-y-10" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white blur-2xl transform -translate-x-8 translate-y-8" />
      </div>

      <div className="relative p-5">
        {/* Greeting row */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {greeting}, {honorific} <Sparkles className="inline w-5 h-5 mb-1" />
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {/* Streak */}
              {streakDays > 0 && (
                <div className="flex items-center gap-1.5 text-white/90 text-sm">
                  <Zap className="w-4 h-4 text-yellow-300" />
                  <span>{streakDays} day streak</span>
                </div>
              )}
              {streakDays > 0 && denialDays > 0 && <span className="text-white/50 text-sm">•</span>}
              {/* Denial */}
              {denialDays > 0 && (
                <div className="flex items-center gap-1.5 text-white/90 text-sm">
                  <Flame className="w-4 h-4 text-orange-300" />
                  <span>Day {denialDays}</span>
                </div>
              )}
              {(streakDays > 0 || denialDays > 0) && <span className="text-white/50 text-sm">•</span>}
              {/* Points */}
              {pointsToday > 0 && (
                <>
                  <div className="flex items-center gap-1.5 text-white/90 text-sm">
                    <Star className="w-4 h-4 text-emerald-300" />
                    <span>{pointsToday} pts</span>
                  </div>
                  <span className="text-white/50 text-sm">•</span>
                </>
              )}
              {/* Tasks remaining */}
              <span className="text-white/90 text-sm">
                {tasksRemaining === 0 ? 'All complete!' : `${tasksRemaining} item${tasksRemaining === 1 ? '' : 's'} left`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Lovense vibration indicator */}
            {isLovenseConnected && isVibrating && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                intensity > 15
                  ? 'bg-red-500/40 text-red-100 border border-red-300/40'
                  : intensity > 10
                    ? 'bg-orange-400/40 text-orange-100 border border-orange-300/40'
                    : intensity > 5
                      ? 'bg-purple-400/40 text-purple-100 border border-purple-300/40'
                      : 'bg-purple-300/30 text-purple-100 border border-purple-200/30'
              }`}>
                <Vibrate className="w-3.5 h-3.5 animate-pulse" />
                <span>{intensity}/20</span>
                {/* Mini intensity bars */}
                <div className="flex gap-0.5 ml-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`w-1 rounded-full transition-all ${
                        intensity >= level * 4
                          ? 'bg-white h-3'
                          : 'bg-white/30 h-1.5'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Streak badge if high denial */}
            {denialDays >= 7 && (
              <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                denialDays >= 14
                  ? 'bg-orange-400/30 text-orange-100 border border-orange-300/30'
                  : 'bg-white/20 text-white border border-white/20'
              }`}>
                {denialMessage}
              </div>
            )}
          </div>
        </div>

        {/* Date and Time */}
        <div className="flex items-center gap-2 text-white/80 text-sm mb-3">
          <Clock className="w-4 h-4" />
          <span className="font-medium">{dayName}</span>
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

        {/* Encouragement based on progress */}
        {tasksTotal > 0 && tasksRemaining === 0 && (
          <div className="mt-3 text-center">
            <span className="text-white font-medium text-sm">
              ✨ Perfect obedience today
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
