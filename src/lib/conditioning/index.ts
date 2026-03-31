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
