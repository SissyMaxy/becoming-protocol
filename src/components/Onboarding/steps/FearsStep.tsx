import { useState } from 'react';
import { StepNav } from '../OnboardingFlow';
import { UserProfile, Fear } from '../types';
import { AlertTriangle, Plus, X } from 'lucide-react';

interface FearsStepProps {
  profile: Partial<UserProfile>;
  onUpdate: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

const COMMON_FEARS = [
  'Being visibly trans',
  'Voice not passing',
  'Family rejection',
  'Losing my job',
  'Violence/safety',
  'Partner leaving',
  'Never passing',
  'Regret',
  'Medical complications',
  'Social awkwardness',
  'Starting too late',
  'Being alone',
  'Coming out',
  'Public bathrooms'
];

const RESISTANCE_SUGGESTIONS = [
  'When I\'m tired I skip everything',
  'Procrastinating when tasks feel hard',
  'Getting discouraged by slow progress',
  'Feeling too dysphoric to try',
  'Worried about being heard practicing',
  'Running out of time in the day'
];

export function FearsStep({ profile, onUpdate, onNext, onBack }: FearsStepProps) {
  const [fears, setFears] = useState<Fear[]>(profile.fears || []);
  const [customFear, setCustomFear] = useState('');

  const toggleFear = (fear: string) => {
    const existing = fears.find(f => f.fear === fear);
    let updated: Fear[];

    if (existing) {
      updated = fears.filter(f => f.fear !== fear);
    } else {
      updated = [...fears, { fear, intensity: 3 as 1 | 2 | 3 | 4 | 5 }];
    }

    setFears(updated);
    onUpdate({ fears: updated });
  };

  const updateIntensity = (fear: string, intensity: 1 | 2 | 3 | 4 | 5) => {
    const updated = fears.map(f =>
      f.fear === fear ? { ...f, intensity } : f
    );
    setFears(updated);
    onUpdate({ fears: updated });
  };

  const addCustomFear = () => {
    if (customFear.trim() && !fears.find(f => f.fear === customFear.trim())) {
      const updated = [...fears, { fear: customFear.trim(), intensity: 3 as 1 | 2 | 3 | 4 | 5 }];
      setFears(updated);
      onUpdate({ fears: updated });
      setCustomFear('');
    }
  };

  const isSelected = (fear: string) => fears.some(f => f.fear === fear);
  const getIntensity = (fear: string) => fears.find(f => f.fear === fear)?.intensity || 3;

  // Find the biggest fear (highest intensity)
  const biggestFear = fears.reduce((max, f) =>
    f.intensity > (max?.intensity || 0) ? f : max,
    fears[0]
  );

  return (
    <div className="flex-1 p-6 pb-24 max-w-md mx-auto overflow-y-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-amber-500/20">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
        <h2 className="text-2xl font-bold text-protocol-text">
          Fears & Resistance
        </h2>
      </div>
      <p className="text-protocol-text-muted mb-6">
        What holds you back? Understanding your fears helps me support you through difficult moments.
      </p>

      <div className="space-y-6">
        {/* Common fears */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-3">
            What fears do you carry? (optional)
          </label>
          <div className="flex flex-wrap gap-2">
            {COMMON_FEARS.map(fear => (
              <button
                key={fear}
                onClick={() => toggleFear(fear)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  isSelected(fear)
                    ? 'bg-amber-500/20 border-2 border-amber-400 text-amber-400'
                    : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-amber-400/50'
                }`}
              >
                {fear}
              </button>
            ))}
          </div>
        </div>

        {/* Custom fear input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customFear}
            onChange={e => setCustomFear(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustomFear()}
            placeholder="Add another fear..."
            className="flex-1 px-4 py-2 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm"
          />
          <button
            onClick={addCustomFear}
            disabled={!customFear.trim()}
            className="px-3 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Selected fears with intensity */}
        {fears.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-protocol-text mb-3">
              Rate the intensity (1 = small worry, 5 = major block)
            </label>
            <div className="space-y-3">
              {fears.map(fear => (
                <div
                  key={fear.fear}
                  className={`p-3 rounded-lg border ${
                    biggestFear?.fear === fear.fear
                      ? 'bg-amber-500/10 border-amber-400'
                      : 'bg-protocol-surface border-protocol-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-protocol-text text-sm">
                      {fear.fear}
                      {biggestFear?.fear === fear.fear && (
                        <span className="ml-2 text-xs text-amber-400">(biggest)</span>
                      )}
                    </span>
                    <button
                      onClick={() => toggleFear(fear.fear)}
                      className="p-1 text-protocol-text-muted hover:text-protocol-danger"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(level => (
                      <button
                        key={level}
                        onClick={() => updateIntensity(fear.fear, level as 1 | 2 | 3 | 4 | 5)}
                        className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
                          getIntensity(fear.fear) === level
                            ? 'bg-amber-500 text-white'
                            : 'bg-protocol-surface-light text-protocol-text-muted hover:bg-protocol-surface-light/80'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resistance patterns */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-2">
            What makes you skip practice? (optional)
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {RESISTANCE_SUGGESTIONS.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onUpdate({
                  resistancePatterns: profile.resistancePatterns
                    ? `${profile.resistancePatterns}. ${suggestion}`
                    : suggestion
                })}
                className="px-2.5 py-1 text-xs rounded-full bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors border border-amber-500/20"
              >
                + {suggestion}
              </button>
            ))}
          </div>
          <textarea
            value={profile.resistancePatterns || ''}
            onChange={e => onUpdate({ resistancePatterns: e.target.value })}
            placeholder="Or describe your patterns..."
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none text-sm"
          />
          <p className="text-xs text-protocol-text-muted mt-2">
            This helps me recognize when you might need extra support
          </p>
        </div>
      </div>

      <StepNav onNext={onNext} onBack={onBack} />
    </div>
  );
}
