import { StepNav } from '../OnboardingFlow';
import { UserProfile } from '../types';
import { Target, Compass, Shield } from 'lucide-react';

interface GoalsStepProps {
  profile: Partial<UserProfile>;
  onUpdate: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

// Quick suggestions for each field
const SHORT_TERM_SUGGESTIONS = [
  'Practice voice for 10 minutes daily',
  'Develop a skincare routine',
  'Try a new feminine outfit',
  'Practice makeup basics',
  'Walk more femininely',
  'Paint my nails regularly'
];

const VISION_SUGGESTIONS = [
  'Confident and comfortable in my body',
  'Speaking with a voice that feels like mine',
  'Wearing clothes that express who I am',
  'Being seen and accepted as myself',
  'Living authentically every day'
];

const NON_NEGOTIABLE_SUGGESTIONS = [
  'Daily skincare routine',
  'Voice practice 3x/week',
  'Weekly nail care',
  'Daily feminine affirmations',
  'Moisturizing every day'
];

interface QuickSuggestionsProps {
  suggestions: string[];
  currentValue: string;
  onSelect: (suggestion: string) => void;
  color?: string;
}

function QuickSuggestions({ suggestions, currentValue, onSelect, color = 'protocol-accent' }: QuickSuggestionsProps) {
  const handleClick = (suggestion: string) => {
    // Append to current value with proper formatting
    const newValue = currentValue
      ? `${currentValue}\n${suggestion}`
      : suggestion;
    onSelect(newValue);
  };

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {suggestions.map(suggestion => (
        <button
          key={suggestion}
          type="button"
          onClick={() => handleClick(suggestion)}
          className={`px-2.5 py-1 text-xs rounded-full bg-${color}/10 text-${color} hover:bg-${color}/20 transition-colors border border-${color}/20`}
          style={{
            backgroundColor: `var(--color-${color}, rgba(168, 85, 247, 0.1))`,
            borderColor: `var(--color-${color}, rgba(168, 85, 247, 0.2))`
          }}
        >
          + {suggestion}
        </button>
      ))}
    </div>
  );
}

export function GoalsStep({ profile, onUpdate, onNext, onBack }: GoalsStepProps) {
  return (
    <div className="flex-1 p-6 pb-24 max-w-md mx-auto overflow-y-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-protocol-accent/20">
          <Target className="w-5 h-5 text-protocol-accent" />
        </div>
        <h2 className="text-2xl font-bold text-protocol-text">
          Goals & Vision
        </h2>
      </div>
      <p className="text-protocol-text-muted mb-6">
        Where do you want to go? Your goals shape the path I'll help you walk.
      </p>

      <div className="space-y-6">
        {/* Short-term goals */}
        <div className="card p-4 bg-protocol-surface-light border-l-4 border-protocol-accent">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-protocol-accent" />
            <label className="text-sm font-medium text-protocol-text">
              Next 30 days
            </label>
          </div>
          <p className="text-xs text-protocol-text-muted mb-3">
            What would you like to accomplish in the next month? Tap to add:
          </p>
          <QuickSuggestions
            suggestions={SHORT_TERM_SUGGESTIONS}
            currentValue={profile.shortTermGoals || ''}
            onSelect={(value) => onUpdate({ shortTermGoals: value })}
          />
          <textarea
            value={profile.shortTermGoals || ''}
            onChange={e => onUpdate({ shortTermGoals: e.target.value })}
            placeholder="Or write your own goals..."
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent resize-none text-sm"
          />
        </div>

        {/* Long-term vision */}
        <div className="card p-4 bg-protocol-surface-light border-l-4 border-pink-500">
          <div className="flex items-center gap-2 mb-2">
            <Compass className="w-4 h-4 text-pink-500" />
            <label className="text-sm font-medium text-protocol-text">
              Your Vision
            </label>
          </div>
          <p className="text-xs text-protocol-text-muted mb-3">
            Imagine your future self, fully realized. Tap to add:
          </p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {VISION_SUGGESTIONS.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onUpdate({
                  longTermVision: profile.longTermVision
                    ? `${profile.longTermVision}\n${suggestion}`
                    : suggestion
                })}
                className="px-2.5 py-1 text-xs rounded-full bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition-colors border border-pink-500/20"
              >
                + {suggestion}
              </button>
            ))}
          </div>
          <textarea
            value={profile.longTermVision || ''}
            onChange={e => onUpdate({ longTermVision: e.target.value })}
            placeholder="Or describe your future self in your own words..."
            rows={4}
            className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none text-sm"
          />
        </div>

        {/* Non-negotiables */}
        <div className="card p-4 bg-protocol-surface-light border-l-4 border-protocol-success">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-protocol-success" />
            <label className="text-sm font-medium text-protocol-text">
              Non-Negotiables
            </label>
          </div>
          <p className="text-xs text-protocol-text-muted mb-3">
            What practices will you commit to no matter what? Tap to add:
          </p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {NON_NEGOTIABLE_SUGGESTIONS.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onUpdate({
                  nonNegotiables: profile.nonNegotiables
                    ? `${profile.nonNegotiables}\n${suggestion}`
                    : suggestion
                })}
                className="px-2.5 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20"
              >
                + {suggestion}
              </button>
            ))}
          </div>
          <textarea
            value={profile.nonNegotiables || ''}
            onChange={e => onUpdate({ nonNegotiables: e.target.value })}
            placeholder="Or write your own commitments..."
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-success resize-none text-sm"
          />
        </div>

        {/* Inspirational note */}
        <div className="p-4 rounded-lg bg-gradient-to-r from-protocol-accent/10 to-pink-500/10 border border-protocol-accent/20">
          <p className="text-sm text-protocol-text-muted italic">
            "She who you're becoming already exists within you. The protocol simply helps her emerge."
          </p>
        </div>
      </div>

      <StepNav onNext={onNext} onBack={onBack} />
    </div>
  );
}
