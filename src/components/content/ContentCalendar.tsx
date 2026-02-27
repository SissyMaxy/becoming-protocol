/**
 * ContentCalendar — Week view with platform rows.
 * Cell states: open, assigned, queued, posted, skipped.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw, Loader2, Calendar,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import {
  getWeekCalendar,
  generateWeeklyCalendar,
} from '../../lib/content-pipeline';
import type { ContentCalendarDay, CalendarSlot, Platform } from '../../types/content-pipeline';

interface ContentCalendarProps {
  onBack: () => void;
}

const PLATFORMS: { id: Platform; label: string; color: string }[] = [
  { id: 'twitter', label: 'Twitter', color: 'blue' },
  { id: 'reddit', label: 'Reddit', color: 'orange' },
  { id: 'onlyfans', label: 'OF', color: 'cyan' },
  { id: 'fansly', label: 'Fansly', color: 'purple' },
];

const SLOT_COLORS: Record<string, { bambi: string; dark: string }> = {
  open: { bambi: 'bg-gray-100 border-gray-200', dark: 'bg-protocol-bg border-protocol-border' },
  assigned: { bambi: 'bg-yellow-100 border-yellow-300', dark: 'bg-yellow-900/20 border-yellow-600/40' },
  queued: { bambi: 'bg-blue-100 border-blue-300', dark: 'bg-blue-900/20 border-blue-600/40' },
  scheduled: { bambi: 'bg-blue-100 border-blue-300', dark: 'bg-blue-900/20 border-blue-600/40' },
  posted: { bambi: 'bg-green-100 border-green-300', dark: 'bg-emerald-900/20 border-emerald-600/40' },
  skipped: { bambi: 'bg-gray-50 border-gray-100', dark: 'bg-gray-800/20 border-gray-700/40' },
};

function getDayLabels(startDate: string): string[] {
  const labels: string[] = [];
  const start = new Date(startDate + 'T12:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    labels.push(d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }));
  }
  return labels;
}

function getSlotsForPlatform(day: ContentCalendarDay, platform: Platform): CalendarSlot[] {
  if (!day.slots) return [];
  return (day.slots as CalendarSlot[]).filter(s => s.platform === platform);
}

export function ContentCalendar({ onBack }: ContentCalendarProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();

  const [weekStart, setWeekStart] = useState(() => new Date().toISOString().split('T')[0]);
  const [days, setDays] = useState<ContentCalendarDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeArcTitle, setActiveArcTitle] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const data = await getWeekCalendar(user.id, weekStart);
    setDays(data);
    // Extract arc title from first day that has one
    const arcDay = data.find(d => d.beat_label);
    setActiveArcTitle(arcDay?.beat_label || null);
    setIsLoading(false);
  }, [user, weekStart]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleGenerate = async () => {
    if (!user) return;
    setIsGenerating(true);
    await generateWeeklyCalendar(user.id);
    await refresh();
    setIsGenerating(false);
  };

  const shiftWeek = (direction: number) => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + direction * 7);
    setWeekStart(d.toISOString().split('T')[0]);
  };

  const dayLabels = getDayLabels(weekStart);
  const bg = isBambiMode ? 'bg-white' : 'bg-protocol-bg';
  const text = isBambiMode ? 'text-gray-800' : 'text-protocol-text';
  const muted = isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted';

  return (
    <div className={`min-h-screen ${bg} pb-20`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={muted}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className={`text-lg font-bold ${text}`}>Content Calendar</h1>
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg ${
            isBambiMode
              ? 'bg-pink-100 text-pink-600'
              : 'bg-protocol-accent/20 text-protocol-accent'
          }`}
        >
          {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Generate Week
        </button>
      </div>

      {/* Active arc banner */}
      {activeArcTitle && (
        <div className={`mx-4 mb-3 px-3 py-2 rounded-lg text-xs ${
          isBambiMode ? 'bg-purple-50 text-purple-700' : 'bg-purple-900/20 text-purple-400'
        }`}>
          Active arc: {activeArcTitle}
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-between px-4 mb-4">
        <button onClick={() => shiftWeek(-1)} className={muted}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className={`text-sm font-medium ${text}`}>
          {dayLabels[0]} — {dayLabels[6]}
        </span>
        <button onClick={() => shiftWeek(1)} className={muted}>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className={`w-6 h-6 animate-spin ${muted}`} />
        </div>
      ) : days.length === 0 ? (
        <div className={`text-center py-20 ${muted}`}>
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No calendar for this week. Generate one.</p>
        </div>
      ) : (
        <div className="px-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={`text-left py-2 pr-2 ${muted} font-medium`}>Platform</th>
                {dayLabels.map((label, i) => (
                  <th key={i} className={`text-center py-2 px-1 ${muted} font-medium`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLATFORMS.map(platform => (
                <tr key={platform.id}>
                  <td className={`py-1 pr-2 font-medium ${text}`}>{platform.label}</td>
                  {days.map((day, i) => {
                    const slots = getSlotsForPlatform(day, platform.id);
                    const slot = slots[0];
                    const status = slot?.status || 'open';
                    const colors = SLOT_COLORS[status] || SLOT_COLORS.open;

                    return (
                      <td key={i} className="py-1 px-1">
                        <div className={`h-10 rounded border flex items-center justify-center ${
                          isBambiMode ? colors.bambi : colors.dark
                        }`}>
                          <span className={`text-[10px] ${muted}`}>
                            {status === 'open' ? '—' : status.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Beat labels row */}
          <div className="flex gap-1 mt-2">
            {days.map((day, i) => (
              <div key={i} className={`flex-1 text-center text-[10px] ${muted} truncate`}>
                {day.beat_label || ''}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
