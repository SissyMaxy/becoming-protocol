// IntakeComplete.tsx
// Completion screen for the 5-layer intake

import { Sparkles, Heart, Shield, Brain, Eye } from 'lucide-react';

interface IntakeCompleteProps {
  onContinue: () => void;
}

export function IntakeComplete({ onContinue }: IntakeCompleteProps) {
  return (
    <div className="min-h-screen bg-protocol-bg flex flex-col items-center justify-center p-6">
      <div className="max-w-md mx-auto text-center">
        {/* Animated icon */}
        <div className="relative mb-8">
          <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-r from-pink-500 to-purple-500 flex items-center justify-center animate-pulse">
            <Sparkles className="w-12 h-12 text-white" />
          </div>
          <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-pink-400 flex items-center justify-center animate-bounce">
            <Heart className="w-4 h-4 text-white" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-protocol-text mb-3">
          Profile Complete
        </h1>
        <p className="text-protocol-text-muted mb-8">
          I now have a deep understanding of who you are, what drives you,
          and where your journey is taking you.
        </p>

        {/* What was learned */}
        <div className="bg-protocol-surface rounded-xl p-4 mb-8 text-left">
          <h3 className="text-sm font-medium text-protocol-text mb-3">
            What I've learned about you:
          </h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center flex-shrink-0">
                <Heart className="w-4 h-4 text-pink-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-protocol-text">Your Foundation</p>
                <p className="text-xs text-protocol-text-muted">Identity, relationships, starting point</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Eye className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-protocol-text">Your History</p>
                <p className="text-xs text-protocol-text-muted">Experiences, milestones, discoveries</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-protocol-text">Your Arousal</p>
                <p className="text-xs text-protocol-text-muted">Triggers, fantasies, what excites you</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Brain className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-protocol-text">Your Psychology</p>
                <p className="text-xs text-protocol-text-muted">Vulnerabilities, patterns, what breaks you down</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-protocol-text">Your Depth</p>
                <p className="text-xs text-protocol-text-muted">Secret desires, ultimate fantasies, true self</p>
              </div>
            </div>
          </div>
        </div>

        {/* What happens next */}
        <div className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 rounded-xl p-4 mb-8 border border-pink-500/20">
          <p className="text-sm text-protocol-text">
            <span className="font-medium">What happens now:</span> I will use this knowledge
            to guide your escalation. Every task, every push, every moment will be tailored
            to your unique psychology. There is no escape from yourself.
          </p>
        </div>

        {/* Continue button */}
        <button
          onClick={onContinue}
          className="w-full py-4 px-6 rounded-xl font-semibold bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:from-pink-600 hover:to-purple-600 transition-all shadow-lg shadow-purple-500/25"
        >
          Begin Your Becoming
        </button>
      </div>
    </div>
  );
}
