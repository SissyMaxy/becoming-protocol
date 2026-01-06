/**
 * Ceremony Step Renderer
 * Renders different step types for ceremony performance
 */

import { useState } from 'react';
import { Pen, Mic, Trash2, FileSignature, Camera, Video, Check } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { CeremonyStep } from '../../types/ceremonies';

interface CeremonyStepRendererProps {
  step: CeremonyStep;
  stepNumber: number;
  totalSteps: number;
  themeAccent: string;
  themeText: string;
  onComplete: (response?: string) => void;
  isLastStep: boolean;
}

export function CeremonyStepRenderer({
  step,
  stepNumber,
  totalSteps,
  themeAccent,
  themeText,
  onComplete,
  isLastStep,
}: CeremonyStepRendererProps) {
  const { isBambiMode } = useBambiMode();
  const [response, setResponse] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const handleComplete = () => {
    if (step.type === 'write') {
      onComplete(response);
    } else {
      onComplete();
    }
  };

  const canProceed = () => {
    switch (step.type) {
      case 'write':
        return response.trim().length > 0;
      case 'say':
      case 'confirm':
      case 'destroy':
      case 'sign':
      case 'photo':
      case 'record':
        return confirmed;
      default:
        return true;
    }
  };

  const renderStepContent = () => {
    switch (step.type) {
      case 'write':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Pen className={`w-6 h-6 ${themeAccent}`} />
              <p className={`text-lg font-medium ${themeText}`}>
                {step.prompt}
              </p>
            </div>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder={step.placeholder || 'Write here...'}
              className={`w-full h-32 p-4 rounded-xl border-2 resize-none transition-colors ${
                isBambiMode
                  ? 'bg-white/50 border-pink-200 focus:border-pink-400 text-pink-900 placeholder:text-pink-400'
                  : 'bg-black/20 border-white/20 focus:border-white/40 text-white placeholder:text-white/40'
              } focus:outline-none`}
            />
          </div>
        );

      case 'say':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <Mic className={`w-6 h-6 ${themeAccent}`} />
              <p className={`text-sm ${themeText}/70`}>Say aloud:</p>
            </div>
            <p className={`text-2xl font-bold text-center py-6 ${themeText}`}>
              "{step.text}"
            </p>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="sr-only peer"
              />
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                confirmed
                  ? isBambiMode ? 'bg-pink-500 border-pink-500' : 'bg-white border-white'
                  : isBambiMode ? 'border-pink-300' : 'border-white/40'
              }`}>
                {confirmed && <Check className={`w-4 h-4 ${
                  isBambiMode ? 'text-white' : 'text-black'
                }`} />}
              </div>
              <span className={`text-sm ${themeText}`}>{step.confirmText}</span>
            </label>
          </div>
        );

      case 'destroy':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <Trash2 className={`w-6 h-6 ${themeAccent}`} />
              <p className={`text-sm ${themeText}/70`}>Destroy:</p>
            </div>
            <div className={`p-6 rounded-xl text-center ${
              isBambiMode ? 'bg-white/30' : 'bg-black/30'
            }`}>
              <p className={`text-xl font-bold ${themeText}`}>
                {step.item}
              </p>
              <p className={`text-sm mt-2 ${themeText}/60`}>
                {step.method}
              </p>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="sr-only peer"
              />
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                confirmed
                  ? isBambiMode ? 'bg-pink-500 border-pink-500' : 'bg-white border-white'
                  : isBambiMode ? 'border-pink-300' : 'border-white/40'
              }`}>
                {confirmed && <Check className={`w-4 h-4 ${
                  isBambiMode ? 'text-white' : 'text-black'
                }`} />}
              </div>
              <span className={`text-sm ${themeText}`}>I have destroyed it</span>
            </label>
          </div>
        );

      case 'sign':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <FileSignature className={`w-6 h-6 ${themeAccent}`} />
              <p className={`text-sm ${themeText}/70`}>Sign the {step.document}:</p>
            </div>
            <div className={`p-6 rounded-xl border-2 border-dashed text-center ${
              isBambiMode ? 'border-pink-300 bg-white/20' : 'border-white/30 bg-black/20'
            }`}>
              <p className={`text-lg ${themeText}`}>
                [Signature Area]
              </p>
              <p className={`text-xs mt-2 ${themeText}/50`}>
                Sign your new name here
              </p>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="sr-only peer"
              />
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                confirmed
                  ? isBambiMode ? 'bg-pink-500 border-pink-500' : 'bg-white border-white'
                  : isBambiMode ? 'border-pink-300' : 'border-white/40'
              }`}>
                {confirmed && <Check className={`w-4 h-4 ${
                  isBambiMode ? 'text-white' : 'text-black'
                }`} />}
              </div>
              <span className={`text-sm ${themeText}`}>I have signed</span>
            </label>
          </div>
        );

      case 'photo':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <Camera className={`w-6 h-6 ${themeAccent}`} />
              <p className={`text-sm ${themeText}/70`}>Take a photo:</p>
            </div>
            <div className={`p-8 rounded-xl border-2 border-dashed text-center ${
              isBambiMode ? 'border-pink-300 bg-white/20' : 'border-white/30 bg-black/20'
            }`}>
              <Camera className={`w-12 h-12 mx-auto mb-3 ${themeText}/30`} />
              <p className={`text-sm ${themeText}`}>
                {step.instruction}
              </p>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="sr-only peer"
              />
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                confirmed
                  ? isBambiMode ? 'bg-pink-500 border-pink-500' : 'bg-white border-white'
                  : isBambiMode ? 'border-pink-300' : 'border-white/40'
              }`}>
                {confirmed && <Check className={`w-4 h-4 ${
                  isBambiMode ? 'text-white' : 'text-black'
                }`} />}
              </div>
              <span className={`text-sm ${themeText}`}>Photo captured</span>
            </label>
          </div>
        );

      case 'record':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <Video className={`w-6 h-6 ${themeAccent}`} />
              <p className={`text-sm ${themeText}/70`}>Record:</p>
            </div>
            <div className={`p-8 rounded-xl border-2 border-dashed text-center ${
              isBambiMode ? 'border-pink-300 bg-white/20' : 'border-white/30 bg-black/20'
            }`}>
              <Video className={`w-12 h-12 mx-auto mb-3 ${themeText}/30`} />
              <p className={`text-sm ${themeText}`}>
                {step.instruction}
              </p>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="sr-only peer"
              />
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                confirmed
                  ? isBambiMode ? 'bg-pink-500 border-pink-500' : 'bg-white border-white'
                  : isBambiMode ? 'border-pink-300' : 'border-white/40'
              }`}>
                {confirmed && <Check className={`w-4 h-4 ${
                  isBambiMode ? 'text-white' : 'text-black'
                }`} />}
              </div>
              <span className={`text-sm ${themeText}`}>Recording complete</span>
            </label>
          </div>
        );

      case 'confirm':
        return (
          <div className="space-y-6">
            <div className={`p-6 rounded-xl text-center ${
              isBambiMode ? 'bg-white/30' : 'bg-black/30'
            }`}>
              <p className={`text-lg font-medium ${themeText}`}>
                {step.text}
              </p>
            </div>
            <label className="flex items-center gap-3 cursor-pointer justify-center">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="sr-only peer"
              />
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                confirmed
                  ? isBambiMode ? 'bg-pink-500 border-pink-500' : 'bg-white border-white'
                  : isBambiMode ? 'border-pink-300' : 'border-white/40'
              }`}>
                {confirmed && <Check className={`w-4 h-4 ${
                  isBambiMode ? 'text-white' : 'text-black'
                }`} />}
              </div>
              <span className={`text-sm ${themeText}`}>I confirm</span>
            </label>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className={`text-xs font-medium ${themeText}/60 text-center`}>
        Step {stepNumber} of {totalSteps}
      </div>

      {/* Step content */}
      {renderStepContent()}

      {/* Continue button */}
      <button
        onClick={handleComplete}
        disabled={!canProceed()}
        className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
          canProceed()
            ? isBambiMode
              ? 'bg-pink-500 text-white hover:bg-pink-600'
              : 'bg-white text-black hover:bg-white/90'
            : isBambiMode
              ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
              : 'bg-white/20 text-white/40 cursor-not-allowed'
        }`}
      >
        {isLastStep ? 'Complete Ceremony' : 'Continue'}
      </button>
    </div>
  );
}
