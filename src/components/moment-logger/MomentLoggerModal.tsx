// Moment Logger Modal
// Step-based flow: type → details → post-log

import { X, ArrowLeft } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { TypeSelector } from './steps/TypeSelector';
import { DetailsStep } from './steps/DetailsStep';
import { EuphoriaCelebration } from './post-log/EuphoriaCelebration';
import { ArousalCelebration } from './post-log/ArousalCelebration';
import { DysphoriaSupport } from './post-log/DysphoriaSupport';
import type { useMomentLogger } from '../../hooks/useMomentLogger';

interface MomentLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  momentLogger: ReturnType<typeof useMomentLogger>;
}

export function MomentLoggerModal({
  isOpen,
  onClose,
  momentLogger,
}: MomentLoggerModalProps) {
  const { isBambiMode } = useBambiMode();

  if (!isOpen) return null;

  const {
    currentStep,
    selectedType,
    selectedIntensity,
    selectedTriggers,
    customTriggerText,
    isLoading,
    lastLoggedMoment: _lastLoggedMoment,
    selectType,
    selectIntensity,
    toggleTrigger,
    setCustomTriggerText,
    saveMoment,
    recordSupport,
    goBack,
  } = momentLogger;

  // Post-log screens
  if (currentStep === 'post-euphoria') {
    return (
      <EuphoriaCelebration
        intensity={selectedIntensity}
        onComplete={onClose}
      />
    );
  }

  if (currentStep === 'post-arousal') {
    return (
      <ArousalCelebration
        intensity={selectedIntensity}
        onComplete={onClose}
      />
    );
  }

  if (currentStep === 'post-dysphoria') {
    return (
      <DysphoriaSupport
        intensity={selectedIntensity}
        onSupportSelected={async (support) => {
          await recordSupport(support);
          onClose();
        }}
        onSkip={() => {
          recordSupport('skipped');
          onClose();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div
        className={`w-full max-w-sm rounded-2xl overflow-hidden ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-4 border-b ${
            isBambiMode ? 'border-pink-100' : 'border-protocol-border'
          }`}
        >
          {currentStep === 'details' ? (
            <button
              onClick={goBack}
              className={`p-1 rounded-lg transition-colors ${
                isBambiMode
                  ? 'hover:bg-pink-100 text-pink-600'
                  : 'hover:bg-protocol-surface text-protocol-text'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-7" />
          )}

          <h2
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-900' : 'text-protocol-text'
            }`}
          >
            {currentStep === 'type'
              ? 'How are you feeling?'
              : selectedType === 'euphoria'
              ? '✨ Euphoria'
              : selectedType === 'arousal'
              ? '🔥 Arousal'
              : '💭 Dysphoria'}
          </h2>

          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition-colors ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-600'
                : 'hover:bg-protocol-surface text-protocol-text'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {currentStep === 'type' && (
            <TypeSelector onSelect={selectType} />
          )}

          {currentStep === 'details' && selectedType && (
            <DetailsStep
              type={selectedType}
              intensity={selectedIntensity}
              triggers={selectedTriggers}
              customText={customTriggerText}
              onIntensityChange={selectIntensity}
              onToggleTrigger={toggleTrigger}
              onCustomTextChange={setCustomTriggerText}
              onSave={saveMoment}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}
