/**
 * Evening Bookend — full-screen overlay for end-of-day ritual.
 */

import { BookOpen, Headphones } from 'lucide-react';
import type { DaySummary } from '../../types/bookend';

interface EveningBookendProps {
  name: string;
  message: string;
  summary: DaySummary;
  onDismiss: () => void;
  onJournal?: () => void;
  onSleepContent?: () => void;
}

export function EveningBookend({ name, message, summary, onDismiss, onJournal, onSleepContent }: EveningBookendProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-8 select-none"
      style={{
        background: 'linear-gradient(135deg, #0d0d1a 0%, #1a0a2e 40%, #0a0a14 100%)',
      }}
    >
      {/* Subtle glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="relative z-10 text-center max-w-sm w-full">
        {/* Greeting */}
        <h1 className="text-3xl font-bold text-white mb-2">
          Good night, {name}.
        </h1>

        {/* Day summary */}
        <div className="flex items-center justify-center gap-3 text-white/40 text-sm mb-6">
          <span>{summary.tasksCompleted} tasks</span>
          <span className="text-white/20">|</span>
          <span>{summary.domainsTouched} domains</span>
          <span className="text-white/20">|</span>
          <span>Protein: {summary.proteinCount}/5</span>
        </div>

        {/* Handler message */}
        <p className="text-white/70 text-base italic leading-relaxed mb-8">
          &ldquo;{message}&rdquo;
        </p>

        {/* Action buttons */}
        <div className="flex gap-3 mb-8">
          {onJournal && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onJournal();
              }}
              className="flex-1 py-3 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-sm font-medium flex items-center justify-center gap-2 hover:bg-indigo-500/30 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Journal
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSleepContent?.();
            }}
            className={`flex-1 py-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              onSleepContent
                ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30'
                : 'bg-white/5 border-white/10 text-white/40 cursor-default'
            }`}
          >
            <Headphones className="w-4 h-4" />
            Sleep Content
          </button>
        </div>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="text-white/20 text-xs hover:text-white/40 transition-colors"
        >
          tap to dismiss
        </button>
      </div>
    </div>
  );
}
