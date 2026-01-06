/**
 * Irreversibility Modal
 * Celebrates and acknowledges irreversible milestone achievements
 */

import { useState, useEffect } from 'react';
import { Lock, Sparkles, X, Heart, Star } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { getVectorById } from '../../data/vector-definitions';
import type { IrreversibilityMarker } from '../../types/adaptive-feminization';

interface IrreversibilityModalProps {
  marker: IrreversibilityMarker;
  onAcknowledge: () => Promise<void>;
  onClose: () => void;
}

export function IrreversibilityModal({
  marker,
  onAcknowledge,
  onClose,
}: IrreversibilityModalProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [showContent, setShowContent] = useState(false);

  const vector = getVectorById(marker.vectorId);

  // Animate in
  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Trigger celebration on mount
  useEffect(() => {
    if (isBambiMode) {
      triggerHearts?.();
    }
  }, [isBambiMode, triggerHearts]);

  const handleAcknowledge = async () => {
    setIsAcknowledging(true);
    try {
      await onAcknowledge();
      if (isBambiMode) {
        triggerHearts?.();
      }
    } finally {
      setIsAcknowledging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          showContent ? 'opacity-100' : 'opacity-0'
        } ${isBambiMode ? 'bg-pink-900/60' : 'bg-black/60'} backdrop-blur-sm`}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md transform transition-all duration-500 ${
          showContent ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        {/* Floating particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className={`absolute animate-float-slow ${
                isBambiMode ? 'text-pink-300' : 'text-purple-400'
              }`}
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                opacity: 0.5 + Math.random() * 0.5,
              }}
            >
              {i % 3 === 0 ? (
                <Sparkles className="w-4 h-4" />
              ) : i % 3 === 1 ? (
                <Heart className="w-3 h-3" />
              ) : (
                <Star className="w-3 h-3" />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className={`rounded-2xl overflow-hidden ${
          isBambiMode
            ? 'bg-gradient-to-b from-pink-50 to-pink-100'
            : 'bg-gradient-to-b from-protocol-surface to-protocol-bg'
        }`}>
          {/* Close button */}
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${
              isBambiMode ? 'hover:bg-pink-200' : 'hover:bg-protocol-surface-light'
            }`}
          >
            <X className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`} />
          </button>

          {/* Header */}
          <div className={`p-6 text-center ${
            isBambiMode
              ? 'bg-gradient-to-r from-pink-400 to-purple-400'
              : 'bg-gradient-to-r from-protocol-accent to-purple-600'
          }`}>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-1">
              Irreversible Milestone
            </h2>
            <p className="text-white/80 text-sm">
              This change is permanent
            </p>
          </div>

          {/* Body */}
          <div className="p-6">
            {/* Vector info */}
            {vector && (
              <div className={`p-4 rounded-xl mb-4 ${
                isBambiMode ? 'bg-white' : 'bg-protocol-surface'
              }`}>
                <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}>
                  {vector.category === 'feminization' ? 'Feminization' : 'Sissification'} Vector
                </p>
                <p className={`text-lg font-semibold ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}>
                  {vector.name}
                </p>
              </div>
            )}

            {/* Milestone info */}
            <div className={`p-4 rounded-xl mb-4 border-l-4 ${
              isBambiMode
                ? 'bg-purple-50 border-purple-400'
                : 'bg-purple-900/20 border-purple-500'
            }`}>
              <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${
                isBambiMode ? 'text-purple-500' : 'text-purple-400'
              }`}>
                Level {marker.level} Milestone
              </p>
              <p className={`font-semibold mb-2 ${
                isBambiMode ? 'text-purple-700' : 'text-purple-300'
              }`}>
                {marker.milestoneName}
              </p>
              <p className={`text-sm italic ${
                isBambiMode ? 'text-purple-600' : 'text-purple-400'
              }`}>
                "{marker.message}"
              </p>
            </div>

            {/* Explanation */}
            <div className={`p-4 rounded-xl mb-6 ${
              isBambiMode ? 'bg-amber-50' : 'bg-amber-900/20'
            }`}>
              <p className={`text-sm ${
                isBambiMode ? 'text-amber-700' : 'text-amber-400'
              }`}>
                You have reached a point of no return. The progress you've made in this vector has fundamentally changed who you are. There is no going back — only forward.
              </p>
            </div>

            {/* Achievement date */}
            <p className={`text-center text-xs mb-6 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}>
              Achieved on {new Date(marker.achievedAt).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>

            {/* Acknowledge button */}
            <button
              onClick={handleAcknowledge}
              disabled={isAcknowledging}
              className={`w-full py-3 rounded-xl font-semibold text-white transition-all ${
                isBambiMode
                  ? 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600'
                  : 'bg-gradient-to-r from-protocol-accent to-purple-600 hover:from-protocol-accent/90 hover:to-purple-700'
              }`}
            >
              {isAcknowledging ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Acknowledging...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  <span>I Accept This Change</span>
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* CSS for floating animation */}
      <style>{`
        @keyframes float-slow {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-20px) rotate(180deg);
          }
        }
        .animate-float-slow {
          animation: float-slow 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
