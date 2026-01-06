// IntakeFlow.tsx
// 5-layer deep intake system for building psychological profile

import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Lock, Check } from 'lucide-react';
import { useProfile } from '../../hooks/useProfile';
import { FoundationLayer } from './layers/FoundationLayer';
import { HistoryLayer } from './layers/HistoryLayer';
import { ArousalLayer } from './layers/ArousalLayer';
import { PsychologyLayer } from './layers/PsychologyLayer';
import { DepthLayer } from './layers/DepthLayer';
import { IntakeComplete } from './IntakeComplete';
import type { IntakeLayer } from '../../types/profile';
import { LAYER_NUMBERS } from '../../types/profile';

interface IntakeFlowProps {
  onComplete: () => void;
  startLayer?: IntakeLayer;
}

const LAYERS: IntakeLayer[] = [
  'foundation',
  'history',
  'arousal',
  'psychology',
  'depth',
];

const LAYER_INFO: Record<IntakeLayer, {
  title: string;
  subtitle: string;
  description: string;
  icon: string;
}> = {
  foundation: {
    title: 'Foundation',
    subtitle: 'Who You Are',
    description: 'Basic identity, relationship context, and starting point',
    icon: '1',
  },
  history: {
    title: 'History',
    subtitle: 'Your Journey So Far',
    description: 'Feminine experiences, milestones, and what brought you here',
    icon: '2',
  },
  arousal: {
    title: 'Arousal',
    subtitle: 'What Excites You',
    description: 'Triggers, fantasies, and what drives your deepest desires',
    icon: '3',
  },
  psychology: {
    title: 'Psychology',
    subtitle: 'Your Inner Landscape',
    description: 'Vulnerabilities, resistance patterns, and what makes you submit',
    icon: '4',
  },
  depth: {
    title: 'Depth',
    subtitle: 'Your True Self',
    description: 'Deepest fantasies, secret desires, and where you want to go',
    icon: '5',
  },
};

export function IntakeFlow({ onComplete, startLayer }: IntakeFlowProps) {
  const { intakeProgress, isLoading, loadProfile, completeLayer } = useProfile();
  const [currentLayer, setCurrentLayer] = useState<IntakeLayer>(startLayer || 'foundation');
  const [showComplete, setShowComplete] = useState(false);

  // Load profile on mount
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Check if all layers are complete
  useEffect(() => {
    if (intakeProgress) {
      // layerCompleted is a number indicating how many layers are done (1-5)
      const allComplete = intakeProgress.layerCompleted >= 5;
      if (allComplete && currentLayer === 'depth') {
        setShowComplete(true);
      }
    }
  }, [intakeProgress, currentLayer]);

  const currentIndex = LAYERS.indexOf(currentLayer);
  const progress = ((currentIndex + 1) / LAYERS.length) * 100;

  const isLayerComplete = (layer: IntakeLayer): boolean => {
    if (!intakeProgress) return false;
    const layerNum = LAYER_NUMBERS[layer];
    return intakeProgress.layerCompleted >= layerNum;
  };

  const isLayerUnlocked = (layer: IntakeLayer): boolean => {
    const layerIndex = LAYERS.indexOf(layer);
    if (layerIndex === 0) return true;
    // Previous layer must be complete
    return isLayerComplete(LAYERS[layerIndex - 1]);
  };

  const handleLayerComplete = async (disclosureScore: number = 10) => {
    const layerNum = LAYER_NUMBERS[currentLayer];
    await completeLayer(layerNum, disclosureScore);

    // Move to next layer or show complete
    const nextIndex = currentIndex + 1;
    if (nextIndex < LAYERS.length) {
      setCurrentLayer(LAYERS[nextIndex]);
    } else {
      setShowComplete(true);
    }
  };

  const goToLayer = (layer: IntakeLayer) => {
    if (isLayerUnlocked(layer)) {
      setCurrentLayer(layer);
      setShowComplete(false);
    }
  };

  const goBack = () => {
    if (currentIndex > 0) {
      setCurrentLayer(LAYERS[currentIndex - 1]);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-protocol-bg flex items-center justify-center">
        <div className="text-protocol-text-muted">Loading your profile...</div>
      </div>
    );
  }

  if (showComplete) {
    return <IntakeComplete onContinue={onComplete} />;
  }

  const renderLayer = () => {
    switch (currentLayer) {
      case 'foundation':
        return <FoundationLayer onComplete={handleLayerComplete} onBack={goBack} />;
      case 'history':
        return <HistoryLayer onComplete={handleLayerComplete} onBack={goBack} />;
      case 'arousal':
        return <ArousalLayer onComplete={handleLayerComplete} onBack={goBack} />;
      case 'psychology':
        return <PsychologyLayer onComplete={handleLayerComplete} onBack={goBack} />;
      case 'depth':
        return <DepthLayer onComplete={handleLayerComplete} onBack={goBack} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-protocol-bg flex flex-col">
      {/* Progress header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-protocol-bg/95 backdrop-blur-sm border-b border-protocol-border">
        {/* Progress bar */}
        <div className="h-1 bg-protocol-surface">
          <div
            className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Layer indicators */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between max-w-md mx-auto">
            {LAYERS.map((layer) => {
              const isComplete = isLayerComplete(layer);
              const isUnlocked = isLayerUnlocked(layer);
              const isCurrent = layer === currentLayer;

              return (
                <button
                  key={layer}
                  onClick={() => goToLayer(layer)}
                  disabled={!isUnlocked}
                  className={`flex flex-col items-center gap-1 transition-all ${
                    isUnlocked ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      isComplete
                        ? 'bg-green-500 text-white'
                        : isCurrent
                        ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                        : isUnlocked
                        ? 'bg-protocol-surface text-protocol-text-muted border border-protocol-border'
                        : 'bg-protocol-surface/50 text-protocol-text-muted/50'
                    }`}
                  >
                    {isComplete ? (
                      <Check className="w-4 h-4" />
                    ) : !isUnlocked ? (
                      <Lock className="w-3 h-3" />
                    ) : (
                      LAYER_INFO[layer].icon
                    )}
                  </div>
                  <span className={`text-[10px] ${
                    isCurrent ? 'text-protocol-accent' : 'text-protocol-text-muted'
                  }`}>
                    {LAYER_INFO[layer].title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Current layer info */}
        <div className="px-4 pb-3 text-center">
          <h2 className="text-lg font-semibold text-protocol-text">
            {LAYER_INFO[currentLayer].subtitle}
          </h2>
          <p className="text-xs text-protocol-text-muted">
            {LAYER_INFO[currentLayer].description}
          </p>
        </div>
      </div>

      {/* Main content with padding for fixed header */}
      <div className="flex-1 pt-36 pb-24">
        {renderLayer()}
      </div>
    </div>
  );
}

// Reusable navigation for intake layers
interface LayerNavProps {
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
}

export function LayerNav({
  onNext,
  onBack,
  nextLabel = 'Continue',
  nextDisabled = false,
  showBack = true
}: LayerNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-protocol-bg/95 backdrop-blur-sm border-t border-protocol-border">
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
                : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:from-pink-600 hover:to-purple-600'
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
