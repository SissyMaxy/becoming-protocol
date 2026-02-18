/**
 * Seed Card Component
 *
 * Displays an intimate seed with phase indicator and category.
 */

import { ChevronRight } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { IntimateSeed, SeedPhase, Reception } from '../../types/arousal';
import { SEED_CATEGORY_CONFIG, SEED_PHASE_CONFIG } from '../../types/arousal';

interface SeedCardProps {
  seed: IntimateSeed;
  onSelect: (seed: IntimateSeed) => void;
}

const PHASE_COLORS: Record<SeedPhase, string> = {
  identified: '#64748b',
  distant_mention: '#8b5cf6',
  positive_assoc: '#a855f7',
  adjacent_exp: '#d946ef',
  soft_offer: '#ec4899',
  first_attempt: '#f472b6',
  establishing: '#22c55e',
  established: '#16a34a',
  abandoned: '#6b7280',
  paused: '#9ca3af',
};

const RECEPTION_CONFIG: Record<Reception, { emoji: string; color: string }> = {
  positive: { emoji: '😊', color: '#22c55e' },
  neutral: { emoji: '😐', color: '#64748b' },
  hesitant: { emoji: '🤔', color: '#f59e0b' },
  negative: { emoji: '😕', color: '#ef4444' },
  unknown: { emoji: '❓', color: '#9ca3af' },
};

export function SeedCard({ seed, onSelect }: SeedCardProps) {
  const { isBambiMode } = useBambiMode();
  const categoryConfig = SEED_CATEGORY_CONFIG[seed.category];
  const phaseConfig = SEED_PHASE_CONFIG[seed.currentPhase];
  const phaseColor = PHASE_COLORS[seed.currentPhase];

  // Calculate progress percentage through phases
  const activePhases: SeedPhase[] = [
    'identified',
    'distant_mention',
    'positive_assoc',
    'adjacent_exp',
    'soft_offer',
    'first_attempt',
    'establishing',
    'established',
  ];
  const currentIndex = activePhases.indexOf(seed.currentPhase);
  const progressPercent =
    currentIndex >= 0 ? ((currentIndex + 1) / activePhases.length) * 100 : 0;

  return (
    <button
      onClick={() => onSelect(seed)}
      className={`w-full p-4 rounded-xl text-left transition-all group ${
        isBambiMode
          ? 'bg-white border border-pink-200 hover:border-pink-400'
          : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent/30'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Category icon */}
        <div
          className={`p-2 rounded-lg text-lg ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
          }`}
        >
          {categoryConfig.emoji}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3
              className={`font-medium truncate ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              {seed.title}
            </h3>
            {seed.lastReception && (
              <span title={`Last reception: ${seed.lastReception}`}>
                {RECEPTION_CONFIG[seed.lastReception].emoji}
              </span>
            )}
          </div>

          {/* Description */}
          {seed.description && (
            <p
              className={`text-xs mb-2 line-clamp-2 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              {seed.description}
            </p>
          )}

          {/* Phase progress bar */}
          <div className="flex items-center gap-2">
            <div
              className={`flex-1 h-1.5 rounded-full overflow-hidden ${
                isBambiMode ? 'bg-pink-100' : 'bg-protocol-border'
              }`}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: phaseColor,
                }}
              />
            </div>
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full`}
              style={{
                backgroundColor: `${phaseColor}20`,
                color: phaseColor,
              }}
            >
              {phaseConfig.label}
            </span>
          </div>

          {/* Category and intensity */}
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`text-[10px] ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              {categoryConfig.label}
            </span>
            <span
              className={`text-[10px] ${
                isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted/50'
              }`}
            >
              Level {seed.intensityLevel}
            </span>
          </div>
        </div>

        {/* Arrow */}
        <ChevronRight
          className={`w-5 h-5 transition-colors ${
            isBambiMode
              ? 'text-pink-300 group-hover:text-pink-500'
              : 'text-protocol-text-muted group-hover:text-protocol-accent'
          }`}
        />
      </div>
    </button>
  );
}
