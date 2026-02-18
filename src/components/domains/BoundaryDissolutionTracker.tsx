/**
 * Boundary Dissolution Tracker
 *
 * Displays and manages boundaries being dissolved.
 */

import { useState, useEffect } from 'react';
import { Plus, Target, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import {
  BoundaryDissolution,
  DissolutionMethod,
  ESCALATION_DOMAIN_LABELS,
  EscalationDomain,
} from '../../types/escalation';
import { getBoundaries } from '../../lib/domainEscalation';
import { AddBoundaryModal } from './AddBoundaryModal';
import { UpdateBoundaryModal } from './UpdateBoundaryModal';

const METHOD_LABELS: Record<DissolutionMethod, string> = {
  gradual_exposure: 'Gradual Exposure',
  arousal_bypass: 'Arousal Bypass',
  hypno_conditioning: 'Hypno Conditioning',
  gina_command: 'Gina Command',
};

const METHOD_COLORS: Record<DissolutionMethod, string> = {
  gradual_exposure: '#8b5cf6',
  arousal_bypass: '#ec4899',
  hypno_conditioning: '#a855f7',
  gina_command: '#ef4444',
};

type BoundaryStatus = 'identified' | 'dissolving' | 'dissolved';

function getBoundaryStatus(boundary: BoundaryDissolution): BoundaryStatus {
  if (boundary.dissolutionCompleted) return 'dissolved';
  if (boundary.dissolutionStarted) return 'dissolving';
  return 'identified';
}

export function BoundaryDissolutionTracker() {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [boundaries, setBoundaries] = useState<BoundaryDissolution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedBoundary, setSelectedBoundary] = useState<BoundaryDissolution | null>(null);

  const loadBoundaries = async () => {
    if (!user) return;
    setIsLoading(true);
    const data = await getBoundaries(user.id);
    setBoundaries(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadBoundaries();
  }, [user]);

  // Group by status
  const dissolved = boundaries.filter(b => getBoundaryStatus(b) === 'dissolved');
  const dissolving = boundaries.filter(b => getBoundaryStatus(b) === 'dissolving');
  const identified = boundaries.filter(b => getBoundaryStatus(b) === 'identified');

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const renderBoundaryCard = (boundary: BoundaryDissolution, status: BoundaryStatus) => {
    const methodColor = boundary.method ? METHOD_COLORS[boundary.method] : '#6b7280';

    return (
      <div
        key={boundary.id}
        className={`p-3 rounded-lg ${
          isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              "{boundary.boundaryDescription}"
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* Status badge */}
              {status === 'dissolving' && boundary.method && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${methodColor}20`, color: methodColor }}
                >
                  {METHOD_LABELS[boundary.method]}
                </span>
              )}

              {status === 'dissolved' && boundary.nowBaseline && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 font-medium">
                  Now Baseline
                </span>
              )}

              {boundary.domain && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    isBambiMode
                      ? 'bg-pink-100 text-pink-600'
                      : 'bg-protocol-surface-light text-protocol-text-muted'
                  }`}
                >
                  {ESCALATION_DOMAIN_LABELS[boundary.domain as EscalationDomain]}
                </span>
              )}
            </div>

            {/* Dates */}
            <div
              className={`flex items-center gap-3 mt-2 text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              {status === 'identified' && (
                <span>Identified: {formatDate(boundary.firstIdentified)}</span>
              )}
              {status === 'dissolving' && boundary.dissolutionStarted && (
                <span>Started: {formatDate(boundary.dissolutionStarted)}</span>
              )}
              {status === 'dissolved' && boundary.dissolutionCompleted && (
                <span>Completed: {formatDate(boundary.dissolutionCompleted)}</span>
              )}
            </div>
          </div>

          {/* Actions */}
          {status === 'identified' && (
            <button
              onClick={() => setSelectedBoundary(boundary)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                isBambiMode
                  ? 'bg-pink-500 text-white'
                  : 'bg-purple-500 text-white'
              }`}
            >
              Start
            </button>
          )}

          {status === 'dissolving' && (
            <button
              onClick={() => setSelectedBoundary(boundary)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                isBambiMode
                  ? 'bg-pink-100 text-pink-600'
                  : 'bg-protocol-surface-light text-protocol-text'
              }`}
            >
              Update
            </button>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div
          className={`text-sm ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}
        >
          Loading boundaries...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add Button */}
      <button
        onClick={() => setShowAddModal(true)}
        className={`w-full p-3 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 transition-colors ${
          isBambiMode
            ? 'border-pink-300 text-pink-500 hover:bg-pink-50'
            : 'border-protocol-border text-protocol-text-muted hover:bg-protocol-surface'
        }`}
      >
        <Plus className="w-5 h-5" />
        <span className="text-sm font-medium">Add Boundary</span>
      </button>

      {/* Dissolving Section */}
      {dissolving.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock
              className={`w-4 h-4 ${
                isBambiMode ? 'text-pink-500' : 'text-amber-400'
              }`}
            />
            <h3
              className={`text-sm font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Dissolving ({dissolving.length})
            </h3>
          </div>
          <div className="space-y-2">
            {dissolving.map((b) => renderBoundaryCard(b, 'dissolving'))}
          </div>
        </div>
      )}

      {/* Identified Section */}
      {identified.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle
              className={`w-4 h-4 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            />
            <h3
              className={`text-sm font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Identified ({identified.length})
            </h3>
          </div>
          <div className="space-y-2">
            {identified.map((b) => renderBoundaryCard(b, 'identified'))}
          </div>
        </div>
      )}

      {/* Dissolved Section */}
      {dissolved.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle
              className={`w-4 h-4 ${
                isBambiMode ? 'text-pink-500' : 'text-green-400'
              }`}
            />
            <h3
              className={`text-sm font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Dissolved ({dissolved.length})
            </h3>
          </div>
          <div className="space-y-2">
            {dissolved.map((b) => renderBoundaryCard(b, 'dissolved'))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {boundaries.length === 0 && (
        <div className="text-center py-8">
          <Target
            className={`w-10 h-10 mx-auto mb-2 ${
              isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
            }`}
          />
          <p
            className={`text-sm ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            No boundaries tracked yet
          </p>
          <p
            className={`text-xs mt-1 ${
              isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
            }`}
          >
            Add boundaries you want to dissolve
          </p>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddBoundaryModal
          onSubmit={async () => {
            await loadBoundaries();
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Update Modal */}
      {selectedBoundary && (
        <UpdateBoundaryModal
          boundary={selectedBoundary}
          onSubmit={async () => {
            await loadBoundaries();
          }}
          onClose={() => setSelectedBoundary(null)}
        />
      )}
    </div>
  );
}
