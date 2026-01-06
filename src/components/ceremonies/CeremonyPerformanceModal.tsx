/**
 * Ceremony Performance Modal
 * Full-screen immersive ceremony experience
 */

import { useState, useEffect } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
// X is used for close button in performing phase
import { useBambiMode } from '../../context/BambiModeContext';
import { CeremonyStepRenderer } from './CeremonyStepRenderer';
import { CEREMONY_THEMES } from '../../types/ceremonies';
import type { UserCeremony, CeremonyStep } from '../../types/ceremonies';

interface CeremonyPerformanceModalProps {
  ceremony: UserCeremony;
  steps: CeremonyStep[];
  currentStep: number;
  onCompleteStep: (response?: string) => Promise<void>;
  onFinish: () => Promise<void>;
  onCancel: () => void;
}

type Phase = 'intro' | 'warning' | 'performing' | 'completing' | 'complete';

export function CeremonyPerformanceModal({
  ceremony,
  steps,
  currentStep,
  onCompleteStep,
  onFinish,
  onCancel,
}: CeremonyPerformanceModalProps) {
  const { isBambiMode } = useBambiMode();
  const [phase, setPhase] = useState<Phase>('intro');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get theme
  const themeName = getThemeName(ceremony.ceremony.name);
  const theme = CEREMONY_THEMES[themeName] || CEREMONY_THEMES.naming;

  // Auto-advance from intro
  useEffect(() => {
    if (phase === 'intro') {
      const timer = setTimeout(() => setPhase('warning'), 2000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // Handle step completion
  const handleStepComplete = async (response?: string) => {
    setIsProcessing(true);
    setError(null);

    try {
      await onCompleteStep(response);

      // Check if this was the last step
      if (currentStep >= steps.length - 1) {
        setPhase('completing');
        await onFinish();
        setPhase('complete');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete step');
    } finally {
      setIsProcessing(false);
    }
  };

  // Begin ceremony after warning
  const handleBegin = () => {
    setPhase('performing');
  };

  // Render based on phase
  const renderPhase = () => {
    switch (phase) {
      case 'intro':
        return (
          <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
            <h1 className={`text-4xl font-bold mb-4 ${
              isBambiMode ? theme.bambiText : theme.text
            }`}>
              {ceremony.ceremony.name}
            </h1>
            <p className={`text-lg ${
              isBambiMode ? theme.bambiText + '/70' : theme.text + '/70'
            }`}>
              The ceremony is about to begin...
            </p>
          </div>
        );

      case 'warning':
        return (
          <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
            <div className={`p-4 rounded-full mb-6 ${
              isBambiMode ? 'bg-white/30' : 'bg-black/30'
            }`}>
              <AlertTriangle className={`w-16 h-16 ${
                isBambiMode ? theme.bambiText : theme.text
              }`} />
            </div>

            <h2 className={`text-2xl font-bold mb-4 ${
              isBambiMode ? theme.bambiText : theme.text
            }`}>
              Point of No Return
            </h2>

            <p className={`text-lg mb-6 max-w-sm ${
              isBambiMode ? theme.bambiText + '/80' : theme.text + '/80'
            }`}>
              {ceremony.ceremony.description}
            </p>

            <div className={`p-4 rounded-xl mb-8 ${
              isBambiMode ? 'bg-white/20' : 'bg-black/20'
            }`}>
              <p className={`text-sm font-medium ${
                isBambiMode ? theme.bambiText : theme.text
              }`}>
                Irreversible marker:
              </p>
              <p className={`text-base mt-1 ${
                isBambiMode ? theme.bambiText + '/80' : theme.text + '/80'
              }`}>
                {ceremony.ceremony.irreversibleMarker}
              </p>
            </div>

            <p className={`text-xs mb-8 ${
              isBambiMode ? theme.bambiText + '/50' : theme.text + '/50'
            }`}>
              Once begun, this ceremony cannot be undone.
            </p>

            <div className="flex gap-4">
              <button
                onClick={onCancel}
                className={`px-6 py-3 rounded-xl font-medium transition-colors ${
                  isBambiMode
                    ? 'bg-white/30 text-pink-700 hover:bg-white/40'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                I'm not ready
              </button>
              <button
                onClick={handleBegin}
                className={`px-6 py-3 rounded-xl font-semibold transition-colors ${
                  isBambiMode
                    ? 'bg-pink-500 text-white hover:bg-pink-600'
                    : 'bg-white text-black hover:bg-white/90'
                }`}
              >
                Begin Ceremony
              </button>
            </div>
          </div>
        );

      case 'performing':
        return (
          <div className="min-h-screen p-6 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <h2 className={`text-lg font-semibold ${
                isBambiMode ? theme.bambiText : theme.text
              }`}>
                {ceremony.ceremony.name}
              </h2>
              <button
                onClick={onCancel}
                className={`p-2 rounded-lg transition-colors ${
                  isBambiMode ? 'hover:bg-white/20' : 'hover:bg-black/20'
                }`}
              >
                <X className={`w-5 h-5 ${
                  isBambiMode ? theme.bambiText : theme.text
                }`} />
              </button>
            </div>

            {/* Progress bar */}
            <div className="mb-8">
              <div className={`h-2 rounded-full ${
                isBambiMode ? 'bg-white/20' : 'bg-black/20'
              }`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isBambiMode ? 'bg-pink-500' : 'bg-white'
                  }`}
                  style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Current step */}
            <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
              {steps[currentStep] && (
                <CeremonyStepRenderer
                  step={steps[currentStep]}
                  stepNumber={currentStep + 1}
                  totalSteps={steps.length}
                  themeAccent={isBambiMode ? theme.bambiText : theme.accent}
                  themeText={isBambiMode ? theme.bambiText : theme.text}
                  onComplete={handleStepComplete}
                  isLastStep={currentStep >= steps.length - 1}
                />
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 p-4 rounded-xl bg-red-500/20 text-red-200 text-center">
                {error}
              </div>
            )}

            {/* Processing overlay */}
            {isProcessing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
          </div>
        );

      case 'completing':
        return (
          <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
            <Loader2 className={`w-12 h-12 mb-4 animate-spin ${
              isBambiMode ? theme.bambiText : theme.text
            }`} />
            <p className={`text-lg ${
              isBambiMode ? theme.bambiText : theme.text
            }`}>
              Sealing the ceremony...
            </p>
          </div>
        );

      case 'complete':
        return (
          <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
              isBambiMode ? 'bg-pink-500' : 'bg-white'
            }`}>
              <span className="text-4xl">✓</span>
            </div>

            <h2 className={`text-3xl font-bold mb-4 ${
              isBambiMode ? theme.bambiText : theme.text
            }`}>
              {ceremony.ceremony.name}
            </h2>

            <p className={`text-xl mb-2 ${
              isBambiMode ? theme.bambiText : theme.text
            }`}>
              Complete
            </p>

            <p className={`text-sm mb-8 ${
              isBambiMode ? theme.bambiText + '/60' : theme.text + '/60'
            }`}>
              {ceremony.ceremony.irreversibleMarker}
            </p>

            <p className={`text-xs italic mb-8 ${
              isBambiMode ? theme.bambiText + '/40' : theme.text + '/40'
            }`}>
              There is no going back.
            </p>

            <button
              onClick={onCancel}
              className={`px-8 py-3 rounded-xl font-semibold transition-colors ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-white text-black hover:bg-white/90'
              }`}
            >
              Continue
            </button>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${
        isBambiMode ? theme.bambiGradient : theme.gradient
      }`} />

      {/* Content */}
      <div className="relative z-10">
        {renderPhase()}
      </div>
    </div>
  );
}

// Helper to get theme name from ceremony name
function getThemeName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('naming')) return 'naming';
  if (lower.includes('covenant')) return 'covenant';
  if (lower.includes('surrender')) return 'surrender';
  if (lower.includes('becoming')) return 'becoming';
  return 'naming';
}
