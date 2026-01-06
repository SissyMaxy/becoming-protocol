/**
 * Covenant Modal
 *
 * Formal commitment signing ceremony.
 * User agrees to terms and writes their own consequence.
 */

import { useState, useEffect } from 'react';
import { Shield, Check, X, FileSignature } from 'lucide-react';
import {
  Covenant,
  DEFAULT_COVENANT_TERMS,
} from '../../types/ratchets';
import { signCovenant } from '../../lib/ratchets';
import { supabase } from '../../lib/supabase';

interface CovenantModalProps {
  onComplete: (covenant: Covenant) => void;
  onDismiss?: () => void;
  canDismiss?: boolean;
}

export function CovenantModal({
  onComplete,
  onDismiss,
  canDismiss = true,
}: CovenantModalProps) {
  const [step, setStep] = useState<'intro' | 'terms' | 'consequence' | 'confirm' | 'signed'>('intro');
  const [acceptedTerms, setAcceptedTerms] = useState<Set<string>>(new Set());
  const [selfConsequence, setSelfConsequence] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);
  }, []);

  const allTermsAccepted = DEFAULT_COVENANT_TERMS
    .filter(t => t.required)
    .every(t => acceptedTerms.has(t.id));

  const handleToggleTerm = (termId: string) => {
    const newSet = new Set(acceptedTerms);
    if (newSet.has(termId)) {
      newSet.delete(termId);
    } else {
      newSet.add(termId);
    }
    setAcceptedTerms(newSet);
  };

  const handleSign = async () => {
    if (!selfConsequence.trim() || !allTermsAccepted) return;

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const terms = DEFAULT_COVENANT_TERMS.filter(t => acceptedTerms.has(t.id));
      const covenant = await signCovenant(user.id, terms, selfConsequence.trim());

      setStep('signed');
      setTimeout(() => {
        onComplete(covenant);
      }, 2000);
    } catch (error) {
      console.error('Error signing covenant:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDismiss = () => {
    if (!canDismiss) return;
    setIsVisible(false);
    setTimeout(() => onDismiss?.(), 200);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-protocol-bg/95' : 'bg-transparent pointer-events-none'
      }`}
      onClick={canDismiss && step === 'intro' ? handleDismiss : undefined}
    >
      <div
        className={`max-w-md w-full max-h-[90vh] overflow-y-auto transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="card p-6 relative">
          {/* Close button (only on intro if dismissable) */}
          {canDismiss && step === 'intro' && (
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-1 text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Intro */}
          {step === 'intro' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-protocol-accent/20 flex items-center justify-center">
                <Shield className="w-8 h-8 text-protocol-accent" />
              </div>

              <h2 className="text-2xl font-bold text-protocol-text mb-2">
                The Covenant
              </h2>

              <p className="text-protocol-text-muted mb-6">
                You've proven you want this.
                <br />
                Now make it official.
              </p>

              <p className="text-sm text-protocol-text-muted mb-8">
                A covenant is a sacred promise to yourself. Once signed, it cannot
                be unsigned. Breaking it will have consequences you define.
              </p>

              <button
                onClick={() => setStep('terms')}
                className="w-full py-4 rounded-lg bg-protocol-accent text-white font-medium hover:bg-protocol-accent/90 transition-colors"
              >
                Begin Covenant
              </button>

              {canDismiss && (
                <button
                  onClick={handleDismiss}
                  className="mt-4 text-sm text-protocol-text-muted hover:text-protocol-text transition-colors"
                >
                  Not ready yet
                </button>
              )}
            </div>
          )}

          {/* Terms */}
          {step === 'terms' && (
            <div>
              <h2 className="text-xl font-bold text-protocol-text mb-2 text-center">
                I, commit to:
              </h2>

              <p className="text-sm text-protocol-text-muted mb-6 text-center">
                Check each commitment you agree to
              </p>

              <div className="space-y-3 mb-8">
                {DEFAULT_COVENANT_TERMS.map(term => (
                  <label
                    key={term.id}
                    className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                      acceptedTerms.has(term.id)
                        ? 'bg-protocol-accent/10 border-protocol-accent/30'
                        : 'bg-protocol-surface border-protocol-border hover:border-protocol-text-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={acceptedTerms.has(term.id)}
                      onChange={() => handleToggleTerm(term.id)}
                      className="w-5 h-5 mt-0.5 rounded border-2 border-protocol-accent text-protocol-accent focus:ring-protocol-accent bg-protocol-surface"
                    />
                    <span className="text-protocol-text">{term.text}</span>
                  </label>
                ))}
              </div>

              <button
                onClick={() => setStep('consequence')}
                disabled={!allTermsAccepted}
                className={`w-full py-4 rounded-lg font-medium transition-colors ${
                  allTermsAccepted
                    ? 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
                    : 'bg-protocol-surface text-protocol-text-muted cursor-not-allowed'
                }`}
              >
                Continue
              </button>

              <button
                onClick={() => setStep('intro')}
                className="w-full mt-3 py-2 text-sm text-protocol-text-muted hover:text-protocol-text transition-colors"
              >
                Go back
              </button>
            </div>
          )}

          {/* Self-imposed consequence */}
          {step === 'consequence' && (
            <div>
              <h2 className="text-xl font-bold text-protocol-text mb-2 text-center">
                If I break this covenant:
              </h2>

              <p className="text-sm text-protocol-text-muted mb-6 text-center">
                Write your own consequence. Make it meaningful.
              </p>

              <textarea
                value={selfConsequence}
                onChange={e => setSelfConsequence(e.target.value)}
                placeholder="e.g., I will tell Gina everything..."
                rows={4}
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent resize-none mb-6"
              />

              <p className="text-xs text-protocol-text-muted mb-6 text-center">
                This consequence will be shown to you if you violate the covenant.
              </p>

              <button
                onClick={() => setStep('confirm')}
                disabled={!selfConsequence.trim()}
                className={`w-full py-4 rounded-lg font-medium transition-colors ${
                  selfConsequence.trim()
                    ? 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
                    : 'bg-protocol-surface text-protocol-text-muted cursor-not-allowed'
                }`}
              >
                Review Covenant
              </button>

              <button
                onClick={() => setStep('terms')}
                className="w-full mt-3 py-2 text-sm text-protocol-text-muted hover:text-protocol-text transition-colors"
              >
                Go back
              </button>
            </div>
          )}

          {/* Confirmation */}
          {step === 'confirm' && (
            <div>
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-protocol-accent/20 flex items-center justify-center">
                <FileSignature className="w-6 h-6 text-protocol-accent" />
              </div>

              <h2 className="text-xl font-bold text-protocol-text mb-4 text-center">
                Your Covenant
              </h2>

              <div className="p-4 rounded-lg bg-protocol-surface border border-protocol-border mb-4">
                <p className="text-sm text-protocol-text-muted mb-3">I commit to:</p>
                <ul className="space-y-2">
                  {DEFAULT_COVENANT_TERMS
                    .filter(t => acceptedTerms.has(t.id))
                    .map(term => (
                      <li key={term.id} className="flex items-start gap-2 text-sm text-protocol-text">
                        <Check className="w-4 h-4 text-protocol-success flex-shrink-0 mt-0.5" />
                        {term.text}
                      </li>
                    ))}
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 mb-6">
                <p className="text-sm text-protocol-text-muted mb-2">If I break this covenant:</p>
                <p className="text-sm text-red-400 italic">"{selfConsequence}"</p>
              </div>

              <p className="text-xs text-protocol-text-muted text-center mb-6">
                Duration: Until I reach Phase 4
                <br />
                <span className="text-amber-400">This cannot be undone.</span>
              </p>

              <button
                onClick={handleSign}
                disabled={isSubmitting}
                className="w-full py-4 rounded-lg bg-gradient-to-r from-protocol-accent to-pink-500 text-white font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <FileSignature className="w-5 h-5" />
                {isSubmitting ? 'Signing...' : 'Sign Covenant'}
              </button>

              <button
                onClick={() => setStep('consequence')}
                className="w-full mt-3 py-2 text-sm text-protocol-text-muted hover:text-protocol-text transition-colors"
              >
                Go back
              </button>
            </div>
          )}

          {/* Signed */}
          {step === 'signed' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-protocol-success/20 flex items-center justify-center animate-scale-in">
                <Check className="w-8 h-8 text-protocol-success" />
              </div>

              <h2 className="text-2xl font-bold text-protocol-text mb-2">
                Covenant Signed
              </h2>

              <p className="text-protocol-text-muted">
                You've made it official.
                <br />
                There's no going back now.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Covenant Violation Modal
 * Shown when user violates their covenant
 */
interface CovenantViolationModalProps {
  covenant: Covenant;
  violationType: string;
  violationDescription: string;
  onAcknowledge: () => void;
}

export function CovenantViolationModal({
  covenant,
  violationType: _violationType,
  violationDescription,
  onAcknowledge,
}: CovenantViolationModalProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);
  }, []);

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
        <div className="card p-6 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <Shield className="w-7 h-7 text-red-400" />
          </div>

          <h2 className="text-xl font-bold text-protocol-text mb-2">
            Covenant Violation
          </h2>

          <p className="text-protocol-text-muted mb-4">
            {violationDescription}
          </p>

          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 mb-6">
            <p className="text-sm text-protocol-text-muted mb-2">
              Your self-imposed consequence:
            </p>
            <p className="text-red-400 font-medium">
              "{covenant.selfConsequence}"
            </p>
          </div>

          <p className="text-sm text-protocol-text-muted mb-6">
            This is violation #{covenant.violations + 1}.
          </p>

          <button
            onClick={onAcknowledge}
            className="w-full py-4 rounded-lg bg-red-500 text-white font-medium hover:bg-red-500/90 transition-colors"
          >
            I acknowledge this violation
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Covenant Display Card
 * Shows active covenant on profile/settings
 */
interface CovenantCardProps {
  covenant: Covenant;
}

export function CovenantCard({ covenant }: CovenantCardProps) {
  const signedDate = new Date(covenant.signedAt).toLocaleDateString();

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-protocol-accent/20">
          <Shield className="w-5 h-5 text-protocol-accent" />
        </div>
        <div>
          <h3 className="font-medium text-protocol-text">Covenant Active</h3>
          <p className="text-xs text-protocol-text-muted">Signed {signedDate}</p>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {covenant.terms.map(term => (
          <div key={term.id} className="flex items-start gap-2 text-sm">
            <Check className="w-4 h-4 text-protocol-success flex-shrink-0 mt-0.5" />
            <span className="text-protocol-text-muted">{term.text}</span>
          </div>
        ))}
      </div>

      {covenant.violations > 0 && (
        <div className="p-2 rounded bg-red-500/10 text-center">
          <span className="text-xs text-red-400">
            {covenant.violations} violation{covenant.violations > 1 ? 's' : ''} recorded
          </span>
        </div>
      )}
    </div>
  );
}
