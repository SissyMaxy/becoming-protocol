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
