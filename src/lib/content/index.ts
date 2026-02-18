/**
 * Content Module
 *
 * Re-exports for the content subsystem.
 */

// Permanence Tracker
export {
  type ClassifyInput,
  type RegisterContentInput,
  type AcknowledgmentResult,
  type AdvancementResult,
  type DeletionAttemptResult,
  classifyTier,
  registerContent,
  acknowledgePermanence,
  advanceTier,
  updateCopyEstimate,
  attemptDeletion,
  getPermanenceSummary,
  getUnacknowledgedContent,
  getPermanenceRatchetScore,
} from './permanence-tracker';
