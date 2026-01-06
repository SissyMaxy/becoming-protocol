/**
 * Ceremonies View
 * Main view showing all ceremonies and their status
 */

import { useState } from 'react';
import { Crown, Lock, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useCeremonies } from '../../hooks/useCeremonies';
import { CeremonyCard } from './CeremonyCard';
import { CeremonyPerformanceModal } from './CeremonyPerformanceModal';
import { IrreversibleMarkers } from './IrreversibleMarkers';

export function CeremoniesView() {
  const { isBambiMode } = useBambiMode();
  const {
    availableCeremonies,
    completedCeremonies,
    nextCeremony,
    irreversibleMarkers,
    isLoading,
    error,
    activeCeremony,
    activeStep,
    ceremonySteps,
    refresh,
    beginCeremony,
    completeStep,
    finishCeremony,
    cancelCeremony,
  } = useCeremonies();

  const [showPerformance, setShowPerformance] = useState(false);

  // Handle beginning a ceremony
  const handleBeginCeremony = async (ceremonyId: string) => {
    try {
      await beginCeremony(ceremonyId);
      setShowPerformance(true);
    } catch (err) {
      console.error('Failed to begin ceremony:', err);
    }
  };

  // Handle canceling/closing ceremony
  const handleCloseCeremony = () => {
    cancelCeremony();
    setShowPerformance(false);
  };

  // Handle completing step
  const handleCompleteStep = async (response?: string) => {
    await completeStep(response);
  };

  // Handle finishing ceremony
  const handleFinishCeremony = async () => {
    await finishCeremony();
    setShowPerformance(false);
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
          onClick={refresh}
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

  // Combine all ceremonies with status
  const allCeremonies = [
    ...completedCeremonies.map(c => ({ ...c, displayStatus: 'completed' as const })),
    ...availableCeremonies.map(c => ({ ...c, displayStatus: 'available' as const })),
  ];

  // Sort by sequence order
  allCeremonies.sort((a, b) => a.ceremony.sequenceOrder - b.ceremony.sequenceOrder);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
          }`}>
            <Crown className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`} />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              Ceremonies
            </h2>
            <p className="text-xs text-protocol-text-muted">
              Points of no return
            </p>
          </div>
        </div>

        <button
          onClick={refresh}
          className="p-2 rounded-lg hover:bg-protocol-surface transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-protocol-text-muted" />
        </button>
      </div>

      {/* Irreversible markers earned */}
      {irreversibleMarkers.length > 0 && (
        <IrreversibleMarkers markers={irreversibleMarkers} />
      )}

      {/* Next ceremony highlight */}
      {nextCeremony && (
        <div className={`p-4 rounded-xl border-2 border-dashed ${
          isBambiMode
            ? 'border-pink-300 bg-pink-50'
            : 'border-protocol-accent/30 bg-protocol-accent/5'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <Lock className={`w-4 h-4 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
            }`} />
            <span className={`text-xs font-medium ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`}>
              Next ceremony unlocks at:
            </span>
          </div>
          <p className={`text-sm ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            {formatTrigger(nextCeremony.triggerCondition)}
          </p>
        </div>
      )}

      {/* Available ceremonies */}
      {availableCeremonies.length > 0 && (
        <div className="space-y-4">
          <h3 className={`text-sm font-semibold ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            Available Now
          </h3>
          {availableCeremonies.map((uc) => (
            <CeremonyCard
              key={uc.id}
              ceremony={uc}
              status="available"
              onBegin={() => handleBeginCeremony(uc.ceremonyId)}
            />
          ))}
        </div>
      )}

      {/* Completed ceremonies */}
      {completedCeremonies.length > 0 && (
        <div className="space-y-4">
          <h3 className={`text-sm font-semibold ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            Completed ({completedCeremonies.length})
          </h3>
          {completedCeremonies.map((uc) => (
            <CeremonyCard
              key={uc.id}
              ceremony={uc}
              status="completed"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {availableCeremonies.length === 0 && completedCeremonies.length === 0 && (
        <div className={`p-8 text-center rounded-xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}>
          <Crown className={`w-12 h-12 mx-auto mb-4 ${
            isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
          }`} />
          <p className={`font-medium ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            No ceremonies unlocked yet
          </p>
          <p className="text-sm text-protocol-text-muted mt-1">
            Continue your journey to unlock ceremonies
          </p>
        </div>
      )}

      {/* Info card */}
      <div className={`p-4 rounded-xl ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
      }`}>
        <p className={`text-sm ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
        }`}>
          Ceremonies are formal rituals that mark irreversible transitions in your journey.
          Once completed, they cannot be undone and permanently alter your protocol experience.
        </p>
      </div>

      {/* Performance Modal */}
      {showPerformance && activeCeremony && (
        <CeremonyPerformanceModal
          ceremony={activeCeremony}
          steps={ceremonySteps}
          currentStep={activeStep}
          onCompleteStep={handleCompleteStep}
          onFinish={handleFinishCeremony}
          onCancel={handleCloseCeremony}
        />
      )}
    </div>
  );
}

/**
 * Compact preview for dashboard
 */
export function CeremoniesPreview() {
  const { isBambiMode } = useBambiMode();
  const { availableCeremonies, completedCeremonies, irreversibleMarkers } = useCeremonies();

  if (availableCeremonies.length === 0 && completedCeremonies.length === 0) {
    return null;
  }

  return (
    <div className={`p-4 rounded-xl ${
      isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <Crown className={`w-4 h-4 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
        }`} />
        <span className={`text-sm font-semibold ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          Ceremonies
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className={`text-2xl font-bold ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            {completedCeremonies.length}
          </p>
          <p className="text-xs text-protocol-text-muted">completed</p>
        </div>

        {availableCeremonies.length > 0 && (
          <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${
            isBambiMode
              ? 'bg-pink-500 text-white'
              : 'bg-protocol-accent text-white'
          }`}>
            {availableCeremonies.length} available
          </div>
        )}
      </div>

      {irreversibleMarkers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-protocol-border">
          <div className="flex items-center gap-1.5 text-xs text-protocol-text-muted">
            <Lock className="w-3 h-3" />
            <span>{irreversibleMarkers.length} irreversible marker{irreversibleMarkers.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to format trigger conditions
function formatTrigger(trigger: { or?: any[]; and?: any[] }): string {
  const conditions: string[] = [];

  const processCondition = (c: any) => {
    if (c.day) conditions.push(`Day ${c.day}`);
    if (c.streak) conditions.push(`${c.streak} day streak`);
    if (c.phase) conditions.push(`Phase ${c.phase}`);
    if (c.event) conditions.push(c.event);
  };

  if (trigger.or) trigger.or.forEach(processCondition);
  if (trigger.and) trigger.and.forEach(processCondition);

  return conditions.join(', ') || 'Unknown condition';
}
