import { useState } from 'react';
import { StepNav } from '../OnboardingFlow';
import { UserProfile, PartnerSupport } from '../types';
import { Heart, HeartOff } from 'lucide-react';

interface PartnerStepProps {
  profile: Partial<UserProfile>;
  onUpdate: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

const SUPPORT_LEVELS: { value: PartnerSupport; label: string; emoji: string }[] = [
  { value: 'very_supportive', label: 'Very supportive', emoji: '💕' },
  { value: 'supportive', label: 'Supportive', emoji: '💜' },
  { value: 'neutral', label: 'Neutral', emoji: '😐' },
  { value: 'unsupportive', label: 'Unsupportive', emoji: '😔' },
  { value: 'doesnt_know', label: "Doesn't know yet", emoji: '🤫' }
];

export function PartnerStep({ profile, onUpdate, onNext, onBack }: PartnerStepProps) {
  const [hasPartner, setHasPartner] = useState(profile.hasPartner ?? false);

  const handlePartnerToggle = (value: boolean) => {
    setHasPartner(value);
    onUpdate({ hasPartner: value });
    if (!value) {
      onUpdate({ partnerName: undefined, partnerSupportive: undefined, partnerNotes: undefined });
    }
  };

  return (
    <div className="flex-1 p-6 pb-24 max-w-md mx-auto overflow-y-auto">
      <h2 className="text-2xl font-bold text-protocol-text mb-2">
        Support System
      </h2>
      <p className="text-protocol-text-muted mb-6">
        Having a supportive partner can change everything. Let me know about your situation.
      </p>

      <div className="space-y-6">
        {/* Has Partner Toggle */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-3">
            Do you have a partner or spouse?
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handlePartnerToggle(true)}
              className={`p-4 rounded-lg flex flex-col items-center gap-2 transition-all ${
                hasPartner
                  ? 'bg-pink-500/20 border-2 border-pink-500'
                  : 'bg-protocol-surface border border-protocol-border hover:border-pink-500/50'
              }`}
            >
              <Heart className={`w-6 h-6 ${hasPartner ? 'text-pink-500' : 'text-protocol-text-muted'}`} />
              <span className="font-medium text-protocol-text">Yes</span>
            </button>
            <button
              onClick={() => handlePartnerToggle(false)}
              className={`p-4 rounded-lg flex flex-col items-center gap-2 transition-all ${
                !hasPartner
                  ? 'bg-protocol-accent/20 border-2 border-protocol-accent'
                  : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent/50'
              }`}
            >
              <HeartOff className={`w-6 h-6 ${!hasPartner ? 'text-protocol-accent' : 'text-protocol-text-muted'}`} />
              <span className="font-medium text-protocol-text">No</span>
            </button>
          </div>
        </div>

        {hasPartner && (
          <>
            {/* Partner Name */}
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-2">
                Their name (optional)
              </label>
              <input
                type="text"
                value={profile.partnerName || ''}
                onChange={e => onUpdate({ partnerName: e.target.value })}
                placeholder="Partner's name"
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent"
              />
              <p className="text-xs text-protocol-text-muted mt-1">
                Helps personalize messages that involve your relationship
              </p>
            </div>

            {/* Support Level */}
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-3">
                How supportive are they of your journey?
              </label>
              <div className="space-y-2">
                {SUPPORT_LEVELS.map(level => (
                  <button
                    key={level.value}
                    onClick={() => onUpdate({ partnerSupportive: level.value })}
                    className={`w-full p-3 rounded-lg flex items-center gap-3 transition-all ${
                      profile.partnerSupportive === level.value
                        ? 'bg-protocol-accent/20 border-2 border-protocol-accent'
                        : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent/50'
                    }`}
                  >
                    <span className="text-xl">{level.emoji}</span>
                    <span className="font-medium text-protocol-text">{level.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Partner Notes */}
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-2">
                Anything else about your partner? (optional)
              </label>
              <textarea
                value={profile.partnerNotes || ''}
                onChange={e => onUpdate({ partnerNotes: e.target.value })}
                placeholder="E.g., 'They're supportive but uncomfortable seeing me practice voice' or 'We're working through this together'"
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent resize-none"
              />
            </div>
          </>
        )}

        {!hasPartner && (
          <div className="card p-4 bg-protocol-surface-light">
            <p className="text-sm text-protocol-text-muted">
              That's perfectly okay! Many people navigate this journey solo or find community in other ways.
              The protocol adapts to support you wherever you are.
            </p>
          </div>
        )}
      </div>

      <StepNav onNext={onNext} onBack={onBack} />
    </div>
  );
}
