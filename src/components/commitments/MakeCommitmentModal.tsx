/**
 * Make Commitment Modal
 * Modal for creating new commitments with binding level selection
 */

import { useState } from 'react';
import { X, Link2, Link, Lock, AlertTriangle, Sparkles } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { ArousalGatedCommitment, BindingLevel } from '../../types/commitments';
import { BINDING_LEVEL_INFO } from '../../types/commitments';

interface MakeCommitmentModalProps {
  availableCommitments: ArousalGatedCommitment[];
  currentArousalState?: string;
  currentDenialDay?: number;
  onMakeCommitment: (commitmentId: string) => Promise<void>;
  onMakeCustom: (text: string, bindingLevel: BindingLevel) => Promise<void>;
  onClose: () => void;
}

type Tab = 'available' | 'custom';

const BINDING_ICONS: Record<BindingLevel, React.ElementType> = {
  soft: Link2,
  hard: Link,
  permanent: Lock,
};

export function MakeCommitmentModal({
  availableCommitments,
  currentArousalState,
  currentDenialDay,
  onMakeCommitment,
  onMakeCustom,
  onClose,
}: MakeCommitmentModalProps) {
  const { isBambiMode } = useBambiMode();
  const [activeTab, setActiveTab] = useState<Tab>('available');
  const [selectedCommitment, setSelectedCommitment] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const [customBindingLevel, setCustomBindingLevel] = useState<BindingLevel>('soft');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleSelectCommitment = async (id: string) => {
    setSelectedCommitment(id);
    setShowConfirmation(true);
  };

  const handleConfirmCommitment = async () => {
    if (!selectedCommitment) return;

    setIsProcessing(true);
    try {
      await onMakeCommitment(selectedCommitment);
      onClose();
    } catch (err) {
      console.error('Failed to make commitment:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMakeCustom = async () => {
    if (!customText.trim()) return;

    setIsProcessing(true);
    try {
      await onMakeCustom(customText.trim(), customBindingLevel);
      onClose();
    } catch (err) {
      console.error('Failed to make custom commitment:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedCommitmentData = availableCommitments.find(c => c.id === selectedCommitment);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative w-full max-w-md max-h-[85vh] overflow-hidden rounded-2xl ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
      }`}>
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          isBambiMode ? 'border-pink-200' : 'border-protocol-border'
        }`}>
          <h2 className={`text-lg font-semibold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            Make a Commitment
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface'
            }`}
          >
            <X className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`} />
          </button>
        </div>

        {/* Current state info */}
        <div className={`px-4 py-3 flex items-center gap-3 ${
          isBambiMode ? 'bg-pink-100/50' : 'bg-protocol-surface'
        }`}>
          <Sparkles className={`w-4 h-4 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`} />
          <div className="text-xs">
            <span className={isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}>
              Current state: <span className="font-medium">{currentArousalState?.replace('_', ' ') || 'unknown'}</span>
            </span>
            {currentDenialDay !== undefined && currentDenialDay > 0 && (
              <span className={isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}>
                {' '}• Day {currentDenialDay}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${
          isBambiMode ? 'border-pink-200' : 'border-protocol-border'
        }`}>
          <button
            onClick={() => setActiveTab('available')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'available'
                ? isBambiMode
                  ? 'text-pink-600 border-b-2 border-pink-500'
                  : 'text-protocol-accent border-b-2 border-protocol-accent'
                : isBambiMode
                  ? 'text-pink-400'
                  : 'text-protocol-text-muted'
            }`}
          >
            Available ({availableCommitments.length})
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'custom'
                ? isBambiMode
                  ? 'text-pink-600 border-b-2 border-pink-500'
                  : 'text-protocol-accent border-b-2 border-protocol-accent'
                : isBambiMode
                  ? 'text-pink-400'
                  : 'text-protocol-text-muted'
            }`}
          >
            Custom
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[50vh]">
          {activeTab === 'available' ? (
            <div className="space-y-3">
              {availableCommitments.length === 0 ? (
                <div className={`text-center py-8 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}>
                  <Lock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No commitments available in your current state</p>
                </div>
              ) : (
                availableCommitments.map((commitment) => {
                  const Icon = BINDING_ICONS[commitment.bindingLevel];
                  const bindingInfo = BINDING_LEVEL_INFO[commitment.bindingLevel];

                  return (
                    <button
                      key={commitment.id}
                      onClick={() => handleSelectCommitment(commitment.id)}
                      className={`w-full p-4 rounded-xl text-left transition-all ${
                        isBambiMode
                          ? 'bg-white hover:bg-pink-50 border border-pink-200'
                          : 'bg-protocol-surface hover:bg-protocol-surface-light border border-protocol-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${
                            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                          }`}>
                            {commitment.description}
                          </p>
                          <p className={`text-xs mt-1 ${
                            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                          }`}>
                            {bindingInfo.description}
                          </p>
                        </div>
                        <div className={`p-2 rounded-lg ${
                          commitment.bindingLevel === 'permanent'
                            ? 'bg-red-500/10 text-red-400'
                            : commitment.bindingLevel === 'hard'
                              ? 'bg-orange-500/10 text-orange-400'
                              : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Custom text input */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}>
                  Your commitment
                </label>
                <textarea
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="I commit to..."
                  rows={3}
                  className={`w-full p-3 rounded-lg border text-sm resize-none ${
                    isBambiMode
                      ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-pink-400'
                      : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:border-protocol-accent'
                  } focus:outline-none`}
                />
              </div>

              {/* Binding level selection */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}>
                  Binding level
                </label>
                <div className="space-y-2">
                  {(Object.keys(BINDING_LEVEL_INFO) as BindingLevel[]).map((level) => {
                    const Icon = BINDING_ICONS[level];
                    const info = BINDING_LEVEL_INFO[level];
                    const isSelected = customBindingLevel === level;

                    return (
                      <button
                        key={level}
                        onClick={() => setCustomBindingLevel(level)}
                        className={`w-full p-3 rounded-lg text-left transition-all flex items-start gap-3 ${
                          isSelected
                            ? isBambiMode
                              ? 'bg-pink-100 border-2 border-pink-400'
                              : 'bg-protocol-accent/10 border-2 border-protocol-accent'
                            : isBambiMode
                              ? 'bg-white border border-pink-200'
                              : 'bg-protocol-surface border border-protocol-border'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg ${
                          level === 'permanent'
                            ? 'bg-red-500/10 text-red-400'
                            : level === 'hard'
                              ? 'bg-orange-500/10 text-orange-400'
                              : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${
                            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                          }`}>
                            {info.label}
                          </p>
                          <p className={`text-xs ${
                            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                          }`}>
                            {info.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Warning for permanent */}
              {customBindingLevel === 'permanent' && (
                <div className={`p-3 rounded-lg flex items-start gap-2 ${
                  isBambiMode ? 'bg-red-50 text-red-600' : 'bg-red-500/10 text-red-400'
                }`}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p className="text-xs">
                    Permanent commitments cannot be broken. Think carefully before proceeding.
                  </p>
                </div>
              )}

              {/* Make commitment button */}
              <button
                onClick={handleMakeCustom}
                disabled={!customText.trim() || isProcessing}
                className={`w-full py-3 rounded-lg font-medium transition-colors ${
                  !customText.trim() || isProcessing
                    ? isBambiMode
                      ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
                      : 'bg-protocol-surface text-protocol-text-muted cursor-not-allowed'
                    : isBambiMode
                      ? 'bg-pink-500 text-white hover:bg-pink-600'
                      : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
                }`}
              >
                {isProcessing ? 'Making Commitment...' : 'Make This Commitment'}
              </button>
            </div>
          )}
        </div>

        {/* Confirmation overlay */}
        {showConfirmation && selectedCommitmentData && (
          <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/80">
            <div className={`w-full max-w-sm p-6 rounded-2xl ${
              isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
            }`}>
              <div className="text-center mb-4">
                <Lock className={`w-8 h-8 mx-auto mb-2 ${
                  selectedCommitmentData.bindingLevel === 'permanent'
                    ? 'text-red-500'
                    : isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                }`} />
                <h3 className={`text-lg font-semibold ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}>
                  Confirm Commitment
                </h3>
              </div>

              <div className={`p-4 rounded-lg mb-4 ${
                isBambiMode ? 'bg-white' : 'bg-protocol-surface'
              }`}>
                <p className={`text-sm text-center ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}>
                  "{selectedCommitmentData.description}"
                </p>
              </div>

              <p className={`text-xs text-center mb-4 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}>
                {BINDING_LEVEL_INFO[selectedCommitmentData.bindingLevel].breakConsequence}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConfirmation(false);
                    setSelectedCommitment(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    isBambiMode
                      ? 'bg-pink-100 text-pink-600'
                      : 'bg-protocol-surface text-protocol-text'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmCommitment}
                  disabled={isProcessing}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    isBambiMode
                      ? 'bg-pink-500 text-white'
                      : 'bg-protocol-accent text-white'
                  }`}
                >
                  {isProcessing ? 'Confirming...' : 'I Commit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
