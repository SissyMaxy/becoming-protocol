// Graduated Goals Component
// Displays goals that have been internalized/graduated

import { Trophy, Calendar, Target, Flame, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { Goal } from '../../types/goals';
import { getDomainLabel, getDomainColor } from '../../types/goals';

interface GraduatedGoalsProps {
  goals: Goal[];
}

export function GraduatedGoals({ goals }: GraduatedGoalsProps) {
  const { isBambiMode } = useBambiMode();
  const [expanded, setExpanded] = useState(false);

  if (goals.length === 0) return null;

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        isBambiMode
          ? 'bg-yellow-50/50 border-yellow-200'
          : 'bg-yellow-900/10 border-yellow-700/30'
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              isBambiMode ? 'bg-yellow-100' : 'bg-yellow-900/30'
            }`}
          >
            <Trophy className="w-5 h-5 text-yellow-500" />
          </div>
          <div className="text-left">
            <h3
              className={`font-semibold ${
                isBambiMode ? 'text-yellow-700' : 'text-yellow-400'
              }`}
            >
              Graduated Skills
            </h3>
            <p
              className={`text-sm ${
                isBambiMode ? 'text-yellow-600' : 'text-yellow-500/70'
              }`}
            >
              {goals.length} behavior{goals.length !== 1 ? 's' : ''} now automatic
            </p>
          </div>
        </div>

        {expanded ? (
          <ChevronUp
            className={`w-5 h-5 ${
              isBambiMode ? 'text-yellow-400' : 'text-yellow-500/50'
            }`}
          />
        ) : (
          <ChevronDown
            className={`w-5 h-5 ${
              isBambiMode ? 'text-yellow-400' : 'text-yellow-500/50'
            }`}
          />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div
          className={`px-4 pb-4 border-t ${
            isBambiMode ? 'border-yellow-200' : 'border-yellow-700/30'
          }`}
        >
          <div className="pt-3 space-y-3">
            {goals.map((goal) => (
              <GraduatedGoalItem key={goal.id} goal={goal} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface GraduatedGoalItemProps {
  goal: Goal;
}

function GraduatedGoalItem({ goal }: GraduatedGoalItemProps) {
  const { isBambiMode } = useBambiMode();
  const domainColor = getDomainColor(goal.domain);

  const graduatedDate = goal.graduatedAt
    ? new Date(goal.graduatedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <div
      className={`p-3 rounded-lg ${
        isBambiMode ? 'bg-white/70' : 'bg-protocol-surface/50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className="p-1.5 rounded-lg"
            style={{ backgroundColor: `${domainColor}20` }}
          >
            <Trophy className="w-4 h-4" style={{ color: domainColor }} />
          </div>
          <div>
            <h4
              className={`font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              {goal.name}
            </h4>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${domainColor}20`,
                color: domainColor,
              }}
            >
              {getDomainLabel(goal.domain)}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mt-3 text-xs">
        <div className="flex items-center gap-1">
          <Calendar
            className={`w-3 h-3 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          />
          <span
            className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}
          >
            {graduatedDate}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Target
            className={`w-3 h-3 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          />
          <span
            className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}
          >
            {goal.totalCompletions} completions
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Flame className="w-3 h-3 text-orange-400" />
          <span
            className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}
          >
            {goal.longestStreak} best streak
          </span>
        </div>
      </div>
    </div>
  );
}
