/**
 * AI Layer Exports
 *
 * Complete AI integration for the protocol system.
 */

// Main AI Layer
export {
  AILayer,
  getAILayer,
  createAILayer,
  type AICallConfig,
  type AIResponse,
  type BudgetConfig,
  type ModelTier,
  type Priority,
} from './ai-layer';

// System Prompts
export {
  SYSTEM_PROMPTS,
  getSystemPrompt,
  MODEL_PREFERENCES,
  CACHEABLE_OPERATIONS,
  MAX_TOKENS,
  type OperationType,
} from './system-prompts';

// Prefill Patterns
export {
  PREFILL_PATTERNS,
  STRUCTURED_PREFILLS,
  getPrefill,
  expectsJson,
  getStructuredPrefill,
  buildJsonPrefill,
  buildArrayPrefill,
  buildContextualPrefill,
  type PrefillPattern,
} from './prefill-patterns';

// Template Fallbacks
export {
  FALLBACK_TEMPLATES,
  getFallbackTemplate,
  interpolateTemplate,
  buildMorningContext,
  buildEveningContext,
  buildVaultContext,
  buildFindomContext,
  buildDissonanceContext,
  buildTaskContext,
  getCoercionFallback,
  getWarmthFallback,
} from './template-fallbacks';

// Context Composer
export { ContextComposer } from './context-composer';
