/**
 * Ratchet System Components
 *
 * Part 6 of the Becoming Protocol v2 specification
 * The Ratchet System ensures forward progress through:
 * - Evidence accumulation (undeniable proof)
 * - Investment tracking (sunk cost leverage)
 * - Commitment management (arousal-extracted promises)
 * - Baseline ratcheting (floors only rise)
 * - Milestone markers (irreversible progress points)
 */

export { EvidenceGallery, default as EvidenceGalleryDefault } from './EvidenceGallery';
export { InvestmentTracker, default as InvestmentTrackerDefault } from './InvestmentTracker';
export { CommitmentDashboard, default as CommitmentDashboardDefault } from './CommitmentDashboard';
export { SunkCostDisplay, useSunkCostMessage, default as SunkCostDisplayDefault } from './SunkCostDisplay';
export { BaselineTracker, default as BaselineTrackerDefault } from './BaselineTracker';
export { MilestoneTimeline, default as MilestoneTimelineDefault } from './MilestoneTimeline';
