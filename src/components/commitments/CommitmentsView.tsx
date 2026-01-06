/**
 * Commitments View
 * Main view showing all commitments and allowing new ones
 */

import { useState } from 'react';
import { Link, Plus, Loader2, RefreshCw, AlertTriangle, Lock, CheckCircle, XCircle } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useCommitments } from '../../hooks/useCommitments';
import { CommitmentCard } from './CommitmentCard';
import { MakeCommitmentModal } from './MakeCommitmentModal';
import type { BindingLevel } from '../../types/commitments';

export function CommitmentsView() {
  const { isBambiMode } = useBambiMode();
  const {
    activeCommitments,
    userCommitments,
    availableCommitments,
    currentArousalState,
    isLoading,
    error,
    refresh,
    startCommitment,
    confirmCommitment,
    makeCustom,
    fulfill,
    break_,
  } = useCommitments();

  // Get denial day (we'll use 0 as default since it's not directly exposed)
  const currentDenialDay = 0;

  const [showMakeModal, setShowMakeModal] = useState(false);

  // Separate fulfilled and broken commitments
  const fulfilledCommitments = userCommitments.filter(c => c.status === 'fulfilled');
  const brokenCommitments = userCommitments.filter(c => c.status === 'broken');

  const handleMakeCommitment = async (commitmentId: string) => {
    // Find the commitment object by ID
    const commitment = availableCommitments.find(c => c.id === commitmentId);
    if (!commitment) return;

    startCommitment(commitment);
    await confirmCommitment(commitment.bindingLevel);
  };

  const handleMakeCustom = async (text: string, bindingLevel: BindingLevel) => {
    await makeCustom(text, bindingLevel);
  };

  const handleFulfill = async (id: string) => {
    await fulfill(id);
  };

  const handleBreak = async (id: string) => {
    if (!confirm('Are you sure you want to break this commitment? This cannot be undone.')) {
      return;
    }
    await break_(id);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
          }`}>
            <Link className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`} />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              Commitments
            </h2>
            <p className="text-xs text-protocol-text-muted">
              Bind yourself to your truth
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="p-2 rounded-lg hover:bg-protocol-surface transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-protocol-text-muted" />
          </button>
          <button
            onClick={() => setShowMakeModal(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">New</span>
          </button>
        </div>
      </div>

      {/* Stats summary */}
      <div className={`grid grid-cols-3 gap-3 p-4 rounded-xl ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
      }`}>
        <div className="text-center">
          <p className={`text-2xl font-bold ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            {activeCommitments.length}
          </p>
          <p className="text-xs text-protocol-text-muted">Active</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-500">
            {fulfilledCommitments.length}
          </p>
          <p className="text-xs text-protocol-text-muted">Fulfilled</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-400">
            {brokenCommitments.length}
          </p>
          <p className="text-xs text-protocol-text-muted">Broken</p>
        </div>
      </div>

      {/* Active commitments */}
      {activeCommitments.length > 0 && (
        <div className="space-y-4">
          <h3 className={`text-sm font-semibold ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            Active Commitments
          </h3>
          {activeCommitments.map((commitment) => (
            <CommitmentCard
              key={commitment.id}
              commitment={commitment}
              onFulfill={() => handleFulfill(commitment.id)}
              onBreak={() => handleBreak(commitment.id)}
            />
          ))}
        </div>
      )}

      {/* Empty state for active */}
      {activeCommitments.length === 0 && (
        <div className={`p-8 text-center rounded-xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}>
          <Link className={`w-12 h-12 mx-auto mb-4 ${
            isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
          }`} />
          <p className={`font-medium ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            No active commitments
          </p>
          <p className="text-sm text-protocol-text-muted mt-1">
            Make a commitment to bind yourself to your journey
          </p>
          <button
            onClick={() => setShowMakeModal(true)}
            className={`mt-4 px-4 py-2 rounded-lg font-medium transition-colors ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
            }`}
          >
            Make Your First Commitment
          </button>
        </div>
      )}

      {/* Fulfilled commitments */}
      {fulfilledCommitments.length > 0 && (
        <div className="space-y-4">
          <h3 className={`text-sm font-semibold flex items-center gap-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            <CheckCircle className="w-4 h-4 text-green-500" />
            Fulfilled ({fulfilledCommitments.length})
          </h3>
          {fulfilledCommitments.map((commitment) => (
            <CommitmentCard
              key={commitment.id}
              commitment={commitment}
            />
          ))}
        </div>
      )}

      {/* Broken commitments */}
      {brokenCommitments.length > 0 && (
        <div className="space-y-4">
          <h3 className={`text-sm font-semibold flex items-center gap-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            <XCircle className="w-4 h-4 text-red-400" />
            Broken ({brokenCommitments.length})
          </h3>
          {brokenCommitments.map((commitment) => (
            <CommitmentCard
              key={commitment.id}
              commitment={commitment}
            />
          ))}
        </div>
      )}

      {/* Info card */}
      <div className={`p-4 rounded-xl ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
      }`}>
        <p className={`text-sm ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
        }`}>
          Commitments bind you to your path. Soft commitments are noted, hard commitments have consequences,
          and permanent commitments cannot be broken.
        </p>
      </div>

      {/* Make commitment modal */}
      {showMakeModal && (
        <MakeCommitmentModal
          availableCommitments={availableCommitments}
          currentArousalState={currentArousalState}
          currentDenialDay={currentDenialDay}
          onMakeCommitment={handleMakeCommitment}
          onMakeCustom={handleMakeCustom}
          onClose={() => setShowMakeModal(false)}
        />
      )}
    </div>
  );
}

/**
 * Compact preview for dashboard
 */
export function CommitmentsPreview() {
  const { isBambiMode } = useBambiMode();
  const { activeCommitments, userCommitments } = useCommitments();

  const fulfilledCount = userCommitments.filter(c => c.status === 'fulfilled').length;
  const permanentCount = activeCommitments.filter(c => c.bindingLevel === 'permanent').length;

  if (activeCommitments.length === 0 && userCommitments.length === 0) {
    return null;
  }

  return (
    <div className={`p-4 rounded-xl ${
      isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <Link className={`w-4 h-4 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
        }`} />
        <span className={`text-sm font-semibold ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          Commitments
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className={`text-2xl font-bold ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            {activeCommitments.length}
          </p>
          <p className="text-xs text-protocol-text-muted">active</p>
        </div>

        {permanentCount > 0 && (
          <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${
            isBambiMode
              ? 'bg-red-100 text-red-600'
              : 'bg-red-500/10 text-red-400'
          }`}>
            <Lock className="w-3 h-3 inline mr-1" />
            {permanentCount} permanent
          </div>
        )}
      </div>

      {fulfilledCount > 0 && (
        <div className="mt-3 pt-3 border-t border-protocol-border">
          <div className="flex items-center gap-1.5 text-xs text-protocol-text-muted">
            <CheckCircle className="w-3 h-3 text-green-500" />
            <span>{fulfilledCount} fulfilled</span>
          </div>
        </div>
      )}
    </div>
  );
}
