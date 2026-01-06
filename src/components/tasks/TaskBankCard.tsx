/**
 * Task Bank Card
 * Read-only display of a task in the task bank catalog
 */

import { Clock, Target, Lock, Zap } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { Task } from '../../types/task-bank';
import { CATEGORY_EMOJI, INTENSITY_CONFIG } from '../../types/task-bank';

interface TaskBankCardProps {
  task: Task;
  showRequirements?: boolean;
}

const DOMAIN_LABELS: Record<string, string> = {
  voice: 'Voice',
  movement: 'Movement',
  skincare: 'Skincare',
  style: 'Style',
  makeup: 'Makeup',
  social: 'Social',
  body_language: 'Body Language',
  inner_narrative: 'Inner Narrative',
  arousal: 'Arousal',
  chastity: 'Chastity',
  conditioning: 'Conditioning',
  identity: 'Identity',
};

export function TaskBankCard({ task, showRequirements = false }: TaskBankCardProps) {
  const { isBambiMode } = useBambiMode();

  const emoji = CATEGORY_EMOJI[task.category];
  const intensityConfig = INTENSITY_CONFIG[task.intensity];
  const domainLabel = DOMAIN_LABELS[task.domain] || task.domain;

  // Intensity color
  const getIntensityColor = () => {
    if (isBambiMode) {
      switch (task.intensity) {
        case 1: return 'bg-pink-100 text-pink-600';
        case 2: return 'bg-pink-200 text-pink-700';
        case 3: return 'bg-fuchsia-200 text-fuchsia-700';
        case 4: return 'bg-purple-200 text-purple-700';
        case 5: return 'bg-red-200 text-red-700';
        default: return 'bg-pink-100 text-pink-600';
      }
    }
    switch (task.intensity) {
      case 1: return 'bg-emerald-900/30 text-emerald-400';
      case 2: return 'bg-teal-900/30 text-teal-400';
      case 3: return 'bg-amber-900/30 text-amber-400';
      case 4: return 'bg-orange-900/30 text-orange-400';
      case 5: return 'bg-red-900/30 text-red-400';
      default: return 'bg-emerald-900/30 text-emerald-400';
    }
  };

  // Check if task has requirements
  const hasRequirements = task.requires && (
    task.requires.phase ||
    task.requires.denialDay ||
    task.requires.streakDays ||
    (task.requires.hasItem && task.requires.hasItem.length > 0)
  );

  return (
    <div className={`rounded-xl overflow-hidden ${
      isBambiMode
        ? 'bg-white border border-pink-200'
        : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Category emoji */}
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0 ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-bg'
          }`}>
            {emoji}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className={`font-medium leading-snug ${
              isBambiMode ? 'text-gray-800' : 'text-protocol-text'
            }`}>
              {task.instruction}
            </p>

            {task.subtext && (
              <p className={`text-xs mt-1 ${
                isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
              }`}>
                {task.subtext}
              </p>
            )}

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* Intensity badge */}
              <span className={`text-xs px-2 py-0.5 rounded-full ${getIntensityColor()}`}>
                {intensityConfig.label}
              </span>

              {/* Domain */}
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isBambiMode
                  ? 'bg-gray-100 text-gray-600'
                  : 'bg-protocol-bg text-protocol-text-muted'
              }`}>
                {domainLabel}
              </span>

              {/* Points */}
              <span className={`text-xs flex items-center gap-1 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`}>
                <Zap className="w-3 h-3" />
                {task.reward.points}
              </span>

              {/* Duration */}
              {task.durationMinutes && (
                <span className={`text-xs flex items-center gap-1 ${
                  isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
                }`}>
                  <Clock className="w-3 h-3" />
                  {task.durationMinutes}m
                </span>
              )}

              {/* Count */}
              {task.targetCount && (
                <span className={`text-xs flex items-center gap-1 ${
                  isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
                }`}>
                  <Target className="w-3 h-3" />
                  x{task.targetCount}
                </span>
              )}

              {/* Core indicator */}
              {task.aiFlags.isCore && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                }`}>
                  Core
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Requirements section */}
        {showRequirements && hasRequirements && (
          <div className={`mt-3 pt-3 border-t ${
            isBambiMode ? 'border-pink-100' : 'border-protocol-border'
          }`}>
            <div className="flex items-center gap-1 mb-2">
              <Lock className={`w-3 h-3 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`} />
              <span className={`text-xs font-medium ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}>
                Requirements
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {task.requires.phase && (
                <span className={`text-xs px-2 py-1 rounded ${
                  isBambiMode ? 'bg-pink-50 text-pink-600' : 'bg-protocol-bg text-protocol-text-muted'
                }`}>
                  Phase {task.requires.phase}+
                </span>
              )}
              {task.requires.denialDay?.min && (
                <span className={`text-xs px-2 py-1 rounded ${
                  isBambiMode ? 'bg-pink-50 text-pink-600' : 'bg-protocol-bg text-protocol-text-muted'
                }`}>
                  Day {task.requires.denialDay.min}+
                </span>
              )}
              {task.requires.streakDays && (
                <span className={`text-xs px-2 py-1 rounded ${
                  isBambiMode ? 'bg-pink-50 text-pink-600' : 'bg-protocol-bg text-protocol-text-muted'
                }`}>
                  {task.requires.streakDays}+ day streak
                </span>
              )}
              {task.requires.hasItem && task.requires.hasItem.length > 0 && (
                <span className={`text-xs px-2 py-1 rounded ${
                  isBambiMode ? 'bg-pink-50 text-pink-600' : 'bg-protocol-bg text-protocol-text-muted'
                }`}>
                  Requires items
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
