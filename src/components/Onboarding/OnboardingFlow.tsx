import { useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { WelcomeStep } from './steps/WelcomeStep';
import { BasicInfoStep } from './steps/BasicInfoStep';
import { JourneyStep } from './steps/JourneyStep';
import { PartnerStep } from './steps/PartnerStep';
import { DysphoriaStep } from './steps/DysphoriaStep';
import { EuphoriaStep } from './steps/EuphoriaStep';
import { FearsStep } from './steps/FearsStep';
import { GoalsStep } from './steps/GoalsStep';
import { InventoryStep } from './steps/InventoryStep';
import { PreferencesStep } from './steps/PreferencesStep';
import { ScheduleStep } from './steps/ScheduleStep';
import { LetterStep } from './steps/LetterStep';
import { CompletionStep } from './steps/CompletionStep';
import { UserProfile, SealedLetter } from './types';
import type { OnboardingInventoryCategory } from '../../types/investments';

interface OnboardingFlowProps {
  onComplete: (profile: UserProfile, letters: SealedLetter[]) => void;
  initialProfile?: Partial<UserProfile>;
  isEditMode?: boolean;
  onCancel?: () => void;
}

const STEPS = [
  'welcome',
  'basic',
  'journey',
  'partner',
  'dysphoria',
  'euphoria',
  'fears',
  'goals',
  'inventory',
  'preferences',
  'schedule',
  'letter',
  'complete'
] as const;

type Step = typeof STEPS[number];

const STEP_TITLES: Record<Step, string> = {
  welcome: 'Welcome',
  basic: 'About You',
  journey: 'Your Journey',
  partner: 'Support System',
  dysphoria: 'Dysphoria Map',
  euphoria: 'Euphoria Map',
  fears: 'Fears & Resistance',
  goals: 'Goals & Vision',
  inventory: 'Your Investments',
  preferences: 'Preferences',
  schedule: 'Your Schedule',
  letter: 'Letter to Future Self',
  complete: 'Ready to Begin'
};

export function OnboardingFlow({ onComplete, initialProfile, isEditMode = false, onCancel }: OnboardingFlowProps) {
  // In edit mode, skip welcome and start at basic info
  const [currentStep, setCurrentStep] = useState<Step>(isEditMode ? 'basic' : 'welcome');
  const [profile, setProfile] = useState<Partial<UserProfile>>(initialProfile || {});
  const [letters, setLetters] = useState<SealedLetter[]>([]);
  const [inventoryData, setInventoryData] = useState<OnboardingInventoryCategory[]>([]);

  const currentIndex = STEPS.indexOf(currentStep);
  const progress = ((currentIndex) / (STEPS.length - 1)) * 100;

  const updateProfile = (updates: Partial<UserProfile>) => {
    setProfile(prev => ({ ...prev, ...updates }));
  };

  const addLetter = (letter: SealedLetter) => {
    setLetters(prev => [...prev, letter]);
  };

  const goNext = () => {
    let nextIndex = currentIndex + 1;
    // In edit mode, skip the letter step (they already have letters)
    if (isEditMode && STEPS[nextIndex] === 'letter') {
      nextIndex++;
    }
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  };

  const goBack = () => {
    let prevIndex = currentIndex - 1;
    // In edit mode, skip the letter step when going back too
    if (isEditMode && STEPS[prevIndex] === 'letter') {
      prevIndex--;
    }
    // In edit mode, if we're at the first editable step, cancel instead
    if (isEditMode && prevIndex < STEPS.indexOf('basic')) {
      onCancel?.();
      return;
    }
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  };

  const handleComplete = () => {
    onComplete(profile as UserProfile, letters);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return <WelcomeStep onNext={goNext} />;
      case 'basic':
        return <BasicInfoStep profile={profile} onUpdate={updateProfile} onNext={goNext} onBack={goBack} />;
      case 'journey':
        return <JourneyStep profile={profile} onUpdate={updateProfile} onNext={goNext} onBack={goBack} />;
      case 'partner':
        return <PartnerStep profile={profile} onUpdate={updateProfile} onNext={goNext} onBack={goBack} />;
      case 'dysphoria':
        return <DysphoriaStep profile={profile} onUpdate={updateProfile} onNext={goNext} onBack={goBack} />;
      case 'euphoria':
        return <EuphoriaStep profile={profile} onUpdate={updateProfile} onNext={goNext} onBack={goBack} />;
      case 'fears':
        return <FearsStep profile={profile} onUpdate={updateProfile} onNext={goNext} onBack={goBack} />;
      case 'goals':
        return <GoalsStep profile={profile} onUpdate={updateProfile} onNext={goNext} onBack={goBack} />;
      case 'inventory':
        return (
          <InventoryStep
            profile={profile}
            onUpdate={updateProfile}
            onNext={goNext}
            onBack={goBack}
            onSaveInventory={setInventoryData}
          />
        );
      case 'preferences':
        return <PreferencesStep profile={profile} onUpdate={updateProfile} onNext={goNext} onBack={goBack} />;
      case 'schedule':
        return <ScheduleStep profile={profile} onUpdate={updateProfile} onNext={goNext} onBack={goBack} />;
      case 'letter':
        return <LetterStep onAddLetter={addLetter} onNext={goNext} onBack={goBack} />;
      case 'complete':
        return (
          <CompletionStep
            profile={profile}
            letters={letters}
            inventoryData={inventoryData}
            onComplete={handleComplete}
            onBack={goBack}
            isEditMode={isEditMode}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-protocol-bg flex flex-col">
      {/* Progress bar */}
      {currentStep !== 'welcome' && currentStep !== 'complete' && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <div className="h-1 bg-protocol-surface">
            <div
              className="h-full bg-protocol-accent transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="px-4 py-2 flex items-center justify-between bg-protocol-bg/80 backdrop-blur-sm">
            <span className="text-xs text-protocol-text-muted">
              {STEP_TITLES[currentStep]}
            </span>
            <span className="text-xs text-protocol-text-muted">
              {currentIndex} of {STEPS.length - 2}
            </span>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col pt-12">
        {renderStep()}
      </div>
    </div>
  );
}

// Reusable navigation buttons
interface StepNavProps {
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
}

export function StepNav({ onNext, onBack, nextLabel = 'Continue', nextDisabled = false, showBack = true }: StepNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-protocol-bg/80 backdrop-blur-sm border-t border-protocol-border">
      <div className="max-w-md mx-auto flex gap-3">
        {showBack && onBack && (
          <button
            onClick={onBack}
            className="flex-shrink-0 p-3 rounded-lg border border-protocol-border hover:bg-protocol-surface transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-protocol-text-muted" />
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            disabled={nextDisabled}
            className={`flex-1 py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
              nextDisabled
                ? 'bg-protocol-surface text-protocol-text-muted cursor-not-allowed'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
            }`}
          >
            {nextLabel}
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
