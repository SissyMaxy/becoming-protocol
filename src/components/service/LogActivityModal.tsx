/**
 * Log Activity Modal
 *
 * Quick modal for logging activities at the current service stage.
 */

import { useState } from 'react';
import { X, Plus, Sparkles } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  STAGE_ACTIVITY_TEMPLATES,
  SERVICE_STAGE_LABELS,
  type ServiceStage,
} from '../../types/escalation';

interface LogActivityModalProps {
  currentStage: ServiceStage;
  onSubmit: (activity: string) => Promise<void>;
  onClose: () => void;
}

export function LogActivityModal({
  currentStage,
  onSubmit,
  onClose,
}: LogActivityModalProps) {
  const { isBambiMode } = useBambiMode();
  const [customActivity, setCustomActivity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const templates = STAGE_ACTIVITY_TEMPLATES[currentStage] || [];

  const handleSelectTemplate = async (template: string) => {
    setIsSubmitting(true);
    try {
      await onSubmit(template);
      onClose();
    } catch (err) {
      console.error('Failed to log activity:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitCustom = async () => {
    if (!customActivity.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(customActivity.trim());
      onClose();
    } catch (err) {
      console.error('Failed to log activity:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md max-h-[80vh] overflow-hidden rounded-2xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`p-4 border-b flex items-center justify-between ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <div className="flex items-center gap-2">
            <Sparkles className={isBambiMode ? 'text-pink-500' : 'text-purple-400'} />
            <div>
              <h2
                className={`text-lg font-semibold ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Log Activity
              </h2>
              <p
                className={`text-xs ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                {SERVICE_STAGE_LABELS[currentStage]} Stage
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
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-140px)] space-y-4">
          {/* Quick Templates */}
          {templates.length > 0 && (
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Quick Add
              </label>
              <div className="space-y-2">
                {templates.map(template => (
                  <button
                    key={template}
                    onClick={() => handleSelectTemplate(template)}
                    disabled={isSubmitting}
                    className={`w-full p-3 rounded-lg text-left text-sm transition-colors ${
                      isBambiMode
                        ? 'bg-white hover:bg-pink-100 text-pink-700 border border-pink-200'
                        : 'bg-protocol-surface hover:bg-protocol-surface-light text-protocol-text border border-protocol-border'
                    } disabled:opacity-50`}
                  >
                    {template}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Activity */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Custom Activity
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customActivity}
                onChange={e => setCustomActivity(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmitCustom()}
                placeholder="Describe what you did..."
                className={`flex-1 p-3 rounded-lg border text-sm ${
                  isBambiMode
                    ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                    : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
                } focus:outline-none focus:ring-2 focus:ring-purple-500/50`}
              />
              <button
                onClick={handleSubmitCustom}
                disabled={!customActivity.trim() || isSubmitting}
                className={`px-4 py-3 rounded-lg transition-colors ${
                  !customActivity.trim() || isSubmitting
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : isBambiMode
                    ? 'bg-pink-500 text-white hover:bg-pink-600'
                    : 'bg-purple-500 text-white hover:bg-purple-600'
                }`}
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
