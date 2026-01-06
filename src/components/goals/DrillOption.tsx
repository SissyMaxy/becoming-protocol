// Drill Option Component
// Selectable drill option for completing a goal

import { useState } from 'react';
import { Clock, ChevronDown, ChevronUp, Check, Sparkles } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { Drill } from '../../types/goals';
import { getDifficultyLabel } from '../../types/goals';

interface DrillOptionProps {
  drill: Drill;
  selected: boolean;
  completed: boolean;
  onSelect: () => void;
}

export function DrillOption({ drill, selected, completed, onSelect }: DrillOptionProps) {
  const { isBambiMode } = useBambiMode();
  const [expanded, setExpanded] = useState(false);

  const handleClick = () => {
    if (completed) return;
    onSelect();
  };

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  return (
    <div
      className={`rounded-lg border transition-all ${
        completed
          ? isBambiMode
            ? 'bg-pink-100 border-pink-300 opacity-75'
            : 'bg-green-900/20 border-green-700/50 opacity-75'
          : selected
          ? isBambiMode
            ? 'bg-pink-100 border-pink-400 ring-2 ring-pink-400'
            : 'bg-protocol-accent/20 border-protocol-accent ring-2 ring-protocol-accent'
          : isBambiMode
          ? 'bg-white/50 border-pink-200 hover:border-pink-300 cursor-pointer'
          : 'bg-protocol-surface-light border-protocol-border hover:border-protocol-accent/50 cursor-pointer'
      }`}
      onClick={handleClick}
    >
      <div className="p-3 flex items-start gap-3">
        {/* Selection indicator */}
        <div
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
            completed
              ? isBambiMode
                ? 'bg-pink-500 border-pink-500'
                : 'bg-green-500 border-green-500'
              : selected
              ? isBambiMode
                ? 'bg-pink-500 border-pink-500'
                : 'bg-protocol-accent border-protocol-accent'
              : isBambiMode
              ? 'border-pink-300'
              : 'border-protocol-border'
          }`}
        >
          {(selected || completed) && (
            <Check className="w-3 h-3 text-white" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`font-medium ${
                completed
                  ? isBambiMode
                    ? 'text-pink-600 line-through'
                    : 'text-green-400 line-through'
                  : isBambiMode
                  ? 'text-pink-700'
                  : 'text-protocol-text'
              }`}
            >
              {drill.name}
            </span>

            {/* Points badge */}
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                isBambiMode
                  ? 'bg-pink-200 text-pink-700'
                  : 'bg-protocol-accent/20 text-protocol-accent'
              }`}
            >
              +{drill.points}
            </span>
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-3 mt-1">
            {drill.estimatedMinutes && (
              <span
                className={`flex items-center gap-1 text-xs ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                <Clock className="w-3 h-3" />
                {drill.estimatedMinutes} min
              </span>
            )}
            <span
              className={`text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              {getDifficultyLabel(drill.difficulty)}
            </span>
          </div>

          {/* Expanded instruction */}
          {expanded && (
            <p
              className={`mt-2 text-sm ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              {drill.instruction}
            </p>
          )}

          {/* Affirmation preview */}
          {expanded && drill.affirmation && (
            <div
              className={`mt-2 flex items-center gap-1.5 text-xs italic ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              "{drill.affirmation}"
            </div>
          )}
        </div>

        {/* Expand button */}
        <button
          onClick={handleExpand}
          className={`p-1 rounded ${
            isBambiMode
              ? 'text-pink-400 hover:bg-pink-100'
              : 'text-protocol-text-muted hover:bg-protocol-surface-light'
          }`}
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
