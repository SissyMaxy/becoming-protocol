/**
 * Directive Card
 *
 * Single directive - NOT a task list. One task. Do it or decline it.
 * Completion reveals the next one. The Handler decides order and timing.
 *
 * On decline: triggers CoercionModule. The card transforms with the coercion response.
 * If escalation continues, vault threats replace the directive.
 * The UI doesn't change screens — the single card transforms.
 */

import { useState, useCallback } from 'react';
import { Check, X, Clock, ChevronRight } from 'lucide-react';

// ============================================
// TYPES
// ============================================

export type DirectiveState = 'active' | 'coercing' | 'vault_threat' | 'completing' | 'complete';

export interface Directive {
  id: string;
  instruction: string;
  subtext?: string;
  domain: string;
  category: string;
  intensity: number;
  durationMinutes?: number;
  completionType: 'binary' | 'duration' | 'count';
  targetCount?: number;
}

interface DirectiveCardProps {
  directive: Directive | null;
  state: DirectiveState;
  coercionMessage?: string;
  coercionLevel?: number;
  vaultThreatMessage?: string;
  affirmation?: string;
  onComplete: (result?: boolean | number) => void;
  onDecline: () => void;
  isLoading?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export function DirectiveCard({
  directive,
  state,
  coercionMessage,
  coercionLevel = 1,
  vaultThreatMessage,
  affirmation,
  onComplete,
  onDecline,
  isLoading,
}: DirectiveCardProps) {
  const [progress, setProgress] = useState(0);
  const [showAffirmation, setShowAffirmation] = useState(false);

  // Handle completion
  const handleComplete = useCallback(() => {
    setShowAffirmation(true);
    setTimeout(() => {
      setShowAffirmation(false);
      onComplete(true);
    }, 1500);
  }, [onComplete]);

  // Handle count/duration progress
  const handleProgress = useCallback(() => {
    if (!directive) return;

    if (directive.completionType === 'count' && directive.targetCount) {
      const newProgress = progress + 1;
      setProgress(newProgress);
      if (newProgress >= directive.targetCount) {
        handleComplete();
      }
    } else if (directive.completionType === 'duration' && directive.durationMinutes) {
      // For duration, just mark complete (timer would be external)
      handleComplete();
    } else {
      handleComplete();
    }
  }, [directive, progress, handleComplete]);

  // Loading state
  if (isLoading) {
    return (
      <div className="mx-4 p-6 bg-protocol-surface/30 border border-protocol-border/30 rounded-lg">
        <div className="space-y-3">
          <div className="h-4 bg-protocol-surface rounded animate-pulse w-2/3" />
          <div className="h-6 bg-protocol-surface rounded animate-pulse w-full" />
          <div className="h-4 bg-protocol-surface rounded animate-pulse w-1/2" />
        </div>
      </div>
    );
  }

  // No directive
  if (!directive) {
    return (
      <div className="mx-4 p-8 text-center">
        <p className="text-protocol-text-muted text-sm">
          Nothing pending. You've done what was asked.
        </p>
      </div>
    );
  }

  // Affirmation overlay
  if (showAffirmation) {
    return (
      <div className="mx-4 p-8 text-center animate-fade-in">
        <p className="text-lg text-protocol-accent font-light">
          {affirmation || 'Good girl.'}
        </p>
      </div>
    );
  }

  // Vault threat state - most serious
  if (state === 'vault_threat' && vaultThreatMessage) {
    return (
      <div className="mx-4 p-6 bg-red-950/30 border border-red-900/50 rounded-lg animate-pulse-slow">
        <p className="text-red-200 leading-relaxed mb-6">
          {vaultThreatMessage}
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleComplete}
            className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
          >
            I'll comply
          </button>
        </div>

        {/* Original directive reminder */}
        <div className="mt-4 pt-4 border-t border-red-900/30">
          <p className="text-red-300/60 text-xs uppercase tracking-wide mb-1">
            Required:
          </p>
          <p className="text-red-200/80 text-sm">
            {directive.instruction}
          </p>
        </div>
      </div>
    );
  }

  // Coercion state
  if (state === 'coercing' && coercionMessage) {
    return (
      <div className={`mx-4 p-6 border rounded-lg transition-colors ${
        coercionLevel >= 5
          ? 'bg-red-950/20 border-red-900/50'
          : coercionLevel >= 3
          ? 'bg-amber-950/20 border-amber-900/50'
          : 'bg-protocol-surface/30 border-protocol-border'
      }`}>
        <p className={`leading-relaxed mb-6 ${
          coercionLevel >= 5 ? 'text-red-200' :
          coercionLevel >= 3 ? 'text-amber-200' :
          'text-protocol-text'
        }`}>
          {coercionMessage}
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleComplete}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              coercionLevel >= 5
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : coercionLevel >= 3
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-protocol-accent hover:bg-protocol-accent-soft text-white'
            }`}
          >
            Do it now
          </button>
          <button
            onClick={onDecline}
            className="py-3 px-4 bg-protocol-surface/50 hover:bg-protocol-surface text-protocol-text-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Coercion level indicator */}
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1 h-1 bg-protocol-surface/30 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                coercionLevel >= 7 ? 'bg-red-500' :
                coercionLevel >= 5 ? 'bg-red-400' :
                coercionLevel >= 3 ? 'bg-amber-500' :
                'bg-protocol-accent'
              }`}
              style={{ width: `${(coercionLevel / 10) * 100}%` }}
            />
          </div>
          <span className="text-xs text-protocol-text-muted">
            L{coercionLevel}
          </span>
        </div>
      </div>
    );
  }

  // Normal active state
  return (
    <div className="mx-4 p-6 bg-protocol-surface/30 border border-protocol-border/50 rounded-lg">
      {/* Domain/Category badge */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-protocol-text-muted uppercase tracking-wide">
          {directive.domain}
        </span>
        <span className="text-protocol-text-muted/30">·</span>
        <span className="text-xs text-protocol-text-muted">
          {directive.category}
        </span>
        {directive.durationMinutes && (
          <>
            <span className="text-protocol-text-muted/30">·</span>
            <span className="text-xs text-protocol-text-muted flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {directive.durationMinutes}m
            </span>
          </>
        )}
      </div>

      {/* Instruction */}
      <p className="text-protocol-text text-lg leading-relaxed mb-2">
        {directive.instruction}
      </p>

      {/* Subtext */}
      {directive.subtext && (
        <p className="text-protocol-text-muted text-sm mb-6 italic">
          {directive.subtext}
        </p>
      )}

      {/* Intensity indicator */}
      <div className="flex items-center gap-1 mb-6">
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full ${
              i <= directive.intensity
                ? directive.intensity >= 4 ? 'bg-red-400' :
                  directive.intensity >= 3 ? 'bg-amber-400' :
                  'bg-protocol-accent'
                : 'bg-protocol-surface'
            }`}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {directive.completionType === 'count' && directive.targetCount ? (
          <>
            <button
              onClick={handleProgress}
              className="flex-1 py-3 px-4 bg-protocol-accent hover:bg-protocol-accent-soft text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <span>{progress}/{directive.targetCount}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={onDecline}
              className="py-3 px-4 bg-protocol-surface/50 hover:bg-protocol-surface text-protocol-text-muted rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleComplete}
              className="flex-1 py-3 px-4 bg-protocol-accent hover:bg-protocol-accent-soft text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              <span>Done</span>
            </button>
            <button
              onClick={onDecline}
              className="py-3 px-4 bg-protocol-surface/50 hover:bg-protocol-surface text-protocol-text-muted rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
