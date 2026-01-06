/**
 * Daily Prescription View
 * Main view showing today's prescription and overall progress
 */

import { useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Brain,
  Lock,
  TrendingUp,
  Clock,
  ChevronRight
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAdaptiveFeminization } from '../../hooks/useAdaptiveFeminization';
import { PrescriptionCard } from './PrescriptionCard';
import { IrreversibilityModal } from './IrreversibilityModal';
import type { IrreversibilityMarker } from '../../types/adaptive-feminization';

interface DailyPrescriptionViewProps {
  onViewAllVectors?: () => void;
}

export function DailyPrescriptionView({ onViewAllVectors }: DailyPrescriptionViewProps) {
  const { isBambiMode } = useBambiMode();
  const {
    prescription,
    vectorDisplayInfos,
    irreversibilityMarkers,
    totalProgress,
    lockedInCount,
    isLoading,
    error,
    generateNewPrescription,
    completeEngagement,
    acknowledgeMarker,
  } = useAdaptiveFeminization();

  const [isGenerating, setIsGenerating] = useState(false);
  const [activeVectorId, setActiveVectorId] = useState<string | null>(null);
  const [completedVectors, setCompletedVectors] = useState<Set<string>>(new Set());
  const [selectedMarker, setSelectedMarker] = useState<IrreversibilityMarker | null>(null);

  // Get unacknowledged irreversibility markers
  const unacknowledgedMarkers = irreversibilityMarkers.filter(m => !m.acknowledged);

  // Handle generate prescription
  const handleGeneratePrescription = async () => {
    setIsGenerating(true);
    try {
      await generateNewPrescription();
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle complete engagement
  const handleCompleteEngagement = async (
    vectorId: string,
    quality: 'excellent' | 'good' | 'mediocre' | 'poor'
  ) => {
    const prescriptionItem = prescription?.prescriptions.find(p => p.vectorId === vectorId);
    await completeEngagement(
      vectorId as any,
      quality,
      prescriptionItem?.suggestedDuration || 15
    );
    setCompletedVectors(prev => new Set([...prev, vectorId]));
    setActiveVectorId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className={`w-8 h-8 animate-spin ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
        }`} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-protocol-danger" />
        <p className="text-protocol-danger mb-4">{error}</p>
        <button
          onClick={handleGeneratePrescription}
          className={`px-4 py-2 rounded-lg font-medium ${
            isBambiMode
              ? 'bg-pink-100 text-pink-600'
              : 'bg-protocol-surface text-protocol-text'
          }`}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
          }`}>
            <Brain className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`} />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              Adaptive Intelligence
            </h2>
            <p className="text-xs text-protocol-text-muted">
              Your personalized vector prescription
            </p>
          </div>
        </div>

        <button
          onClick={handleGeneratePrescription}
          disabled={isGenerating}
          className={`p-2 rounded-lg transition-colors ${
            isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface'
          }`}
        >
          <RefreshCw className={`w-5 h-5 ${
            isGenerating ? 'animate-spin' : ''
          } ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
        </button>
      </div>

      {/* Unacknowledged markers alert */}
      {unacknowledgedMarkers.length > 0 && (
        <button
          onClick={() => setSelectedMarker(unacknowledgedMarkers[0])}
          className={`w-full p-4 rounded-xl text-left transition-all ${
            isBambiMode
              ? 'bg-gradient-to-r from-pink-100 to-purple-100 border border-pink-300'
              : 'bg-gradient-to-r from-protocol-accent/20 to-purple-900/20 border border-protocol-accent/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`} />
              <div>
                <p className={`font-medium ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}>
                  Irreversible Milestone Reached!
                </p>
                <p className={`text-xs ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}>
                  Tap to celebrate your progress
                </p>
              </div>
            </div>
            <ChevronRight className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`} />
          </div>
        </button>
      )}

      {/* Progress stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`p-4 rounded-xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className={`w-4 h-4 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`} />
            <span className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              Progress
            </span>
          </div>
          <p className={`text-xl font-bold ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            {(totalProgress * 10).toFixed(0)}%
          </p>
        </div>

        <div className={`p-4 rounded-xl ${
          isBambiMode ? 'bg-purple-50' : 'bg-protocol-surface'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <Lock className={`w-4 h-4 ${
              isBambiMode ? 'text-purple-400' : 'text-protocol-text-muted'
            }`} />
            <span className={`text-xs ${
              isBambiMode ? 'text-purple-500' : 'text-protocol-text-muted'
            }`}>
              Locked In
            </span>
          </div>
          <p className={`text-xl font-bold ${
            isBambiMode ? 'text-purple-600' : 'text-protocol-text'
          }`}>
            {lockedInCount}
          </p>
        </div>

        <div className={`p-4 rounded-xl ${
          isBambiMode ? 'bg-amber-50' : 'bg-protocol-surface'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <Clock className={`w-4 h-4 ${
              isBambiMode ? 'text-amber-400' : 'text-protocol-text-muted'
            }`} />
            <span className={`text-xs ${
              isBambiMode ? 'text-amber-500' : 'text-protocol-text-muted'
            }`}>
              Today
            </span>
          </div>
          <p className={`text-xl font-bold ${
            isBambiMode ? 'text-amber-600' : 'text-protocol-text'
          }`}>
            {prescription?.totalEstimatedTime || 0}m
          </p>
        </div>
      </div>

      {/* Focus message */}
      {prescription?.focusMessage && (
        <div className={`p-4 rounded-xl border-l-4 ${
          isBambiMode
            ? 'bg-pink-50 border-pink-400'
            : 'bg-protocol-surface border-protocol-accent'
        }`}>
          <p className={`text-sm italic ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            "{prescription.focusMessage}"
          </p>
        </div>
      )}

      {/* Prescriptions */}
      {prescription?.prescriptions && prescription.prescriptions.length > 0 ? (
        <div className="space-y-4">
          <h3 className={`text-sm font-semibold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            Today's Prescription
          </h3>
          {prescription.prescriptions.map((p) => {
            const vectorInfo = vectorDisplayInfos.find(v => v.id === p.vectorId);
            if (!vectorInfo) return null;

            return (
              <PrescriptionCard
                key={p.vectorId}
                prescription={p}
                vectorInfo={vectorInfo}
                isActive={activeVectorId === p.vectorId}
                isCompleted={completedVectors.has(p.vectorId)}
                onStart={() => setActiveVectorId(p.vectorId)}
                onComplete={(quality) => handleCompleteEngagement(p.vectorId, quality)}
              />
            );
          })}
        </div>
      ) : (
        <div className={`p-6 rounded-xl text-center ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}>
          <Sparkles className={`w-8 h-8 mx-auto mb-3 ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`} />
          <p className={`text-sm mb-4 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}>
            No prescription generated yet
          </p>
          <button
            onClick={handleGeneratePrescription}
            disabled={isGenerating}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
            }`}
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              'Generate Prescription'
            )}
          </button>
        </div>
      )}

      {/* Adaptive insights */}
      {prescription?.adaptiveInsights && prescription.adaptiveInsights.length > 0 && (
        <div className={`p-4 rounded-xl ${
          isBambiMode ? 'bg-purple-50' : 'bg-protocol-surface'
        }`}>
          <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
            isBambiMode ? 'text-purple-600' : 'text-protocol-text-muted'
          }`}>
            Adaptive Insights
          </h4>
          <ul className="space-y-1">
            {prescription.adaptiveInsights.map((insight, i) => (
              <li key={i} className={`text-sm flex items-start gap-2 ${
                isBambiMode ? 'text-purple-700' : 'text-protocol-text'
              }`}>
                <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-purple-500" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* View all vectors button */}
      {onViewAllVectors && (
        <button
          onClick={onViewAllVectors}
          className={`w-full p-4 rounded-xl flex items-center justify-between transition-colors ${
            isBambiMode
              ? 'bg-pink-50 hover:bg-pink-100'
              : 'bg-protocol-surface hover:bg-protocol-surface-light'
          }`}
        >
          <span className={`font-medium ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            View All Vectors
          </span>
          <ChevronRight className={`w-5 h-5 ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`} />
        </button>
      )}

      {/* Irreversibility modal */}
      {selectedMarker && (
        <IrreversibilityModal
          marker={selectedMarker}
          onAcknowledge={async () => {
            await acknowledgeMarker(selectedMarker.id);
            // Check for next unacknowledged marker
            const remaining = unacknowledgedMarkers.filter(m => m.id !== selectedMarker.id);
            setSelectedMarker(remaining.length > 0 ? remaining[0] : null);
          }}
          onClose={() => setSelectedMarker(null)}
        />
      )}
    </div>
  );
}
