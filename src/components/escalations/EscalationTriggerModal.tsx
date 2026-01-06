/**
 * Escalation Trigger Modal
 * Shown when an escalation is triggered - dramatic, inevitable feel
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { AutomaticEscalation } from '../../types/escalations';

interface EscalationTriggerModalProps {
  escalation: AutomaticEscalation;
  effectMessage: string;
  onDismiss: () => void;
}

export function EscalationTriggerModal({
  escalation,
  effectMessage,
  onDismiss,
}: EscalationTriggerModalProps) {
  const { isBambiMode } = useBambiMode();
  const [phase, setPhase] = useState<'reveal' | 'message' | 'accept'>('reveal');

  // Dramatic reveal sequence
  useEffect(() => {
    const timer1 = setTimeout(() => setPhase('message'), 1500);
    const timer2 = setTimeout(() => setPhase('accept'), 3000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* Header - ominous gradient */}
        <div
          className={`p-6 ${
            isBambiMode
              ? 'bg-gradient-to-br from-pink-500 to-rose-600'
              : 'bg-gradient-to-br from-protocol-danger to-red-700'
          }`}
        >
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 rounded-full bg-white/20 backdrop-blur">
              <Lock className="w-8 h-8 text-white" />
            </div>
          </div>

          <h2 className="text-xl font-bold text-white text-center">
            Escalation Triggered
          </h2>

          <p className="text-white/80 text-sm text-center mt-2">
            Day {escalation.dayTrigger} has arrived
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Escalation description */}
          <div
            className={`transition-all duration-500 ${
              phase === 'reveal' ? 'opacity-100' : 'opacity-70'
            }`}
          >
            <div className="flex items-start gap-3 p-4 rounded-xl bg-protocol-danger/10 border border-protocol-danger/20">
              <AlertTriangle className="w-5 h-5 text-protocol-danger flex-shrink-0 mt-0.5" />
              <div>
                <p className={`font-medium ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}>
                  {escalation.description}
                </p>
              </div>
            </div>
          </div>

          {/* Effect message */}
          <div
            className={`transition-all duration-500 ${
              phase === 'reveal' ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
            }`}
          >
            <p className={`text-center text-sm ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
            }`}>
              {effectMessage}
            </p>
          </div>

          {/* No going back message */}
          <div
            className={`transition-all duration-500 ${
              phase !== 'accept' ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <p className={`text-center text-xs italic ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}>
              There is no going back.
            </p>
          </div>
        </div>

        {/* Accept button */}
        <div className="p-6 pt-0">
          <button
            onClick={onDismiss}
            disabled={phase !== 'accept'}
            className={`w-full py-3 px-4 rounded-xl font-medium transition-all ${
              phase === 'accept'
                ? isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-danger text-white hover:bg-red-600'
                : 'bg-protocol-surface-light text-protocol-text-muted cursor-not-allowed'
            }`}
          >
            {phase === 'accept' ? 'I Understand' : 'Processing...'}
          </button>
        </div>
      </div>
    </div>
  );
}
