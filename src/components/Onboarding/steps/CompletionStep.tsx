import { UserProfile, SealedLetter } from '../types';
import { Sparkles, Lock, Heart, Target, Shield, ChevronRight, DollarSign } from 'lucide-react';
import type { OnboardingInventoryCategory } from '../../../types/investments';
import { RANGE_MIDPOINTS } from '../../../types/investments';

interface CompletionStepProps {
  profile: Partial<UserProfile>;
  letters: SealedLetter[];
  inventoryData: OnboardingInventoryCategory[];
  onComplete: () => void;
  onBack: () => void;
  isEditMode?: boolean;
}

export function CompletionStep({ profile, letters, inventoryData, onComplete, onBack, isEditMode = false }: CompletionStepProps) {
  const dysphoriaTriggerCount = profile.dysphoriaTriggers?.length || 0;
  const euphoriaTriggerCount = profile.euphoriaTriggers?.length || 0;
  const fearCount = profile.fears?.length || 0;

  // Calculate total invested from inventory data
  const calculateInventoryTotal = (): number => {
    let total = 0;
    inventoryData.forEach(cat => {
      // Add range estimate if present
      if (cat.estimatedRange) {
        total += RANGE_MIDPOINTS[cat.estimatedRange];
      }
      // Add specific items
      cat.specificItems.forEach(item => {
        total += item.amount;
      });
    });
    return total;
  };

  const inventoryTotal = calculateInventoryTotal();
  const categoryCount = inventoryData.length;

  return (
    <div className="flex-1 p-6 pb-8 max-w-md mx-auto overflow-y-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-protocol-accent/20 flex items-center justify-center animate-scale-in">
          <Sparkles className="w-10 h-10 text-protocol-accent" />
        </div>

        <h1 className="text-2xl font-bold text-gradient mb-2">
          {isEditMode ? 'Profile Updated' : "You're Ready"}
        </h1>

        <p className="text-protocol-text-muted">
          {isEditMode
            ? 'Your changes have been saved.'
            : profile.preferredName
              ? `${profile.preferredName}, your protocol is ready.`
              : 'Your protocol has been personalized.'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="space-y-4 mb-8">
        {/* Investment summary - shown prominently if they have investments */}
        {inventoryTotal > 0 && (
          <div className="card p-5 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="font-medium text-protocol-text">Already Invested</span>
            </div>
            <div className="text-center py-3">
              <div className="text-3xl font-bold text-emerald-400 mb-1">
                ${inventoryTotal.toLocaleString()}
              </div>
              <div className="text-sm text-protocol-text-muted">
                across {categoryCount} {categoryCount === 1 ? 'category' : 'categories'}
              </div>
            </div>
            <p className="text-xs text-protocol-text-muted text-center italic mt-2">
              Your past self has been working toward this. Now we make it systematic.
            </p>
          </div>
        )}

        {/* Context captured */}
        <div className="card p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-protocol-accent/20">
              <Target className="w-4 h-4 text-protocol-accent" />
            </div>
            <span className="font-medium text-protocol-text">Context Captured</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 rounded-lg bg-protocol-surface-light">
              <div className="text-lg font-bold text-blue-400">{dysphoriaTriggerCount}</div>
              <div className="text-xs text-protocol-text-muted">Dysphoria areas</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-protocol-surface-light">
              <div className="text-lg font-bold text-pink-400">{euphoriaTriggerCount}</div>
              <div className="text-xs text-protocol-text-muted">Joy sources</div>
            </div>
            <div className="text-center p-2 rounded-lg bg-protocol-surface-light">
              <div className="text-lg font-bold text-amber-400">{fearCount}</div>
              <div className="text-xs text-protocol-text-muted">Fears named</div>
            </div>
          </div>
        </div>

        {/* Letters sealed */}
        {letters.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-pink-500/20">
                <Lock className="w-4 h-4 text-pink-400" />
              </div>
              <div>
                <span className="font-medium text-protocol-text">
                  {letters.length} Letter{letters.length > 1 ? 's' : ''} Sealed
                </span>
                <p className="text-xs text-protocol-text-muted">
                  Hidden away until the right moment
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Journey stage */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-protocol-success/20">
              <Shield className="w-4 h-4 text-protocol-success" />
            </div>
            <div>
              <span className="font-medium text-protocol-text capitalize">
                {profile.journeyStage?.replace('_', ' ') || 'Beginning'}
              </span>
              <p className="text-xs text-protocol-text-muted">
                {profile.monthsOnJourney || 0} months on your journey
              </p>
            </div>
          </div>
        </div>

        {/* Preferences */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-protocol-accent/20">
              <Heart className="w-4 h-4 text-protocol-accent" />
            </div>
            <div>
              <span className="font-medium text-protocol-text capitalize">
                {profile.preferredIntensity || 'Normal'} Intensity
              </span>
              <p className="text-xs text-protocol-text-muted">
                {profile.preferredIntensity === 'gentle' && 'Prioritizing comfort and safety'}
                {profile.preferredIntensity === 'normal' && 'Balanced growth and comfort'}
                {profile.preferredIntensity === 'challenging' && 'Ready to push boundaries'}
                {!profile.preferredIntensity && 'Ready to begin'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* What happens next - only show for new users */}
      {!isEditMode && (
        <div className="mb-8">
          <h3 className="text-sm font-medium text-protocol-text mb-3">What Happens Next</h3>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-protocol-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-protocol-accent">1</span>
              </div>
              <div>
                <p className="text-sm text-protocol-text">Choose your daily intensity</p>
                <p className="text-xs text-protocol-text-muted">Gentle, Normal, or Push Me</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-protocol-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-protocol-accent">2</span>
              </div>
              <div>
                <p className="text-sm text-protocol-text">Complete personalized tasks</p>
                <p className="text-xs text-protocol-text-muted">Based on everything you shared</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-protocol-accent/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-protocol-accent">3</span>
              </div>
              <div>
                <p className="text-sm text-protocol-text">Watch yourself grow</p>
                <p className="text-xs text-protocol-text-muted">Progress that sticks through the ratchet principle</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quote */}
      <div className="p-4 rounded-lg bg-gradient-to-r from-protocol-accent/10 to-pink-500/10 border border-protocol-accent/20 mb-8">
        <p className="text-sm text-protocol-text-muted italic text-center">
          "The woman you're becoming is already here.
          <br />
          We're just helping her emerge."
        </p>
      </div>

      {/* Action buttons */}
      <div className="space-y-3">
        <button
          onClick={onComplete}
          className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium flex items-center justify-center gap-2 hover:bg-protocol-accent/90 transition-colors"
        >
          {isEditMode ? 'Save Changes' : 'Begin The Protocol'}
          <ChevronRight className="w-4 h-4" />
        </button>

        <button
          onClick={onBack}
          className="w-full py-3 text-sm text-protocol-text-muted hover:text-protocol-text transition-colors"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
