// ============================================
// Submission Flow
// Capture → Privacy Scan → Review → Submit/Veto
// ============================================

import type {
  CaptureData,
  SubmissionReviewData,
  SubmissionClassification,
  SubmissionResult,
  PrivacyScanResult,
  MediaType,
} from '../../types/vault';
import { runFullPrivacyScan, stripMetadata } from './privacy-filter';
import { classifyContent, generateHandlerNote, submitToVault, logVeto } from './vault-manager';

// ============================================
// Submission Flow State Machine
// ============================================

export type FlowStep = 'capture' | 'scanning' | 'review' | 'submitting' | 'complete' | 'vetoed';

export interface SubmissionFlowState {
  step: FlowStep;
  captureData: CaptureData | null;
  reviewData: SubmissionReviewData | null;
  classification: SubmissionClassification | null;
  strippedBlob: Blob | null;
  strippedUrl: string | null;
  exifStripped: boolean;
  result: SubmissionResult | null;
  error: string | null;
}

export function createInitialFlowState(): SubmissionFlowState {
  return {
    step: 'capture',
    captureData: null,
    reviewData: null,
    classification: null,
    strippedBlob: null,
    strippedUrl: null,
    exifStripped: false,
    result: null,
    error: null,
  };
}

// ============================================
// Flow Actions
// ============================================

/**
 * Step 1: Process captured media.
 * Runs privacy scan, strips EXIF, classifies content.
 * Returns review data for the SubmissionReview component.
 */
export async function processCapture(
  capture: CaptureData
): Promise<{
  reviewData: SubmissionReviewData;
  classification: SubmissionClassification;
  strippedBlob: Blob;
  strippedUrl: string;
  exifStripped: boolean;
}> {
  // Run privacy scan
  const privacyScan = await runFullPrivacyScan(capture.mediaFile, capture.captureContext);

  // Strip EXIF metadata
  const { blob, url, stripped } = await stripMetadata(capture.mediaFile);

  // Detect media type
  const mediaType: MediaType = capture.mediaFile.type.startsWith('image/') ? 'image'
    : capture.mediaFile.type.startsWith('video/') ? 'video'
    : 'audio';

  // Classify content
  const classification = classifyContent({
    sourceType: capture.sourceType,
    mediaType,
    captureContext: capture.captureContext,
    arousalLevel: capture.arousalLevel,
  });

  // Generate Handler note
  const handlerNote = generateHandlerNote(classification);

  const reviewData: SubmissionReviewData = {
    mediaPreviewUrl: url,
    mediaType,
    privacyScan,
    handlerNote,
    captureContext: capture.captureContext,
    arousalLevel: capture.arousalLevel,
  };

  return {
    reviewData,
    classification,
    strippedBlob: blob,
    strippedUrl: url,
    exifStripped: stripped,
  };
}

/**
 * Step 2: Submit content to vault.
 * Called after David approves in the review screen.
 */
export async function submitContent(
  userId: string,
  capture: CaptureData,
  classification: SubmissionClassification,
  strippedBlob: Blob,
  exifStripped: boolean,
  privacyScan: PrivacyScanResult,
  description?: string
): Promise<SubmissionResult> {
  try {
    const vaultItem = await submitToVault(
      userId,
      strippedBlob,
      capture.mediaFile.type,
      classification,
      {
        sourceType: capture.sourceType,
        sourceTaskId: capture.sourceTaskId,
        sourceSessionId: capture.sourceSessionId,
        sourceCamSessionId: capture.sourceCamSessionId,
        captureContext: capture.captureContext,
        arousalLevel: capture.arousalLevel,
        description,
        privacyScanResult: privacyScan as unknown as Record<string, unknown>,
        exifStripped,
      }
    );

    return {
      success: true,
      vaultItemId: vaultItem.id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to submit content',
    };
  }
}

/**
 * Step 2 (alt): Veto content.
 * Logs the veto and cleans up.
 */
export async function vetoContent(
  userId: string,
  capture: CaptureData,
  reason?: string
): Promise<void> {
  // Log veto for avoidance detection
  await logVeto(userId, {
    sourceType: capture.sourceType,
    sourceTaskId: capture.sourceTaskId,
    sourceSessionId: capture.sourceSessionId,
    captureContext: capture.captureContext,
    arousalLevelAtCapture: capture.arousalLevel,
    mediaType: capture.mediaFile.type.split('/')[0],
    reason,
  });

  // Content is permanently deleted — never enters the system
}

/**
 * Clean up object URLs to prevent memory leaks.
 */
export function cleanupFlowState(state: SubmissionFlowState): void {
  if (state.strippedUrl) {
    URL.revokeObjectURL(state.strippedUrl);
  }
  if (state.reviewData?.mediaPreviewUrl && state.reviewData.mediaPreviewUrl !== state.strippedUrl) {
    URL.revokeObjectURL(state.reviewData.mediaPreviewUrl);
  }
}
