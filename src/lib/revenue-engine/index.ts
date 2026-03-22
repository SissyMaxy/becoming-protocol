/**
 * Revenue Engine — barrel exports
 *
 * The autonomous revenue generation system.
 * Generates content, engages audiences, manages subscriptions,
 * multiplies content, writes erotica, manages affiliates,
 * and makes financial decisions — all autonomously.
 */

// Voice & personality
export { MAXY_VOICE_PROMPT, CONTENT_STRATEGIES, selectBestSubreddit } from './voice';

// Autonomous content generation
export {
  generateDailyContentPlan,
  generateSinglePost,
  getDueAIContent,
  markAIContentPosted,
  markAIContentFailed,
  updateEngagementMetrics,
} from './autonomous-content';

// Engagement engine
export {
  runEngagementCycle,
  addEngagementTarget,
  bulkAddTargets,
  getTargetsForPlatform,
  updateTargetStatus,
  pruneUnresponsiveTargets,
} from './engagement';

// GFE & paid DMs
export {
  sendGFEMessages,
  respondToDM,
  upsertGFESubscriber,
  cancelGFESubscription,
  updateSubscriberProfile,
  getGFEStats,
} from './gfe';

// Content multiplication
export {
  multiplyContent,
  getMultiplicationStats,
} from './content-multiplier';

// Written content (erotica, captions, journal)
export {
  generateErotica,
  generateCaption,
  generateJournalEntry,
} from './written-content';

// Affiliate revenue
export {
  addAffiliateLink,
  trackAffiliateClick,
  recordAffiliateConversion,
  generateAffiliateContent,
  getAffiliateStats,
} from './affiliate';

// Revenue decisions
export {
  weeklyRevenueReview,
  executeDecision,
  getRecentDecisions,
  getPendingDecisions,
} from './revenue-decisions';

// Scheduler & operations
export {
  OPERATIONS_SCHEDULE,
  runOperation,
  processNewVaultItems,
  runDailyBatch,
  runWeeklyBatch,
} from './scheduler';
