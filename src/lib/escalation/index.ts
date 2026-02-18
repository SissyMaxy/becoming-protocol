/**
 * Escalation Module
 *
 * Re-exports for the infinite escalation subsystem.
 */

export {
  assessAdvancement,
  generateNextLevel,
  advanceDomain,
  recordTaskAtLevel,
  getEscalationOverview,
  getCrossDomainStatus,
  getDomainDependencies,
  initializeDomainState,
} from './level-generator';
