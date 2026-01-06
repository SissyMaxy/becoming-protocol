import { StepNav } from '../OnboardingFlow';
import { UserProfile, JourneyStage, LivingSituation, OutLevel } from '../types';
import { Compass, MapPin, Eye } from 'lucide-react';

interface JourneyStepProps {
  profile: Partial<UserProfile>;
  onUpdate: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

const JOURNEY_STAGES: { value: JourneyStage; label: string; description: string }[] = [
  { value: 'exploring', label: 'Exploring', description: 'Questioning, learning, figuring things out' },
  { value: 'decided', label: 'Decided', description: 'Know who I am, preparing to take steps' },
  { value: 'started', label: 'Started', description: 'Actively transitioning, early stages' },
  { value: 'established', label: 'Established', description: 'Living authentically, refining my practice' }
];

const LIVING_SITUATIONS: { value: LivingSituation; label: string }[] = [
  { value: 'alone', label: 'Living alone' },
  { value: 'with_partner', label: 'With partner/spouse' },
  { value: 'with_family', label: 'With family' },
  { value: 'with_roommates', label: 'With roommates' },
  { value: 'other', label: 'Other' }
];

const OUT_LEVELS: { value: OutLevel; label: string; description: string }[] = [
  { value: 'not_out', label: 'Not out', description: 'Haven\'t told anyone yet' },
  { value: 'few_people', label: 'A few people', description: 'Close friends or family know' },
  { value: 'mostly_out', label: 'Mostly out', description: 'Most important people know' },
  { value: 'fully_out', label: 'Fully out', description: 'Living openly' }
];

const JOURNEY_DURATIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Just starting' },
  { value: 3, label: '< 6 months' },
  { value: 9, label: '6mo - 1 year' },
  { value: 18, label: '1-2 years' },
  { value: 36, label: '2-5 years' },
  { value: 60, label: '5+ years' }
];

export function JourneyStep({ profile, onUpdate, onNext, onBack }: JourneyStepProps) {
  return (
    <div className="flex-1 p-6 pb-24 max-w-md mx-auto overflow-y-auto">
      <h2 className="text-2xl font-bold text-protocol-text mb-2">
        Your Journey
      </h2>
      <p className="text-protocol-text-muted mb-6">
        Where are you in your journey? This helps me understand your context.
      </p>

      <div className="space-y-6">
        {/* Journey Stage */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Compass className="w-4 h-4 text-protocol-accent" />
            <label className="text-sm font-medium text-protocol-text">
              Where are you in your journey?
            </label>
          </div>
          <div className="space-y-2">
            {JOURNEY_STAGES.map(stage => (
              <button
                key={stage.value}
                onClick={() => onUpdate({ journeyStage: stage.value })}
                className={`w-full p-4 rounded-lg text-left transition-all ${
                  profile.journeyStage === stage.value
                    ? 'bg-protocol-accent/20 border-2 border-protocol-accent'
                    : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent/50'
                }`}
              >
                <div className="font-medium text-protocol-text">{stage.label}</div>
                <div className="text-sm text-protocol-text-muted">{stage.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Months on journey */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-3">
            How long have you been on this journey?
          </label>
          <div className="flex flex-wrap gap-2">
            {JOURNEY_DURATIONS.map(duration => (
              <button
                key={duration.value}
                onClick={() => onUpdate({ monthsOnJourney: duration.value })}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  profile.monthsOnJourney === duration.value
                    ? 'bg-protocol-accent text-white'
                    : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-protocol-accent'
                }`}
              >
                {duration.label}
              </button>
            ))}
          </div>
        </div>

        {/* Living Situation */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-protocol-accent" />
            <label className="text-sm font-medium text-protocol-text">
              Living situation
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {LIVING_SITUATIONS.map(situation => (
              <button
                key={situation.value}
                onClick={() => onUpdate({ livingSituation: situation.value })}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  profile.livingSituation === situation.value
                    ? 'bg-protocol-accent text-white'
                    : 'bg-protocol-surface border border-protocol-border text-protocol-text hover:border-protocol-accent'
                }`}
              >
                {situation.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-protocol-text-muted mt-2">
            This affects what practices are feasible for you
          </p>
        </div>

        {/* Out Level */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-protocol-accent" />
            <label className="text-sm font-medium text-protocol-text">
              How out are you?
            </label>
          </div>
          <div className="space-y-2">
            {OUT_LEVELS.map(level => (
              <button
                key={level.value}
                onClick={() => onUpdate({ outLevel: level.value })}
                className={`w-full p-3 rounded-lg text-left transition-all ${
                  profile.outLevel === level.value
                    ? 'bg-protocol-accent/20 border-2 border-protocol-accent'
                    : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent/50'
                }`}
              >
                <div className="font-medium text-protocol-text text-sm">{level.label}</div>
                <div className="text-xs text-protocol-text-muted">{level.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <StepNav onNext={onNext} onBack={onBack} />
    </div>
  );
}
