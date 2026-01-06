/**
 * Log Guy Mode Modal
 * Modal for logging guy mode events
 */

import { useState } from 'react';
import { X, AlertTriangle, Clock, Shirt, Mic, User, SkipForward, Timer, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { GuyModeEventType } from '../../types/guy-mode';

interface LogGuyModeModalProps {
  onLogEvent: (eventType: GuyModeEventType, durationMinutes?: number, notes?: string) => Promise<void>;
  onClose: () => void;
}

interface EventOption {
  type: GuyModeEventType;
  label: string;
  description: string;
  icon: React.ElementType;
  requiresDuration?: boolean;
  requiresNotes?: boolean;
}

const EVENT_OPTIONS: EventOption[] = [
  {
    type: 'costume_mode_entered',
    label: 'Entering Costume Mode',
    description: 'Starting a period of masculine presentation',
    icon: User,
  },
  {
    type: 'costume_mode_exited',
    label: 'Exiting Costume Mode',
    description: 'Finished presenting masculine',
    icon: Timer,
    requiresDuration: true,
  },
  {
    type: 'masculine_clothing_worn',
    label: 'Masculine Clothing',
    description: 'Wore masculine clothing item',
    icon: Shirt,
    requiresNotes: true,
  },
  {
    type: 'deadname_used_by_self',
    label: 'Used Deadname',
    description: 'Called yourself by your old name',
    icon: AlertTriangle,
  },
  {
    type: 'masculine_voice_used',
    label: 'Used Masculine Voice',
    description: 'Spoke in your old voice',
    icon: Mic,
  },
  {
    type: 'masculine_posture_defaulted',
    label: 'Masculine Posture',
    description: 'Defaulted to masculine body language',
    icon: User,
  },
  {
    type: 'skipped_feminization',
    label: 'Skipped Feminization',
    description: 'Skipped a feminization practice',
    icon: SkipForward,
  },
];

export function LogGuyModeModal({ onLogEvent, onClose }: LogGuyModeModalProps) {
  const { isBambiMode } = useBambiMode();
  const [selectedEvent, setSelectedEvent] = useState<EventOption | null>(null);
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSelectEvent = (event: EventOption) => {
    setSelectedEvent(event);
    if (!event.requiresDuration && !event.requiresNotes) {
      setShowConfirm(true);
    }
  };

  const handleSubmit = async () => {
    if (!selectedEvent) return;

    setIsSubmitting(true);
    try {
      const durationMinutes = duration ? parseInt(duration, 10) : undefined;
      await onLogEvent(selectedEvent.type, durationMinutes, notes || undefined);
      onClose();
    } catch (err) {
      console.error('Failed to log event:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    setSelectedEvent(null);
    setShowConfirm(false);
    setDuration('');
    setNotes('');
  };

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
            {selectedEvent ? selectedEvent.label : 'Log Guy Mode Event'}
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

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {!selectedEvent ? (
            // Event selection
            <div className="space-y-2">
              <p className={`text-sm mb-4 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}>
                What happened?
              </p>
              {EVENT_OPTIONS.map((event) => {
                const Icon = event.icon;
                return (
                  <button
                    key={event.type}
                    onClick={() => handleSelectEvent(event)}
                    className={`w-full p-4 rounded-xl text-left transition-all flex items-start gap-3 ${
                      isBambiMode
                        ? 'bg-white hover:bg-pink-50 border border-pink-200'
                        : 'bg-protocol-surface hover:bg-protocol-surface-light border border-protocol-border'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${
                      isBambiMode ? 'bg-pink-100' : 'bg-protocol-bg'
                    }`}>
                      <Icon className={`w-5 h-5 ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`} />
                    </div>
                    <div>
                      <p className={`font-medium ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}>
                        {event.label}
                      </p>
                      <p className={`text-xs mt-0.5 ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}>
                        {event.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : showConfirm ? (
            // Confirmation
            <div className="text-center py-4">
              <AlertTriangle className={`w-12 h-12 mx-auto mb-4 ${
                isBambiMode ? 'text-amber-500' : 'text-amber-400'
              }`} />
              <p className={`text-lg font-medium mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}>
                Log this event?
              </p>
              <p className={`text-sm mb-6 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}>
                {selectedEvent.description}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  className={`flex-1 py-2.5 rounded-lg font-medium ${
                    isBambiMode
                      ? 'bg-pink-100 text-pink-600'
                      : 'bg-protocol-surface text-protocol-text'
                  }`}
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className={`flex-1 py-2.5 rounded-lg font-medium ${
                    isBambiMode
                      ? 'bg-amber-500 text-white'
                      : 'bg-amber-600 text-white'
                  }`}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    'Log It'
                  )}
                </button>
              </div>
            </div>
          ) : (
            // Duration/notes input
            <div className="space-y-4">
              {selectedEvent.requiresDuration && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}>
                    <Clock className="w-4 h-4 inline mr-1" />
                    Duration (minutes)
                  </label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="How long in costume mode?"
                    min="1"
                    className={`w-full p-3 rounded-lg border text-sm ${
                      isBambiMode
                        ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-pink-400'
                        : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:border-protocol-accent'
                    } focus:outline-none`}
                  />
                </div>
              )}

              {selectedEvent.requiresNotes && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}>
                    What item?
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g., boxers, men's jeans..."
                    className={`w-full p-3 rounded-lg border text-sm ${
                      isBambiMode
                        ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-pink-400'
                        : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:border-protocol-accent'
                    } focus:outline-none`}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleBack}
                  className={`flex-1 py-2.5 rounded-lg font-medium ${
                    isBambiMode
                      ? 'bg-pink-100 text-pink-600'
                      : 'bg-protocol-surface text-protocol-text'
                  }`}
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || (selectedEvent.requiresDuration && !duration)}
                  className={`flex-1 py-2.5 rounded-lg font-medium transition-colors ${
                    isSubmitting || (selectedEvent.requiresDuration && !duration)
                      ? isBambiMode
                        ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
                        : 'bg-protocol-surface text-protocol-text-muted cursor-not-allowed'
                      : isBambiMode
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'bg-amber-600 text-white hover:bg-amber-700'
                  }`}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    'Log It'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Warning footer */}
        <div className={`px-4 py-3 border-t ${
          isBambiMode ? 'border-pink-200 bg-amber-50' : 'border-protocol-border bg-amber-900/10'
        }`}>
          <p className={`text-xs text-center ${
            isBambiMode ? 'text-amber-600' : 'text-amber-400'
          }`}>
            Every guy mode event is logged. Frequent occurrences increase penalties.
          </p>
        </div>
      </div>
    </div>
  );
}
