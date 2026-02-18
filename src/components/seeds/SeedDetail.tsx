/**
 * Seed Detail Component
 *
 * Full view of an intimate seed with phase history and actions.
 */

import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  TrendingUp,
  Trash2,
  MessageCircle,
  Loader2,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type {
  IntimateSeed,
  SeedAction,
  SeedPhase,
} from '../../types/arousal';
import {
  SEED_CATEGORY_CONFIG,
  SEED_PHASE_CONFIG,
} from '../../types/arousal';

interface SeedDetailProps {
  seed: IntimateSeed;
  onBack: () => void;
  onLogAction: () => void;
  onAdvancePhase: () => void;
  onDelete: () => void;
  getSeedActions: (seedId: string) => Promise<SeedAction[]>;
}

const PHASE_COLORS: Record<SeedPhase, string> = {
  identified: '#64748b',
  distant_mention: '#8b5cf6',
  positive_assoc: '#a855f7',
  adjacent_exp: '#d946ef',
  soft_offer: '#ec4899',
  first_attempt: '#f472b6',
  establishing: '#22c55e',
  established: '#16a34a',
  abandoned: '#6b7280',
  paused: '#9ca3af',
};

const ACTION_TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  mention: { label: 'Mentioned', emoji: '💬' },
  tested_waters: { label: 'Tested Waters', emoji: '🌊' },
  soft_offer: { label: 'Soft Offer', emoji: '💝' },
  attempted: { label: 'Attempted', emoji: '🎯' },
  succeeded: { label: 'Succeeded', emoji: '✅' },
  partial: { label: 'Partial Success', emoji: '🔄' },
  rejected: { label: 'Rejected', emoji: '❌' },
  postponed: { label: 'Postponed', emoji: '⏸️' },
  she_initiated: { label: 'She Initiated', emoji: '💖' },
  she_expanded: { label: 'She Expanded', emoji: '🌟' },
  abandoned: { label: 'Abandoned', emoji: '🚫' },
  note: { label: 'Note', emoji: '📝' },
};

