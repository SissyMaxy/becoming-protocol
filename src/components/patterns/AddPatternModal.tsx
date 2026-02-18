/**
 * Add Pattern Modal
 *
 * Form to add a new masculine pattern to track.
 */

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import {
  PatternCategory,
  PATTERN_CATEGORIES,
  PATTERN_CATEGORY_LABELS,
  PATTERN_CATEGORY_ICONS,
  PATTERN_CATEGORY_COLORS,
} from '../../types/patterns';
import { createPattern } from '../../lib/patterns';

interface AddPatternModalProps {
  onSubmit: () => Promise<void>;
  onClose: () => void;
}

export function AddPatternModal({ onSubmit, onClose }: AddPatternModalProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();

  const [category, setCategory] = useState<PatternCategory | null>(null);
  const [patternName, setPatternName] = useState('');
  const [description, setDescription] = useState('');
  const [feminineReplacement, setFeminineReplacement] = useState('');
  const [automaticity, setAutomaticity] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = category !== null && patternName.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !user || !category) return;

    setIsSubmitting(true);
    try {
      await createPattern(user.id, {
        category,
        patternName: patternName.trim(),
        description: description.trim() || undefined,
        feminineReplacement: feminineReplacement.trim() || undefined,
        replacementAutomaticity: automaticity,
      });
      await onSubmit();
      onClose();
    } catch (err) {
      console.error('Failed to add pattern:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md max-h-[90vh] overflow-hidden rounded-2xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`p-4 border-b flex items-center justify-between ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <div className="flex items-center gap-2">
            <Plus className={isBambiMode ? 'text-pink-500' : 'text-red-400'} />
            <h2
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Add Pattern
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface'
            }`}
          >
            <X
              className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
          {/* Category Selection */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Category
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PATTERN_CATEGORIES.map((cat) => {
                const color = PATTERN_CATEGORY_COLORS[cat];
                const iconName = PATTERN_CATEGORY_ICONS[cat];
                const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[iconName] || LucideIcons.Circle;
                const isSelected = category === cat;

                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`p-3 rounded-lg flex flex-col items-center gap-1.5 transition-all border-2 ${
                      isSelected
                        ? ''
                        : isBambiMode
                        ? 'bg-white border-transparent hover:border-pink-200'
                        : 'bg-protocol-surface border-transparent hover:border-protocol-border'
                    }`}
                    style={{
                      backgroundColor: isSelected ? `${color}15` : undefined,
                      borderColor: isSelected ? color : undefined,
                    }}
                  >
                    <IconComponent
                      className="w-5 h-5"
                      style={{ color: isSelected ? color : isBambiMode ? '#ec4899' : '#9ca3af' }}
                    />
                    <span
                      className={`text-xs font-medium ${
                        isSelected
                          ? ''
                          : isBambiMode
                          ? 'text-pink-600'
                          : 'text-protocol-text-muted'
                      }`}
                      style={{ color: isSelected ? color : undefined }}
                    >
                      {PATTERN_CATEGORY_LABELS[cat]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pattern Name */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Pattern Name
            </label>
            <input
              type="text"
              value={patternName}
              onChange={(e) => setPatternName(e.target.value)}
              placeholder="e.g., Spreading legs when sitting"
              className={`w-full p-3 rounded-lg border text-sm ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none focus:ring-2 focus:ring-red-500/50`}
            />
          </div>

          {/* Description */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When does this pattern show up?"
              rows={2}
              className={`w-full p-3 rounded-lg border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none`}
            />
          </div>

          {/* Feminine Replacement */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Feminine Replacement (optional)
            </label>
            <textarea
              value={feminineReplacement}
              onChange={(e) => setFeminineReplacement(e.target.value)}
              placeholder="What's the feminine alternative?"
              rows={2}
              className={`w-full p-3 rounded-lg border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none`}
            />
          </div>

          {/* Initial Automaticity */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Current Automaticity: {automaticity}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={automaticity}
              onChange={(e) => setAutomaticity(parseInt(e.target.value))}
              className="w-full accent-red-500"
            />
            <div
              className={`flex justify-between text-xs mt-1 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              <span>Never automatic</span>
              <span>Always automatic</span>
            </div>
            <p
              className={`text-xs mt-2 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              How often does the feminine replacement happen automatically?
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`p-4 border-t ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              !canSubmit || isSubmitting
                ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                : isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-red-500 text-white hover:bg-red-600'
            }`}
          >
            {isSubmitting ? 'Adding...' : 'Add Pattern'}
          </button>
        </div>
      </div>
    </div>
  );
}
