/**
 * Log Content Exposure Modal
 *
 * Form to log content exposure with theme and intensity.
 */

import { useState } from 'react';
import { X, Zap } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { ContentTheme } from '../../types/escalation';
import { logContentExposure } from '../../lib/domainEscalation';

interface LogContentExposureModalProps {
  onSubmit: () => Promise<void>;
  onClose: () => void;
}

const THEMES: { value: ContentTheme; label: string }[] = [
  { value: 'feminization', label: 'Feminization' },
  { value: 'sissification', label: 'Sissification' },
  { value: 'service', label: 'Service' },
  { value: 'humiliation', label: 'Humiliation' },
  { value: 'bbc', label: 'BBC' },
  { value: 'gangbang', label: 'Gangbang' },
  { value: 'gloryhole', label: 'Gloryhole' },
  { value: 'submission', label: 'Submission' },
  { value: 'hypno', label: 'Hypno' },
  { value: 'chastity', label: 'Chastity' },
];

export function LogContentExposureModal({
  onSubmit,
  onClose,
}: LogContentExposureModalProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();

  const [theme, setTheme] = useState<ContentTheme>('hypno');
  const [contentType, setContentType] = useState('');
  const [intensityLevel, setIntensityLevel] = useState(5);
  const [currentResponse, setCurrentResponse] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = contentType.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;

    setIsSubmitting(true);
    try {
      await logContentExposure(user.id, {
        contentType: contentType.trim(),
        theme,
        intensityLevel,
        currentResponse: currentResponse.trim() || undefined,
      });
      await onSubmit();
      onClose();
    } catch (err) {
      console.error('Failed to log content exposure:', err);
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
        className={`relative w-full max-w-md max-h-[90vh] overflow-hidden rounded-2xl ${
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
            <Zap className={isBambiMode ? 'text-pink-500' : 'text-purple-400'} />
            <h2
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Log Content Exposure
            </h2>
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
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
          {/* Theme */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Theme
            </label>
            <div className="flex flex-wrap gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    theme === t.value
                      ? isBambiMode
                        ? 'bg-pink-500 text-white'
                        : 'bg-purple-500 text-white'
                      : isBambiMode
                      ? 'bg-white text-pink-600 border border-pink-200'
                      : 'bg-protocol-surface text-protocol-text'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content Type */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Content Type / Title
            </label>
            <input
              type="text"
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
              placeholder="e.g., Bambi Sleep - Training Loop"
              className={`w-full p-3 rounded-lg border text-sm ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none focus:ring-2 focus:ring-purple-500/50`}
            />
          </div>

          {/* Intensity Level */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Intensity Level: {intensityLevel}/10
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={intensityLevel}
              onChange={(e) => setIntensityLevel(parseInt(e.target.value))}
              className="w-full accent-pink-500"
            />
            <div
              className={`flex justify-between text-xs mt-1 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              <span>Mild</span>
              <span>Extreme</span>
            </div>
          </div>

          {/* Response */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Your Response (optional)
            </label>
            <textarea
              value={currentResponse}
              onChange={(e) => setCurrentResponse(e.target.value)}
              placeholder="How did this content affect you?"
              rows={2}
              className={`w-full p-3 rounded-lg border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              } focus:outline-none`}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className={`p-4 border-t ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              !canSubmit || isSubmitting
                ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                : isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-purple-500 text-white hover:bg-purple-600'
            }`}
          >
            {isSubmitting ? 'Logging...' : 'Log Exposure'}
          </button>
        </div>
      </div>
    </div>
  );
}