export function SeedDetail({
  seed,
  onBack,
  onLogAction,
  onAdvancePhase,
  onDelete,
  getSeedActions,
}: SeedDetailProps) {
  const { isBambiMode } = useBambiMode();
  const [actions, setActions] = useState<SeedAction[]>([]);
  const [isLoadingActions, setIsLoadingActions] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const categoryConfig = SEED_CATEGORY_CONFIG[seed.category];
  const phaseConfig = SEED_PHASE_CONFIG[seed.currentPhase];
  const phaseColor = PHASE_COLORS[seed.currentPhase];

  useEffect(() => {
    loadActions();
  }, [seed.id]);

  const loadActions = async () => {
    try {
      setIsLoadingActions(true);
      const data = await getSeedActions(seed.id);
      setActions(data);
    } catch (err) {
      console.error('Failed to load actions:', err);
    } finally {
      setIsLoadingActions(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  const canAdvance =
    seed.currentPhase !== 'established' &&
    seed.currentPhase !== 'abandoned' &&
    seed.currentPhase !== 'paused';

  return (
    <div
      className={`min-h-screen ${
        isBambiMode ? 'bg-gradient-to-b from-pink-50 to-white' : 'bg-protocol-bg'
      }`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 px-4 py-3 flex items-center gap-3 ${
          isBambiMode
            ? 'bg-pink-50/90 backdrop-blur-sm border-b border-pink-200'
            : 'bg-protocol-bg/90 backdrop-blur-sm border-b border-protocol-border'
        }`}
      >
        <button
          onClick={onBack}
          className={`p-2 rounded-lg transition-colors ${
            isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface'
          }`}
        >
          <ArrowLeft
            className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}
          />
        </button>
        <div className="flex-1">
          <h1
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            {seed.title}
          </h1>
          <p
            className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            {categoryConfig.emoji} {categoryConfig.label}
          </p>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="p-2 rounded-lg hover:bg-red-100 transition-colors"
        >
          <Trash2 className="w-5 h-5 text-red-400" />
        </button>
      </div>

      <div className="p-4 pb-24 space-y-6">
        {/* Phase Status */}
        <div
          className={`p-4 rounded-xl ${
            isBambiMode
              ? 'bg-white border border-pink-200'
              : 'bg-protocol-surface border border-protocol-border'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className={`text-sm font-medium ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              Current Phase
            </span>
            <span
              className="text-sm font-medium px-3 py-1 rounded-full"
              style={{
                backgroundColor: `${phaseColor}20`,
                color: phaseColor,
              }}
            >
              {phaseConfig.label}
            </span>
          </div>

          <p
            className={`text-xs mb-4 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            {phaseConfig.description}
          </p>

          {/* Phase Timeline */}
          <div className="flex items-center gap-1">
            {Object.entries(SEED_PHASE_CONFIG)
              .filter(([_, config]) => config.order >= 0)
              .sort((a, b) => a[1].order - b[1].order)
              .map(([phase, config]) => {
                const isCompleted =
                  config.order < SEED_PHASE_CONFIG[seed.currentPhase].order;
                const isCurrent = phase === seed.currentPhase;
                return (
                  <div
                    key={phase}
                    className={`flex-1 h-2 rounded-full transition-colors ${
                      isCompleted || isCurrent
                        ? ''
                        : isBambiMode
                        ? 'bg-pink-100'
                        : 'bg-protocol-border'
                    }`}
                    style={{
                      backgroundColor:
                        isCompleted || isCurrent
                          ? PHASE_COLORS[phase as SeedPhase]
                          : undefined,
                      opacity: isCurrent ? 1 : isCompleted ? 0.5 : undefined,
                    }}
                    title={config.label}
                  />
                );
              })}
          </div>
        </div>

        {/* Description */}
        {seed.description && (
          <div
            className={`p-4 rounded-xl ${
              isBambiMode
                ? 'bg-white border border-pink-200'
                : 'bg-protocol-surface border border-protocol-border'
            }`}
          >
            <h3
              className={`text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              Description
            </h3>
            <p
              className={`text-sm ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              {seed.description}
            </p>
          </div>
        )}

        {/* Timing Context */}
        {(seed.bestTimingContext || seed.avoidContexts) && (
          <div
            className={`p-4 rounded-xl ${
              isBambiMode
                ? 'bg-white border border-pink-200'
                : 'bg-protocol-surface border border-protocol-border'
            }`}
          >
            <h3
              className={`text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              Timing Notes
            </h3>
            {seed.bestTimingContext && (
              <div className="mb-2">
                <span className="text-xs text-green-500 font-medium">
                  Best timing:
                </span>
                <p
                  className={`text-sm ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  {seed.bestTimingContext}
                </p>
              </div>
            )}
            {seed.avoidContexts && (
              <div>
                <span className="text-xs text-red-400 font-medium">Avoid:</span>
                <p
                  className={`text-sm ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  {seed.avoidContexts}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Phase History */}
        <div
          className={`p-4 rounded-xl ${
            isBambiMode
              ? 'bg-white border border-pink-200'
              : 'bg-protocol-surface border border-protocol-border'
          }`}
        >
          <h3
            className={`text-sm font-medium mb-3 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
            }`}
          >
            Phase History
          </h3>
          <div className="space-y-2">
            {seed.phaseHistory.map((entry, index) => (
              <div key={index} className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: PHASE_COLORS[entry.phase] }}
                />
                <span
                  className={`flex-1 text-sm ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  {SEED_PHASE_CONFIG[entry.phase].label}
                </span>
                <span
                  className={`text-xs ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`}
                >
                  {formatDate(entry.date)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions Log */}
        <div
          className={`p-4 rounded-xl ${
            isBambiMode
              ? 'bg-white border border-pink-200'
              : 'bg-protocol-surface border border-protocol-border'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3
              className={`text-sm font-medium ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}
            >
              Action History
            </h3>
            <span
              className={`text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              {actions.length} entries
            </span>
          </div>

          {isLoadingActions ? (
            <div className="flex items-center justify-center py-4">
              <Loader2
                className={`w-5 h-5 animate-spin ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
                }`}
              />
            </div>
          ) : actions.length === 0 ? (
            <p
              className={`text-sm text-center py-4 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              No actions logged yet
            </p>
          ) : (
            <div className="space-y-3">
              {actions.slice(0, 5).map((action) => {
                const actionConfig = ACTION_TYPE_LABELS[action.actionType] || {
                  label: action.actionType,
                  emoji: '📌',
                };
                return (
                  <div
                    key={action.id}
                    className={`p-3 rounded-lg ${
                      isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{actionConfig.emoji}</span>
                      <span
                        className={`flex-1 text-sm font-medium ${
                          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                        }`}
                      >
                        {actionConfig.label}
                      </span>
                      <span
                        className={`text-xs ${
                          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                        }`}
                      >
                        {formatDate(action.occurredAt)}
                      </span>
                    </div>
                    {action.whatHappened && (
                      <p
                        className={`text-xs ${
                          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                        }`}
                      >
                        {action.whatHappened}
                      </p>
                    )}
                    {action.herReaction && (
                      <p
                        className={`text-xs mt-1 ${
                          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted/70'
                        }`}
                      >
                        Her reaction: {action.herReaction}
                      </p>
                    )}
                  </div>
                );
              })}
              {actions.length > 5 && (
                <p
                  className={`text-xs text-center ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`}
                >
                  +{actions.length - 5} more actions
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Buttons */}
      <div
        className={`fixed bottom-0 left-0 right-0 p-4 flex gap-3 ${
          isBambiMode
            ? 'bg-pink-50/90 backdrop-blur-sm border-t border-pink-200'
            : 'bg-protocol-bg/90 backdrop-blur-sm border-t border-protocol-border'
        }`}
      >
        <button
          onClick={onLogAction}
          className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
            isBambiMode
              ? 'bg-pink-500 text-white'
              : 'bg-protocol-accent text-white'
          }`}
        >
          <MessageCircle className="w-5 h-5" />
          Log Action
        </button>
        {canAdvance && (
          <button
            onClick={onAdvancePhase}
            className={`py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 ${
              isBambiMode
                ? 'bg-green-500 text-white'
                : 'bg-green-600 text-white'
            }`}
          >
            <TrendingUp className="w-5 h-5" />
            Advance
          </button>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            className={`w-full max-w-sm p-6 rounded-2xl ${
              isBambiMode ? 'bg-white' : 'bg-protocol-surface'
            }`}
          >
            <h3
              className={`text-lg font-semibold mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Delete Seed?
            </h3>
            <p
              className={`text-sm mb-4 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              This will permanently delete "{seed.title}" and all its action history.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className={`flex-1 py-3 rounded-xl font-medium ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-700'
                    : 'bg-protocol-bg text-protocol-text'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDelete();
                }}
                className="flex-1 py-3 rounded-xl font-medium bg-red-500 text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
