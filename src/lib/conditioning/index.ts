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
