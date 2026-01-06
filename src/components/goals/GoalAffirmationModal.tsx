/**
 * Goal Affirmation Modal
 *
 * "I am someone who practices [goal] daily."
 * Shown at goal milestones (Day 10, 20, 30)
 * Identity-based change is the most lasting.
 */

import { useState, useEffect } from 'react';
import { Sparkles, Check, Heart } from 'lucide-react';
import { recordGoalAffirmation } from '../../lib/ratchets';
import { supabase } from '../../lib/supabase';
import type { Goal } from '../../types/goals';

interface GoalAffirmationModalProps {
  goal: Goal;
  onComplete: () => void;
}

// Generate affirmation statement based on goal
function getAffirmationStatement(goal: Goal, streak: number): string {
  const domain = goal.domain;

  // Domain-specific affirmations
  const domainAffirmations: Record<string, string[]> = {
    voice: [
      "I am someone who practices her voice daily.",
      "My feminine voice is becoming natural.",
      "I am a woman who speaks with grace.",
    ],
    movement: [
      "I am someone who moves with feminine grace.",
      "Feminine movement is becoming automatic.",
      "I embody feminine presence naturally.",
    ],
    skincare: [
      "I am someone who cares for her skin daily.",
      "Self-care is part of who I am.",
      "I nurture my body with intention.",
    ],
    style: [
      "I am someone who expresses herself through style.",
      "Feminine presentation is my daily practice.",
      "I dress as the woman I am becoming.",
    ],
    social: [
      "I am someone who practices feminine social presence.",
      "I connect with others as my authentic self.",
      "My feminine energy is welcomed in social spaces.",
    ],
    mindset: [
      "I am someone who cultivates a feminine mindset.",
      "My thoughts align with who I'm becoming.",
      "I think and feel as the woman I am.",
    ],
  };

  const goalName = goal.name.toLowerCase();

  // Pick based on milestone
  const index = streak >= 30 ? 2 : streak >= 20 ? 1 : 0;

  if (domain && domainAffirmations[domain]) {
    return domainAffirmations[domain][index];
  }

  // Generic affirmations for non-domain goals
  return `I am someone who ${goalName.includes('practice') ? goalName : `practices ${goalName}`} daily.`;
}

function getMilestoneTitle(streak: number): string {
  if (streak >= 30) return 'Day 30 Milestone';
  if (streak >= 20) return 'Day 20 Milestone';
  if (streak >= 10) return 'Day 10 Milestone';
  return 'Milestone Reached';
}

function getMilestoneSubtitle(streak: number): string {
  if (streak >= 30) return "30 days. This isn't a phase. This is who you are.";
  if (streak >= 20) return "20 days of consistency. You're building a new identity.";
  if (streak >= 10) return "10 days without missing. You're committed to this.";
  return "You've reached a milestone. Time to affirm who you're becoming.";
}

export function GoalAffirmationModal({ goal, onComplete }: GoalAffirmationModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAffirmed, setIsAffirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [typedText, setTypedText] = useState('');

  const statement = getAffirmationStatement(goal, goal.consecutiveDays);
  const isTypingComplete = typedText.toLowerCase() === statement.toLowerCase();

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);
  }, []);

  const handleAffirm = async () => {
    if (!isTypingComplete) return;

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await recordGoalAffirmation(
        user.id,
        goal.id,
        statement,
        goal.consecutiveDays
      );

      setIsAffirmed(true);
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (error) {
      console.error('Error recording affirmation:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-protocol-bg/95' : 'bg-transparent pointer-events-none'
      }`}
    >
      <div
        className={`max-w-md w-full transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className="card p-6 text-center overflow-hidden relative">
          {/* Gradient background effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-protocol-accent/10 to-pink-500/10 pointer-events-none" />

          <div className="relative">
            {!isAffirmed ? (
              <>
                {/* Icon */}
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-protocol-accent" />
                </div>

                {/* Title */}
                <h2 className="text-2xl font-bold text-protocol-text mb-2">
                  {getMilestoneTitle(goal.consecutiveDays)}
                </h2>

                {/* Goal name */}
                <p className="text-protocol-accent font-medium mb-2">
                  {goal.name}
                </p>

                {/* Subtitle */}
                <p className="text-protocol-text-muted mb-6">
                  {getMilestoneSubtitle(goal.consecutiveDays)}
                </p>

                {/* Statement to type */}
                <div className="p-4 rounded-lg bg-protocol-surface/50 mb-4">
                  <p className="text-sm text-protocol-text-muted mb-2">
                    Type this affirmation to make it real:
                  </p>
                  <p className="text-lg text-protocol-text font-medium italic">
                    "{statement}"
                  </p>
                </div>

                {/* Input field */}
                <div className="mb-6">
                  <input
                    type="text"
                    value={typedText}
                    onChange={(e) => setTypedText(e.target.value)}
                    placeholder="Type the affirmation..."
                    className={`w-full p-4 rounded-lg border-2 bg-protocol-surface text-protocol-text text-center transition-colors ${
                      isTypingComplete
                        ? 'border-green-500/50 bg-green-900/10'
                        : 'border-protocol-border focus:border-protocol-accent'
                    }`}
                  />
                  {isTypingComplete && (
                    <p className="text-green-400 text-sm mt-2 flex items-center justify-center gap-1">
                      <Check className="w-4 h-4" />
                      Perfect
                    </p>
                  )}
                </div>

                {/* Affirmation button */}
                <button
                  onClick={handleAffirm}
                  disabled={!isTypingComplete || isSubmitting}
                  className={`w-full py-4 rounded-lg font-medium transition-all ${
                    isTypingComplete
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90'
                      : 'bg-protocol-surface text-protocol-text-muted cursor-not-allowed'
                  }`}
                >
                  {isSubmitting ? 'Recording...' : 'I am her'}
                </button>

                <p className="text-xs text-protocol-text-muted mt-4">
                  This affirmation becomes part of your identity record.
                </p>
              </>
            ) : (
              <>
                {/* Confirmed state */}
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center animate-scale-in">
                  <Heart className="w-10 h-10 text-pink-400" />
                </div>

                <h2 className="text-2xl font-bold text-protocol-text mb-2">
                  Affirmed.
                </h2>

                <p className="text-lg text-protocol-accent font-medium mb-2">
                  "{statement}"
                </p>

                <p className="text-protocol-text-muted">
                  This is who you are now.
                </p>

                <div className="mt-6 p-3 rounded-lg bg-protocol-surface/50">
                  <p className="text-sm text-protocol-text-muted">
                    {goal.consecutiveDays} consecutive days of practice
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
