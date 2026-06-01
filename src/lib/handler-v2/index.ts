/**
 * Handler Module
 * Exports for the Handler system
 */

// Main Handler
export { Handler, getHandler, clearHandler } from './handler';
export type { HandlerConfig } from './handler';

// Types
export type {
  HandlerMode,
  OdometerState,
  TimeOfDay,
  ExecFunction,
  FailureMode,
  DepressionLevel,
  UserState,
  InterventionType,
  HandlerIntervention,
  MorningBriefing,
  EveningDebrief,
  SessionGuidance,
  TimeCapsule,
  CrisisKitItem,
  HandlerAction,
  HandlerDailyPlan,
} from './types';

// Budget Manager
export { BudgetManager, createBudgetManager, ACTION_COSTS } from './budget-manager';
export type { AIBudget, ActionType } from './budget-manager';

// Template Engine
export { TemplateEngine, getTemplateEngine } from './template-engine';

// AI Client
export { AIClient, createAIClient } from './ai-client';

// Mode Selector
export {
  selectHandlerMode,
  getEscalationLevel,
  shouldOpenVulnerabilityWindow,
  shouldTransitionMode,
} from './mode-selector';
export type { ModeSelectionResult } from './mode-selector';

// Intervention Detector
export {
  checkForInterventions,
  shouldFireIntervention,
  getInterventionPriority,
  prioritizeInterventions,
} from './intervention-detector';
export type { InterventionCheck } from './intervention-detector';

// Failure Modes (Core)
export {
  detectPostReleaseCrash,
  detectDepressionCollapse,
  detectWorkStress,
  detectIdentityCrisis,
  detectFailureModes,
  analyzeJournalForCrisis,
  logFailureModeEvent,
  resolveFailureModeEvent,
  getRecentFailureModes,
  checkSafetyEscalation,
} from './failure-modes';
export type { FailureModeEvent, FailureModeDetection } from './failure-modes';

// Failure Modes (Extended - FM2, FM4, FM5, FM6, FM7)

// Daily Plan Generation

// Coercive Strategies

// Gina Safety

// Crisis Kit

// Pattern Analysis

// Arousal Controller
export {
  getArousalState,
  summonUser,
  selectSummonsPattern,
  deliverReward,
  calculateRewardForTask,
  enforceDenial,
  extendDenial,
  scheduleFrustrationActivations,
  executeScheduledActivations,
  getDenialSummary,
} from './arousal-controller';
export type {
  ArousalState,
  ScheduledActivation,
  LovensePattern as ArousalLovensePattern,
  ArousalRewardType,
  ArousalReward,
} from './arousal-controller';

// Financial Engine
export {
  getFund,
  getTransactionHistory,
  processRevenue,
  executeConsequence,
  startBleeding,
  stopBleeding,
  processBleeding,
  allocateFunds,
  getTodayEarnings,
  getEarningsSummary,
  getPendingConsequences,
  markConsequenceCompleted,
  markConsequenceFailed,
  getFinancialSnapshot,
} from './financial-engine';
export type {
  MaxyFund,
  FundTransaction,
  RevenueEvent,
  EarningsSummary,
} from './financial-engine';

// Strategy Engine
export {
  getStrategy,
  evaluateAndUpdate,
  determinePhase,
  generateContentCalendar,
  getContentCalendar,
  updateStrategy,
  getPhaseDescription,
} from './strategy-engine';
export type {
  Phase,
  StrategyState,
  ContentCalendarSlot,
  StrategyDecision,
} from './strategy-engine';

// Content Engine
export {
  getActiveBriefs,
  getBrief,
  generateDailyBriefs,
  generateQuickTask,
  submitContent,
  processForPosting,
  getContentLibrary,
  getContentForRelease,
  markContentReleased,
} from './content-engine';
export type {
  ContentBrief,
  BriefInstructions,
  ContentItem,
} from './content-engine';

// Enforcement Engine
export {
  getComplianceState,
  evaluateCompliance,
  checkEscalation,
  executeAction,
  onTaskCompletion,
  reduceEscalation,
  releaseContent,
  getDailyEnforcementSummary,
} from './enforcement-engine';
export type {
  ComplianceState,
  EnforcementAction,
  EnforcementActionType,
  EscalationThreshold,
  DailyEnforcementSummary,
} from './enforcement-engine';
export { ESCALATION_THRESHOLDS } from './enforcement-engine';

// Platform Manager
export {
  getAccounts,
  getAccount,
  getReleasePlatforms,
  createScheduledPost,
  getDuePosts,
  executeScheduledPosts,
  postToPlatform,
  handlePostingError,
  syncAnalytics,
  getPostingSummary,
  calculateOptimalPostTime,
} from './platform-manager';
export type {
  PlatformAccount,
  ScheduledPost,
  PostResult,
} from './platform-manager';
export { PLATFORM_CONFIGS } from './platform-manager';

// Adaptation Engine
