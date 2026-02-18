// ============================================
// Submission Review
// David's veto/submit screen shown at capture time
// ============================================

import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
  AlertTriangle,
  Eye,
  Lock,
  Video,
  Mic,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import type {
  CaptureData,
  PrivacyScanResult,
  VaultTier,
} from '../../types/vault';
import {
  processCapture,
  submitContent,
  vetoContent,
  cleanupFlowState,
  createInitialFlowState,
} from '../../lib/content/submission-flow';
import type { SubmissionFlowState } from '../../lib/content/submission-flow';

// ============================================
// Props
// ============================================

interface SubmissionReviewProps {
  /** The captured media and context */
  capture: CaptureData;
  /** Called when submission is complete (submitted or vetoed) */
  onComplete: (result: { decision: 'submit' | 'veto'; vaultItemId?: string }) => void;
  /** Called when user cancels (before any decision) */
  onCancel?: () => void;
}

// ============================================
// Component
// ============================================

export function SubmissionReview({ capture, onComplete, onCancel }: SubmissionReviewProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();

  const [flowState, setFlowState] = useState<SubmissionFlowState>(createInitialFlowState);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const [description, setDescription] = useState('');
  const [vetoReason, setVetoReason] = useState('');
  const [showVetoConfirm, setShowVetoConfirm] = useState(false);

  // Process capture on mount
  useEffect(() => {
    let cancelled = false;

    async function process() {
      setFlowState(prev => ({ ...prev, step: 'scanning' }));

      try {
        const result = await processCapture(capture);

        if (cancelled) return;

        setFlowState(prev => ({
          ...prev,
          step: 'review',
          captureData: capture,
          reviewData: result.reviewData,
          classification: result.classification,
          strippedBlob: result.strippedBlob,
          strippedUrl: result.strippedUrl,
          exifStripped: result.exifStripped,
        }));
      } catch (err) {
        if (cancelled) return;
        setFlowState(prev => ({
          ...prev,
          step: 'capture',
          error: err instanceof Error ? err.message : 'Failed to process capture',
        }));
      }
    }

    process();
    return () => { cancelled = true; };
  }, [capture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupFlowState(flowState);
  }, []);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!user || !flowState.classification || !flowState.strippedBlob || !flowState.reviewData) return;

    setFlowState(prev => ({ ...prev, step: 'submitting' }));

    const result = await submitContent(
      user.id,
      capture,
      flowState.classification,
      flowState.strippedBlob,
      flowState.exifStripped,
      flowState.reviewData.privacyScan,
      description || undefined
    );

    setFlowState(prev => ({ ...prev, step: 'complete', result }));
    onComplete({ decision: 'submit', vaultItemId: result.vaultItemId });
  }, [user, flowState, capture, description, onComplete]);

  // Veto handler
  const handleVeto = useCallback(async () => {
    if (!user) return;

    await vetoContent(user.id, capture, vetoReason || undefined);
    setFlowState(prev => ({ ...prev, step: 'vetoed' }));
    onComplete({ decision: 'veto' });
  }, [user, capture, vetoReason, onComplete]);

  const review = flowState.reviewData;
  const classification = flowState.classification;
  const scan = review?.privacyScan;

  // ============================================
  // Scanning State
  // ============================================
  if (flowState.step === 'scanning') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className={`mx-4 w-full max-w-md rounded-2xl p-8 text-center ${
          isBambiMode ? 'bg-white' : 'bg-protocol-surface'
        }`}>
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-protocol-accent" />
          <h2 className={`text-lg font-semibold mb-2 ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            Scanning Content
          </h2>
          <p className="text-sm text-protocol-text-muted">
            Running privacy check and stripping metadata...
          </p>
        </div>
      </div>
    );
  }

  // ============================================
  // Error State
  // ============================================
  if (flowState.error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className={`mx-4 w-full max-w-md rounded-2xl p-6 ${
          isBambiMode ? 'bg-white' : 'bg-protocol-surface'
        }`}>
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-red-400" />
          <h2 className="text-lg font-semibold text-center text-red-400 mb-2">
            Processing Failed
          </h2>
          <p className="text-sm text-center text-protocol-text-muted mb-4">
            {flowState.error}
          </p>
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-xl bg-protocol-surface-light text-protocol-text font-medium"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // Submitting State
  // ============================================
  if (flowState.step === 'submitting') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className={`mx-4 w-full max-w-md rounded-2xl p-8 text-center ${
          isBambiMode ? 'bg-white' : 'bg-protocol-surface'
        }`}>
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-green-400" />
          <h2 className={`text-lg font-semibold mb-2 ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            Submitting to Vault
          </h2>
          <p className="text-sm text-protocol-text-muted">
            Uploading and classifying...
          </p>
        </div>
      </div>
    );
  }

  // ============================================
  // Review State (main screen)
  // ============================================
  if (flowState.step !== 'review' || !review || !classification) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      {/* Header */}
      <div className={`flex items-center justify-between p-4 border-b ${
        isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-surface border-protocol-border'
      }`}>
        <h2 className={`text-lg font-semibold ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          Submission Review
        </h2>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-2 rounded-full hover:bg-protocol-surface-light"
          >
            <X className="w-5 h-5 text-protocol-text-muted" />
          </button>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">

          {/* Media Preview */}
          <div className="rounded-xl overflow-hidden bg-black">
            {review.mediaType === 'image' && (
              <img
                src={review.mediaPreviewUrl}
                alt="Captured content"
                className="w-full max-h-64 object-contain"
              />
            )}
            {review.mediaType === 'video' && (
              <video
                src={review.mediaPreviewUrl}
                controls
                className="w-full max-h-64"
              />
            )}
            {review.mediaType === 'audio' && (
              <div className="p-8 flex flex-col items-center">
                <Mic className="w-12 h-12 text-protocol-accent mb-3" />
                <audio src={review.mediaPreviewUrl} controls className="w-full" />
              </div>
            )}
          </div>

          {/* Privacy Scan Results */}
          <PrivacyScanCard
            scan={scan!}
            showDetails={showPrivacyDetails}
            onToggleDetails={() => setShowPrivacyDetails(!showPrivacyDetails)}
            isBambiMode={isBambiMode}
            exifStripped={flowState.exifStripped}
          />

          {/* Handler Note */}
          <div className={`p-4 rounded-xl border ${
            isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-surface border-protocol-border'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4 text-protocol-accent" />
              <span className={`text-sm font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}>
                Handler's Intent
              </span>
            </div>
            <p className="text-sm text-protocol-text-muted italic">
              "{review.handlerNote}"
            </p>
          </div>

          {/* Classification Badge */}
          <div className="flex items-center gap-3">
            <VaultTierBadge tier={classification.vaultTier} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-protocol-text-muted">Vulnerability</span>
                <div className="flex-1 h-2 rounded-full bg-protocol-surface-light overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${classification.vulnerabilityScore * 10}%`,
                      backgroundColor: getVulnColor(classification.vulnerabilityScore),
                    }}
                  />
                </div>
                <span className="text-xs font-mono text-protocol-text-muted">
                  {classification.vulnerabilityScore}/10
                </span>
              </div>
            </div>
          </div>

          {/* Context Info */}
          <div className={`p-3 rounded-lg text-xs space-y-1 ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface-light'
          }`}>
            <div className="flex justify-between">
              <span className="text-protocol-text-muted">Source</span>
              <span className={isBambiMode ? 'text-pink-600' : 'text-protocol-text'}>
                {review.captureContext || capture.sourceType}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-protocol-text-muted">Arousal at capture</span>
              <span className={isBambiMode ? 'text-pink-600' : 'text-protocol-text'}>
                {review.arousalLevel}/10
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-protocol-text-muted">Media type</span>
              <span className={isBambiMode ? 'text-pink-600' : 'text-protocol-text'}>
                {review.mediaType}
              </span>
            </div>
          </div>

          {/* Optional description */}
          <div>
            <label className="text-xs text-protocol-text-muted block mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add context about this content..."
              className={`w-full p-3 rounded-xl border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              }`}
              rows={2}
            />
          </div>
        </div>
      </div>

      {/* Action Buttons (fixed at bottom) */}
      <div className={`p-4 border-t space-y-3 ${
        isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-surface border-protocol-border'
      }`}>
        {/* Privacy blocked — can't submit */}
        {scan?.blocked && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
            <ShieldAlert className="w-5 h-5 mx-auto mb-1 text-red-400" />
            <p className="text-sm text-red-400 font-medium">
              Privacy issue must be resolved before submission
            </p>
            <p className="text-xs text-red-400/70 mt-1">
              Retake this content to fix the blocked issue
            </p>
          </div>
        )}

        {/* Veto confirmation */}
        {showVetoConfirm ? (
          <div className="space-y-3">
            <textarea
              value={vetoReason}
              onChange={e => setVetoReason(e.target.value)}
              placeholder="Why are you vetoing? (optional — Handler tracks patterns)"
              className={`w-full p-3 rounded-xl border text-sm resize-none ${
                isBambiMode
                  ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              }`}
              rows={2}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowVetoConfirm(false)}
                className={`flex-1 py-3 rounded-xl text-sm font-medium ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-600'
                    : 'bg-protocol-surface-light text-protocol-text'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleVeto}
                className="flex-1 py-3 rounded-xl bg-red-500/20 text-red-400 text-sm font-medium"
              >
                Confirm Veto
              </button>
            </div>
            <p className="text-xs text-center text-protocol-text-muted">
              Content will be permanently deleted. Handler logs this as data.
            </p>
          </div>
        ) : (
          <div className="flex gap-3">
            {/* Veto Button */}
            <button
              onClick={() => setShowVetoConfirm(true)}
              className={`flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${
                isBambiMode
                  ? 'bg-pink-100 text-pink-600'
                  : 'bg-protocol-surface-light text-protocol-text'
              }`}
            >
              <X className="w-4 h-4" />
              Veto
            </button>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={scan?.blocked}
              className={`flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                scan?.blocked
                  ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                  : isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
              }`}
            >
              <Upload className="w-4 h-4" />
              Submit to Handler
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function PrivacyScanCard({
  scan,
  showDetails,
  onToggleDetails,
  isBambiMode: _isBambiMode,
  exifStripped,
}: {
  scan: PrivacyScanResult;
  showDetails: boolean;
  onToggleDetails: () => void;
  isBambiMode: boolean;
  exifStripped: boolean;
}) {
  const StatusIcon = scan.blocked ? ShieldAlert : scan.safe ? ShieldCheck : Shield;
  const statusColor = scan.blocked ? 'text-red-400' : scan.safe ? 'text-green-400' : 'text-yellow-400';
  const statusBg = scan.blocked ? 'bg-red-500/10 border-red-500/20'
    : scan.safe ? 'bg-green-500/10 border-green-500/20'
    : 'bg-yellow-500/10 border-yellow-500/20';
  const statusText = scan.blocked ? 'Privacy Issue Detected'
    : scan.safe ? 'Privacy Scan Clear'
    : 'Privacy Warnings';

  return (
    <div className={`p-4 rounded-xl border ${statusBg}`}>
      <button
        onClick={onToggleDetails}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <StatusIcon className={`w-5 h-5 ${statusColor}`} />
          <span className={`text-sm font-medium ${statusColor}`}>
            {statusText}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {exifStripped && (
            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
              EXIF stripped
            </span>
          )}
          {showDetails ? (
            <ChevronUp className="w-4 h-4 text-protocol-text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-protocol-text-muted" />
          )}
        </div>
      </button>

      {showDetails && scan.warnings.length > 0 && (
        <div className="mt-3 space-y-2">
          {scan.warnings.map((warning, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <AlertTriangle className={`w-3 h-3 mt-0.5 flex-shrink-0 ${
                scan.blocked ? 'text-red-400' : 'text-yellow-400'
              }`} />
              <span className="text-protocol-text-muted">{warning}</span>
            </div>
          ))}
        </div>
      )}

      {showDetails && scan.warnings.length === 0 && (
        <p className="mt-3 text-xs text-green-400">
          No privacy concerns detected. Content is safe to submit.
        </p>
      )}
    </div>
  );
}

function VaultTierBadge({ tier }: { tier: VaultTier }) {
  const config: Record<VaultTier, { icon: typeof Lock; label: string; color: string }> = {
    public_ready: { icon: Eye, label: 'Public Ready', color: 'text-green-400 bg-green-500/10' },
    private: { icon: Lock, label: 'Private', color: 'text-yellow-400 bg-yellow-500/10' },
    restricted: { icon: ShieldAlert, label: 'Restricted', color: 'text-red-400 bg-red-500/10' },
    cam_recording: { icon: Video, label: 'Cam Recording', color: 'text-purple-400 bg-purple-500/10' },
    cam_highlight: { icon: Video, label: 'Cam Highlight', color: 'text-purple-400 bg-purple-500/10' },
  };

  const { icon: Icon, label, color } = config[tier];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {label}
    </div>
  );
}

// ============================================
// Helpers
// ============================================

function getVulnColor(score: number): string {
  if (score <= 3) return '#4ade80';  // green
  if (score <= 5) return '#facc15';  // yellow
  if (score <= 7) return '#f97316';  // orange
  return '#ef4444';                   // red
}
