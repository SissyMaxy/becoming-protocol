import { useState } from 'react';
import { StepNav } from '../OnboardingFlow';
import { UserProfile, AgeRange } from '../types';

interface BasicInfoStepProps {
  profile: Partial<UserProfile>;
  onUpdate: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

const AGE_RANGES: { value: AgeRange; label: string }[] = [
  { value: '18-24', label: '18-24' },
  { value: '25-34', label: '25-34' },
  { value: '35-44', label: '35-44' },
  { value: '45-54', label: '45-54' },
  { value: '55+', label: '55+' }
];

const PRONOUNS_OPTIONS = [
  'she/her',
  'they/them',
  'she/they',
  'he/him',
  'he/they',
  'any pronouns'
];

export function BasicInfoStep({ profile, onUpdate, onNext, onBack }: BasicInfoStepProps) {
  const [skippedName, setSkippedName] = useState(profile.preferredName === null);

  const handleSkipName = () => {
    setSkippedName(true);
    onUpdate({ preferredName: undefined }); // Will be saved as null
  };

  const handleNameChange = (name: string) => {
    setSkippedName(false);
    onUpdate({ preferredName: name || undefined });
  };

  return (
    <div className="flex-1 p-6 pb-24 max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-protocol-text mb-2">
        About You
      </h2>
      <p className="text-protocol-text-muted mb-6">
        What should I call you? These basics help me personalize your experience.
      </p>

      <div className="space-y-6">
        {/* Preferred Name */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-2">
            What name would you like me to use?
          </label>

          {!skippedName && (
            <>
              <input
                type="text"
                value={profile.preferredName || ''}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="Your preferred name"
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent"
              />
              <p className="text-xs text-protocol-text-muted mt-1">
                This can be your chosen name, a nickname, or whatever feels right
              </p>
            </>
          )}

          {/* Not ready for name toggle */}
          <label className="flex items-center gap-3 mt-3 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={skippedName}
                onChange={e => {
                  if (e.target.checked) {
                    handleSkipName();
                  } else {
                    setSkippedName(false);
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-protocol-surface-light border border-protocol-border rounded-full peer-checked:bg-protocol-accent peer-checked:border-protocol-accent transition-colors" />
              <div className="absolute left-1 top-1 w-4 h-4 bg-protocol-text-muted rounded-full transition-all peer-checked:translate-x-4 peer-checked:bg-white" />
            </div>
            <span className="text-sm text-protocol-text-muted group-hover:text-protocol-text transition-colors">
              I'm not ready for a name yet
            </span>
          </label>

          {skippedName && (
            <p className="text-xs text-protocol-text-muted mt-2 ml-[52px]">
              No problem! You can add one anytime in settings.
            </p>
          )}
        </div>

        {/* Pronouns */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-2">
            Your pronouns
          </label>
          <div className="flex flex-wrap gap-2">
            {PRONOUNS_OPTIONS.map(pronoun => (
              <button
                key={pronoun}
                onClick={() => onUpdate({ pronouns: pronoun })}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  profile.pronouns === pronoun
                    ? 'bg-protocol-accent text-white'
                    : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-protocol-accent'
                }`}
              >
                {pronoun}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={!PRONOUNS_OPTIONS.includes(profile.pronouns || '') ? profile.pronouns || '' : ''}
            onChange={e => onUpdate({ pronouns: e.target.value })}
            placeholder="Or type your own..."
            className="w-full mt-2 px-4 py-2 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent text-sm"
          />
        </div>

        {/* Age Range */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-2">
            Age range
          </label>
          <div className="flex flex-wrap gap-2">
            {AGE_RANGES.map(range => (
              <button
                key={range.value}
                onClick={() => onUpdate({ ageRange: range.value })}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  profile.ageRange === range.value
                    ? 'bg-protocol-accent text-white'
                    : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-protocol-accent'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-protocol-text-muted mt-2">
            This helps tailor practices to your life stage
          </p>
        </div>
      </div>

      <StepNav onNext={onNext} onBack={onBack} />
    </div>
  );
}
