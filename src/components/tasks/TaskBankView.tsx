/**
 * Task Bank View
 * Browse all available tasks in the task bank
 */

import { useState, useEffect, useMemo } from 'react';
import { BookOpen, Loader2, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { getAllTasks } from '../../lib/task-bank';
import { TaskBankCard } from './TaskBankCard';
import { TaskFilters } from './TaskFilters';
import type { Task, TaskCategory, FeminizationDomain } from '../../types/task-bank';

export function TaskBankView() {
  const { isBambiMode } = useBambiMode();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<TaskCategory | null>(null);
  const [selectedIntensity, setSelectedIntensity] = useState<number | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<FeminizationDomain | null>(null);

  // Load tasks
  const loadTasks = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const allTasks = await getAllTasks();
      setTasks(allTasks);
    } catch (err) {
      console.error('Failed to load tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  // Calculate task counts for filters
  const taskCounts = useMemo(() => {
    const byCategory: Record<string, number> = {};
    const byIntensity: Record<number, number> = {};
    const byDomain: Record<string, number> = {};

    tasks.forEach((task) => {
      byCategory[task.category] = (byCategory[task.category] || 0) + 1;
      byIntensity[task.intensity] = (byIntensity[task.intensity] || 0) + 1;
      byDomain[task.domain] = (byDomain[task.domain] || 0) + 1;
    });

    return {
      byCategory: byCategory as Record<TaskCategory, number>,
      byIntensity,
      byDomain: byDomain as Record<FeminizationDomain, number>,
      total: tasks.length,
    };
  }, [tasks]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (selectedCategory && task.category !== selectedCategory) return false;
      if (selectedIntensity && task.intensity !== selectedIntensity) return false;
      if (selectedDomain && task.domain !== selectedDomain) return false;
      return true;
    });
  }, [tasks, selectedCategory, selectedIntensity, selectedDomain]);

  // Group by category for display
  const groupedTasks = useMemo(() => {
    const groups: Record<TaskCategory, Task[]> = {} as Record<TaskCategory, Task[]>;

    filteredTasks.forEach((task) => {
      if (!groups[task.category]) {
        groups[task.category] = [];
      }
      groups[task.category].push(task);
    });

    return groups;
  }, [filteredTasks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className={`w-8 h-8 animate-spin ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
        }`} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-protocol-danger" />
        <p className="text-protocol-danger mb-4">{error}</p>
        <button
          onClick={loadTasks}
          className={`px-4 py-2 rounded-lg font-medium ${
            isBambiMode
              ? 'bg-pink-100 text-pink-600'
              : 'bg-protocol-surface text-protocol-text'
          }`}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
          }`}>
            <BookOpen className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`} />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              Task Bank
            </h2>
            <p className="text-xs text-protocol-text-muted">
              {tasks.length} tasks available
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              isBambiMode
                ? 'text-pink-600 hover:bg-pink-100'
                : 'text-protocol-text-muted hover:bg-protocol-surface'
            }`}
          >
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Filters
          </button>
          <button
            onClick={loadTasks}
            className="p-2 rounded-lg hover:bg-protocol-surface transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-protocol-text-muted" />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className={`p-4 rounded-xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}>
          <TaskFilters
            selectedCategory={selectedCategory}
            selectedIntensity={selectedIntensity}
            selectedDomain={selectedDomain}
            onCategoryChange={setSelectedCategory}
            onIntensityChange={setSelectedIntensity}
            onDomainChange={setSelectedDomain}
            taskCounts={taskCounts}
          />
        </div>
      )}

      {/* Results count */}
      {(selectedCategory || selectedIntensity || selectedDomain) && (
        <p className={`text-sm ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
        }`}>
          Showing {filteredTasks.length} of {tasks.length} tasks
        </p>
      )}

      {/* Task list */}
      {filteredTasks.length === 0 ? (
        <div className={`p-8 text-center rounded-xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}>
          <BookOpen className={`w-12 h-12 mx-auto mb-4 ${
            isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
          }`} />
          <p className={`font-medium ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            No tasks match your filters
          </p>
          <p className="text-sm text-protocol-text-muted mt-1">
            Try adjusting your filter criteria
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedTasks).map(([category, categoryTasks]) => (
            <div key={category}>
              <h3 className={`text-sm font-semibold mb-3 capitalize ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}>
                {category} ({categoryTasks.length})
              </h3>
              <div className="space-y-3">
                {categoryTasks.map((task) => (
                  <TaskBankCard
                    key={task.id}
                    task={task}
                    showRequirements
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info card */}
      <div className={`p-4 rounded-xl ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
      }`}>
        <p className={`text-sm ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
        }`}>
          Tasks are selected daily based on your phase, arousal state, and conditioning goals.
          You don't choose - the system decides what you need.
        </p>
      </div>
    </div>
  );
}

/**
 * Compact preview for dashboard
 */
export function TaskBankPreview() {
  const { isBambiMode } = useBambiMode();
  const [taskCount, setTaskCount] = useState<number | null>(null);

  useEffect(() => {
    getAllTasks()
      .then((tasks) => setTaskCount(tasks.length))
      .catch(() => setTaskCount(null));
  }, []);

  if (taskCount === null) {
    return null;
  }

  return (
    <div className={`p-4 rounded-xl ${
      isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className={`w-4 h-4 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
        }`} />
        <span className={`text-sm font-semibold ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          Task Bank
        </span>
      </div>

      <div>
        <p className={`text-2xl font-bold ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text'
        }`}>
          {taskCount}
        </p>
        <p className="text-xs text-protocol-text-muted">
          available tasks
        </p>
      </div>
    </div>
  );
}
