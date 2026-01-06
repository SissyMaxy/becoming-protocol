/**
 * Check-In Modal
 * Quick arousal state check-in form
 */

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { ArousalState, PhysicalSign } from '../../types/arousal';
import { AROUSAL_STATE_CONFIG, PHYSICAL_SIGN_CONFIG } from '../../types/arousal';

interface CheckInModalProps {
  checkInType: string;
  onSubmit: (
    arousalLevel: number,
    stateReported: ArousalState,
    achingIntensity?: number,
    physicalSigns?: PhysicalSign[],
    notes?: string
  ) => Promise<void>;
  onClose: () => void;
  isSubmitting?: boolean;
}

export function CheckInModal({
  checkInType,
  onSubmit,
  onClose,
  isSubmitting = false,
}: CheckInModalProps) {
  const { isBambiMode } = useBambiMode();

  const [arousalLevel, setArousalLevel] = useState(5);
  const [achingIntensity, setAchingIntensity] = useState(5);
  const [state, setState] = useState<ArousalState>('baseline');
  const [physicalSigns, setPhysicalSigns] = useState<PhysicalSign[]>([]);
  const [notes, setNotes] = useState('');

  const handleToggleSign = (sign: PhysicalSign) => {
    setPhysicalSigns(prev =>
      prev.includes(sign)
        ? prev.filter(s => s !== sign)
        : [...prev, sign]
    );
  };

  const handleSubmit = async () => {
    await onSubmit(
      arousalLevel,
      state,
      achingIntensity,
      physicalSigns.length > 0 ? physicalSigns : undefined,
      notes || undefined
    );
    onClose();
  };

  const states: ArousalState[] = ['baseline', 'building', 'sweet_spot', 'overload', 'post_release', 'recovery'];
  const signs: PhysicalSign[] = ['leaking', 'aching', 'sensitive', 'throbbing', 'desperate', 'calm', 'numb'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-6 ${
        isBambiMode ? 'bg-white' : 'bg-protocol-surface'
      }`}>
        {/* Close button */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 p-2 rounded-lg ${
            isBambiMode ? 'hover:bg-gray-100' : 'hover:bg-gray-700'
          }`}
        >
          <X className={`w-5 h-5 ${isBambiMode ? 'text-gray-500' : 'text-gray-400'}`} />
        </button>

        {/* Header */}
        <h2 className={`text-xl font-bold mb-1 ${
          isBambiMode ? 'text-gray-800' : 'text-protocol-text'
        }`}>
          Arousal Check-In
        </h2>
        <p className={`text-sm mb-6 ${
          isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
        }`}>
          {checkInType.charAt(0).toUpperCase() + checkInType.slice(1).replace('_', ' ')} report
        </p>

        {/* Arousal Level Slider */}
        <div className="mb-6">
          <label className={`block text-sm font-medium mb-2 ${
            isBambiMode ? 'text-gray-700' : 'text-protocol-text'
          }`}>
            Arousal Level: {arousalLevel}/10
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={arousalLevel}
            onChange={(e) => setArousalLevel(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-200 dark:bg-gray-700"
          />
          <div className="flex justify-between text-xs mt-1">
            <span className={isBambiMode ? 'text-gray-400' : 'text-gray-500'}>Low</span>
            <span className={isBambiMode ? 'text-gray-400' : 'text-gray-500'}>High</span>
          </div>
        </div>

        {/* Aching Intensity Slider */}
        <div className="mb-6">
          <label className={`block text-sm font-medium mb-2 ${
            isBambiMode ? 'text-gray-700' : 'text-protocol-text'
          }`}>
            Aching Intensity: {achingIntensity}/10
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={achingIntensity}
            onChange={(e) => setAchingIntensity(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-200 dark:bg-gray-700"
          />
        </div>

        {/* State Selection */}
        <div className="mb-6">
          <label className={`block text-sm font-medium mb-2 ${
            isBambiMode ? 'text-gray-700' : 'text-protocol-text'
          }`}>
            Current State
          </label>
          <div className="grid grid-cols-2 gap-2">
            {states.map((s) => (
              <button
                key={s}
                onClick={() => setState(s)}
                className={`p-2.5 rounded-lg text-sm font-medium transition-colors ${
                  state === s
                    ? isBambiMode
                      ? 'bg-purple-500 text-white'
                      : 'bg-purple-600 text-white'
                    : isBambiMode
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {AROUSAL_STATE_CONFIG[s].emoji} {AROUSAL_STATE_CONFIG[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Physical Signs */}
        <div className="mb-6">
          <label className={`block text-sm font-medium mb-2 ${
            isBambiMode ? 'text-gray-700' : 'text-protocol-text'
          }`}>
            Physical Signs
          </label>
          <div className="flex flex-wrap gap-2">
            {signs.map((sign) => (
              <button
                key={sign}
                onClick={() => handleToggleSign(sign)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  physicalSigns.includes(sign)
                    ? isBambiMode
                      ? 'bg-pink-500 text-white'
                      : 'bg-pink-600 text-white'
                    : isBambiMode
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {PHYSICAL_SIGN_CONFIG[sign].emoji} {PHYSICAL_SIGN_CONFIG[sign].label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <label className={`block text-sm font-medium mb-2 ${
            isBambiMode ? 'text-gray-700' : 'text-protocol-text'
          }`}>
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="How are you feeling?"
            className={`w-full px-3 py-2 rounded-lg border text-sm ${
              isBambiMode
                ? 'bg-white border-gray-200 text-gray-800 placeholder-gray-400'
                : 'bg-protocol-bg border-protocol-border text-protocol-text placeholder-gray-500'
            }`}
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`w-full py-3 rounded-xl font-semibold transition-colors ${
            isBambiMode
              ? 'bg-purple-500 hover:bg-purple-600 text-white'
              : 'bg-purple-600 hover:bg-purple-500 text-white'
          } disabled:opacity-50`}
        >
          {isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : (
            'Submit Check-In'
          )}
        </button>
      </div>
    </div>
  );
}
