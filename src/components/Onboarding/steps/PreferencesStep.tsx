import { StepNav } from '../OnboardingFlow';
import { UserProfile, PreferredIntensity, VoiceFocusLevel, SocialComfort } from '../types';
import { Zap, Mic, Users } from 'lucide-react';

interface PreferencesStepProps {
  profile: Partial<UserProfile>;
  onUpdate: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

const INTENSITY_OPTIONS: { value: PreferredIntensity; label: string; description: string; emoji: string }[] = [
  { value: 'gentle', label: 'Gentle', description: 'Slow and steady, prioritize comfort', emoji: '🌸' },
  { value: 'normal', label: 'Balanced', description: 'Mix of comfort and challenge', emoji: '⚖️' },
  { value: 'challenging', label: 'Push Me', description: 'I want to grow fast, challenge welcome', emoji: '🔥' }
];

const VOICE_OPTIONS: { value: VoiceFocusLevel; label: string; description: string }[] = [
  { value: 'not_now', label: 'Not right now', description: 'Focus on other areas first' },
  { value: 'gentle', label: 'Gentle', description: 'Small exercises when I\'m ready' },
  { value: 'moderate', label: 'Moderate', description: 'Regular voice work' },
  { value: 'intensive', label: 'Intensive', description: 'Voice is a priority for me' }
];

const SOCIAL_OPTIONS: { value: SocialComfort; label: string; emoji: string }[] = [
  { value: 'very_anxious', label: 'Very anxious', emoji: '😰' },
  { value: 'nervous', label: 'Nervous but trying', emoji: '😬' },
  { value: 'comfortable', label: 'Mostly comfortable', emoji: '😊' },
  { value: 'confident', label: 'Confident', emoji: '💪' }
];

export function PreferencesStep({ profile, onUpdate, onNext, onBack }: PreferencesStepProps) {
  return (
    <div className="flex-1 p-6 pb-24 max-w-md mx-auto overflow-y-auto">
      <h2 className="text-2xl font-bold text-protocol-text mb-2">
        Preferences
      </h2>
      <p className="text-protocol-text-muted mb-6">
        How should I approach your practice? These settings shape your daily experience.
      </p>

      <div className="space-y-6">
        {/* Default Intensity */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-protocol-accent" />
            <label className="text-sm font-medium text-protocol-text">
              Default intensity level
            </label>
          </div>
          <div className="space-y-2">
            {INTENSITY_OPTIONS.map(option => (
              <button
                key={option.value}
                onClick={() => onUpdate({ preferredIntensity: option.value })}
                className={`w-full p-4 rounded-lg text-left transition-all ${
                  profile.preferredIntensity === option.value
                    ? 'bg-protocol-accent/20 border-2 border-protocol-accent'
                    : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{option.emoji}</span>
                  <div>
                    <div className="font-medium text-protocol-text">{option.label}</div>
                    <div className="text-sm text-protocol-text-muted">{option.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <p className="text-xs text-protocol-text-muted mt-2">
            You can adjust this day-by-day, this is just your default
          </p>
        </div>

        {/* Voice Focus */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Mic className="w-4 h-4 text-protocol-accent" />
            <label className="text-sm font-medium text-protocol-text">
              Voice practice focus
            </label>
          </div>
          <div className="space-y-2">
            {VOICE_OPTIONS.map(option => (
              <button
                key={option.value}
                onClick={() => onUpdate({ voiceFocusLevel: option.value })}
                className={`w-full p-3 rounded-lg text-left transition-all ${
                  profile.voiceFocusLevel === option.value
                    ? 'bg-protocol-accent/20 border-2 border-protocol-accent'
                    : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent/50'
                }`}
              >
                <div className="font-medium text-protocol-text text-sm">{option.label}</div>
                <div className="text-xs text-protocol-text-muted">{option.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Social Comfort */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-protocol-accent" />
            <label className="text-sm font-medium text-protocol-text">
              Social comfort level
            </label>
          </div>
          <p className="text-xs text-protocol-text-muted mb-3">
            How comfortable are you practicing feminization in social settings?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SOCIAL_OPTIONS.map(option => (
              <button
                key={option.value}
                onClick={() => onUpdate({ socialComfort: option.value })}
                className={`p-3 rounded-lg flex flex-col items-center gap-1 transition-all ${
                  profile.socialComfort === option.value
                    ? 'bg-protocol-accent/20 border-2 border-protocol-accent'
                    : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent/50'
                }`}
              >
                <span className="text-xl">{option.emoji}</span>
                <span className="text-sm font-medium text-protocol-text">{option.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-protocol-text-muted mt-2">
            This affects how many public/social tasks I'll suggest
          </p>
        </div>
      </div>

      <StepNav onNext={onNext} onBack={onBack} />
    </div>
  );
}
