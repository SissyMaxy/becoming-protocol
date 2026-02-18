/**
 * Bambi-Maxy Fusion System
 *
 * Conditioning engine: trance tracking, trigger management,
 * content audit, and Handler trance invocation.
 */

export {
  type LogBambiSessionInput,
  type EndSessionData,
  type AuditContentInput,
  type SessionContext,
  logBambiSession,
  endBambiSession,
  registerTrigger,
  updateTriggerExposure,
  recordTriggerResponse,
  grantHandlerInvocation,
  revokeHandlerInvocation,
  getHandlerInvokableTriggers,
  invokeForHandler,
  auditContent,
  getContentRecommendation,
  getBambiDashboardData,
} from './state-engine';
