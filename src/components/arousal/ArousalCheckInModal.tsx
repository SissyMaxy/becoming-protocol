import { useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type {
  ArousalState,
  PhysicalSign,
  ArousalCheckInInput,
} from '../../types/arousal';
import {
  AROUSAL_STATE_CONFIG,
  PHYSICAL_SIGN_CONFIG,
} from '../../types/arousal';

interface ArousalCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ArousalCheckInInput) => Promise<void>;
  initialState?: ArousalState;
}

export function ArousalCheckInModal({
  isOpen,
  onClose,
  onSubmit,
  initialState = 'baseline',
}: ArousalCheckInModalProps) {
  const { isBambiMode } = useBambiMode();
  const [state, setState] = useState<ArousalState>(initialState);
  const [arousalLevel, setArousalLevel] = useState(5);
  const [feminizationReceptivity, setFeminizationReceptivity] = useState(5);
  const [achingIntensity, setAchingIntensity] = useState(5);
  const [edgeCount, setEdgeCount] = useState(0);
  const [physicalSigns, setPhysicalSigns] = useState<PhysicalSign[]>([]);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      await onSubmit({
        state,
        arousalLevel,
        feminizationReceptivity,
        achingIntensity,
        edgeCount,
        physicalSigns,
        notes: notes || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Failed to submit check-in:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePhysicalSign = (sign: PhysicalSign) => {
    setPhysicalSigns(prev =>
      prev.includes(sign)
        ? prev.filter(s => s !== sign)
        : [...prev, sign]
    );
  };

  const states = Object.keys(AROUSAL_STATE_CONFIG) as ArousalState[];
  const signs = Object.keys(PHYSICAL_SIGN_CONFIG) as PhysicalSign[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className={`w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b ${
            isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-bg border-protocol-border'
          }`}
        >
          <h2
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Arousal Check-In
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-full ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-400'
                : 'hover:bg-protocol-surface text-protocol-text-muted'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* State Selection */}
          <div>
            <label
              className={`block text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Current State
            </label>
            <div className="grid grid-cols-3 gap-2">
              {states.map((s) => {
                const config = AROUSAL_STATE_CONFIG[s];
                const isSelected = state === s;
                return (
                  <button
                    key={s}
                    onClick={() => setState(s)}
                    className={`p-3 rounded-xl text-center transition-all ${
                      isSelected
                        ? isBambiMode
                          ? 'bg-pink-500 text-white'
                          : 'bg-protocol-accent text-white'
                        : isBambiMode
                          ? 'bg-pink-50 text-pink-600 border border-pink-200'
                          : 'bg-protocol-surface text-protocol-text border border-protocol-border'
                    }`}
                  >
                    <span className="text-xl block mb-1">{config.emoji}</span>
                    <span className="text-xs">{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Arousal Level */}
          <div>
            <label
              className={`block text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Arousal Level
            </label>
            <div className="flex justify-between gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                <button
                  key={level}
                  onClick={() => setArousalLevel(level)}
                  className={`w-8 h-8 rounded-full text-sm font-medium transition-all ${
                    arousalLevel === level
                      ? isBambiMode
                        ? 'bg-pink-500 text-white scale-110'
                        : 'bg-protocol-accent text-white scale-110'
                      : isBambiMode
                        ? 'bg-pink-100 text-pink-600'
                        : 'bg-protocol-surface text-protocol-text'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Feminization Receptivity */}
          <div>
            <label
              className={`block text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Feminization Receptivity
            </label>
            <div className="flex justify-between gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                <button
                  key={level}
                  onClick={() => setFeminizationReceptivity(level)}
                  className={`w-8 h-8 rounded-full text-sm font-medium transition-all ${
                    feminizationReceptivity === level
                      ? isBambiMode
                        ? 'bg-purple-500 text-white scale-110'
                        : 'bg-purple-600 text-white scale-110'
                      : isBambiMode
                        ? 'bg-purple-100 text-purple-600'
                        : 'bg-protocol-surface text-protocol-text'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Aching Intensity */}
          <div>
            <label
              className={`block text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Aching Intensity
            </label>
            <div className="flex justify-between gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
                <button
                  key={level}
                  onClick={() => setAchingIntensity(level)}
                  className={`w-8 h-8 rounded-full text-sm font-medium transition-all ${
                    achingIntensity === level
                      ? isBambiMode
                        ? 'bg-red-400 text-white scale-110'
                        : 'bg-red-600 text-white scale-110'
                      : isBambiMode
                        ? 'bg-red-100 text-red-600'
                        : 'bg-protocol-surface text-protocol-text'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Edge Count */}
          <div>
            <label
              className={`block text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Edges Today
            </label>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setEdgeCount(Math.max(0, edgeCount - 1))}
                disabled={edgeCount === 0}
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  edgeCount === 0
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                } ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-600'
                    : 'bg-protocol-surface text-protocol-text'
                }`}
              >
                <Minus className="w-5 h-5" />
              </button>
              <span
                className={`text-3xl font-bold w-16 text-center ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                }`}
              >
                {edgeCount}
              </span>
              <button
                onClick={() => setEdgeCount(edgeCount + 1)}
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-600'
                    : 'bg-protocol-surface text-protocol-text'
                }`}
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Physical Signs */}
          <div>
            <label
              className={`block text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Physical Signs
            </label>
            <div className="flex flex-wrap gap-2">
              {signs.map((sign) => {
                const config = PHYSICAL_SIGN_CONFIG[sign];
                const isSelected = physicalSigns.includes(sign);
                return (
                  <button
                    key={sign}
                    onClick={() => togglePhysicalSign(sign)}
                    className={`px-3 py-2 rounded-lg text-sm transition-all ${
                      isSelected
                        ? isBambiMode
                          ? 'bg-pink-500 text-white'
                          : 'bg-protocol-accent text-white'
                        : isBambiMode
                          ? 'bg-pink-50 text-pink-600 border border-pink-200'
                          : 'bg-protocol-surface text-protocol-text border border-protocol-border'
                    }`}
                  >
                    {config.emoji} {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any observations or context..."
              rows={2}
              className={`w-full px-4 py-3 rounded-xl resize-none ${
                isBambiMode
                  ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
                  : 'bg-protocol-surface border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
              } outline-none transition-colors`}
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className={`w-full py-3 rounded-xl font-medium transition-all ${
              isLoading
                ? isBambiMode
                  ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
                  : 'bg-protocol-surface-light text-protocol-text-muted cursor-not-allowed'
                : isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
            }`}
          >
            {isLoading ? 'Saving...' : 'Save Check-In'}
          </button>
        </div>
      </div>
    </div>
  );
}
