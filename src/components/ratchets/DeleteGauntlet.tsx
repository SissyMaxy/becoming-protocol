/**
 * Delete Account Gauntlet
 *
 * Multi-step friction flow for account deletion.
 * Makes leaving psychologically difficult by showing:
 * 1. What they'll lose (stats)
 * 2. Their own words (confessions)
 * 3. Their letter to future self
 * 4. Final confirmation requiring typing "I am killing her"
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, X, ChevronRight, Quote, Mail } from 'lucide-react';
import {
  DeletionAttempt,
  DELETION_GAUNTLET_STEPS,
  KeyAdmission,
} from '../../types/ratchets';
import {
  startDeletionAttempt,
  updateDeletionAttempt,
  completeDeletionAttempt,
  getAdmissionForBacksliding,
} from '../../lib/ratchets';
import { supabase } from '../../lib/supabase';

interface DeleteGauntletProps {
  // User stats to show what they'll lose
  stats: {
    days: number;
    investment: number;
    letters: number;
    tasks: number;
    milestones: number;
  };
  // Sealed letter content to show
  sealedLetter?: string;
  // Called when user completes deletion
  onDelete: () => void;
  // Called when user backs out
  onCancel: () => void;
}

export function DeleteGauntlet({
  stats,
  sealedLetter,
  onDelete,
  onCancel,
}: DeleteGauntletProps) {
  const [step, setStep] = useState(1);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [confession, setConfession] = useState<KeyAdmission | null>(null);
  const [reason, setReason] = useState('');
  const [typedPhrase, setTypedPhrase] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentStepConfig = DELETION_GAUNTLET_STEPS[step - 1];
  const requiredPhrase = "I am killing her";

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);
    initializeAttempt();
  }, []);

  const initializeAttempt = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const attempt = await startDeletionAttempt(user.id);
      setAttemptId(attempt.id);

      // Get a confession to show in step 2
      const admission = await getAdmissionForBacksliding(user.id);
      setConfession(admission);
    } catch (error) {
      console.error('Error initializing deletion attempt:', error);
    }
  };

  const handleStay = async (stoppedReason: DeletionAttempt['stoppedReason']) => {
    if (attemptId) {
      await updateDeletionAttempt(attemptId, step, { reason: stoppedReason });
    }
    setIsVisible(false);
    setTimeout(onCancel, 200);
  };

  const handleContinue = async () => {
    if (step < 4) {
      if (attemptId) {
        await updateDeletionAttempt(attemptId, step + 1);
      }
      setStep(step + 1);
    }
  };

  const handleFinalDelete = async () => {
    if (typedPhrase !== requiredPhrase) return;

    setIsDeleting(true);
    try {
      if (attemptId) {
        await completeDeletionAttempt(attemptId, reason);
      }
      onDelete();
    } catch (error) {
      console.error('Error completing deletion:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-protocol-bg/95' : 'bg-transparent pointer-events-none'
      }`}
    >
      <div
        className={`max-w-md w-full max-h-[90vh] overflow-y-auto transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className="card p-6 relative">
          {/* Step 1: Show Stats */}
          {step === 1 && (
            <>
              <button
                onClick={() => handleStay('reconsidered')}
                className="absolute top-4 right-4 p-1 text-protocol-text-muted hover:text-protocol-text transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                  <Trash2 className="w-7 h-7 text-red-400" />
                </div>

                <h2 className="text-xl font-bold text-protocol-text mb-2">
                  {currentStepConfig.title}
                </h2>

                <p className="text-sm text-protocol-text-muted">
                  This will erase everything.
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between p-3 rounded-lg bg-protocol-surface">
                  <span className="text-protocol-text-muted">Days of progress</span>
                  <span className="font-medium text-red-400">{stats.days}</span>
                </div>
                <div className="flex justify-between p-3 rounded-lg bg-protocol-surface">
                  <span className="text-protocol-text-muted">Investment tracked</span>
                  <span className="font-medium text-red-400">${stats.investment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-3 rounded-lg bg-protocol-surface">
                  <span className="text-protocol-text-muted">Sealed letters</span>
                  <span className="font-medium text-red-400">{stats.letters}</span>
                </div>
                <div className="flex justify-between p-3 rounded-lg bg-protocol-surface">
                  <span className="text-protocol-text-muted">Tasks completed</span>
                  <span className="font-medium text-red-400">{stats.tasks}</span>
                </div>
                <div className="flex justify-between p-3 rounded-lg bg-protocol-surface">
                  <span className="text-protocol-text-muted">Milestones achieved</span>
                  <span className="font-medium text-red-400">{stats.milestones}</span>
                </div>
              </div>

              <button
                onClick={() => handleStay('reconsidered')}
                className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors mb-3"
              >
                {currentStepConfig.primaryButton}
              </button>

              <button
                onClick={handleContinue}
                className="w-full py-3 text-sm text-protocol-text-muted hover:text-protocol-text transition-colors flex items-center justify-center gap-1"
              >
                {currentStepConfig.secondaryButton}
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Step 2: Show Their Own Words */}
          {step === 2 && (
            <>
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Quote className="w-7 h-7 text-amber-400" />
                </div>

                <h2 className="text-xl font-bold text-protocol-text mb-2">
                  {currentStepConfig.title}
                </h2>
              </div>

              {confession ? (
                <div className="p-4 rounded-lg bg-protocol-surface border border-protocol-border mb-6">
                  <p className="text-sm text-protocol-text-muted mb-2">
                    On Day {Math.floor(Math.random() * stats.days) + 1}, you wrote:
                  </p>
                  <p className="text-protocol-text italic">
                    "{confession.admissionText}"
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-protocol-surface border border-protocol-border mb-6">
                  <p className="text-protocol-text-muted text-center">
                    You've been on this journey for {stats.days} days.
                    <br />
                    Something kept you coming back.
                  </p>
                </div>
              )}

              <p className="text-center text-protocol-text-muted mb-6">
                Were you lying to yourself then?
                <br />
                Or are you lying to yourself now?
              </p>

              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="What changed? (required to continue)"
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent resize-none mb-4"
              />

              <button
                onClick={() => handleStay('own_words')}
                className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors mb-3"
              >
                {currentStepConfig.primaryButton}
              </button>

              <button
                onClick={handleContinue}
                disabled={!reason.trim()}
                className={`w-full py-3 text-sm transition-colors flex items-center justify-center gap-1 ${
                  reason.trim()
                    ? 'text-protocol-text-muted hover:text-protocol-text'
                    : 'text-protocol-text-muted/30 cursor-not-allowed'
                }`}
              >
                {currentStepConfig.secondaryButton}
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Step 3: Show Sealed Letter */}
          {step === 3 && (
            <>
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-pink-500/20 flex items-center justify-center">
                  <Mail className="w-7 h-7 text-pink-400" />
                </div>

                <h2 className="text-xl font-bold text-protocol-text mb-2">
                  {currentStepConfig.title}
                </h2>

                <p className="text-sm text-protocol-text-muted">
                  You wrote this for this moment.
                  <br />
                  When you'd want to quit.
                </p>
              </div>

              {sealedLetter ? (
                <div className="p-4 rounded-lg bg-gradient-to-br from-pink-500/10 to-purple-500/10 border border-pink-500/30 mb-6">
                  <p className="text-protocol-text whitespace-pre-wrap">
                    {sealedLetter}
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-protocol-surface border border-protocol-border mb-6 text-center">
                  <p className="text-protocol-text-muted">
                    You haven't written a letter to your future self yet.
                    <br />
                    <br />
                    But if you had, what would you have said?
                    <br />
                    Would you have wanted yourself to give up?
                  </p>
                </div>
              )}

              <button
                onClick={() => handleStay('letter')}
                className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors mb-3"
              >
                {currentStepConfig.primaryButton}
              </button>

              <button
                onClick={handleContinue}
                className="w-full py-3 text-sm text-protocol-text-muted hover:text-protocol-text transition-colors flex items-center justify-center gap-1"
              >
                {currentStepConfig.secondaryButton}
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Step 4: Final Confirmation */}
          {step === 4 && (
            <>
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-red-400" />
                </div>

                <h2 className="text-xl font-bold text-protocol-text mb-2">
                  {currentStepConfig.title}
                </h2>

                <p className="text-protocol-text-muted">
                  Type the following to confirm:
                </p>
              </div>

              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 mb-4 text-center">
                <p className="text-red-400 font-medium">
                  "{requiredPhrase}"
                </p>
              </div>

              <input
                type="text"
                value={typedPhrase}
                onChange={e => setTypedPhrase(e.target.value)}
                placeholder="Type the phrase above..."
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-red-500 mb-6"
              />

              <button
                onClick={() => handleStay('typing_phrase')}
                className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors mb-3"
              >
                {currentStepConfig.primaryButton}
              </button>

              <button
                onClick={handleFinalDelete}
                disabled={typedPhrase !== requiredPhrase || isDeleting}
                className={`w-full py-3 text-sm transition-colors ${
                  typedPhrase === requiredPhrase && !isDeleting
                    ? 'text-red-400 hover:text-red-300'
                    : 'text-protocol-text-muted/30 cursor-not-allowed'
                }`}
              >
                {isDeleting ? 'Deleting...' : currentStepConfig.secondaryButton}
              </button>
            </>
          )}

          {/* Step indicator */}
          <div className="flex justify-center gap-2 mt-6">
            {[1, 2, 3, 4].map(s => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-colors ${
                  s === step
                    ? 'bg-protocol-accent'
                    : s < step
                    ? 'bg-protocol-accent/50'
                    : 'bg-protocol-border'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
