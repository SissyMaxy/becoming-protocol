/**
 * Commitment Prompt Modal
 *
 * Displays Handler AI commitment prompts during high-arousal sessions.
 * Designed for maximum impact when user resistance is lowest.
 */

import { useState, useEffect } from 'react';
import { Flame, X, Heart, TrendingUp, AlertTriangle } from 'lucide-react';

interface CommitmentPromptModalProps {
  prompt: string;
  domain: string;
  escalationLevel: number;
  arousalLevel: number;
  edgeCount: number;
  onAccept: () => Promise<void>;
  onDecline: () => void;
  isOpen: boolean;
}

// Domain labels aligned with new 5-domain structure
// Priority: arousal > sissification > submission > identity > feminization
const DOMAIN_LABELS: Record<string, string> = {
  // Driver domains (arousal-based)
  arousal: 'Arousal',
  sissification: 'Sissification',
  submission: 'Submission',
  // Outcome domains (shaped by arousal)
  identity: 'Identity',
  feminization: 'Feminization',
  // Legacy mappings for backwards compatibility
  denial: 'Arousal',
  hypno: 'Arousal',
  chastity: 'Submission',
  sexual_service: 'Submission',
  gina_dynamic: 'Submission',
  presentation: 'Feminization',
  exposure: 'Submission',
};

export function CommitmentPromptModal({
  prompt,
  domain,
  escalationLevel,
  arousalLevel,
  edgeCount,
  onAccept,
  onDecline,
  isOpen,
}: CommitmentPromptModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsExiting(false);
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  const handleAccept = async () => {
    setIsProcessing(true);
    try {
      await onAccept();
      setIsExiting(true);
      setTimeout(() => {
        setIsVisible(false);
      }, 300);
    } catch (err) {
      console.error('Failed to accept commitment:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecline = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDecline();
      setIsVisible(false);
    }, 300);
  };

  if (!isOpen) return null;

  const domainLabel = DOMAIN_LABELS[domain] || domain;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Dramatic backdrop */}
      <div
        className={`
          absolute inset-0 bg-gradient-to-br from-red-900/90 via-pink-900/90 to-purple-900/90
          backdrop-blur-md transition-opacity duration-300
          ${isVisible && !isExiting ? 'opacity-100' : 'opacity-0'}
        `}
      />

      {/* Pulsing glow effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-red-500/20 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* Modal */}
      <div
        className={`
          relative w-full max-w-md rounded-2xl border border-red-500/30
          bg-black/80 shadow-2xl transform transition-all duration-300
          ${isVisible && !isExiting ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}
        `}
      >
        {/* Close button */}
        <button
          onClick={handleDecline}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors z-10"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>

        {/* Header with stats */}
        <div className="p-6 pb-4 border-b border-red-500/20">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Flame className="w-6 h-6 text-red-400 animate-pulse" />
            <span className="text-red-400 font-semibold text-lg">Commitment Window</span>
            <Flame className="w-6 h-6 text-red-400 animate-pulse" />
          </div>

          {/* Session stats */}
          <div className="flex items-center justify-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/20">
              <Heart className="w-4 h-4 text-red-400" />
              <span className="text-red-300">Arousal {arousalLevel}/10</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pink-500/20">
              <TrendingUp className="w-4 h-4 text-pink-400" />
              <span className="text-pink-300">Edge #{edgeCount}</span>
            </div>
          </div>
        </div>

        {/* Commitment prompt */}
        <div className="p-6">
          <p className="text-white text-xl leading-relaxed text-center font-medium">
            {prompt}
          </p>

          {/* Domain badge */}
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-sm font-medium">
              {domainLabel}
            </span>
            {escalationLevel > 0 && (
              <span className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-300 text-sm">
                Level {escalationLevel}
              </span>
            )}
          </div>
        </div>

        {/* Warning */}
        <div className="mx-6 mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-amber-300/80 text-xs">
            Commitments made during arousal are binding. Your sober self will be held to this.
          </p>
        </div>

        {/* Actions */}
        <div className="p-6 pt-2 flex gap-3">
          <button
            onClick={handleDecline}
            disabled={isProcessing}
            className="flex-1 py-4 px-4 rounded-xl bg-white/5 hover:bg-white/10
                       text-gray-300 font-medium transition-colors"
          >
            Not Yet
          </button>
          <button
            onClick={handleAccept}
            disabled={isProcessing}
            className="flex-1 py-4 px-4 rounded-xl bg-gradient-to-r from-red-500 to-pink-500
                       text-white font-bold transition-all hover:brightness-110 hover:scale-[1.02]
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Committing...' : 'I Commit'}
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <p className="text-center text-gray-500 text-xs italic">
            Horny brain decides. Sober brain lives with it.
          </p>
        </div>
      </div>
    </div>
  );
}
