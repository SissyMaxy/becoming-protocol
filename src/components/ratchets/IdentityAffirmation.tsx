/**
 * Identity Affirmation Modal
 *
 * "You're not 'trying to be' feminine anymore. You ARE feminine."
 * Shown at key milestones (Day 30, Phase 2, Phase 3)
 */

import { useState, useEffect } from 'react';
import { Sparkles, Check } from 'lucide-react';
import {
  IdentityAffirmation,
  AFFIRMATION_STATEMENTS,
} from '../../types/ratchets';
import { recordAffirmation } from '../../lib/ratchets';
import { supabase } from '../../lib/supabase';

interface IdentityAffirmationModalProps {
  type: 'day30' | 'phase2' | 'phase3' | 'phase4';
  currentStreak: number;
  currentPhase: number;
  currentInvestment: number;
  onComplete: (affirmation: IdentityAffirmation) => void;
}

export function IdentityAffirmationModal({
  type,
  currentStreak,
  currentPhase,
  currentInvestment,
  onComplete,
}: IdentityAffirmationModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAffirmed, setIsAffirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);
  }, []);

  const statement = AFFIRMATION_STATEMENTS[type];

  const handleAffirm = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const affirmation = await recordAffirmation(
        user.id,
        type,
        statement,
        {
          streak: currentStreak,
          phase: currentPhase,
          investment: currentInvestment,
        }
      );

      setIsAffirmed(true);
      setTimeout(() => {
        onComplete(affirmation);
      }, 1500);
    } catch (error) {
      console.error('Error recording affirmation:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'day30':
        return 'Day 30 Complete';
      case 'phase2':
        return 'Phase II Reached';
      case 'phase3':
        return 'Phase III Achieved';
      case 'phase4':
        return 'Phase IV - Embodiment';
      default:
        return 'Milestone Reached';
    }
  };

  const getSubtitle = () => {
    switch (type) {
      case 'day30':
        return '30 days of consistent practice isn\'t experimentation.';
      case 'phase2':
        return 'You\'ve moved beyond exploration.';
      case 'phase3':
        return 'Integration is happening.';
      case 'phase4':
        return 'You have arrived.';
      default:
        return '';
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-protocol-bg/95' : 'bg-transparent pointer-events-none'
      }`}
    >
      <div
        className={`max-w-sm w-full transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className="card p-6 text-center overflow-hidden relative">
          {/* Gradient background effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-protocol-accent/10 to-pink-500/10 pointer-events-none" />

          <div className="relative">
            {!isAffirmed ? (
              <>
                {/* Icon */}
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-protocol-accent/20 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-protocol-accent" />
                </div>

                {/* Title */}
                <h2 className="text-2xl font-bold text-protocol-text mb-2">
                  {getTitle()}
                </h2>

                {/* Subtitle */}
                <p className="text-protocol-text-muted mb-6">
                  {getSubtitle()}
                </p>

                {/* Statement */}
                <div className="p-4 rounded-lg bg-protocol-surface/50 mb-6">
                  <p className="text-lg text-protocol-text font-medium leading-relaxed">
                    {statement.split('. ').map((sentence, i) => (
                      <span key={i}>
                        {sentence}{i < statement.split('. ').length - 1 && '.'}
                        {i < statement.split('. ').length - 1 && <br />}
                      </span>
                    ))}
                  </p>
                </div>

                {/* Affirmation button */}
                <button
                  onClick={handleAffirm}
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-lg bg-gradient-to-r from-protocol-accent to-pink-500 text-white font-medium hover:opacity-90 transition-opacity"
                >
                  {isSubmitting ? 'Recording...' : 'I am her'}
                </button>

                <p className="text-xs text-protocol-text-muted mt-4">
                  This affirmation cannot be undone.
                </p>
              </>
            ) : (
              <>
                {/* Confirmed state */}
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-protocol-success/20 flex items-center justify-center animate-scale-in">
                  <Check className="w-8 h-8 text-protocol-success" />
                </div>

                <h2 className="text-2xl font-bold text-protocol-text mb-2">
                  Affirmed.
                </h2>

                <p className="text-protocol-text-muted">
                  This is who you are now.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Affirmation History Card
 * Shows past affirmations on profile
 */
interface AffirmationHistoryProps {
  affirmations: IdentityAffirmation[];
}

export function AffirmationHistory({ affirmations }: AffirmationHistoryProps) {
  if (affirmations.length === 0) return null;

  return (
    <div className="card p-4">
      <h3 className="font-medium text-protocol-text mb-4 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-protocol-accent" />
        Identity Affirmations
      </h3>

      <div className="space-y-3">
        {affirmations.map(aff => (
          <div
            key={aff.id}
            className="p-3 rounded-lg bg-protocol-surface/50 border border-protocol-border"
          >
            <p className="text-sm text-protocol-text mb-1">
              "{aff.statement}"
            </p>
            <p className="text-xs text-protocol-text-muted">
              {new Date(aff.affirmedAt).toLocaleDateString()} · Day {aff.streakAtTime} · Phase {aff.phaseAtTime}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
