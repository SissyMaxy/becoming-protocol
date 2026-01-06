/**
 * Journal Gate - Inline journal unlock/completion flow
 * Shows remaining tasks and unlocks journal when all addressed
 */

import { useState } from 'react';
import { BookOpen, Lock, Sparkles, Check, X, ChevronRight } from 'lucide-react';
import { ProtocolTask } from '../types';

interface JournalGateProps {
  tasks: ProtocolTask[];
  completedCount: number;
  skippedCount: number;
  hasJournaled: boolean;
  onCompleteTask: (taskId: string) => void;
  onSkipTask: (task: ProtocolTask) => void;
  onOpenJournal: () => void;
}

export function JournalGate({
  tasks,
  completedCount,
  skippedCount,
  hasJournaled,
  onCompleteTask,
  onSkipTask,
  onOpenJournal,
}: JournalGateProps) {
  const [_expandedTaskId, _setExpandedTaskId] = useState<string | null>(null);

  const incompleteTasks = tasks.filter(t => !t.completed);
  const allTasksAddressed = incompleteTasks.length === 0;
  void tasks.length; // totalTasks - reserved for future use

  // Already journaled
  if (hasJournaled) {
    return (
      <div className="card p-4 bg-gradient-to-br from-protocol-success/10 to-emerald-500/5 border-protocol-success/30">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-protocol-success/20">
            <Check className="w-5 h-5 text-protocol-success" />
          </div>
          <div>
            <p className="font-medium text-protocol-text">Day Complete</p>
            <p className="text-sm text-protocol-text-muted">
              {completedCount} completed · {skippedCount > 0 ? `${skippedCount} skipped` : 'none skipped'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // All tasks addressed - journal ready
  if (allTasksAddressed) {
    return (
      <div className="card overflow-hidden">
        <div className="p-4 bg-gradient-to-br from-protocol-accent/10 to-purple-500/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-xl bg-protocol-accent/20">
              <Sparkles className="w-5 h-5 text-protocol-accent" />
            </div>
            <div>
              <p className="font-medium text-protocol-text">Complete Your Day</p>
              <p className="text-sm text-protocol-text-muted">
                {completedCount} done{skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onOpenJournal}
            className="w-full py-3 rounded-xl bg-protocol-accent text-white font-medium
                       hover:bg-protocol-accent-soft transition-colors
                       flex items-center justify-center gap-2 shadow-lg shadow-protocol-accent/20"
          >
            <BookOpen className="w-5 h-5" />
            Open Evening Journal
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Tasks remaining - show gate
  return (
    <div className="card overflow-hidden">
      <div className="p-4 bg-gradient-to-br from-amber-500/10 to-orange-500/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-amber-500/20">
            <Lock className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="font-medium text-protocol-text">Complete Your Day</p>
            <p className="text-sm text-protocol-text-muted">
              {incompleteTasks.length} task{incompleteTasks.length !== 1 ? 's' : ''} remaining
            </p>
          </div>
        </div>

        {/* Remaining tasks */}
        <div className="space-y-2">
          {incompleteTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-xl bg-protocol-surface/50 overflow-hidden"
            >
              <div className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Complete button - radio style on left */}
                  <button
                    onClick={() => onCompleteTask(task.id)}
                    className="w-6 h-6 rounded-full border-2 border-protocol-border hover:border-protocol-success hover:bg-protocol-success/20 transition-colors flex-shrink-0"
                    title="Mark complete"
                  />
                  <span className="text-sm text-protocol-text truncate">
                    {task.title}
                  </span>
                </div>

                {/* Skip button */}
                <button
                  onClick={() => onSkipTask(task)}
                  className="p-2 rounded-lg text-protocol-text-muted hover:text-amber-400 hover:bg-amber-500/20 transition-colors flex-shrink-0"
                  title="Skip task"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-protocol-text-muted text-center mt-4">
          Address all tasks to unlock evening journal
        </p>
      </div>
    </div>
  );
}
