import { useState } from 'react';
import { StepNav } from '../OnboardingFlow';
import { UserProfile, DysphoriaTrigger } from '../types';
import { CloudRain, Plus, X } from 'lucide-react';

interface DysphoriaStepProps {
  profile: Partial<UserProfile>;
  onUpdate: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

const COMMON_AREAS = [
  'Voice',
  'Face',
  'Body hair',
  'Chest',
  'Shoulders',
  'Hands',
  'Height',
  'Adam\'s apple',
  'Jaw/chin',
  'Hairline',
  'Hips',
  'Walk/gait',
  'Social perception',
  'Clothing fit'
];

const WORST_TIMES_SUGGESTIONS = [
  'In the morning before getting ready',
  'When I hear my voice in recordings',
  'Looking in mirrors',
  'In public bathrooms',
  'During video calls',
  'When shopping for clothes'
];

const COPING_SUGGESTIONS = [
  'Wearing baggy clothes',
  'Avoiding mirrors',
  'Staying home',
  'Keeping my voice quiet',
  'Wearing a hat/hood',
  'Distracting myself'
];

export function DysphoriaStep({ profile, onUpdate, onNext, onBack }: DysphoriaStepProps) {
  const [triggers, setTriggers] = useState<DysphoriaTrigger[]>(profile.dysphoriaTriggers || []);
  const [customArea, setCustomArea] = useState('');

  const toggleArea = (area: string) => {
    const existing = triggers.find(t => t.area === area);
    let updated: DysphoriaTrigger[];

    if (existing) {
      updated = triggers.filter(t => t.area !== area);
    } else {
      updated = [...triggers, { area, intensity: 3 as 1 | 2 | 3 | 4 | 5 }];
    }

    setTriggers(updated);
    onUpdate({ dysphoriaTriggers: updated });
  };

  const updateIntensity = (area: string, intensity: 1 | 2 | 3 | 4 | 5) => {
    const updated = triggers.map(t =>
      t.area === area ? { ...t, intensity } : t
    );
    setTriggers(updated);
    onUpdate({ dysphoriaTriggers: updated });
  };

  const addCustomArea = () => {
    if (customArea.trim() && !triggers.find(t => t.area === customArea.trim())) {
      const updated = [...triggers, { area: customArea.trim(), intensity: 3 as 1 | 2 | 3 | 4 | 5 }];
      setTriggers(updated);
      onUpdate({ dysphoriaTriggers: updated });
      setCustomArea('');
    }
  };

  const isSelected = (area: string) => triggers.some(t => t.area === area);
  const getIntensity = (area: string) => triggers.find(t => t.area === area)?.intensity || 3;

  return (
    <div className="flex-1 p-6 pb-24 max-w-md mx-auto overflow-y-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-blue-500/20">
          <CloudRain className="w-5 h-5 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-protocol-text">
          Dysphoria Map
        </h2>
      </div>
      <p className="text-protocol-text-muted mb-6">
        Understanding what causes discomfort helps me prioritize practices that address your needs.
        Select any areas that apply.
      </p>

      <div className="space-y-6">
        {/* Common areas */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-3">
            What areas trigger dysphoria for you?
          </label>
          <div className="flex flex-wrap gap-2">
            {COMMON_AREAS.map(area => (
              <button
                key={area}
                onClick={() => toggleArea(area)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  isSelected(area)
                    ? 'bg-blue-500/20 border-2 border-blue-400 text-blue-400'
                    : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-blue-400/50'
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </div>

        {/* Custom area input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customArea}
            onChange={e => setCustomArea(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustomArea()}
            placeholder="Add another area..."
            className="flex-1 px-4 py-2 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
          />
          <button
            onClick={addCustomArea}
            disabled={!customArea.trim()}
            className="px-3 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Selected areas with intensity */}
        {triggers.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-protocol-text mb-3">
              Rate intensity (1 = mild, 5 = severe)
            </label>
            <div className="space-y-3">
              {triggers.map(trigger => (
                <div
                  key={trigger.area}
                  className="p-3 rounded-lg bg-protocol-surface border border-protocol-border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-protocol-text">{trigger.area}</span>
                    <button
                      onClick={() => toggleArea(trigger.area)}
                      className="p-1 text-protocol-text-muted hover:text-protocol-danger"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(level => (
                      <button
                        key={level}
                        onClick={() => updateIntensity(trigger.area, level as 1 | 2 | 3 | 4 | 5)}
                        className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
                          getIntensity(trigger.area) === level
                            ? 'bg-blue-500 text-white'
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

        {/* Worst times */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-2">
            When is dysphoria typically worst? (optional)
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {WORST_TIMES_SUGGESTIONS.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onUpdate({
                  dysphoriaWorstTimes: profile.dysphoriaWorstTimes
                    ? `${profile.dysphoriaWorstTimes}, ${suggestion.toLowerCase()}`
                    : suggestion
                })}
                className="px-2.5 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors border border-blue-500/20"
              >
                + {suggestion}
              </button>
            ))}
          </div>
          <textarea
            value={profile.dysphoriaWorstTimes || ''}
            onChange={e => onUpdate({ dysphoriaWorstTimes: e.target.value })}
            placeholder="Or describe in your own words..."
            rows={2}
            className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none text-sm"
          />
        </div>

        {/* Current coping */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-2">
            How do you currently cope? (optional)
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {COPING_SUGGESTIONS.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onUpdate({
                  dysphoriaCoping: profile.dysphoriaCoping
                    ? `${profile.dysphoriaCoping}, ${suggestion.toLowerCase()}`
                    : suggestion
                })}
                className="px-2.5 py-1 text-xs rounded-full bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors border border-blue-500/20"
              >
                + {suggestion}
              </button>
            ))}
          </div>
          <textarea
            value={profile.dysphoriaCoping || ''}
            onChange={e => onUpdate({ dysphoriaCoping: e.target.value })}
            placeholder="Or describe your strategies..."
            rows={2}
            className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none text-sm"
          />
        </div>
      </div>

      <StepNav onNext={onNext} onBack={onBack} />
    </div>
  );
}
