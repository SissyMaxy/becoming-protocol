import { useState } from 'react';
import { StepNav } from '../OnboardingFlow';
import { UserProfile, EuphoriaTrigger } from '../types';
import { Plus, X, Sun } from 'lucide-react';

interface EuphoriaStepProps {
  profile: Partial<UserProfile>;
  onUpdate: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

const COMMON_ACTIVITIES = [
  'Wearing feminine clothes',
  'Makeup',
  'Painting nails',
  'Voice practice',
  'Being called she/her',
  'Being called my name',
  'Feminine hairstyle',
  'Skincare routine',
  'Walking in heels',
  'Feminine gestures',
  'Looking in mirror (good days)',
  'Supportive friends',
  'Wearing jewelry',
  'Feminine fragrance'
];

const BEST_MOMENTS_SUGGESTIONS = [
  'First time someone used my name',
  'When my outfit felt perfect',
  'Hearing my voice sound right',
  'Being gendered correctly by a stranger',
  'Seeing myself and feeling aligned',
  'A supportive friend making me feel seen'
];

const WANTS_MORE_SUGGESTIONS = [
  'More moments of feeling seen as myself',
  'Confidence in my voice',
  'Feeling comfortable in public',
  'Natural feminine movement',
  'Inner peace with my body'
];

export function EuphoriaStep({ profile, onUpdate, onNext, onBack }: EuphoriaStepProps) {
  const [triggers, setTriggers] = useState<EuphoriaTrigger[]>(profile.euphoriaTriggers || []);
  const [customActivity, setCustomActivity] = useState('');

  const toggleActivity = (activity: string) => {
    const existing = triggers.find(t => t.activity === activity);
    let updated: EuphoriaTrigger[];

    if (existing) {
      updated = triggers.filter(t => t.activity !== activity);
    } else {
      updated = [...triggers, { activity, intensity: 3 as 1 | 2 | 3 | 4 | 5 }];
    }

    setTriggers(updated);
    onUpdate({ euphoriaTriggers: updated });
  };

  const updateIntensity = (activity: string, intensity: 1 | 2 | 3 | 4 | 5) => {
    const updated = triggers.map(t =>
      t.activity === activity ? { ...t, intensity } : t
    );
    setTriggers(updated);
    onUpdate({ euphoriaTriggers: updated });
  };

  const addCustomActivity = () => {
    if (customActivity.trim() && !triggers.find(t => t.activity === customActivity.trim())) {
      const updated = [...triggers, { activity: customActivity.trim(), intensity: 3 as 1 | 2 | 3 | 4 | 5 }];
      setTriggers(updated);
      onUpdate({ euphoriaTriggers: updated });
      setCustomActivity('');
    }
  };

  const isSelected = (activity: string) => triggers.some(t => t.activity === activity);
  const getIntensity = (activity: string) => triggers.find(t => t.activity === activity)?.intensity || 3;

  return (
    <div className="flex-1 p-6 pb-24 max-w-md mx-auto overflow-y-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-pink-500/20">
          <Sun className="w-5 h-5 text-pink-400" />
        </div>
        <h2 className="text-2xl font-bold text-protocol-text">
          Euphoria Map
        </h2>
      </div>
      <p className="text-protocol-text-muted mb-6">
        What brings you joy? Understanding your euphoria sources helps me prescribe practices that light you up.
      </p>

      <div className="space-y-6">
        {/* Common activities */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-3">
            What gives you gender euphoria?
          </label>
          <div className="flex flex-wrap gap-2">
            {COMMON_ACTIVITIES.map(activity => (
              <button
                key={activity}
                onClick={() => toggleActivity(activity)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  isSelected(activity)
                    ? 'bg-pink-500/20 border-2 border-pink-400 text-pink-400'
                    : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-pink-400/50'
                }`}
              >
                {activity}
              </button>
            ))}
          </div>
        </div>

        {/* Custom activity input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customActivity}
            onChange={e => setCustomActivity(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustomActivity()}
            placeholder="Add another source of joy..."
            className="flex-1 px-4 py-2 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-pink-400 text-sm"
          />
          <button
            onClick={addCustomActivity}
            disabled={!customActivity.trim()}
            className="px-3 rounded-lg bg-pink-500/20 text-pink-400 hover:bg-pink-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Selected activities with intensity */}
        {triggers.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-protocol-text mb-3">
              Rate the euphoria (1 = nice, 5 = amazing)
            </label>
            <div className="space-y-3">
              {triggers.map(trigger => (
                <div
                  key={trigger.activity}
                  className="p-3 rounded-lg bg-protocol-surface border border-protocol-border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-protocol-text text-sm">{trigger.activity}</span>
                    <button
                      onClick={() => toggleActivity(trigger.activity)}
                      className="p-1 text-protocol-text-muted hover:text-protocol-danger"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(level => (
                      <button
                        key={level}
                        onClick={() => updateIntensity(trigger.activity, level as 1 | 2 | 3 | 4 | 5)}
                        className={`flex-1 py-1 rounded text-xs font-medium transition-all ${
                          getIntensity(trigger.activity) === level
                            ? 'bg-pink-500 text-white'
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

        {/* Best moments */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-2">
            Describe a peak euphoria moment (optional)
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {BEST_MOMENTS_SUGGESTIONS.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onUpdate({
                  euphoriaBestMoments: profile.euphoriaBestMoments
                    ? `${profile.euphoriaBestMoments}. ${suggestion}`
                    : suggestion
                })}
                className="px-2.5 py-1 text-xs rounded-full bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition-colors border border-pink-500/20"
              >
                + {suggestion}
              </button>
            ))}
          </div>
          <textarea
            value={profile.euphoriaBestMoments || ''}
            onChange={e => onUpdate({ euphoriaBestMoments: e.target.value })}
            placeholder="Or share your own moment..."
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none text-sm"
          />
        </div>

        {/* What they want more of */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-2">
            What do you want more of? (optional)
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {WANTS_MORE_SUGGESTIONS.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onUpdate({
                  euphoriaSeeks: profile.euphoriaSeeks
                    ? `${profile.euphoriaSeeks}, ${suggestion.toLowerCase()}`
                    : suggestion
                })}
                className="px-2.5 py-1 text-xs rounded-full bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition-colors border border-pink-500/20"
              >
                + {suggestion}
              </button>
            ))}
          </div>
          <textarea
            value={profile.euphoriaSeeks || ''}
            onChange={e => onUpdate({ euphoriaSeeks: e.target.value })}
            placeholder="Or describe what you're seeking..."
            rows={2}
            className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none text-sm"
          />
        </div>
      </div>

      <StepNav onNext={onNext} onBack={onBack} />
    </div>
  );
}
