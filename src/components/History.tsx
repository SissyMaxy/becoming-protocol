import { useState } from 'react';
import { useProtocol } from '../context/ProtocolContext';
import { DailyEntry } from '../types';
import { INTENSITY_CONFIG } from '../data/constants';
import {
  formatDate,
  calculateCompletionPercentage,
  getTodayDate
} from '../lib/protocol';
import {
  Calendar,
  ChevronRight,
  Check,
  Star,
  BookOpen,
  X
} from 'lucide-react';

interface EntryCardProps {
  entry: DailyEntry;
  onClick: () => void;
  isToday: boolean;
}

function EntryCard({ entry, onClick, isToday }: EntryCardProps) {
  const completionPercentage = calculateCompletionPercentage(entry.tasks);
  const intensityConfig = INTENSITY_CONFIG[entry.intensity];
  const completedTasks = entry.tasks.filter(t => t.completed).length;
  const hasJournal = entry.journal && entry.journal.alignmentScore > 0;

  return (
    <button
      onClick={onClick}
      className={`w-full p-4 rounded-lg border text-left transition-all duration-200 ${
        isToday
          ? 'border-protocol-accent bg-protocol-accent/5'
          : 'border-protocol-border bg-protocol-surface hover:border-protocol-text-muted'
      }`}
    >
      <div className="flex items-center gap-4">
        {/* Date */}
        <div className="flex-shrink-0 text-center">
          <p className="text-2xl font-bold text-protocol-text">
            {new Date(entry.date + 'T00:00:00').getDate()}
          </p>
          <p className="text-xs text-protocol-text-muted uppercase">
            {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
          </p>
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isToday && (
              <span className="px-2 py-0.5 text-xs bg-protocol-accent/20 text-protocol-accent rounded-full">
                Today
              </span>
            )}
            <span
              className="px-2 py-0.5 text-xs rounded-full"
              style={{
                backgroundColor: `${intensityConfig.color}20`,
                color: intensityConfig.color
              }}
            >
              {intensityConfig.label}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-protocol-surface-light rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full ${
                completionPercentage === 100
                  ? 'bg-protocol-success'
                  : 'bg-gradient-to-r from-protocol-accent to-protocol-accent-soft'
              }`}
              style={{ width: `${completionPercentage}%` }}
            />
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs text-protocol-text-muted">
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3" />
              {completedTasks}/{entry.tasks.length}
            </span>
            {hasJournal && (
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-protocol-accent" />
                {entry.journal!.alignmentScore}/10
              </span>
            )}
            {hasJournal && (
              <span className="flex items-center gap-1 text-protocol-accent">
                <BookOpen className="w-3 h-3" />
                Journaled
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-protocol-text-muted flex-shrink-0" />
      </div>
    </button>
  );
}

interface EntryDetailProps {
  entry: DailyEntry;
  onClose: () => void;
}

function EntryDetail({ entry, onClose }: EntryDetailProps) {
  const completionPercentage = calculateCompletionPercentage(entry.tasks);
  const intensityConfig = INTENSITY_CONFIG[entry.intensity];
  const completedTasks = entry.tasks.filter(t => t.completed);

  return (
    <div className="fixed inset-0 z-50 bg-protocol-bg/95 overflow-y-auto">
      <div className="min-h-screen p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-protocol-text">
              {formatDate(entry.date)}
            </h2>
            <span
              className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full"
              style={{
                backgroundColor: `${intensityConfig.color}20`,
                color: intensityConfig.color
              }}
            >
              {intensityConfig.label} Day
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-protocol-surface border border-protocol-border hover:border-protocol-text-muted transition-colors"
          >
            <X className="w-5 h-5 text-protocol-text" />
          </button>
        </div>

        {/* Completion summary */}
        <div className="card p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-protocol-text-muted">Completion</span>
            <span className="text-lg font-bold text-protocol-text">
              {completionPercentage}%
            </span>
          </div>
          <div className="h-3 bg-protocol-surface-light rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                completionPercentage === 100
                  ? 'bg-protocol-success'
                  : 'bg-gradient-to-r from-protocol-accent to-protocol-accent-soft'
              }`}
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <p className="text-xs text-protocol-text-muted mt-2">
            {completedTasks.length} of {entry.tasks.length} tasks completed
          </p>
        </div>

        {/* Completed tasks */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-protocol-text-muted mb-3">
            Completed Tasks
          </h3>
          <div className="space-y-2">
            {completedTasks.length > 0 ? (
              completedTasks.map(task => (
                <div
                  key={task.id}
                  className="p-3 rounded-lg bg-protocol-success/10 border border-protocol-success/20"
                >
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-protocol-success" />
                    <span className="text-sm text-protocol-text">{task.title}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-protocol-text-muted">No tasks completed</p>
            )}
          </div>
        </div>

        {/* Journal */}
        {entry.journal && entry.journal.alignmentScore > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-protocol-text-muted">
              Evening Reflection
            </h3>

            {/* Alignment score */}
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-protocol-text-muted">Alignment Score</span>
                <div className="flex items-center gap-1">
                  {[...Array(10)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < entry.journal!.alignmentScore
                          ? 'fill-protocol-accent text-protocol-accent'
                          : 'text-protocol-border'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Journal entries */}
            {entry.journal.euphoriaNote && (
              <div className="card p-4">
                <p className="text-xs text-protocol-success mb-2 font-medium">
                  Euphoria moments
                </p>
                <p className="text-sm text-protocol-text">
                  {entry.journal.euphoriaNote}
                </p>
              </div>
            )}

            {entry.journal.dysphoriaNote && (
              <div className="card p-4">
                <p className="text-xs text-protocol-warning mb-2 font-medium">
                  Dysphoria notes
                </p>
                <p className="text-sm text-protocol-text">
                  {entry.journal.dysphoriaNote}
                </p>
              </div>
            )}

            {entry.journal.insights && (
              <div className="card p-4">
                <p className="text-xs text-protocol-accent mb-2 font-medium">
                  Insights
                </p>
                <p className="text-sm text-protocol-text">
                  {entry.journal.insights}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function History() {
  const { history } = useProtocol();
  const [selectedEntry, setSelectedEntry] = useState<DailyEntry | null>(null);
  const today = getTodayDate();

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
        <Calendar className="w-12 h-12 text-protocol-text-muted" />
        <div>
          <p className="text-protocol-text font-medium">No history yet</p>
          <p className="text-sm text-protocol-text-muted">
            Your completed days will appear here
          </p>
        </div>
      </div>
    );
  }

  // Group by month
  const groupedByMonth: Record<string, DailyEntry[]> = {};
  history.forEach(entry => {
    const monthKey = new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });
    if (!groupedByMonth[monthKey]) {
      groupedByMonth[monthKey] = [];
    }
    groupedByMonth[monthKey].push(entry);
  });

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-protocol-text">History</h2>
        <p className="text-sm text-protocol-text-muted">
          {history.length} day{history.length !== 1 ? 's' : ''} recorded
        </p>
      </div>

      {/* Entries by month */}
      {Object.entries(groupedByMonth).map(([month, entries]) => (
        <div key={month} className="space-y-3">
          <h3 className="text-sm font-medium text-protocol-text-muted">
            {month}
          </h3>
          {entries.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onClick={() => setSelectedEntry(entry)}
              isToday={entry.date === today}
            />
          ))}
        </div>
      ))}

      {/* Entry detail modal */}
      {selectedEntry && (
        <EntryDetail
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}
