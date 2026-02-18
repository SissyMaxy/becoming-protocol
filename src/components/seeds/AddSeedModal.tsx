/**
 * Add Seed Modal
 *
 * Form for creating a new intimate seed.
 */

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { SeedCategory, SeedInput } from '../../types/arousal';
import { SEED_CATEGORY_CONFIG } from '../../types/arousal';

interface AddSeedModalProps {
  onSubmit: (seed: SeedInput) => Promise<void>;
  onCancel: () => void;
}

const CATEGORIES: SeedCategory[] = [
  'power_dynamics',
  'feminization_intimate',
  'sensation_physical',
  'psychological_verbal',
  'new_activities',
  'service_devotion',
  'denial_control',
  'body_exploration',
  'roleplay',
  'other',
];

export function AddSeedModal({ onSubmit, onCancel }: AddSeedModalProps) {
  const { isBambiMode } = useBambiMode();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SeedCategory>('new_activities');
  const [intensityLevel, setIntensityLevel] = useState(3);
  const [bestTimingContext, setBestTimingContext] = useState('');
  const [avoidContexts, setAvoidContexts] = useState('');

  const handleSubmit = async () => {
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        intensityLevel,
        bestTimingContext: bestTimingContext.trim() || undefined,
        avoidContexts: avoidContexts.trim() || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div
        className={`w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl ${
          isBambiMode ? 'bg-white' : 'bg-protocol-surface'
        }`}
      >
        {/* Header */}
        <div
          className={`sticky top-0 flex items-center justify-between p-4 border-b ${
            isBambiMode
              ? 'bg-white border-pink-200'
              : 'bg-protocol-surface border-protocol-border'
          }`}
        >
          <h2
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Plant New Seed
          </h2>
          <button
            onClick={onCancel}
            className={`p-2 rounded-lg transition-colors ${
              isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-bg'
            }`}
          >
            <X
              className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label
              className={`block text-sm font-medium mb-1 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you want to explore?"
              className={`w-full px-4 py-3 rounded-xl border outline-none transition-colors ${
                isBambiMode
                  ? 'bg-pink-50 border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-pink-400'
                  : 'bg-protocol-bg border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:border-protocol-accent'
              }`}
            />
          </div>

          {/* Description */}
          <div>
            <label
              className={`block text-sm font-medium mb-1 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="More details about this desire..."
              rows={3}
              className={`w-full px-4 py-3 rounded-xl border outline-none transition-colors resize-none ${
                isBambiMode
                  ? 'bg-pink-50 border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-pink-400'
                  : 'bg-protocol-bg border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:border-protocol-accent'
              }`}
            />
          </div>

          {/* Category */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              Category
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => {
                const config = SEED_CATEGORY_CONFIG[cat];
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`p-3 rounded-xl text-left transition-all ${
                      isSelected
                        ? isBambiMode
                          ? 'bg-pink-500 text-white'
                          : 'bg-protocol-accent text-white'
                        : isBambiMode
                        ? 'bg-pink-50 text-pink-700 hover:bg-pink-100'
                        : 'bg-protocol-bg text-protocol-text hover:bg-protocol-bg/70'
                    }`}
                  >
                    <span className="mr-2">{config.emoji}</span>
                    <span className="text-sm">{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Intensity Level */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              Intensity Level: {intensityLevel}
            </label>
            <input
              type="range"
              min="1"
              max="5"
              value={intensityLevel}
              onChange={(e) => setIntensityLevel(Number(e.target.value))}
              className={`w-full h-2 rounded-full appearance-none cursor-pointer ${
                isBambiMode ? 'bg-pink-200' : 'bg-protocol-border'
              }`}
              style={{
                background: `linear-gradient(to right, ${
                  isBambiMode ? '#ec4899' : '#06b6d4'
                } 0%, ${isBambiMode ? '#ec4899' : '#06b6d4'} ${
                  ((intensityLevel - 1) / 4) * 100
                }%, ${isBambiMode ? '#fce7f3' : '#374151'} ${
                  ((intensityLevel - 1) / 4) * 100
                }%, ${isBambiMode ? '#fce7f3' : '#374151'} 100%)`,
              }}
            />
            <div className="flex justify-between mt-1">
              <span
                className={`text-xs ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Gentle
              </span>
              <span
                className={`text-xs ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Intense
              </span>
            </div>
          </div>

          {/* Best Timing */}
          <div>
            <label
              className={`block text-sm font-medium mb-1 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              Best Timing/Context
            </label>
            <input
              type="text"
              value={bestTimingContext}
              onChange={(e) => setBestTimingContext(e.target.value)}
              placeholder="When would be a good time?"
              className={`w-full px-4 py-3 rounded-xl border outline-none transition-colors ${
                isBambiMode
                  ? 'bg-pink-50 border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-pink-400'
                  : 'bg-protocol-bg border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:border-protocol-accent'
              }`}
            />
          </div>

          {/* Avoid Contexts */}
          <div>
            <label
              className={`block text-sm font-medium mb-1 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              Contexts to Avoid
            </label>
            <input
              type="text"
              value={avoidContexts}
              onChange={(e) => setAvoidContexts(e.target.value)}
              placeholder="When should this wait?"
              className={`w-full px-4 py-3 rounded-xl border outline-none transition-colors ${
                isBambiMode
                  ? 'bg-pink-50 border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-pink-400'
                  : 'bg-protocol-bg border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:border-protocol-accent'
              }`}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className={`sticky bottom-0 p-4 flex gap-3 border-t ${
            isBambiMode
              ? 'bg-white border-pink-200'
              : 'bg-protocol-surface border-protocol-border'
          }`}
        >
          <button
            onClick={onCancel}
            className={`flex-1 py-3 rounded-xl font-medium ${
              isBambiMode
                ? 'bg-pink-100 text-pink-700'
                : 'bg-protocol-bg text-protocol-text'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || isSubmitting}
            className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
              !title.trim() || isSubmitting
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : isBambiMode
                ? 'bg-pink-500 text-white'
                : 'bg-protocol-accent text-white'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Planting...
              </>
            ) : (
              'Plant Seed'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
