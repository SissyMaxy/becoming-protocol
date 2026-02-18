/**
 * Pattern Card
 *
 * Displays a single masculine pattern with stats and progress.
 */

import * as LucideIcons from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  MasculinePattern,
  PATTERN_CATEGORY_COLORS,
  PATTERN_CATEGORY_ICONS,
  PATTERN_CATEGORY_LABELS,
  PATTERN_STATUS_COLORS,
  PATTERN_STATUS_LABELS,
} from '../../types/patterns';

interface PatternCardProps {
  pattern: MasculinePattern;
  onTap: () => void;
  onLogCatch: () => void;
}

export function PatternCard({ pattern, onTap, onLogCatch }: PatternCardProps) {
  const { isBambiMode } = useBambiMode();

  const color = PATTERN_CATEGORY_COLORS[pattern.category];
  const iconName = PATTERN_CATEGORY_ICONS[pattern.category];
  const statusColor = PATTERN_STATUS_COLORS[pattern.status];

  // Get icon component dynamically
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[iconName] || LucideIcons.Circle;

  return (
    <div
      className={`rounded-xl overflow-hidden ${
        isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface'
      }`}
    >
      <button
        onClick={onTap}
        className="w-full p-4 text-left"
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${color}20` }}
          >
            <IconComponent className="w-5 h-5" style={{ color }} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3
                className={`font-semibold truncate ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                {pattern.patternName}
              </h3>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
              >
                {PATTERN_STATUS_LABELS[pattern.status]}
              </span>
            </div>

            {/* Category */}
            <p
              className={`text-xs mb-2 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              {PATTERN_CATEGORY_LABELS[pattern.category]}
            </p>

            {/* Automaticity progress */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[10px] ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}
                >
                  Automaticity
                </span>
                <span
                  className="text-xs font-medium"
                  style={{ color }}
                >
                  {pattern.replacementAutomaticity}%
                </span>
              </div>
              <div
                className={`h-1.5 rounded-full overflow-hidden ${
                  isBambiMode ? 'bg-pink-100' : 'bg-protocol-border'
                }`}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pattern.replacementAutomaticity}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>

            {/* Stats row */}
            <div
              className={`flex items-center gap-3 text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              <span>Caught {pattern.timesCaught}x</span>
              {pattern.timesCorrected > 0 && (
                <span className="text-green-500">
                  {Math.round((pattern.timesCorrected / pattern.timesCaught) * 100)}% corrected
                </span>
              )}
            </div>

            {/* Feminine replacement preview */}
            {pattern.feminineReplacement && (
              <p
                className={`text-xs mt-2 italic truncate ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                → {pattern.feminineReplacement}
              </p>
            )}
          </div>
        </div>
      </button>

      {/* Quick log button */}
      <div
        className={`px-4 py-2 border-t ${
          isBambiMode ? 'border-pink-100' : 'border-protocol-border/50'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLogCatch();
          }}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
            isBambiMode
              ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
              : 'bg-protocol-surface-light text-protocol-text hover:bg-protocol-border'
          }`}
        >
          Log Catch
        </button>
      </div>
    </div>
  );
}
