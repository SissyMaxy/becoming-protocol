/**
 * Pattern Detail Modal
 *
 * Expanded view of a pattern with history and editing capabilities.
 */

import { useState, useEffect } from 'react';
import { X, Trash2, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  MasculinePattern,
  PatternCatch,
  PatternStatus,
  PATTERN_CATEGORY_COLORS,
  PATTERN_CATEGORY_ICONS,
  PATTERN_CATEGORY_LABELS,
  PATTERN_STATUSES,
  PATTERN_STATUS_LABELS,
  PATTERN_STATUS_COLORS,
} from '../../types/patterns';
import { updatePattern, deletePattern, getPatternCatches } from '../../lib/patterns';

interface PatternDetailModalProps {
  pattern: MasculinePattern;
  onUpdate: () => Promise<void>;
  onLogCatch: () => void;
  onClose: () => void;
}

export function PatternDetailModal({
  pattern,
  onUpdate,
  onLogCatch,
  onClose,
}: PatternDetailModalProps) {
  const { isBambiMode } = useBambiMode();

  const [status, setStatus] = useState<PatternStatus>(pattern.status);
  const [feminineReplacement, setFeminineReplacement] = useState(pattern.feminineReplacement || '');
  const [automaticity, setAutomaticity] = useState(pattern.replacementAutomaticity);
  const [catches, setCatches] = useState<PatternCatch[]>([]);
  const [isLoadingCatches, setIsLoadingCatches] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const color = PATTERN_CATEGORY_COLORS[pattern.category];
  const iconName = PATTERN_CATEGORY_ICONS[pattern.category];
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[iconName] || LucideIcons.Circle;

  // Load catches
  useEffect(() => {
    async function loadCatches() {
      setIsLoadingCatches(true);
      const data = await getPatternCatches(pattern.id, 10);
      setCatches(data);
      setIsLoadingCatches(false);
    }
    loadCatches();
  }, [pattern.id]);

  const hasChanges =
    status !== pattern.status ||
    feminineReplacement !== (pattern.feminineReplacement || '') ||
    automaticity !== pattern.replacementAutomaticity;

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsUpdating(true);
    try {
      await updatePattern(pattern.id, {
        status,
        feminineReplacement: feminineReplacement.trim() || null,
        replacementAutomaticity: automaticity,
      });
      await onUpdate();
      onClose();
    } catch (err) {
      console.error('Failed to update pattern:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    setIsUpdating(true);
    try {
      await deletePattern(pattern.id);
      await onUpdate();
      onClose();
    } catch (err) {
      console.error('Failed to delete pattern:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const correctionRate = pattern.timesCaught > 0
    ? Math.round((pattern.timesCorrected / pattern.timesCaught) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md max-h-[90vh] overflow-hidden rounded-2xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className="p-4 border-b flex items-center justify-between"
          style={{
            backgroundColor: `${color}10`,
            borderColor: isBambiMode ? '#fbcfe8' : `${color}30`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${color}20` }}
            >
              <IconComponent className="w-6 h-6" style={{ color }} />
            </div>
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color }}
              >
                {pattern.patternName}
              </h2>
              <p
                className={`text-xs ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                {PATTERN_CATEGORY_LABELS[pattern.category]}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface'
            }`}
          >
            <X
              className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-200px)] space-y-4">
          {/* Stats */}
          <div
            className={`grid grid-cols-3 gap-2 p-3 rounded-xl ${
              isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface'
            }`}
          >
            <div className="text-center">
              <div
                className={`text-xl font-bold ${
                  isBambiMode ? 'text-pink-600' : 'text-red-400'
                }`}
              >
                {pattern.timesCaught}
              </div>
              <div
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Caught
              </div>
            </div>
            <div className="text-center">
              <div
                className={`text-xl font-bold ${
                  isBambiMode ? 'text-pink-600' : 'text-green-400'
                }`}
              >
                {pattern.timesCorrected}
              </div>
              <div
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Corrected
              </div>
            </div>
            <div className="text-center">
              <div
                className={`text-xl font-bold ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                }`}
              >
                {correctionRate}%
              </div>
              <div
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Success
              </div>
            </div>
          </div>

          {/* Status Selector */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PATTERN_STATUSES.map((s) => {
                const statusColor = PATTERN_STATUS_COLORS[s];
                const isSelected = status === s;

                return (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`p-2 rounded-lg text-sm font-medium transition-all border-2 ${
                      isSelected
                        ? ''
                        : isBambiMode
                        ? 'bg-white border-transparent'
                        : 'bg-protocol-surface border-transparent'
                    }`}
                    style={{
                      backgroundColor: isSelected ? `${statusColor}15` : undefined,
                      borderColor: isSelected ? statusColor : undefined,
                      color: isSelected ? statusColor : undefined,
                    }}
                  >
                    {PATTERN_STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Automaticity */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Replacement Automaticity: {automaticity}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={automaticity}
              onChange={(e) => setAutomaticity(parseInt(e.target.value))}
              className="w-full"
              style={{ accentColor: color }}
            />
            <div
              className={`flex justify-between text-xs mt-1 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              <span>Manual</span>
              <span>Automatic</span>
            </div>
          </div>

          {/* Feminine Replacement */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Feminine Replacement
            </label>
            <textarea
              value={feminineReplacement}
              onChange={(e) => setFeminineReplacement(e.target.value)}
              placeholder="What's the feminine alternative?"
              rows={2}
              className={`w-full p-3 rounded-lg border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none`}
            />
          </div>

          {/* Recent Catches */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock
                className={`w-4 h-4 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              />
              <span
                className={`text-sm font-semibold ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Recent Catches
              </span>
            </div>

            {isLoadingCatches ? (
              <div
                className={`text-center py-4 text-sm ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Loading...
              </div>
            ) : catches.length === 0 ? (
              <div
                className={`text-center py-4 text-sm ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                No catches logged yet
              </div>
            ) : (
              <div className="space-y-2">
                {catches.map((c) => (
                  <div
                    key={c.id}
                    className={`p-3 rounded-lg ${
                      isBambiMode ? 'bg-white border border-pink-100' : 'bg-protocol-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {c.correctionApplied ? (
                          c.correctionSuccess ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                          )
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span
                          className={`text-xs ${
                            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                          }`}
                        >
                          {formatDate(c.caughtAt)}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          c.correctionApplied
                            ? c.correctionSuccess
                              ? 'bg-green-100 text-green-600'
                              : 'bg-amber-100 text-amber-600'
                            : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {c.correctionApplied
                          ? c.correctionSuccess
                            ? 'Corrected'
                            : 'Attempted'
                          : 'Uncorrected'}
                      </span>
                    </div>
                    {c.context && (
                      <p
                        className={`text-xs ${
                          isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                        }`}
                      >
                        {c.context}
                      </p>
                    )}
                    {c.triggerCause && (
                      <p
                        className={`text-[10px] mt-1 ${
                          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                        }`}
                      >
                        Trigger: {c.triggerCause}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delete Section */}
          <div
            className={`p-3 rounded-lg border ${
              isBambiMode ? 'border-pink-200' : 'border-protocol-border'
            }`}
          >
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center justify-center gap-2 text-red-500 text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete Pattern
              </button>
            ) : (
              <div className="space-y-2">
                <p
                  className={`text-xs text-center ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                  }`}
                >
                  Delete this pattern and all its catches?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className={`flex-1 py-2 rounded-lg text-sm ${
                      isBambiMode
                        ? 'bg-pink-100 text-pink-600'
                        : 'bg-protocol-surface text-protocol-text'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isUpdating}
                    className="flex-1 py-2 rounded-lg text-sm bg-red-500 text-white"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className={`p-4 border-t flex gap-3 ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <button
            onClick={onLogCatch}
            className={`flex-1 py-3 rounded-lg font-medium ${
              isBambiMode
                ? 'bg-pink-100 text-pink-600'
                : 'bg-protocol-surface text-protocol-text'
            }`}
          >
            Log Catch
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isUpdating}
            className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
              !hasChanges || isUpdating
                ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                : 'text-white'
            }`}
            style={{
              backgroundColor: hasChanges && !isUpdating ? color : undefined,
            }}
          >
            {isUpdating ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
