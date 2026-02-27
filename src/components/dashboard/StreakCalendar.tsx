/**
 * Streak Calendar
 *
 * GitHub-style heatmap showing daily task completion
 * over the last 90 days. Color intensity = tasks completed.
 */

import { useMemo } from 'react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { CalendarDay } from '../../lib/dashboard-analytics';

interface StreakCalendarProps {
  data: CalendarDay[];
  days?: number;
  currentStreak?: number;
  longestStreak?: number;
}

const WEEKDAY_LABELS = ['', 'M', '', 'W', '', 'F', ''];

export function StreakCalendar({ data, days = 90, currentStreak, longestStreak }: StreakCalendarProps) {
  const { isBambiMode } = useBambiMode();

  const calendarGrid = useMemo(() => {
    const dataMap = new Map(data.map(d => [d.date, d]));
    const grid: { date: string; tasks: number; }[][] = [];

    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days + 1);

    // Align to start of week (Sunday)
    const dayOfWeek = startDate.getDay();
    startDate.setDate(startDate.getDate() - dayOfWeek);

    let currentWeek: { date: string; tasks: number }[] = [];
    const current = new Date(startDate);

    while (current <= today) {
      const dateStr = current.toISOString().split('T')[0];
      const entry = dataMap.get(dateStr);
      currentWeek.push({
        date: dateStr,
        tasks: entry?.tasksCompleted || 0,
      });

      if (currentWeek.length === 7) {
        grid.push(currentWeek);
        currentWeek = [];
      }

      current.setDate(current.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      grid.push(currentWeek);
    }

    return grid;
  }, [data, days]);

  const getColor = (tasks: number): string => {
    if (tasks === 0) return isBambiMode ? '#fce7f3' : '#1a1a2e';
    if (tasks === 1) return isBambiMode ? '#f9a8d4' : '#3b1f5e';
    if (tasks <= 3) return isBambiMode ? '#f472b6' : '#6b21a8';
    if (tasks <= 5) return isBambiMode ? '#ec4899' : '#9333ea';
    return isBambiMode ? '#db2777' : '#a855f7';
  };

  const maxTasks = Math.max(...data.map(d => d.tasksCompleted), 1);

  return (
    <div className={`rounded-lg p-4 ${
      isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-medium ${
          isBambiMode ? 'text-pink-800' : 'text-protocol-text'
        }`}>
          Streak Calendar
        </h3>
        {(currentStreak !== undefined || longestStreak !== undefined) && (
          <div className={`flex gap-3 text-[11px] ${isBambiMode ? 'text-pink-500' : 'text-gray-400'}`}>
            {currentStreak !== undefined && <span>Current: {currentStreak}d</span>}
            {longestStreak !== undefined && <span>Best: {longestStreak}d</span>}
          </div>
        )}
      </div>

      <div className="flex gap-1">
        {/* Weekday labels */}
        <div className="flex flex-col gap-1 mr-1">
          {WEEKDAY_LABELS.map((label, idx) => (
            <div
              key={idx}
              className={`w-3 h-3 text-[8px] flex items-center justify-end ${
                isBambiMode ? 'text-pink-400' : 'text-gray-600'
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex gap-[2px] overflow-x-auto">
          {calendarGrid.map((week, weekIdx) => (
            <div key={weekIdx} className="flex flex-col gap-[2px]">
              {week.map((day, dayIdx) => (
                <div
                  key={dayIdx}
                  className="w-3 h-3 rounded-[2px] transition-colors"
                  style={{ backgroundColor: getColor(day.tasks) }}
                  title={`${day.date}: ${day.tasks} tasks`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1 mt-2">
        <span className={`text-[10px] ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>Less</span>
        {[0, 1, 3, 5, maxTasks].map((level, idx) => (
          <div
            key={idx}
            className="w-3 h-3 rounded-[2px]"
            style={{ backgroundColor: getColor(level) }}
          />
        ))}
        <span className={`text-[10px] ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>More</span>
      </div>
    </div>
  );
}
