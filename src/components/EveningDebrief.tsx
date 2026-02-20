/**
 * EveningDebrief — Lightweight end-of-day overlay.
 * Shows day summary, alignment emoji check, optional reflection, and action buttons.
 * Replaces EveningBookend with a richer but still quick debrief.
 */

import { useState } from 'react';
import { Headphones, Moon, Loader2 } from 'lucide-react';
import { useBambiMode } from '../context/BambiModeContext';
import { useAuth } from '../context/AuthContext';
import { saveJournalEntry } from '../lib/dashboard-analytics';
import { getTodayDate } from '../lib/protocol';
import type { DaySummary } from '../types/bookend';

const ALIGNMENT_EMOJIS = ['😔', '😐', '🙂', '😊', '😄'] as const;

interface EveningDebriefProps {
  name: string;
  message: string;
  summary: DaySummary;
  streakDays: number;
  onDismiss: () => void;
  onSleepContent?: () => void;
}

export function EveningDebrief({
  name,
  message,
  summary,
  streakDays,
  onDismiss,
  onSleepContent,
}: EveningDebriefProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [alignment, setAlignment] = useState<number | null>(null);
  const [reflection, setReflection] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleEndDay = async () => {
    if (!user?.id) {
      onDismiss();
      return;
    }

    setIsSaving(true);
    try {
      // Save reflection if entered
      if (reflection.trim()) {
        await saveJournalEntry(user.id, getTodayDate(), { freeText: reflection.trim() });
      }
    } catch (err) {
      console.error('[EveningDebrief] Save failed:', err);
    } finally {
      setIsSaving(false);
      onDismiss();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 select-none"
      style={{
        background: isBambiMode
          ? 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 40%, #f5f3ff 100%)'
          : 'linear-gradient(135deg, #0d0d1a 0%, #1a0a2e 40%, #0a0a14 100%)',
      }}
    >
      {/* Subtle glow */}
      <div className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-3xl ${
        isBambiMode ? 'bg-pink-200/30' : 'bg-indigo-500/10'
      }`} />

      <div className="relative z-10 max-w-sm w-full space-y-6">
        {/* Greeting */}
        <div className="text-center">
          <Moon className={`w-8 h-8 mx-auto mb-3 ${
            isBambiMode ? 'text-purple-400' : 'text-indigo-400'
          }`} />
          <h1 className={`text-2xl font-bold mb-1 handler-voice ${
            isBambiMode ? 'text-pink-800' : 'text-white'
          }`}>
            Evening, {name}.
          </h1>
          <p className={`text-sm italic handler-voice ${
            isBambiMode ? 'text-pink-500' : 'text-white/60'
          }`}>
            &ldquo;{message}&rdquo;
          </p>
        </div>

        {/* Day summary */}
        <div className={`flex items-center justify-center gap-3 text-sm ${
          isBambiMode ? 'text-pink-600' : 'text-white/50'
        }`}>
          <span>{summary.tasksCompleted} tasks</span>
          <span className={isBambiMode ? 'text-pink-300' : 'text-white/20'}>|</span>
          <span>{summary.domainsTouched} domains</span>
          {streakDays > 0 && (
            <>
              <span className={isBambiMode ? 'text-pink-300' : 'text-white/20'}>|</span>
              <span>{streakDays}-day streak</span>
            </>
          )}
        </div>

        {/* Alignment check */}
        <div className={`rounded-xl p-4 ${
          isBambiMode
            ? 'bg-white/80 border border-pink-200'
            : 'bg-white/5 border border-white/10'
        }`}>
          <p className={`text-sm font-medium mb-3 text-center handler-voice ${
            isBambiMode ? 'text-pink-700' : 'text-white/80'
          }`}>
            How aligned did you feel today?
          </p>
          <div className="flex items-center justify-center gap-2">
            {ALIGNMENT_EMOJIS.map((emoji, i) => (
              <button
                key={i}
                onClick={() => setAlignment(i)}
                className={`text-2xl p-2 rounded-lg transition-all duration-200 ease-in-out ${
                  alignment === i
                    ? 'opacity-100 scale-110'
                    : 'opacity-25 hover:opacity-50'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Quick reflection */}
        <div className={`rounded-xl p-4 ${
          isBambiMode
            ? 'bg-white/80 border border-pink-200'
            : 'bg-white/5 border border-white/10'
        }`}>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="Quick reflection (optional)..."
            rows={2}
            className={`w-full bg-transparent resize-none text-sm outline-none placeholder:opacity-40 ${
              isBambiMode ? 'text-pink-800 placeholder:text-pink-400' : 'text-white/80 placeholder:text-white'
            }`}
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleEndDay}
            disabled={isSaving}
            className={`flex-1 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/40'
            }`}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'End Day'
            )}
          </button>
          {onSleepContent && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSleepContent();
              }}
              className={`flex-1 py-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                isBambiMode
                  ? 'bg-purple-100 border-purple-200 text-purple-600 hover:bg-purple-200'
                  : 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30'
              }`}
            >
              <Headphones className="w-4 h-4" />
              Sleep Content
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
