/**
 * Conditioning Engine — Barrel Exports
 */

export { getHiddenParam, getAllHiddenParams, incrementHiddenParameters } from './hidden-operations';
export { prescribeSession, selectContent } from './prescription';
export type { SessionContext, SessionPrescription } from './prescription';
export { recordDelivery, checkActivations, recordActivation, getPendingPostHypnotics } from './post-hypnotic';
export { weaveTriggers } from './trigger-insertion';
export { buildConditioningEngineContext } from './handler-context';
export * from './elevenlabs';
export * from './script-generator';
export * from './adaptive-session';
export * from './goon-session';
export * from './pmv-generator';
export { activateSessionDevice, deactivateSessionDevice, transitionSessionPhase } from './session-device';
export { getScentInstruction, recordScentPairing } from './scent-bridge';
export {
  getActiveNarrative,
  createNarrative,
  advanceNarrative,
  getNextBeat,
  buildNarrativeContext,
} from './narrative-engine';
export {
  recordIntervention,
  recordOutcome,
  computeEffectiveness,
  getEffectivenessProfile,
  buildImpactContext,
} from './impact-tracking';
export type {
  InterventionType,
  OutcomeType,
  OutcomeDirection,
  InterventionInput,
  OutcomeInput,
  EffectivenessRow,
} from './impact-tracking';
export {
  getProspects,
  addProspect,
  updateProspect,
  getEncounters,
  createEncounter,
  updateEncounter,
  addEncounterContent,
  getEncounterContent,
  getProgressionStage,
  advanceStage,
} from './encounter-pipeline';
export type {
  ProspectStatus,
  EncounterStatus,
  EncounterType,
  IntimacyLevel,
  ContentType,
  TurningOutStage,
  Prospect,
  ProspectInput,
  Encounter,
  EncounterInput,
  EncounterContentInput,
  TurningOutProgression,
} from './encounter-pipeline';
export {
  generateDailyPrescription,
  buildFeminizationPrescriptionContext,
} from './feminization-prescriptions';
export type {
  PrescribedTask,
  DailyFeminizationPrescription,
} from './feminization-prescriptions';
export {
  prescribeWorkout,
  verifyWorkoutCompletion,
  buildExercisePrescriptionContext,
} from './exercise-prescriptions';
export type {
  Exercise,
  WorkoutPrescription,
  WorkoutCompletion,
} from './exercise-prescriptions';
export {
  generateCamGuidance,
  mapTipToDevice,
  processCamTip,
  buildCamSessionContext,
  buildCamHandlerControlContext,
} from './cam-handler-control';
export type {
  CamSessionContext,
  DeviceCommand,
  TipProcessResult,
  CamHandlerContext,
} from './cam-handler-control';
export {
  triggerPostOrgasmHold,
  triggerSilenceOutreach,
  triggerNoveltyInjection,
  triggerEvidenceReframe,
  detectFailureMode,
  buildFailureRecoveryContext,
} from './failure-recovery';
export type {
  RecoveryType,
  RecoveryResult,
} from './failure-recovery';
export {
  getIdentityReinforcingEngagement,
  formatAsMirror,
  buildCommunityMirrorContext,
  getDailyMirrorQuota,
} from './community-mirror';
export {
  executePendingDirectives,
  executeDirective,
  buildDirectiveContext,
} from './directive-executor';
export type {
  DirectiveAction,
  DirectivePriority,
  DirectiveStatus,
  HandlerDirective,
} from './directive-executor';
export {
  recordContentEffectiveness,
  getOptimalContent,
  buildContentOptimizationContext,
} from './content-optimizer';
export type {
  EffectivenessMetrics,
  OptimalContentItem,
  ContentOptimizationContext,
} from './content-optimizer';
export {
  updateDenialDayAnalytics,
  findSweetSpotDays,
  buildDenialMappingContext,
} from './denial-mapping';
export type {
  SweetSpotDays,
  DenialDayAnalytics,
} from './denial-mapping';
export {
  computeCorrelations,
  getSignificantCorrelations,
  buildCorrelationContext,
} from './correlation-engine';
export type {
  CorrelationResult,
} from './correlation-engine';
export {
  getCurrentCommitmentLevel,
  proposeNextCommitment,
  recordCommitmentCompletion,
  buildCommitmentLadderContext,
  LADDER_DOMAINS,
} from './commitment-ladder';
export type {
  CommitmentLevel,
  LadderProgress,
  NextCommitment,
} from './commitment-ladder';
export {
  prescribeMicroExposure,
  recordExposureResult,
  buildGinaMicroExposureContext,
} from './gina-micro-exposure';
export type {
  MicroExposure,
  GinaResponse,
  ExposureRecord,
  ExposurePrescription,
} from './gina-micro-exposure';
export {
  queueOutreachMessage,
  getPendingOutreach,
  markDelivered,
  scheduleCheckIn,
  buildOutreachQueueContext,
} from './proactive-outreach';
export type {
  OutreachUrgency,
  OutreachStatus,
  OutreachSource,
  CheckInReason,
  OutreachMessage,
} from './proactive-outreach';
export {
  generateConversationAgenda,
  getActiveAgenda,
  completeAgenda,
  buildAgendaContext,
} from './conversation-agenda';
export type {
  ConversationAgenda,
} from './conversation-agenda';
export {
  predictReleaseRisk,
  predictEngagementDrop,
  predictBreakthroughWindow,
  runPredictions,
  buildPredictiveEngineContext,
} from './predictive-engine';
export type {
  PredictionType,
  Prediction,
  PredictionResult,
} from './predictive-engine';
export {
  generateDailyCycle,
  executeCycleBlock,
  checkBlockCompliance,
  updateDailyComplianceScore,
  getTodayCycle,
  buildAutonomousCycleContext,
} from './autonomous-cycle';
export type {
  BlockType,
  BlockStatus,
  DailyCycle,
  BlockComplianceResult,
} from './autonomous-cycle';
export {
  assessConsequence,
  executeConsequence,
  resetConsequenceLevel,
  getCurrentConsequenceLevel,
  getRecentConsequences,
  buildConsequenceContext,
  CONSEQUENCE_LADDER,
} from './consequence-engine';
export type {
  ConsequenceType,
  ConsequenceLevel,
  ConsequenceRecord,
  ConsequenceAssessment,
} from './consequence-engine';
export {
  generateDailyObligations,
  checkObligationCompliance,
  autoCompleteObligation,
  markObligationComplete,
  getTodayObligations,
  buildObligationContext,
} from './engagement-obligations';
export type {
  ObligationType,
  Obligation,
} from './engagement-obligations';
export {
  generateDailyDeviceSchedule,
  getNextActivation,
  getDueActivations,
  fireActivation,
  processDeviceSchedule,
  getDeviceScheduleStats,
  buildVariableRatioContext,
} from './variable-ratio-device';
export type {
  DevicePattern,
  DeviceActivation,
} from './variable-ratio-device';
export {
  getAllTemplates,
  getTemplatesForCategory,
  renderTemplate,
  generateFromTemplate,
} from './script-templates';
export type {
  ScriptTemplate,
} from './script-templates';
export {
  batchGenerateAudio,
  fillContentGaps,
  buildBatchTtsContext,
} from './batch-tts';
export type {
  BatchGenerateResult,
  GeneratedItem,
} from './batch-tts';
export {
  addExternalContent,
  searchExternalContent,
  prescribeExternalContent,
  recordExternalConsumption,
  buildContentLibraryContext,
  seedExternalContent,
} from './content-sourcer';
export type {
  ExternalContentType,
  ExternalContentInput,
  ExternalContentItem,
  ContentSearchCriteria,
  ContentLibraryContext,
} from './content-sourcer';
export {
  generateDailyMandates,
  checkMandateCompliance,
  processMandateDeadlines,
  getMandateStatus,
  buildMandateContext,
} from './feminization-mandate';
export type {
  MandateCategory,
  MandateVerification,
  DailyMandate,
  MandateComplianceResult,
} from './feminization-mandate';
export {
  prescribeOutfit,
  verifyOutfitCompliance,
  escalateOutfit,
  buildOutfitControlContext,
} from './outfit-control';
export type {
  OutfitContext,
  OutfitPrescription,
  OutfitComplianceResult,
} from './outfit-control';
export {
  prescribeGoonSession,
  generateSissyCaptions,
  trackGoonEffectiveness,
  postGoonProtocol,
  storeGoonConfession,
  buildGoonEngineContext,
} from './goon-engine';
export type {
  GoonContentType,
  GoonPrescription,
  GoonContentItem,
  GoonDevicePhase,
  GoonCaptionPhase,
  GoonEffectivenessMetrics,
} from './goon-engine';
export {
  calculateArousalTarget,
  generateArousalPulses,
  checkArousalState,
  fireArousalPulse,
  buildArousalMaintenanceContext,
} from './arousal-maintenance';
export type {
  PulseType,
  ArousalTarget,
  ArousalPulse,
  ArousalState,
} from './arousal-maintenance';
export {
  getExposureLevel,
  prescribeExposure,
  completeExposure,
  processOverdueExposures,
  getExposureProgress,
  buildExposureContext,
} from './progressive-exposure';
export type {
  ExposureFrequency,
  ExposureVerification,
  ExposureMandate,
  ExposurePrescription as ProgressiveExposurePrescription,
  ExposureProgress,
} from './progressive-exposure';
export {
  prescribeConsumption,
  verifyConsumption,
  processOverdueConsumption,
  buildConsumptionContext,
} from './consumption-mandates';
export type {
  ConsumptionType,
  ConsumptionMandate,
  ConsumptionStatus,
} from './consumption-mandates';
export {
  generateProofCode,
  validateProofCode,
  getActiveProofCode,
  buildProofOfLifeContext,
} from './proof-of-life';
export type {
  ProofOfLife,
  ProofValidation,
} from './proof-of-life';
export {
  requireVideoVerification,
  validateVideoSubmission,
  getActiveVideoRequirement,
  buildVideoVerificationContext,
} from './video-verification';
export type {
  VideoMandateType,
  VideoRequirement,
  VideoValidation,
} from './video-verification';
export {
  createVerificationSequence,
  submitSequenceStep,
  checkSequenceComplete,
  getActiveSequence,
  buildVerificationSequenceContext,
} from './verification-sequences';
export type {
  SequenceMandateType,
  SequenceStep,
  VerificationSequence,
  SequenceStepResult,
} from './verification-sequences';
export {
  calculateStreakValue,
  incrementStreak,
  breakStreak,
  getActiveStreaks,
  buildStreakContext,
} from './streak-stakes';
export type {
  StreakType,
  StreakValueTier,
  Streak,
  StreakBreak,
  AllStreaks,
} from './streak-stakes';
export {
  detectEasyMode,
  detectHardMode,
  assessDifficulty,
  escalateDifficulty,
  reduceDifficulty,
  autoBalanceDifficulty,
  buildDifficultyContext,
} from './difficulty-escalation';
export type {
  DifficultyMode,
  DifficultyAssessment,
  DifficultyAdjustment,
} from './difficulty-escalation';
export {
  checkPrivilege,
  checkAllPrivileges,
  grantReward,
  revokePrivilege,
  buildRewardGatingContext,
} from './reward-gating';
export type {
  Privilege,
  RewardType,
  PrivilegeCheck,
  RewardEvent,
} from './reward-gating';
export {
  classifyResistance,
  buildResistanceClassifierContext,
} from './resistance-classifier';
export type {
  ResistanceClassification,
  RecommendedApproach,
  ClassificationResult,
} from './resistance-classifier';
