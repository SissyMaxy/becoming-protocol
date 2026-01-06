/**
 * Task Filters
 * Filter controls for browsing the task bank
 */

import { Filter, X } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { TaskCategory, FeminizationDomain } from '../../types/task-bank';
import { CATEGORY_EMOJI, INTENSITY_CONFIG } from '../../types/task-bank';

interface TaskFiltersProps {
  selectedCategory: TaskCategory | null;
  selectedIntensity: number | null;
  selectedDomain: FeminizationDomain | null;
  onCategoryChange: (category: TaskCategory | null) => void;
  onIntensityChange: (intensity: number | null) => void;
  onDomainChange: (domain: FeminizationDomain | null) => void;
  taskCounts: {
    byCategory: Record<TaskCategory, number>;
    byIntensity: Record<number, number>;
    byDomain: Record<FeminizationDomain, number>;
    total: number;
  };
}

const CATEGORIES: TaskCategory[] = [
  'wear', 'listen', 'say', 'apply', 'watch', 'edge',
  'lock', 'practice', 'use', 'remove', 'commit', 'expose', 'serve', 'surrender'
];

const DOMAINS: FeminizationDomain[] = [
  'voice', 'movement', 'skincare', 'style', 'makeup', 'social',
  'body_language', 'inner_narrative', 'arousal', 'chastity', 'conditioning', 'identity'
];

const DOMAIN_LABELS: Record<FeminizationDomain, string> = {
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

export function TaskFilters({
  selectedCategory,
  selectedIntensity,
  selectedDomain,
  onCategoryChange,
  onIntensityChange,
  onDomainChange,
  taskCounts,
}: TaskFiltersProps) {
  const { isBambiMode } = useBambiMode();

  const hasFilters = selectedCategory || selectedIntensity || selectedDomain;

  const clearFilters = () => {
    onCategoryChange(null);
    onIntensityChange(null);
    onDomainChange(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className={`w-4 h-4 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`} />
          <span className={`text-sm font-medium ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            Filters
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-protocol-surface text-protocol-text-muted'
          }`}>
            {taskCounts.total} tasks
          </span>
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
              isBambiMode
                ? 'text-pink-500 hover:bg-pink-100'
                : 'text-protocol-text-muted hover:bg-protocol-surface'
            }`}
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Category filter */}
      <div>
        <p className={`text-xs font-medium mb-2 ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
        }`}>
          Category
        </p>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((category) => {
            const count = taskCounts.byCategory[category] || 0;
            const isSelected = selectedCategory === category;

            if (count === 0) return null;

            return (
              <button
                key={category}
                onClick={() => onCategoryChange(isSelected ? null : category)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                  isSelected
                    ? isBambiMode
                      ? 'bg-pink-500 text-white'
                      : 'bg-protocol-accent text-white'
                    : isBambiMode
                      ? 'bg-pink-50 text-pink-700 hover:bg-pink-100'
                      : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
                }`}
              >
                <span>{CATEGORY_EMOJI[category]}</span>
                <span className="capitalize">{category}</span>
                <span className={`text-xs ${isSelected ? 'opacity-70' : 'opacity-50'}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Intensity filter */}
      <div>
        <p className={`text-xs font-medium mb-2 ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
        }`}>
          Intensity
        </p>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((intensity) => {
            const count = taskCounts.byIntensity[intensity] || 0;
            const isSelected = selectedIntensity === intensity;
            const config = INTENSITY_CONFIG[intensity];

            return (
              <button
                key={intensity}
                onClick={() => onIntensityChange(isSelected ? null : intensity)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isSelected
                    ? isBambiMode
                      ? 'bg-pink-500 text-white'
                      : 'bg-protocol-accent text-white'
                    : isBambiMode
                      ? 'bg-pink-50 text-pink-700 hover:bg-pink-100'
                      : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
                }`}
              >
                <div>{config.label}</div>
                <div className={`text-xs ${isSelected ? 'opacity-70' : 'opacity-50'}`}>
                  {count}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Domain filter */}
      <div>
        <p className={`text-xs font-medium mb-2 ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
        }`}>
          Domain
        </p>
        <div className="flex flex-wrap gap-1.5">
          {DOMAINS.map((domain) => {
            const count = taskCounts.byDomain[domain] || 0;
            const isSelected = selectedDomain === domain;

            if (count === 0) return null;

            return (
              <button
                key={domain}
                onClick={() => onDomainChange(isSelected ? null : domain)}
                className={`px-2 py-1 rounded-lg text-xs transition-colors ${
                  isSelected
                    ? isBambiMode
                      ? 'bg-pink-500 text-white'
                      : 'bg-protocol-accent text-white'
                    : isBambiMode
                      ? 'bg-pink-50 text-pink-700 hover:bg-pink-100'
                      : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
                }`}
              >
                {DOMAIN_LABELS[domain]}
                <span className={`ml-1 text-xs ${isSelected ? 'opacity-70' : 'opacity-50'}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
